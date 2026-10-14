import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import dividend_update as dividend


class DividendTests(unittest.TestCase):
    def test_chart_dividend_and_yield(self):
        stamp = int(dividend.dt.datetime.now(dividend.dt.timezone.utc).timestamp()) - 86400
        chart = json.dumps({'chart': {'result': [{'events': {'dividends': {'one': {'date': stamp, 'amount': 2}}}}]}})
        def fetch(url):
            if '/chart/' in url:
                return chart
            raise ValueError('Calendar unavailable')
        with patch.object(dividend, 'fetch', side_effect=fetch):
            result = dividend.get_one('TEST', 100)
        self.assertEqual(result['dividend_per_share'], 2)
        self.assertEqual(result['dividend_yield_pct'], 2)
        self.assertIsNone(result['dividend_payment_date'])
        self.assertIsNone(result['dividend_error'])

    def test_failure_retains_prior_values_and_does_not_change_prices(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            prior = {'ticker': 'TEST', 'dividend_per_share': 2, 'ex_dividend_date': '01 Jan 2026'}
            (root / 'dividend-data.json').write_text(json.dumps({'instruments': [prior]}))
            market = json.dumps({'instruments': [{'ticker': 'TEST', 'current_price': 100}]})
            (root / 'market-data.json').write_text(market)
            with patch.object(dividend, 'ROOT', root), patch.object(dividend, 'read_config', return_value={}), patch.object(dividend, 'validate', return_value={'instruments': [{'ticker': 'TEST', 'enabled': True}]}), patch.object(dividend, 'fetch', side_effect=ValueError('Offline')):
                result = dividend.run()
            self.assertEqual(result['instruments'][0]['dividend_per_share'], 2)
            self.assertEqual(result['instruments'][0]['ex_dividend_date'], prior['ex_dividend_date'])
            self.assertTrue(result['instruments'][0]['dividend_error'])
            self.assertEqual((root / 'market-data.json').read_text(), market)


if __name__ == '__main__':
    unittest.main()
