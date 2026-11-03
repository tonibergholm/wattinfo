#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$HOME/apps/nordpool-predict-fi"
exec 9> .wattinfo-run.lock
flock -n 9 || exit 0
export OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 NUMBA_NUM_THREADS=2 MPLBACKEND=Agg
started=$(date +%s)
/usr/bin/time -v .venv/bin/python nordpool_predict_fi.py --predict --commit --deploy > logs/wattinfo-run.log 2>&1
.venv/bin/python - "$started" <<'PY'
import json, math, os, sys, time
from pathlib import Path
source = Path('output/prediction.json')
assert source.stat().st_mtime >= int(sys.argv[1]), 'No new forecast generated'
rows = json.loads(source.read_text())
assert 24 <= len(rows) <= 1000, 'Invalid forecast length'
for i, row in enumerate(rows):
    assert isinstance(row, list) and len(row) == 2, 'Invalid forecast row'
    t, price = row
    assert isinstance(t, (int, float)) and math.isfinite(t) and t % 3_600_000 == 0, 'Invalid forecast time'
    assert isinstance(price, (int, float)) and math.isfinite(price), 'Invalid forecast price'
    assert not i or t - rows[i - 1][0] == 3_600_000, 'Forecast gap'
assert rows[-1][0] > (time.time() + 86400) * 1000, 'Insufficient future forecast'
target = Path.home() / 'apps/wattinfo/selfhosted-forecast.json'
staging = target.with_suffix('.tmp')
staging.write_text(json.dumps(rows, allow_nan=False))
os.replace(staging, target)
print(f'Published {len(rows)} hourly forecasts')
PY
# Tracking failure must not discard a successfully generated forecast.
python3 "$HOME/apps/wattinfo/deploy/track-forecast.py" || echo 'Forecast accuracy tracking failed'
