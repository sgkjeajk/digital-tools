import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import market_service as market


class SavedExchangeCloseTests(unittest.TestCase):
    def previous(self, stamp):
        with patch.object(market, 'fetch', side_effect=ValueError('Yahoo history absent')):
            return market.previous_day_change('GQC0.MU', stamp)

    def test_previous_two_closes_use_berlin_date(self):
        result = self.previous('2026-10-16T00:30:00+02:00')
        self.assertAlmostEqual(result['prev_day_pct_change'], (58.562 / 58.35 - 1) * 100)
        self.assertEqual(result['prev_day_change_as_of'], '2026-10-15')
        self.assertEqual(result['prev_day_change_retrieved_at'], '2026-10-19T02:50:00Z')
        self.assertIn('one-time verified', result['prev_day_change_source'])

    def test_monday_uses_friday_and_thursday(self):
        result = self.previous('2026-10-19T10:00:00+02:00')
        self.assertAlmostEqual(result['prev_day_pct_change'], (58.775 / 58.562 - 1) * 100)
        self.assertEqual(result['prev_day_change_as_of'], '2026-10-16')

    def test_missing_future_session_is_not_fresh(self):
        with self.assertRaisesRegex(ValueError, 'required previous session'):
            self.previous('2026-10-20T10:00:00+02:00')

    def test_unknown_instrument_rejects_saved_share_class(self):
        with patch.object(market, 'fetch', side_effect=ValueError('Yahoo absent')):
            with self.assertRaisesRegex(ValueError, 'identity mismatch'):
                market.previous_day_change('OTHER.MU', '2026-10-16T10:00:00+02:00')

    def test_missing_all_time_high_never_claims_saved_value(self):
        quote = {'current_price': 58.775, 'price_as_of': '2026-10-16T10:00:00+02:00'}
        with patch.object(market, 'quote', return_value=quote), patch.object(market, 'historical_high_verified', side_effect=ValueError('No verified full history')), patch.object(market, 'fetch', side_effect=ValueError('Yahoo absent')):
            result = market.retrieve({'ticker': 'GQC0.MU'}, {}, history=True)
        self.assertIsNone(result.get('ath'))
        self.assertIsNone(result.get('drawdown_pct'))
        self.assertTrue(result['ath_error'].startswith('ATH unavailable'))


if __name__ == '__main__':
    unittest.main()
