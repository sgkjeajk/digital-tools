import datetime as dt
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import google_dividend_fallback as google
import dividend_update as dividend
from google_price_fallback import google_symbol, quote_currency


def page(metrics='', symbol='AAPL:NASDAQ', currency='USD', days=1):
    stamp=dt.datetime.now(dt.timezone.utc)-dt.timedelta(days=days)
    text='\n'.join([symbol,'Apple Inc','$100.00',
                    stamp.strftime('Closed: %b %d, %I:%M:%S %p GMT+0')+' · '+currency,
                    metrics])
    return '<pre>'+text+'</pre>'


class GoogleDividendTests(unittest.TestCase):
    def test_explicit_fields(self):
        data=google.parse_dividends(page('Dividend\n0.31%\nQuarterly dividend\n$0.27\nEx-dividend date\nAug 10, 2026'),'AAPL')
        self.assertEqual(data['dividend_yield_pct'],0.31)
        self.assertEqual(data['dividend_per_share'],0.27)
        self.assertEqual(data['ex_dividend_date'],'10 Aug 2026')

    def test_partial_yield_does_not_invent_amount_or_high(self):
        data=google.parse_dividends(page('Dividend\n2.00%\n52-wk high\n$200.00'),'AAPL')
        self.assertNotIn('dividend_per_share',data)
        self.assertNotIn('ath',data)

    def test_wrong_symbol_and_currency_rejected(self):
        for body in [page('Dividend\n2.00%',symbol='MSFT:NASDAQ'),page('Dividend\n2.00%',currency='EUR')]:
            with self.assertRaises(ValueError):google.parse_dividends(body,'AAPL')

    def test_related_ticker_dividend_is_not_used(self):
        with self.assertRaises(ValueError):
            google.parse_dividends(page('Related stocks\nDividend\n2.00%'),'AAPL')

    def test_missing_and_conflicting_values_rejected(self):
        for metrics in ['Dividend\n—','Dividend\n2.00%\nDividend\n3.00%']:
            with self.assertRaises(ValueError):google.parse_dividends(page(metrics),'AAPL')

    def test_stale_quote_rejected(self):
        with self.assertRaises(ValueError):google.parse_dividends(page('Dividend\n2.00%',days=20),'AAPL')

    def test_munich_identity_and_currency(self):
        self.assertEqual(google_symbol('GQC0.MU'),'GQC0:MUN')
        self.assertEqual(quote_currency('GQC0.MU'),'EUR')
        data=google.parse_dividends(page('Annual dividend\n€0.20',symbol='GQC0:MUN',currency='EUR'),'GQC0.MU')
        self.assertEqual(data['dividend_per_share'],0.20)

    def test_yahoo_success_does_not_call_google(self):
        stamp=int(dt.datetime.now(dt.timezone.utc).timestamp())-86400
        body=json.dumps({'chart':{'result':[{'meta':{'symbol':'AAPL'},'events':{'dividends':{'a':{'date':stamp,'amount':2}}}}]}})
        with patch.object(dividend,'fetch',return_value=body),patch.object(dividend,'google_dividends') as fallback:
            result=dividend.get_one('AAPL',100)
        fallback.assert_not_called()
        self.assertEqual(result['dividend_per_share'],2)

    def test_yahoo_empty_and_failure_use_google(self):
        empty=json.dumps({'chart':{'result':[{'meta':{'symbol':'AAPL'}}]}})
        for options in [dict(return_value=empty),dict(side_effect=ValueError('offline'))]:
            with patch.object(dividend,'fetch',**options),patch.object(dividend,'google_dividends',return_value={'dividend_yield_pct':2,'dividend_source':'Google Finance individual ticker webpage'}) as fallback:
                result=dividend.get_one('AAPL',100)
            fallback.assert_called_once()
            self.assertEqual(result['dividend_yield_pct'],2)
            self.assertIn('dividend_per_share',result['dividend_missing_fields'])

    def test_wrong_yahoo_symbol_does_not_supply_dividend(self):
        body=json.dumps({'chart':{'result':[{'meta':{'symbol':'MSFT'},'events':{'dividends':{'a':{'date':1,'amount':9}}}}]}})
        with patch.object(dividend,'fetch',return_value=body),patch.object(dividend,'google_dividends',side_effect=ValueError('missing')):
            result=dividend.get_one('AAPL',100)
        self.assertNotIn('dividend_per_share',result)
        self.assertTrue(result['dividend_error'])

    def test_partial_update_preserves_saved_fields_and_price_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'dividend-data.json').write_text(json.dumps({'instruments':[{'ticker':'AAPL','dividend_per_share':1,'ex_dividend_date':'01 Jan 2026'}]}))
            market=json.dumps({'instruments':[{'ticker':'AAPL','current_price':100}]})
            (root/'market-data.json').write_text(market)
            update={'ticker':'AAPL','dividend_yield_pct':2,'dividend_source':'Google Finance individual ticker webpage','dividend_error':None,'dividend_missing_fields':['dividend_per_share','ex_dividend_date']}
            with patch.object(dividend,'ROOT',root),patch.object(dividend,'read_config',return_value={}),patch.object(dividend,'validate',return_value={'instruments':[{'ticker':'AAPL','enabled':True}]}),patch.object(dividend,'get_one',return_value=update):
                result=dividend.run()['instruments'][0]
            self.assertEqual(result['dividend_per_share'],1)
            self.assertEqual(result['ex_dividend_date'],'01 Jan 2026')
            self.assertEqual(result['dividend_yield_pct'],2)
            self.assertEqual((root/'market-data.json').read_text(),market)


if __name__=='__main__':unittest.main()
