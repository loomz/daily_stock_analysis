# -*- coding: utf-8 -*-
"""
Unit tests for EastmoneyChipFetcher.

Tests cover:
- get_chip_distribution early-exit paths (US, HK, ETF, selenium unavailable)
- _parse_chip_values regex extraction
- _to_sina_tx_symbol conversion logic
- _rate_limit behavior
- Selenium failure handling
"""

import sys
import time
import unittest
from unittest.mock import MagicMock, patch

from data_provider.eastmoney_fetcher import (
    EastmoneyChipFetcher,
    _is_chrome_installed,
    _is_etf_code,
    _is_hk_code,
    _to_sina_tx_symbol,
)
from data_provider.realtime_types import ChipDistribution


class TestIsChromeInstalled(unittest.TestCase):
    """Tests for _is_chrome_installed helper."""

    @patch("data_provider.eastmoney_fetcher.shutil.which")
    def test_returns_true_when_chrome_found(self, mock_which) -> None:
        mock_which.side_effect = lambda x: "/usr/bin/google-chrome" if x == "google-chrome" else None
        self.assertTrue(_is_chrome_installed())

    @patch("data_provider.eastmoney_fetcher.shutil.which")
    def test_returns_true_when_chromium_found(self, mock_which) -> None:
        mock_which.side_effect = lambda x: "/usr/bin/chromium-browser" if x == "chromium-browser" else None
        self.assertTrue(_is_chrome_installed())

    @patch("data_provider.eastmoney_fetcher.shutil.which")
    def test_returns_false_when_no_browser(self, mock_which) -> None:
        mock_which.return_value = None
        self.assertFalse(_is_chrome_installed())


class TestIsEtfCode(unittest.TestCase):
    """Tests for _is_etf_code helper."""

    def test_etf_codes_return_true(self) -> None:
        self.assertTrue(_is_etf_code("510300"))
        self.assertTrue(_is_etf_code("159915"))
        self.assertTrue(_is_etf_code("161726"))
        self.assertTrue(_is_etf_code("560500"))

    def test_regular_stock_codes_return_false(self) -> None:
        self.assertFalse(_is_etf_code("600519"))
        self.assertFalse(_is_etf_code("000001"))
        self.assertFalse(_is_etf_code("300750"))

    def test_non_six_digit_returns_false(self) -> None:
        self.assertFalse(_is_etf_code("51030"))
        self.assertFalse(_is_etf_code("5103001"))


class TestIsHkCode(unittest.TestCase):
    """Tests for _is_hk_code helper."""

    def test_hk_prefix_formats(self) -> None:
        self.assertTrue(_is_hk_code("hk00700"))
        self.assertTrue(_is_hk_code("HK00700"))
        self.assertTrue(_is_hk_code("hk1810"))

    def test_dot_hk_suffix(self) -> None:
        self.assertTrue(_is_hk_code("00700.hk"))
        self.assertTrue(_is_hk_code("00700.HK"))

    def test_five_digit_numeric(self) -> None:
        self.assertTrue(_is_hk_code("00700"))

    def test_a_share_codes_return_false(self) -> None:
        self.assertFalse(_is_hk_code("600519"))
        self.assertFalse(_is_hk_code("000001"))


class TestToSinaTxSymbol(unittest.TestCase):
    """Tests for _to_sina_tx_symbol helper."""

    def test_shanghai_prefix(self) -> None:
        self.assertEqual(_to_sina_tx_symbol("600519"), "sh600519")
        self.assertEqual(_to_sina_tx_symbol("510300"), "sh510300")
        self.assertEqual(_to_sina_tx_symbol("900001"), "sh900001")

    def test_shenzhen_prefix(self) -> None:
        self.assertEqual(_to_sina_tx_symbol("000001"), "sz000001")
        self.assertEqual(_to_sina_tx_symbol("300750"), "sz300750")

    def test_bse_code(self) -> None:
        self.assertEqual(_to_sina_tx_symbol("920748"), "bj920748")
        self.assertEqual(_to_sina_tx_symbol("830799"), "bj830799")


