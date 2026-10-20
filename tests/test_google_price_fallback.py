import datetime as dt
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import google_price_fallback as google


class GoogleFallbackParserTests(unittest.TestCase):
    def test_static_quote_parser_extracts_exact_symbol_quote(self):
        day = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1)
        quote_day = day.strftime('%b %d')
        body = (
            'AF_initDataCallback({key: "ds:8", data:[[[[null,["AAPL","NASDAQ"]],'
            'null,331.695,"/m/07zmbvf",330.7,338.61,336.64,2,-3.7799988,'
            '2,-1.1103927,2,"USD","AAPL:NASDAQ","Apple Inc",340.42]]]]});'
            f'<div class="jZZ2de">Closed:&nbsp;{quote_day}, 4:00:00&#8239;PM GMT-4'
            '&nbsp; &middot; &nbsp; USD</div>'
        )

        parsed = google.parse_static_quote(body, "AAPL")

        self.assertEqual(parsed["source"], "Google Finance individual ticker webpage")
        self.assertEqual(parsed["current_price"], 336.64)
        self.assertEqual(parsed["prev_close"], 340.42)
        self.assertEqual(parsed["currency"], "USD")
        self.assertEqual(
            parsed["price_as_of"],
            day.replace(hour=20, minute=0, second=0, microsecond=0).isoformat(),
        )


if __name__ == "__main__":
    unittest.main()
