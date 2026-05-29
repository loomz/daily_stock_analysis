# -*- coding: utf-8 -*-
"""
===================================
EastmoneyChipFetcher - 东方财富筹码分布 Selenium 爬取器
===================================

使用 Selenium + Chrome CDP 打开东方财富网页，通过锚点 #chart-k-cyq
触发前端 JS 加载筹码分布数据，然后从 .quotechart2022_c_cyq
区域提取数值。

URL: https://quote.eastmoney.com/concept/{symbol}.html
symbol 通过 _to_sina_tx_symbol 转换，如 sz001309、sh600519

数据字段：日期、获利比例、平均成本、
90%成本上下限、90%集中度、70%成本上下限、70%集中度
"""

import glob
import logging
import os
import random
import re
import shutil
import time
from pathlib import Path
from typing import Optional

from .base import BaseFetcher, is_bse_code
from .realtime_types import ChipDistribution, safe_float
from .us_index_mapping import is_us_stock_code


logger = logging.getLogger(__name__)


def _is_etf_code(stock_code: str) -> bool:
    """判断代码是否为 ETF 基金"""
    etf_prefixes = ('51', '52', '56', '58', '15', '16', '18')
    code = stock_code.strip().split(".")[0]
    return code.startswith(etf_prefixes) and len(code) == 6


def _is_hk_code(stock_code: str) -> bool:
    """判断代码是否为港股"""
    code = stock_code.strip().lower()
    if code.endswith('.hk'):
        numeric_part = code[:-3]
        return numeric_part.isdigit() and 1 <= len(numeric_part) <= 5
    if code.startswith('hk'):
        numeric_part = code[2:]
        return numeric_part.isdigit() and 1 <= len(numeric_part) <= 5
    return code.isdigit() and len(code) == 5


def _to_sina_tx_symbol(stock_code: str) -> str:
    """Convert 6-digit A-share code to sh/sz/bj prefixed symbol."""
    base = (stock_code.strip().split(".")[0] if "." in stock_code else stock_code).strip()
    if is_bse_code(base):
        return f"bj{base}"
    if base.startswith(("6", "5", "90")):
        return f"sh{base}"
    return f"sz{base}"


_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
]


def _is_chrome_installed() -> bool:
    """Check if Chrome/Chromium browser binary is available."""
    for name in ("google-chrome", "google-chrome-stable", "google-chrome-beta",
                 "google-chrome-unstable", "chromium-browser", "chromium"):
        if shutil.which(name):
            return True
    return False


def _find_chrome_binary() -> Optional[str]:
    """Find the Chrome/Chromium binary path. Selenium Manager needs this to pick the matching driver."""
    for name in ("google-chrome", "google-chrome-stable", "google-chrome-beta",
                 "google-chrome-unstable", "chromium-browser", "chromium"):
        path = shutil.which(name)
        if path:
            return path
    # Try common system paths as fallback
    for p in ("/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
              "/usr/bin/chromium-browser", "/usr/bin/chromium",
              "/usr/local/bin/google-chrome", "/usr/local/bin/chromium-browser"):
        if os.path.exists(p):
            return p
    return None


def _find_chromedriver_path() -> Optional[str]:
    """Find chromedriver binary from common locations."""
    # 1. Check PATH
    path = shutil.which('chromedriver')
    if path:
        return path

    # 2. Check webdriver-manager cache
    wdm_base = Path.home() / '.wdm' / 'drivers' / 'chromedriver' / 'linux64'
    if wdm_base.exists():
        matches = sorted(glob.glob(str(wdm_base / '**' / 'chromedriver'), recursive=True))
        if matches:
            return matches[-1]

    # 3. Check common system paths
    for p in ['/usr/bin/chromedriver', '/usr/local/bin/chromedriver']:
        if os.path.exists(p):
            return p

    return None


