#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
筹码分布数据示例
演示如何获取和使用筹码分布数据
"""


from data_provider.realtime_types import ChipDistribution
#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
测试 Selenium + webdriver-manager 方案
解决 Chrome 148 版本驱动匹配问题
"""

import subprocess
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager

def demonstrate_chip_distribution():
    """演示筹码分布数据的结构和含义"""
    
    print("=== 筹码分布数据结构说明 ===")
    print()
    
    # 1. 筹码分布数据结构定义
    print("筹码分布数据包含以下关键字段：")
    print("- code: 股票代码")
    print("- date: 数据日期")
    print("- profit_ratio: 获利比例（0-1）")
    print("- avg_cost: 平均成本")
    print("- cost_90_low: 90%筹码成本下限")
    print("- cost_90_high: 90%筹码成本上限")
    print("- concentration_90: 90%筹码集中度（越小越集中）")
    print("- cost_70_low: 70%筹码成本下限")
    print("- cost_70_high: 70%筹码成本上限")
    print("- concentration_70: 70%筹码集中度")
    print()
    
    # 2. 模拟一个真实的筹码分布数据例子
    print("=== 模拟筹码分布数据示例 ===")
    
    # 模拟数据：贵州茅台(600519)的筹码分布
    chip_data = ChipDistribution(
        code="600519",
        date="2024-01-15",
        source="akshare",
        profit_ratio=0.75,      # 75%的筹码获利
        avg_cost=1800.0,        # 平均持仓成本1800元
        cost_90_low=1200.0,     # 90%筹码成本下限1200元
        cost_90_high=2200.0,    # 90%筹码成本上限2200元
        concentration_90=0.15,  # 90%筹码集中度15%
        cost_70_low=1400.0,     # 70%筹码成本下限1400元
        cost_70_high=2000.0,    # 70%筹码成本上限2000元
        concentration_70=0.25   # 70%筹码集中度25%
    )
    
    print(f"股票代码: {chip_data.code}")
    print(f"数据日期: {chip_data.date}")
    print(f"获利比例: {chip_data.profit_ratio:.1%}")
    print(f"平均成本: {chip_data.avg_cost} 元")
    print(f"90%筹码成本范围: {chip_data.cost_90_low} - {chip_data.cost_90_high} 元")
    print(f"90%筹码集中度: {chip_data.concentration_90:.2%}")
    print(f"70%筹码成本范围: {chip_data.cost_70_low} - {chip_data.cost_70_high} 元")
    print(f"70%筹码集中度: {chip_data.concentration_70:.2%}")
    print()
    
    # 3. 筹码状态分析
    print("=== 筹码状态分析 ===")
    current_price = 1950.0  # 当前股价
    status_desc = chip_data.get_chip_status(current_price)
    print(f"当前股价: {current_price} 元")
    print(f"筹码状态描述: {status_desc}")
    print()
    
    # 4. 筹码分布含义解释
    print("=== 筹码分布含义解释 ===")
    print("1. 获利比例 (75%): 表示有75%的持仓者处于盈利状态，说明大部分投资者获利")
    print("2. 平均成本 (1800元): 所有持仓者的平均买入成本")
    print("3. 90%筹码成本范围 (1200-2200元): 包含90%筹码的成本区间")
    print("4. 筹码集中度 (15%): 集中度较低，说明筹码分布相对分散")
    print("5. 70%筹码成本范围 (1400-2000元): 包含70%筹码的成本区间")
    print()
    
    # 5. 实际获取数据的示例
    print("=== 实际获取数据示例 ===")
    print("实际使用时，可以通过以下方式获取：")
    print("fetcher = AkShareFetcher()")
    print("chip_data = fetcher.get_chip_distribution('600519')")
    print("if chip_data:")
    print("    print(f'获利比例: {chip_data.profit_ratio:.1%}')")
    print("    print(f'平均成本: {chip_data.avg_cost} 元')")

def analyze_chip_distribution_examples():
    """分析不同类型的筹码分布情况"""
    
    print("\n=== 不同筹码分布情况分析 ===")
    
    # 情况1：获利盘高，筹码集中
    chip1 = ChipDistribution(
        code="600519",
        date="2024-01-15",
        profit_ratio=0.85,      # 获利盘高
        avg_cost=1800.0,
        cost_90_low=1300.0,
        cost_90_high=2100.0,
        concentration_90=0.10,  # 集中度低
        cost_70_low=1400.0,
        cost_70_high=1900.0,
        concentration_70=0.15
    )
    
    print("情况1 - 获利盘高，筹码集中:")
    print(f"  获利比例: {chip1.profit_ratio:.1%}")
    print(f"  筹码集中度: {chip1.concentration_90:.2%}")
    print(f"  状态: {chip1.get_chip_status(1950.0)}")
    
    # 情况2：获利盘低，筹码分散
    chip2 = ChipDistribution(
        code="000001",
        date="2024-01-15",
        profit_ratio=0.35,      # 获利盘低
        avg_cost=800.0,
        cost_90_low=600.0,
        cost_90_high=1000.0,
        concentration_90=0.30,  # 集中度高
        cost_70_low=700.0,
        cost_70_high=900.0,
        concentration_70=0.25
    )
    
    print("\n情况2 - 获利盘低，筹码分散:")
    print(f"  获利比例: {chip2.profit_ratio:.1%}")
    print(f"  筹码集中度: {chip2.concentration_90:.2%}")
    print(f"  状态: {chip2.get_chip_status(850.0)}")



