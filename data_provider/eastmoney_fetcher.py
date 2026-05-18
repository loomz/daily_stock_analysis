# -*- coding: utf-8 -*-
"""
===================================
EastmoneyChipFetcher - 东方财富筹码分布 Selenium 爬取器
===================================

使用 Selenium 打开东方财富网页，通过锚点 #chart-k-cyq
触发前端 JS 加载筹码分布数据，然后从 .quotechart2022_c_cyq
区域提取数值。

URL: https://quote.eastmoney.com/concept/{symbol}.html#chart-k-cyq
symbol 通过 _to_sina_tx_symbol 转换，如 sz001309、sh600519

数据字段：日期、获利比例、平均成本、
90%成本上下限、90%集中度、70%成本上下限、70%集中度
"""

import logging
import os
import random
import re
import shutil
import time
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
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]


def _is_chrome_installed() -> bool:
    """Check if Chrome/Chromium browser binary is available."""
    for name in ("google-chrome", "google-chrome-stable", "google-chrome-beta",
                 "google-chrome-unstable", "chromium-browser", "chromium"):
        if shutil.which(name):
            return True
    return False


class EastmoneyChipFetcher(BaseFetcher):
    """
    东方财富筹码分布数据 Selenium 爬取器

    使用 Selenium 驱动浏览器访问东方财富网页，通过锚点触发 JS 渲染
    后从 quotechart2022_c_cyq 区域获取筹码数据。优先级 0（最高）。
    仅实现 get_chip_distribution，日线数据由其他 Fetcher 提供。
    """

    name: str = "EastmoneyChipFetcher"
    priority: int = 0

    _selenium_available: bool = True

    def __init__(self):
        self._driver = None
        self._last_request_time = 0.0
        self._min_interval = 3.0
        if EastmoneyChipFetcher._selenium_available:
            try:
                import selenium  # noqa: F401
                import webdriver_manager  # noqa: F401
            except ImportError:
                EastmoneyChipFetcher._selenium_available = False
                logger.warning(
                    "[EastmoneyChipFetcher] selenium/webdriver_manager 未安装，"
                    "筹码分布将跳过此数据源"
                )
                return

            if not _is_chrome_installed():
                EastmoneyChipFetcher._selenium_available = False
                logger.warning(
                    "[EastmoneyChipFetcher] Chrome/Chromium 浏览器未安装，"
                    "筹码分布将跳过此数据源"
                )

    def _get_driver(self):
        """获取或创建浏览器驱动实例"""
        if self._driver is None:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            from selenium.webdriver.chrome.service import Service
            from webdriver_manager.chrome import ChromeDriverManager

            os.environ['WDM_PROGRESS_BAR'] = '0'
            os.environ['WDM_LOG_LEVEL'] = '0'

            options = Options()
            options.add_argument('--headless=new')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            options.add_argument('--disable-extensions')
            options.add_argument('--disable-background-networking')
            options.add_argument('--disable-default-apps')
            options.add_argument('--disable-sync')
            options.add_argument('--disable-translate')
            options.add_argument('--disable-features=TranslateUI')
            options.add_argument('--disable-infobars')
            options.add_argument('--disable-notifications')
            options.add_argument('--disable-popup-blocking')
            options.add_argument('--disable-component-update')
            options.add_argument('--disable-blink-features=AutomationControlled')
            options.add_experimental_option('excludeSwitches', ['enable-automation'])
            options.add_experimental_option('useAutomationExtension', False)
            options.page_load_strategy = 'normal'
            options.add_argument('--window-size=1920,1080')
            options.add_argument(f'--user-agent={random.choice(_USER_AGENTS)}')
            options.add_argument('--lang=zh-CN,zh;q=0.9')

            service = Service(ChromeDriverManager().install())
            self._driver = webdriver.Chrome(service=service, options=options)
            self._driver.set_page_load_timeout(15)
        return self._driver

    def _close_driver(self):
        """关闭浏览器驱动"""
        if self._driver:
            try:
                self._driver.quit()
            except Exception:
                pass
            self._driver = None

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

        使用 Selenium 爬取东方财富网页，锚点 #chart-k-cyq 触发 JS 渲染后
        从 quotechart2022_c_cyq 区域提取筹码数据

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
        page_url = (
            f"https://quote.eastmoney.com/concept/"
            f"{symbol}.html#chart-k-cyq"
        )

        logger.info(
            f"[{self.name}] 爬取筹码: code={stock_code}, symbol={symbol}"
        )

        driver = self._get_driver()

        try:
            from selenium.webdriver.common.by import By
            from selenium.webdriver.support.ui import WebDriverWait
            from selenium.webdriver.support import expected_conditions as EC

            wait = WebDriverWait(driver, 20)

            # 访问页面（不带锚点）
            base_url = page_url.split('#')[0]
            driver.get(base_url)

            # 等待页面主体加载
            wait.until(EC.presence_of_element_located((By.TAG_NAME, "body")))
            time.sleep(3)

            # 隐藏弹窗遮挡
            try:
                shadow = driver.find_element(By.CSS_SELECTOR, ".popwscps_d_shadow")
                driver.execute_script("arguments[0].style.display='none';", shadow)
            except Exception:
                pass

            # 点击日K切换图表类型
            driver.execute_script("""
                    var items = document.querySelectorAll('li');
                    for (var i = 0; i < items.length; i++) {
                        if (items[i].textContent.trim() === '\u65e5K') {
                            items[i].click();
                            break;
                        }
                    }
                """)
            time.sleep(3)

            # 点击筹码分布按钮
            driver.execute_script("""
                    var links = document.querySelectorAll('a.cmfb');
                    if (links.length > 0) {
                        links[0].click();
                    }
                """)
            time.sleep(3)

            # 等待筹码区域加载
            wait.until(
                EC.presence_of_element_located(
                    (By.CSS_SELECTOR, ".quotechart2022_c_cyq")
                )
            )

            # 额外等待 JS 填充数据
            time.sleep(2)

            cyq_element = driver.find_element(
                By.CSS_SELECTOR, ".quotechart2022_c_cyq"
            )
            text_content = cyq_element.text

            logger.debug(
                f"[{self.name}] 页面标题: {driver.title}"
            )
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

    def _parse_chip_values(
        self, text: str, stock_code: str
    ) -> Optional[ChipDistribution]:
        """从文本中提取筹码数值"""
        values: dict = {}

        # 日期
        m = re.search(r'日期[：:]\s*([\d\-/年月]+)', text)
        if m:
            values['date'] = m.group(1)

        # 获利比例 - 保持原始百分比，与 akshare 对齐
        m = re.search(r'获利比例[：:]\s*([\d.]+)%?', text)
        if m:
            values['profit_ratio'] = safe_float(m.group(1))

        # 平均成本
        m = re.search(r'平均成本[：:]\s*([\d.]+)', text)
        if m:
            values['avg_cost'] = safe_float(m.group(1))

        # 90%成本区间 - 优先匹配 "90%成本: X-Y" 范围格式
        m = re.search(r'90%成本[－\-]?[:：]\s*([\d.]+)[－\-~]([\d.]+)', text)
        if m:
            values['cost_90_low'] = safe_float(m.group(1))
            values['cost_90_high'] = safe_float(m.group(2))
        else:
            # 回退：独立行 "90%成本-低: X" / "90%成本-高: X"
            m = re.search(r'90%成本(?:[－\-](?:低|下限))[：:]\s*([\d.]+)', text)
            if m:
                values['cost_90_low'] = safe_float(m.group(1))
            m = re.search(r'90%成本(?:[－\-](?:高|上限))?[：:]\s*([\d.]+)', text)
            if m:
                values['cost_90_high'] = safe_float(m.group(1))

        # 90%集中度 - 保持原始百分比，与 akshare 对齐
        m = re.search(r'90％?集中度[：:]\s*([\d.]+)%?', text)
        if m:
            values['concentration_90'] = safe_float(m.group(1))

        # 70%成本区间
        m = re.search(r'70%成本[－\-]?[:：]\s*([\d.]+)[－\-~]([\d.]+)', text)
        if m:
            values['cost_70_low'] = safe_float(m.group(1))
            values['cost_70_high'] = safe_float(m.group(2))
        else:
            m = re.search(r'70%成本(?:[－\-](?:低|下限))[：:]\s*([\d.]+)', text)
            if m:
                values['cost_70_low'] = safe_float(m.group(1))
            m = re.search(r'70%成本(?:[－\-](?:高|上限))?[：:]\s*([\d.]+)', text)
            if m:
                values['cost_70_high'] = safe_float(m.group(1))

        # 70%集中度 - 保持原始百分比，与 akshare 对齐
        m = re.search(r'70％?集中度[：:]\s*([\d.]+)%?', text)
        if m:
            values['concentration_70'] = safe_float(m.group(1))

        if not values.get('profit_ratio') and not values.get('avg_cost'):
            logger.debug(f"[{self.name}] 筹码区域无有效数据")
            return None

        return ChipDistribution(
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
