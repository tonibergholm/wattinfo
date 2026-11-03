import importlib.util
from pathlib import Path
import sqlite3
import unittest

spec = importlib.util.spec_from_file_location('tracking', Path(__file__).parents[1] / 'deploy/track-forecast.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
H = module.HOUR

class TrackingTest(unittest.TestCase):
    def test_actual_hour_requires_complete_contiguous_quarters(self):
        parts = [(i*H//4,(i+1)*H//4,i) for i in range(4)]
        self.assertEqual(module.hourly_actuals(parts), {0:1.5})
        self.assertEqual(module.hourly_actuals(parts[:3]), {})
        self.assertEqual(module.hourly_actuals(parts+parts[:1]), {})

    def test_forecasts_remain_immutable_and_known_prices_never_count(self):
        with sqlite3.connect(':memory:') as db:
            module.init_db(db)
            module.record_run(db, [[H,9],[25*H,8],[49*H,3]], {H:9}, 0, 'v1', True)
            module.record_run(db, [[H,100]], {H:4,25*H:5,49*H:5}, 1, 'v2', True)
            report=module.score(db)
            self.assertEqual(db.execute('select price from predictions where run_id=1 and target=?',(H,)).fetchone()[0],9)
            self.assertEqual(report['buckets'][0]['count'],0)
            self.assertEqual(report['buckets'][1]['mae'],3)
            self.assertEqual(report['buckets'][1]['bias'],3)
            self.assertEqual(report['buckets'][2]['bias'],-2)

    def test_unknown_publication_status_is_excluded_from_scores(self):
        with sqlite3.connect(':memory:') as db:
            module.init_db(db)
            module.record_run(db, [[H,10]], {}, 0, 'v1', False)
            module.record_run(db, [], {H:5}, H*2, 'v1', True)
            self.assertEqual(module.score(db)['buckets'][0]['count'],0)

if __name__ == '__main__':
    unittest.main()
