import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import market_service


class ValidateConfigTests(unittest.TestCase):
    def test_preserves_complete_saved_metadata_without_lookup(self):
        original_lookup = market_service.lookup
        try:
            def fail_lookup(ticker):
                raise AssertionError("lookup should not run for complete saved metadata")

            market_service.lookup = fail_lookup
            result = market_service.validate(
                {
                    "version": 1,
                    "refreshIntervalMinutes": 15,
                    "instruments": [
                        {
                            "ticker": "SHEL",
                            "enabled": True,
                            "name": "Shell plc",
                            "region": "NYSE",
                            "type": "Stock",
                            "metadata_source": "Yahoo Finance quote webpage",
                        }
                    ],
                }
            )
        finally:
            market_service.lookup = original_lookup

        self.assertEqual(result["instruments"][0]["ticker"], "SHEL")
        self.assertEqual(result["instruments"][0]["name"], "Shell plc")
        self.assertEqual(result["instruments"][0]["type"], "Stock")

    def test_ticker_only_entry_still_uses_lookup(self):
        calls = []
        original_lookup = market_service.lookup
        try:
            def fake_lookup(ticker):
                calls.append(ticker)
                return {
                    "ticker": ticker,
                    "name": "Apple Inc.",
                    "region": "United States",
                    "type": "Stock",
                    "metadata_source": "Test directory",
                }

            market_service.lookup = fake_lookup
            result = market_service.validate(
                {
                    "version": 1,
                    "tickers": [{"ticker": "aapl", "enabled": False}],
                }
            )
        finally:
            market_service.lookup = original_lookup

        self.assertEqual(calls, ["AAPL"])
        self.assertEqual(result["instruments"][0]["ticker"], "AAPL")
        self.assertFalse(result["instruments"][0]["enabled"])


if __name__ == "__main__":
    unittest.main()
