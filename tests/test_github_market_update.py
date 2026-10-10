import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import github_market_update


class GithubMarketUpdateTests(unittest.TestCase):
    def test_heartbeat_updates_snapshot_when_scrape_is_skipped(self):
        original_root = github_market_update.ROOT
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / "data").mkdir()
                github_market_update.ROOT = root
                original = {
                    "generated_at": "2026-01-01T00:00:00Z",
                    "config_revision": 1,
                    "instruments": [{"ticker": "AAPL", "price_retrieved_at": "2026-01-01T00:00:00Z"}],
                    "source": "Yahoo Finance; per-row timestamps and errors apply",
                }
                (root / "market-data.json").write_text(json.dumps(original), encoding="utf-8")

                data = github_market_update.write_check_heartbeat(
                    {"revision": 2, "instruments": []},
                    "skipped_recent_prices_fresh",
                    request_id="req-123",
                )
                mirrored = json.loads((root / "data" / "stock-monitor.json").read_text(encoding="utf-8"))

                self.assertNotEqual(data["generated_at"], original["generated_at"])
                self.assertEqual(data["last_check_completed_at"], data["generated_at"])
                self.assertEqual(data["last_check_status"], "skipped_recent_prices_fresh")
                self.assertEqual(data["config_revision"], 2)
                self.assertEqual(data["request_id"], "req-123")
                self.assertEqual(data["instruments"], original["instruments"])
                self.assertEqual(mirrored, data)
        finally:
            github_market_update.ROOT = original_root


if __name__ == "__main__":
    unittest.main()
