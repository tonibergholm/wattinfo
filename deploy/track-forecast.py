#!/usr/bin/env python3
"""Keep immutable issued forecasts and score them against published hourly means."""
import json
import math
import os
from pathlib import Path
import sqlite3
import subprocess
import time
import urllib.request

HOUR = 3_600_000


def hourly_actuals(rows):
    groups = {}
    for row in rows:
        t, end, value = row
        assert math.isfinite(value) and end > t
        groups.setdefault(t // HOUR * HOUR, []).append((t, end, value))
    result = {}
    for hour, parts in groups.items():
        parts.sort()
        if parts[0][0] == hour and parts[-1][1] == hour + HOUR and all(p[0] == parts[i - 1][1] for i, p in enumerate(parts) if i):
            result[hour] = sum((end - start) * value for start, end, value in parts) / HOUR
    return result


def init_db(db):
    db.executescript('''
        CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, issued_at INTEGER NOT NULL, revision TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS predictions (run_id INTEGER NOT NULL, target INTEGER NOT NULL, price REAL NOT NULL, known_at_issue INTEGER, PRIMARY KEY(run_id,target));
        CREATE TABLE IF NOT EXISTS actuals (target INTEGER PRIMARY KEY, price REAL NOT NULL);
    ''')


def record_run(db, predictions, actuals, issued_at, revision, observed):
    cursor = db.execute('INSERT INTO runs(issued_at,revision) VALUES(?,?)', (issued_at, revision))
    db.executemany('INSERT INTO predictions VALUES(?,?,?,?)', [(cursor.lastrowid, int(t), price, int(t in actuals) if observed else None) for t, price in predictions if t >= issued_at])
    db.executemany('INSERT INTO actuals VALUES(?,?) ON CONFLICT(target) DO UPDATE SET price=excluded.price', actuals.items())


def score(db):
    points = db.execute('''SELECT p.target-r.issued_at, p.price-a.price, p.target FROM predictions p JOIN runs r ON r.id=p.run_id JOIN actuals a ON a.target=p.target WHERE p.known_at_issue=0 AND p.target>r.issued_at''').fetchall()
    buckets = []
    for low, high, label in [(0,24,'Alle 24 h'),(24,48,'24–48 h'),(48,72,'48–72 h'),(72,float('inf'),'Yli 72 h')]:
        subset = [(error, target) for lead, error, target in points if low <= lead / HOUR < high]
        n = len(subset)
        buckets.append({'label': label, 'count': n, 'hours': len({t for _, t in subset}), 'mae': sum(abs(e) for e, _ in subset) / n if n else None, 'bias': sum(e for e, _ in subset) / n if n else None})
    first = db.execute('SELECT min(issued_at) FROM runs').fetchone()[0]
    return {'startedAt': first, 'updatedAt': int(time.time()*1000), 'buckets': buckets}


def main():
    from datetime import datetime
    os.umask(0o077)
    root = Path.home() / 'apps/wattinfo'
    predictions = json.loads((root/'selfhosted-forecast.json').read_text())
    actuals, observed = {}, False
    try:
        request = urllib.request.Request('https://api.porssisahko.net/v2/latest-prices.json', headers={'User-Agent': 'WattInfo/1.0 (+https://github.com/tonibergholm/wattinfo)'})
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
        rows = [(round(datetime.fromisoformat(p['startDate'].replace('Z','+00:00')).timestamp()*1000), round(datetime.fromisoformat(p['endDate'].replace('Z','+00:00')).timestamp()*1000)+1, p['price']) for p in data['prices']]
        actuals = hourly_actuals(rows)
        observed = bool(actuals)
    except Exception as error:
        print(f'Actual-price fetch failed ({type(error).__name__}); this issue will be excluded from scoring')
    revision = subprocess.check_output(['git','-C',str(Path.home()/'apps/nordpool-predict-fi'),'rev-parse','HEAD'],text=True).strip()
    with sqlite3.connect(root/'forecast-history.sqlite') as db:
        init_db(db)
        record_run(db, predictions, actuals, int(time.time()*1000), revision, observed)
        report = score(db)
    target = root/'forecast-accuracy.json'
    staging = target.with_suffix('.tmp')
    staging.write_text(json.dumps(report, allow_nan=False))
    os.replace(staging,target)
    print('Saved forecast issue and updated accuracy report')


if __name__ == '__main__':
    main()