class TestEastmoneyChipFetcherEarlyExit(unittest.TestCase):
    """Test get_chip_distribution early-exit for unsupported markets."""

    def setUp(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    def tearDown(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    @staticmethod
    def _make_fetcher() -> EastmoneyChipFetcher:
        with patch("data_provider.eastmoney_fetcher.EastmoneyChipFetcher.__init__", return_value=None):
            fetcher = EastmoneyChipFetcher.__new__(EastmoneyChipFetcher)
            fetcher._driver = None
            fetcher._last_request_time = 0.0
            fetcher._min_interval = 3.0
        return fetcher

    def test_returns_none_for_us_stock(self) -> None:
        fetcher = self._make_fetcher()
        with patch.object(fetcher, "_fetch_chip_with_selenium") as mock:
            result = fetcher.get_chip_distribution("AAPL")
        self.assertIsNone(result)
        mock.assert_not_called()

    def test_returns_none_for_hk_stock(self) -> None:
        fetcher = self._make_fetcher()
        with patch.object(fetcher, "_fetch_chip_with_selenium") as mock:
            result = fetcher.get_chip_distribution("HK00700")
        self.assertIsNone(result)
        mock.assert_not_called()

    def test_returns_none_for_etf(self) -> None:
        fetcher = self._make_fetcher()
        with patch.object(fetcher, "_fetch_chip_with_selenium") as mock:
            result = fetcher.get_chip_distribution("510300")
        self.assertIsNone(result)
        mock.assert_not_called()

    def test_calls_selenium_for_a_share(self) -> None:
        fetcher = self._make_fetcher()
        mock_chip = ChipDistribution(
            code="600519",
            date="2024-01-15",
            source="eastmoney_web",
            profit_ratio=0.75,
            avg_cost=1800.0,
        )
        with patch.object(fetcher, "_fetch_chip_with_selenium", return_value=mock_chip):
            result = fetcher.get_chip_distribution("600519")
        self.assertIsNotNone(result)
        self.assertEqual(result.code, "600519")

    def test_returns_none_on_selenium_exception(self) -> None:
        fetcher = self._make_fetcher()
        with patch.object(fetcher, "_fetch_chip_with_selenium", side_effect=Exception("network error")):
            result = fetcher.get_chip_distribution("600519")
        self.assertIsNone(result)

    def test_returns_none_when_selenium_not_installed(self) -> None:
        EastmoneyChipFetcher._selenium_available = False
        fetcher = self._make_fetcher()
        result = fetcher.get_chip_distribution("600519")
        self.assertIsNone(result)


class TestParseChipValues(unittest.TestCase):
    """Tests for _parse_chip_values regex extraction."""

    def setUp(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    def tearDown(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    @staticmethod
    def _make_fetcher() -> EastmoneyChipFetcher:
        with patch("data_provider.eastmoney_fetcher.EastmoneyChipFetcher.__init__", return_value=None):
            fetcher = EastmoneyChipFetcher.__new__(EastmoneyChipFetcher)
            fetcher._driver = None
            fetcher._last_request_time = 0.0
            fetcher._min_interval = 3.0
        return fetcher

    def test_parse_full_data(self) -> None:
        fetcher = self._make_fetcher()
        text = (
            "日期：2024-01-15\n"
            "获利比例：75%\n"
            "平均成本：1800.50\n"
            "90%成本-下限：1200.00\n"
            "90%成本-上限：2200.00\n"
            "90%集中度：15%\n"
            "70%成本-下限：1400.00\n"
            "70%成本-上限：2000.00\n"
            "70%集中度：25%"
        )
        result = fetcher._parse_chip_values(text, "600519")
        self.assertIsNotNone(result)
        self.assertEqual(result.code, "600519")
        self.assertEqual(result.date, "2024-01-15")
        self.assertAlmostEqual(result.profit_ratio, 0.75, places=4)
        self.assertAlmostEqual(result.avg_cost, 1800.50, places=2)
        self.assertAlmostEqual(result.cost_90_low, 1200.0, places=2)
        self.assertAlmostEqual(result.cost_90_high, 2200.0, places=2)
        self.assertAlmostEqual(result.concentration_90, 0.15, places=4)
        self.assertAlmostEqual(result.cost_70_low, 1400.0, places=2)
        self.assertAlmostEqual(result.cost_70_high, 2000.0, places=2)
        self.assertAlmostEqual(result.concentration_70, 0.25, places=4)

    def test_parse_data_with_colon_separator(self) -> None:
        fetcher = self._make_fetcher()
        text = (
            "日期: 2024/02/01\n"
            "获利比例: 60%\n"
            "平均成本: 150.25\n"
            "90%成本-低: 100.00\n"
            "90%成本-高: 200.00\n"
            "90%集中度: 10%\n"
            "70%成本-下: 120.00\n"
            "70%成本-上: 180.00\n"
            "70%集中度: 12%"
        )
        result = fetcher._parse_chip_values(text, "000001")
        self.assertIsNotNone(result)
        self.assertEqual(result.date, "2024/02/01")
        self.assertAlmostEqual(result.profit_ratio, 0.60, places=4)
        self.assertAlmostEqual(result.avg_cost, 150.25, places=2)

    def test_parse_profit_ratio_under_one_not_divided(self) -> None:
        """If profit_ratio string parses to a value <= 1, it should NOT be divided by 100."""
        fetcher = self._make_fetcher()
        text = "获利比例：0.5\n平均成本：100"
        result = fetcher._parse_chip_values(text, "600519")
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result.profit_ratio, 0.5, places=4)

    def test_parse_empty_data_returns_none(self) -> None:
        fetcher = self._make_fetcher()
        text = "一些无关文本，没有筹码数据"
        result = fetcher._parse_chip_values(text, "600519")
        self.assertIsNone(result)

    def test_parse_missing_optional_fields(self) -> None:
        """Minimal data (profit_ratio + avg_cost) still produces a result."""
        fetcher = self._make_fetcher()
        text = "获利比例：50%\n平均成本：200.0"
        result = fetcher._parse_chip_values(text, "600519")
        self.assertIsNotNone(result)
        self.assertAlmostEqual(result.profit_ratio, 0.50, places=4)
        self.assertAlmostEqual(result.avg_cost, 200.0, places=2)
        self.assertIsNone(result.cost_90_low)
        self.assertEqual(result.source, "eastmoney_web")


class TestRateLimit(unittest.TestCase):
    """Tests for _rate_limit behavior."""

    def setUp(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    def tearDown(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    @staticmethod
    def _make_fetcher() -> EastmoneyChipFetcher:
        with patch("data_provider.eastmoney_fetcher.EastmoneyChipFetcher.__init__", return_value=None):
            fetcher = EastmoneyChipFetcher.__new__(EastmoneyChipFetcher)
            fetcher._driver = None
            fetcher._last_request_time = 0.0
            fetcher._min_interval = 3.0
        return fetcher

    def test_no_sleep_when_enough_time_passed(self) -> None:
        fetcher = self._make_fetcher()
        fetcher._last_request_time = time.time() - 10
        fetcher._min_interval = 3.0
        fetcher._rate_limit()
        self.assertTrue(fetcher._last_request_time > 0)

    def test_sleeps_when_interval_not_met(self) -> None:
        fetcher = self._make_fetcher()
        fetcher._last_request_time = time.time()
        fetcher._min_interval = 0.3
        start = time.time()
        fetcher._rate_limit()
        elapsed = time.time() - start
        self.assertGreaterEqual(elapsed, 0.25)


class TestFetchChipWithSelenium(unittest.TestCase):
    """Tests for _fetch_chip_with_selenium using mocked driver."""

    def setUp(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    def tearDown(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    @staticmethod
    def _make_fetcher() -> EastmoneyChipFetcher:
        with patch("data_provider.eastmoney_fetcher.EastmoneyChipFetcher.__init__", return_value=None):
            fetcher = EastmoneyChipFetcher.__new__(EastmoneyChipFetcher)
            fetcher._driver = None
            fetcher._last_request_time = 0.0
            fetcher._min_interval = 3.0
        return fetcher

    def test_successful_chip_fetch(self) -> None:
        fetcher = self._make_fetcher()

        fake_element = MagicMock()
        fake_element.text = (
            "日期：2024-03-01\n"
            "获利比例：80%\n"
            "平均成本：1600.00\n"
            "90%成本-下限：1100.00\n"
            "90%成本-上限：2100.00\n"
            "90%集中度：12%\n"
            "70%成本-下限：1300.00\n"
            "70%成本-上限：1900.00\n"
            "70%集中度：18%"
        )

        mock_driver = MagicMock()
        mock_driver.find_element.return_value = fake_element

        with patch.object(fetcher, "_get_driver", return_value=mock_driver):
            with patch.object(fetcher, "_rate_limit"):
                result = fetcher._fetch_chip_with_selenium("600519")

        self.assertIsNotNone(result)
        self.assertEqual(result.code, "600519")
        self.assertAlmostEqual(result.profit_ratio, 0.80, places=4)
        self.assertAlmostEqual(result.avg_cost, 1600.0, places=2)

    def test_returns_none_on_driver_exception(self) -> None:
        """_get_driver is called outside the try block, so exception propagates."""
        fetcher = self._make_fetcher()
        with patch.object(fetcher, "_get_driver", side_effect=Exception("driver crash")):
            with self.assertRaises(Exception):
                fetcher._fetch_chip_with_selenium("600519")

    def test_returns_none_when_parse_returns_none(self) -> None:
        fetcher = self._make_fetcher()

        fake_element = MagicMock()
        fake_element.text = "无有效数据"

        mock_driver = MagicMock()
        mock_driver.find_element.return_value = fake_element

        with patch.object(fetcher, "_get_driver", return_value=mock_driver):
            with patch.object(fetcher, "_rate_limit"):
                result = fetcher._fetch_chip_with_selenium("600519")

        self.assertIsNone(result)


class TestToRatio(unittest.TestCase):
    """Tests for _to_ratio static method."""

    def test_value_over_one_is_divided(self) -> None:
        self.assertAlmostEqual(EastmoneyChipFetcher._to_ratio("15"), 0.15, places=4)
        self.assertAlmostEqual(EastmoneyChipFetcher._to_ratio(25), 0.25, places=4)

    def test_value_under_one_unchanged(self) -> None:
        self.assertAlmostEqual(EastmoneyChipFetcher._to_ratio("0.15"), 0.15, places=4)
        self.assertAlmostEqual(EastmoneyChipFetcher._to_ratio(0.10), 0.10, places=4)

    def test_none_returns_zero(self) -> None:
        self.assertEqual(EastmoneyChipFetcher._to_ratio(None), 0.0)


class TestDriverLifecycle(unittest.TestCase):
    """Tests for driver creation and cleanup."""

    def setUp(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    def tearDown(self) -> None:
        EastmoneyChipFetcher._selenium_available = True

    @staticmethod
    def _make_fetcher() -> EastmoneyChipFetcher:
        with patch("data_provider.eastmoney_fetcher.EastmoneyChipFetcher.__init__", return_value=None):
            fetcher = EastmoneyChipFetcher.__new__(EastmoneyChipFetcher)
            fetcher._driver = None
            fetcher._last_request_time = 0.0
            fetcher._min_interval = 3.0
        return fetcher

    def test_driver_cached_after_creation(self) -> None:
        fetcher = self._make_fetcher()
        mock_driver = MagicMock()
        fetcher._driver = mock_driver

        returned = fetcher._get_driver()
        self.assertEqual(returned, mock_driver)

    def test_close_driver_resets_state(self) -> None:
        fetcher = self._make_fetcher()
        fetcher._driver = MagicMock()
        fetcher._close_driver()
        self.assertIsNone(fetcher._driver)

    def test_close_driver_handles_exception(self) -> None:
        fetcher = self._make_fetcher()
        bad_driver = MagicMock()
        bad_driver.quit.side_effect = Exception("already closed")
        fetcher._driver = bad_driver
        fetcher._close_driver()
        self.assertIsNone(fetcher._driver)


if __name__ == "__main__":
    unittest.main()