def test_chrome_driver():
    """测试 Chrome 驱动是否能正常启动并访问百度"""
    
    print("=" * 60)
    print("开始测试 Chrome 驱动配置")
    print("=" * 60)
    
    # 1. 检查系统 Chrome 版本
    print("\n[1/4] 检查系统 Chrome 版本...")
    try:
        result = subprocess.run(['google-chrome', '--version'], 
                                capture_output=True, text=True, check=False)
        if result.returncode == 0:
            chrome_version = result.stdout.strip()
            print(f"✓ 系统 Chrome 版本: {chrome_version}")
        else:
            print(f"✗ 获取 Chrome 版本失败")
            return False
    except Exception as e:
        print(f"✗ 检查 Chrome 版本时出错: {e}")
        return False
    
    # 2. 使用 webdriver-manager 获取驱动
    print("\n[2/4] 使用 webdriver-manager 获取 ChromeDriver...")
    try:
        import os
        os.environ['WDM_PROGRESS_BAR'] = '0'
        os.environ['WDM_LOG_LEVEL'] = '0'
        
        chromedriver_path = ChromeDriverManager().install()
        print(f"✓ ChromeDriver 路径: {chromedriver_path}")
    except Exception as e:
        print(f"✗ 获取 ChromeDriver 失败: {e}")
        return False
    
    # 3. 配置浏览器选项（关键优化部分）
    print("\n[3/4] 配置 Chrome 浏览器选项...")
    try:
        options = Options()
        
        # 无头模式
        options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        
        # 【新增】解决超时问题的关键参数
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option('excludeSwitches', ['enable-automation'])
        options.add_experimental_option('useAutomationExtension', False)
        
        # 【新增】禁用各种可能影响加载的功能
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
        
        # 【新增】设置页面加载策略为 eager（不等待所有资源）
        options.page_load_strategy = 'eager'
        
        # 【新增】设置窗口大小
        options.add_argument('--window-size=1920,1080')
        
        # 【新增】设置 User-Agent
        options.add_argument('--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36')
        
        print("✓ 浏览器选项配置完成")
        print("  - 使用 eager 加载策略（不等待所有资源）")
        print("  - 已添加反检测参数")
        
    except Exception as e:
        print(f"✗ 配置浏览器选项失败: {e}")
        return False
    
    # 4. 启动浏览器并访问百度
    print("\n[4/4] 启动浏览器并访问百度...")
    driver = None
    try:
        service = Service(chromedriver_path)
        driver = webdriver.Chrome(service=service, options=options)
        print("✓ 浏览器驱动启动成功")
        
        # 【新增】设置页面加载超时时间为 15 秒
        driver.set_page_load_timeout(15)
        
        # 访问百度
        print("  正在访问 https://www.baidu.com ...")
        driver.get("https://www.baidu.com")
        
        # 获取页面标题
        title = driver.title
        print(f"✓ 成功！页面标题: {title}")
        
        if "百度" in title:
            print("✓ 页面标题验证通过，包含'百度'关键字")
        else:
            print(f"⚠ 页面标题与预期不符: {title}")
        
        # 可选：测试其他网站确认不是网络问题
        print("\n  测试访问其他网站...")
        driver.get("https://httpbin.org/html")
        print(f"✓ 成功访问 httpbin.org，页面标题: {driver.title}")
        
        print("\n" + "=" * 60)
        print("✅ 所有测试通过！Chrome 驱动配置正确。")
        print("=" * 60)
        return True
        
    except Exception as e:
        print(f"✗ 浏览器运行失败: {e}")
        
        error_msg = str(e)
        if "timeout" in error_msg.lower():
            print("\n原因分析：页面加载超时")
            print("可能原因及解决方法：")
            print("  1. 网络连接问题 - 检查网络是否正常")
            print("  2. 目标网站反爬 - 尝试访问其他网站测试")
            print("  3. 无头模式兼容性 - 临时移除 --headless 进行调试")
        else:
            print("\n请检查完整错误信息")
        
        return False
        
    finally:
        if driver:
            driver.quit()
            print("\n浏览器已关闭")


if __name__ == "__main__":
    test_chrome_driver()