class EastmoneyChipFetcher(BaseFetcher):
    """
    东方财富筹码分布数据 Selenium 爬取器

    使用 Selenium + Chrome 访问东方财富网页，通过 CDP 设置反检测请求头
    和浏览器指纹伪装，通过锚点触发 JS 渲染后从 quotechart2022_c_cyq
    区域获取筹码数据。优先级 0（最高）。
    仅实现 get_chip_distribution，日线数据由其他 Fetcher 提供。
    """

    name: str = "EastmoneyChipFetcher"
    priority: int = 0

    _selenium_available: bool = True

    # 常见验证码 / 滑块元素选择器
    _CAPTCHA_SELECTORS = [
        ".popwscps_d_shadow",
        ".popwscps_d_pop",
        "[class*='slider-captcha']",
        "[class*='slider-captcha']",
        "[class*='ac-overlays']",
        "[id*='captcha']",
        ".ac-window",
        ".tangren-popup",
        ".iptpx_loop_bg",
    ]

    def __init__(self):
        self._driver = None
        self._last_request_time = 0.0
        self._min_interval = 4.0
        if EastmoneyChipFetcher._selenium_available:
            try:
                from selenium import webdriver as _webdriver  # noqa: F401
                from selenium.webdriver.chrome.options import Options as _ChromeOptions  # noqa: F401
            except ImportError:
                EastmoneyChipFetcher._selenium_available = False
                logger.warning(
                    "[EastmoneyChipFetcher] selenium 未安装，"
                    "筹码分布将跳过此数据源"
                )
                return

            if not _is_chrome_installed():
                EastmoneyChipFetcher._selenium_available = False
                logger.warning(
                    "[EastmoneyChipFetcher] Chrome/Chromium 浏览器未安装，"
                    "筹码分布将跳过此数据源"
                )
                return

            # 检查 chromedriver（非必须，Selenium Manager 可自动下载）
            cd_path = _find_chromedriver_path()
            if cd_path is None:
                logger.debug(
                    "[EastmoneyChipFetcher] 未找到 chromedriver，"
                    "将依赖 Selenium Manager 自动获取"
                )

    def _get_driver(self):
        """获取或创建浏览器驱动实例（Selenium + CDP 反检测）"""
        if self._driver is None:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.chrome.service import Service

            user_agent = random.choice(_USER_AGENTS)
            options = Options()
            options.add_argument('--headless=new')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-blink-features=AutomationControlled')
            options.add_argument('--window-size=1920,1080')
            options.add_argument(f'--user-agent={user_agent}')
            options.add_argument('--lang=zh-CN,zh;q=0.9')

            # Let Selenium Manager locate the Chrome binary and download matching driver
            chrome_path = _find_chrome_binary()
            if chrome_path:
                options.binary_location = chrome_path
                logger.debug("[EastmoneyChipFetcher] Chrome binary: %s", chrome_path)

            cd_path = _find_chromedriver_path()
            if cd_path:
                service = Service(executable_path=cd_path)
                self._driver = webdriver.Chrome(options=options, service=service)
            else:
                self._driver = webdriver.Chrome(options=options)

            self._driver.set_page_load_timeout(20)

            # --- CDP: 启用 Network domain（必须在设置请求头之前） ---
            self._driver.execute_cdp_cmd('Network.enable', {})

            # --- CDP: 完整 Client Hints + 反检测请求头 ---
            self._driver.execute_cdp_cmd(
                'Network.setExtraHTTPHeaders',
                {
                    'headers': {
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                        'Sec-CH-UA': '"Not A(Brand";v="99", "Google Chrome";v="131", "Chromium";v="131"',
                        'Sec-CH-UA-Mobile': '?0',
                        'Sec-CH-UA-Platform': '"Windows"',
                    },
                },
            )

            # --- CDP: 深度伪装浏览器指纹 ---
            self._driver.execute_cdp_cmd(
                'Page.addScriptToEvaluateOnNewDocument',
                {
                    'source': '''
                        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
                        Object.defineProperty(navigator, 'maxTouchPoints', {get: () => 0});
                        const originalQuery = navigator.permissions.query;
                        navigator.permissions.query = (param) => {
                            return Promise.resolve({state: 'granted'});
                        };
                        const getParameter = WebGLRenderingContext.prototype.getParameter;
                        WebGLRenderingContext.prototype.getParameter = function(param) {
                            if (param === 37445) return 'Google Inc. (NVIDIA)';
                            if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce, OpenGL)';
                            return getParameter.apply(this, arguments);
                        };
                        if (!window.chrome) window.chrome = {runtime: {}};
                        Object.defineProperty(navigator, 'languages', {
                            get: () => ['zh-CN', 'zh', 'en'],
                        });
                    ''',
                },
            )
        return self._driver

    def _close_driver(self):
        """关闭浏览器驱动"""
        if self._driver:
            try:
                self._driver.quit()
            except Exception:
                pass
            self._driver = None

    def _is_captcha_present(self, driver) -> bool:
        """检测页面是否存在验证码/滑块元素"""
        from selenium.webdriver.common.by import By

        for selector in self._CAPTCHA_SELECTORS:
            try:
                els = driver.find_elements(By.CSS_SELECTOR, selector)
                for el in els:
                    if el.is_displayed() and el.size and (el.size.width > 0 or el.size.height > 0):
                        logger.warning(
                            f"[{self.name}] 检测到验证码元素: {selector}"
                        )
                        return True
            except Exception:
                pass

        # 额外检查：页面文本中是否包含验证码关键词
        try:
            body_text = driver.find_element(By.TAG_NAME, "body").text
            captcha_keywords = ["滑动验证", "滑块验证", "安全验证", "请滑动", "验证通过后"]
            if any(kw in body_text for kw in captcha_keywords):
                logger.warning(f"[{self.name}] 页面包含验证码文案")
                return True
        except Exception:
            pass

        return False

    # ── BaseFetcher 抽象方法存根 ─────────────────────

    def _fetch_raw_data(self, stock_code: str, start_date: str, end_date: str):
        raise NotImplementedError(
            f"{self.name} 仅实现筹码分布接口，不提供日线数据"
        )

    def _normalize_data(self, df, stock_code: str):
        raise NotImplementedError(
            f"{self.name} 仅实现筹码分布接口，不提供日线数据"
        )

    # ── 筹码分布 ─────────────────────────────────────

    def get_chip_distribution(self, stock_code: str) -> Optional[ChipDistribution]:
        """
        获取筹码分布数据

        使用 Selenium 爬取东方财富网页，锚点 #chart-k-cyq
        触发 JS 渲染后从 quotechart2022_c_cyq 区域提取筹码数据

        Args:
            stock_code: 股票代码

        Returns:
            ChipDistribution 对象，获取失败返回 None
        """
        if not EastmoneyChipFetcher._selenium_available:
            return None

        if is_us_stock_code(stock_code):
            logger.debug(f"[{self.name}] {stock_code} 美股，跳过")
            return None

        if _is_hk_code(stock_code):
            logger.debug(f"[{self.name}] {stock_code} 港股，跳过")
            return None

        if _is_etf_code(stock_code):
            logger.debug(f"[{self.name}] {stock_code} ETF，跳过")
            return None

        try:
            return self._fetch_chip_with_selenium(stock_code)
        except Exception as e:
            logger.error(f"[{self.name}] 获取 {stock_code} 筹码失败: {e}")
            return None

    def _fetch_chip_with_selenium(
        self, stock_code: str
    ) -> Optional[ChipDistribution]:
        """使用 Selenium 爬取东方财富筹码数据"""
        self._rate_limit()

        symbol = _to_sina_tx_symbol(stock_code)
        page_url = f"https://quote.eastmoney.com/concept/{symbol}.html#chart-k-cyq"

        logger.info(
            f"[{self.name}] 爬取筹码: code={stock_code}, symbol={symbol}"
        )

        driver = self._get_driver()

        try:
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC

            wait = WebDriverWait(driver, 15)

            # 访问页面（不带锚点）
            base_url = page_url.split('#')[0]
            driver.get(base_url)

            # 等待页面主体加载
            wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            time.sleep(2 + random.uniform(0.5, 1.5))

            # 首次验证码检测
            if self._is_captcha_present(driver):
                logger.warning(
                    f"[{self.name}] {stock_code} 触发验证码,"
                    " 回退到其他数据源"
                )
                self._close_driver()
                return None

            logger.info(f"[{self.name}] 页面已加载, title={driver.title}")

            # 隐藏弹窗遮挡
            try:
                shadow = driver.find_element(By.CSS_SELECTOR, ".popwscps_d_shadow")
                driver.execute_script("arguments[0].style.display='none';", shadow)
            except Exception:
                pass

            # 模拟鼠标移动（更自然的浏览行为）
            try:
                from selenium.webdriver.common.action_chains import ActionChains
                body_el = driver.find_element(By.TAG_NAME, "body")
                actions = ActionChains(driver)
                actions.move_to_element_with_offset(
                    body_el, random.randint(200, 800),
                    random.randint(100, 400),
                )
                actions.perform()
            except Exception:
                pass

            # 点击日K切换图表类型
            driver.execute_script("""
                    var items = document.querySelectorAll('li');
                    for (var i = 0; i < items.length; i++) {
                        if (items[i].textContent.trim() === '日K') {
                            items[i].click();
                            break;
                        }
                    }
                """)
            time.sleep(2 + random.uniform(0.5, 1.5))

            # 操作后验证码检测
            if self._is_captcha_present(driver):
                logger.warning(
                    f"[{self.name}] {stock_code} 操作后触发验证码, 放弃"
                )
                self._close_driver()
                return None

            # 点击筹码分布按钮
            driver.execute_script("""
                    var links = document.querySelectorAll('a.cmfb');
                    if (links.length > 0) {
                        links[0].click();
                    }
                """)
            time.sleep(2 + random.uniform(0.5, 1.5))

            # 最终验证码检测
            if self._is_captcha_present(driver):
                logger.warning(
                    f"[{self.name}] {stock_code} 点击后触发验证码, 放弃"
                )
                self._close_driver()
                return None

            # 等待筹码区域加载（多选择器兜底）
            cyq_element = None
            for selector in [
                ".quotechart2022_c_cyq",
                "[class*='CyqChart']",
                ".CyqChart",
                "[id*='cyq']",
            ]:
                try:
                    cyq_element = wait.until(
                        EC.presence_of_element_located(
                            (By.CSS_SELECTOR, selector)
                        )
                    )
                    break
                except Exception:
                    continue

            if cyq_element is not None:
                # 等待集中度数据加载完成（至少出现一个数字在"集中度"标签后）
                try:
                    wait.until(
                        lambda d: self._cyq_has_concentration(
                            d.find_element(By.CSS_SELECTOR, ".quotechart2022_c_cyq")
                        )
                    )
                except Exception:
                    logger.debug(f"[{self.name}] 集中度数据可能未完全加载")

            if cyq_element is None:
                screenshot_path = f"/tmp/eastmoney_chip_debug_{stock_code}.png"
                driver.save_screenshot(screenshot_path)
                logger.warning(
                    f"[{self.name}] 未找到筹码区域, 截图: {screenshot_path}"
                )
                return None

            # 再次检查（等待后仍可能弹出）
            if self._is_captcha_present(driver):
                logger.warning(
                    f"[{self.name}] {stock_code} 等待后触发验证码, 放弃"
                )
                self._close_driver()
                return None

            text_content = cyq_element.text

            logger.debug(
                f"[{self.name}] 筹码区域文本: {text_content[:500]}"
            )

            return self._parse_chip_values(text_content, stock_code)

        except Exception as e:
            logger.error(
                f"[{self.name}] Selenium 获取失败: {e}",
                exc_info=True
            )
            return None

    def _cyq_has_concentration(self, element) -> bool:
        """检查筹码区域是否已加载完集中度数据"""
        text = element.text
        return '集中度' in text and any(
            c.isdigit() for c in text.split('集中度')[-1]
        )

    def _parse_chip_values(
        self, text: str, stock_code: str
    ) -> Optional[ChipDistribution]:
        """从文本中提取筹码数值"""
        values: dict = {}

        # 日期
        m = re.search(r'日期[：:]\s*([\d\-/年月]+)', text)
        if m:
            values['date'] = m.group(1)

        # 获利比例 - 页面为百分比，需转为 0-1 比率
        m = re.search(r'获利比例[：:]\s*([\d.]+)%?', text)
        if m:
            values['profit_ratio'] = self._to_ratio(safe_float(m.group(1)))

        # 平均成本
        m = re.search(r'平均成本[：:]\s*([\d.]+)', text)
        if m:
            values['avg_cost'] = safe_float(m.group(1))

        # 90%成本区间
        m = re.search(r'90%成本[－\-]?[:：]\s*([\d.]+)[－\-~]([\d.]+)', text)
        if m:
            values['cost_90_low'] = safe_float(m.group(1))
            values['cost_90_high'] = safe_float(m.group(2))

        # 70%成本区间
        m = re.search(r'70%成本[－\-]?[:：]\s*([\d.]+)[－\-~]([\d.]+)', text)
        if m:
            values['cost_70_low'] = safe_float(m.group(1))
            values['cost_70_high'] = safe_float(m.group(2))

        # 集中度: 页面上可能只有 "集中度:" 而无 90%/70% 前缀
        # 按出现顺序第一个为 90% 集中度，第二个为 70% 集中度
        conc_matches = re.findall(r'集中度[：:]\s*([\d.]+)%?', text)
        if len(conc_matches) >= 1:
            values['concentration_90'] = self._to_ratio(safe_float(conc_matches[0]))
        if len(conc_matches) >= 2:
            values['concentration_70'] = self._to_ratio(safe_float(conc_matches[1]))
        else:
            # 兜底：尝试带前缀的格式
            m = re.search(r'90％?集中度[：:]\s*([\d.]+)%?', text)
            if m:
                values['concentration_90'] = self._to_ratio(safe_float(m.group(1)))
            m = re.search(r'70％?集中度[：:]\s*([\d.]+)%?', text)
            if m:
                values['concentration_70'] = self._to_ratio(safe_float(m.group(1)))

        if not values.get('profit_ratio') and not values.get('avg_cost'):
            logger.debug(f"[{self.name}] 筹码区域无有效数据")
            return None

        chip = ChipDistribution(
            code=stock_code,
            date=str(values.get('date', '')),
            source="eastmoney_web",
            profit_ratio=values.get('profit_ratio', 0.0) or 0.0,
            avg_cost=values.get('avg_cost') or 0.0,
            cost_90_low=values.get('cost_90_low') or 0.0,
            cost_90_high=values.get('cost_90_high') or 0.0,
            concentration_90=values.get('concentration_90') or 0.0,
            cost_70_low=values.get('cost_70_low') or 0.0,
            cost_70_high=values.get('cost_70_high') or 0.0,
            concentration_70=values.get('concentration_70') or 0.0,
        )

        # 按表格格式打印筹码分布日志
        logger.info(
            f"[{self.name}] 筹码分布: {stock_code}\n"
            f"| 指标 | 数值 |\n"
            f"|------|------|\n"
            f"| 日期 | {chip.date} |\n"
            f"| 获利比例 | {chip.profit_ratio:.2%} |\n"
            f"| 平均成本 | {chip.avg_cost:.2f} 元 |\n"
            f"| 90%成本下限 | {chip.cost_90_low:.2f} 元 |\n"
            f"| 90%成本上限 | {chip.cost_90_high:.2f} 元 |\n"
            f"| 90%集中度 | {chip.concentration_90:.2%} |\n"
            f"| 70%成本下限 | {chip.cost_70_low:.2f} 元 |\n"
            f"| 70%成本上限 | {chip.cost_70_high:.2f} 元 |\n"
            f"| 70%集中度 | {chip.concentration_70:.2%} |"
        )
        return chip

    @staticmethod
    def _to_ratio(val) -> float:
        """将百分比字符串转为 0-1 比率"""
        f = safe_float(val)
        if f is None:
            return 0.0
        if f > 1:
            return f / 100.0
        return f

    def _rate_limit(self):
        """简单速率限制"""
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_request_time = time.time()
