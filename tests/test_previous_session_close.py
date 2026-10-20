import datetime as dt
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import market_service as m

class PreviousSessionCloseTests(unittest.TestCase):
    def payload(self, symbol='FUND.SI', currency='SGD', closes=None):
        days=[14,15,16,19]
        return {'chart':{'result':[{'meta':{'symbol':symbol,'currency':currency,'exchangeTimezoneName':'Asia/Singapore'},'timestamp':[int(dt.datetime(2026,10,d,1,tzinfo=dt.timezone.utc).timestamp()) for d in days],'indicators':{'quote':[{'close':closes if closes is not None else [7.17,7.18,7.19,None]}]}}]}}

    def test_fund_ignores_chart_range_baseline(self):
        stamp=int(dt.datetime(2026,10,16,9,tzinfo=dt.timezone.utc).timestamp())
        intraday={'chart':{'result':[{'meta':{'symbol':'FUND.SI','currency':'SGD','regularMarketPrice':7.19,'regularMarketTime':stamp,'chartPreviousClose':7.31}}]}}
        def fetch(url):
            return json.dumps(self.payload() if 'interval=1d' in url else intraday)
        with patch.object(m,'fetch',side_effect=fetch): result=m.quote_chart('FUND.SI')
        self.assertEqual(result['prev_close'],7.18)
        self.assertEqual(result['prev_close_as_of'],'2026-10-15')
        self.assertAlmostEqual(result['current_pct_change'],(7.19/7.18-1)*100)

    def test_excludes_quote_day_and_future_closes(self):
        with patch.object(m,'fetch',return_value=json.dumps(self.payload(closes=[7.17,None,999,1000]))):
            result=m.previous_session_close('FUND.SI',dt.datetime(2026,10,16,9,tzinfo=dt.timezone.utc),'SGD')
        self.assertEqual(result['prev_close'],7.17)
        self.assertEqual(result['prev_close_as_of'],'2026-10-14')

    def test_rejects_wrong_identity_currency_or_missing_prior_close(self):
        for payload in [self.payload(symbol='OTHER.SI'),self.payload(currency='USD'),self.payload(closes=[None,None,7.19,None])]:
            with self.subTest(payload=payload),patch.object(m,'fetch',return_value=json.dumps(payload)):
                with self.assertRaises(ValueError):
                    m.previous_session_close('FUND.SI',dt.datetime(2026,10,16,9,tzinfo=dt.timezone.utc),'SGD')

    def test_explicit_previous_close_needs_no_history_request(self):
        payload={'chart':{'result':[{'meta':{'symbol':'AAPL','currency':'USD','regularMarketPrice':201,'regularMarketTime':int(dt.datetime(2026,10,16,20,tzinfo=dt.timezone.utc).timestamp()),'previousClose':200,'chartPreviousClose':180}}]}}
        with patch.object(m,'fetch',return_value=json.dumps(payload)) as fetch:
            result=m.quote_chart('AAPL')
        self.assertEqual(fetch.call_count,1)
        self.assertEqual(result['current_pct_change'],(201/200-1)*100)

if __name__=='__main__': unittest.main()
