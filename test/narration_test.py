import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('narration', Path(__file__).parents[1] / 'deploy/narrate-forecast.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class NarrationTest(unittest.TestCase):
    def test_summary_groups_finnish_midnight_and_excludes_expired_rows(self):
        from datetime import datetime
        now = datetime.fromisoformat('2026-11-03T21:30:00+00:00').timestamp()
        start = int(now - 1800) * 1000
        rows = [[start - 3600000, 99], [start, -2], [start + 3600000, 4]]
        self.assertEqual(module.daily_summary(rows, now), [
            {'date': '03.11.2026', 'hours': 1, 'mean_snt_kwh': -2, 'complete': False},
            {'date': '04.11.2026', 'hours': 1, 'mean_snt_kwh': 4, 'complete': False}])

    def test_rejects_invented_units_and_prices(self):
        data = [{'mean_snt_kwh': 3.5}]
        module.validate_narration('Ennusteen keskihinta on 3,50 snt/kWh. Ennuste voi muuttua.', data)
        for text in ['Keskihinta on 10 €/kWh. Ennuste voi muuttua.', 'Keskihinta on 10 snt/kWh. Ennuste voi muuttua.']:
            with self.assertRaises(AssertionError): module.validate_narration(text, data)

    def test_finnish_date_formats_preserve_the_source_dates(self):
        module.validate_dates('Halvinta 7. marraskuuta 2026, kalleinta 09.11.2026.', ['07.11.2026','09.11.2026'])
        with self.assertRaises(AssertionError): module.validate_dates('Halvinta 8. marraskuuta 2026.', ['07.11.2026'])

    def test_complete_days_require_calendar_coverage_including_dst(self):
        from datetime import datetime
        for stamp, hours, expected in [('2026-03-28T22:00:00+00:00',23,True), ('2026-11-02T22:00:00+00:00',23,False)]:
            start = int(datetime.fromisoformat(stamp).timestamp()*1000)
            rows = [[start+i*3600000,2] for i in range(hours)]
            self.assertEqual(module.daily_summary(rows,start/1000-1)[0]['complete'],expected)

    def test_failed_llm_validation_publishes_computed_facts(self):
        import json
        import tempfile
        from unittest.mock import patch, MagicMock
        from datetime import datetime
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder)
            root=home/'apps/wattinfo'; root.mkdir(parents=True)
            start=int(datetime.fromisoformat('2026-11-03T22:00:00+00:00').timestamp()*1000)
            (root/'selfhosted-forecast.json').write_text(json.dumps([[start+i*3600000,2.5 if i<24 else 4] for i in range(48)]))
            response=MagicMock()
            response.__enter__.return_value.read.return_value=json.dumps({'done':True,'done_reason':'stop','message':{'content':'Keskihinta on 10 €/kWh. Ennuste voi muuttua.'}}).encode()
            with patch.object(module.Path,'home',return_value=home), patch.object(module.time,'time',return_value=start/1000-1), patch.object(module.urllib.request,'urlopen',return_value=response):
                module.main()
            result=json.loads((root/'selfhosted-narration.json').read_text())
            self.assertEqual(result['generatedBy'],'computed')
            self.assertIsNone(result['model'])
            self.assertIn('2,50 snt/kWh',result['text'])
            self.assertNotIn('€',result['text'])

if __name__ == '__main__':
    unittest.main()
