#!/usr/bin/env python3
"""Generate optional local commentary without changing numeric forecasts."""
import hashlib
import json
import os
import re
from pathlib import Path
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo


def daily_summary(rows, now):
    days = {}
    tz = ZoneInfo('Europe/Helsinki')
    for stamp, price in rows:
        if stamp + 3_600_000 <= now * 1000 or stamp > (now + 7 * 86400) * 1000:
            continue
        day = datetime.fromtimestamp(stamp / 1000, tz).strftime('%d.%m.%Y')
        days.setdefault(day, []).append((stamp, price))
    result = []
    for day, points in days.items():
        midnight = datetime.strptime(day, '%d.%m.%Y').replace(tzinfo=tz)
        start = int(midnight.timestamp() * 1000)
        end = int((midnight + timedelta(days=1)).timestamp() * 1000)
        complete = [t for t, _ in points] == list(range(start, end, 3_600_000))
        result.append({'date': day, 'hours': len(points), 'mean_snt_kwh': round(sum(p for _, p in points) / len(points), 2), 'complete': complete})
    return result


def validate_narration(text, summary):
    assert 30 <= len(text) <= 2000, 'Invalid narration length'
    assert not re.search(r'€|euro|%|prosent', text, re.I), 'Unsupported unit in commentary'
    prices = {round(day['mean_snt_kwh'], 2) for day in summary}
    for number in re.findall(r'([+-]?\d+(?:[.,]\d+)?)\s*(?:snt|sentti)', text, re.I):
        assert round(float(number.replace(',', '.')), 2) in prices, 'Invented price in commentary'


def validate_dates(text, expected):
    months = ['tammikuuta', 'helmikuuta', 'maaliskuuta', 'huhtikuuta', 'toukokuuta', 'kesäkuuta', 'heinäkuuta', 'elokuuta', 'syyskuuta', 'lokakuuta', 'marraskuuta', 'joulukuuta']
    normalized = text.lower()
    for i, month in enumerate(months, 1):
        normalized = re.sub(r'(\d{1,2})\.?\s+' + month + r'\s+(\d{4})', lambda m: f'{m[1]}.{i}.{m[2]}', normalized)
    dates = {datetime.strptime(value, '%d.%m.%Y').date() for value in re.findall(r'\d{1,2}\.\d{1,2}\.\d{4}', normalized)}
    assert {datetime.strptime(value, '%d.%m.%Y').date() for value in expected} <= dates, 'Missing source dates'


def main():
    os.umask(0o077)
    root = Path.home() / 'apps/wattinfo'
    raw = (root / 'selfhosted-forecast.json').read_bytes()
    summary = daily_summary(json.loads(raw), time.time())
    assert summary, 'No future forecasts'
    complete = [day for day in summary if day['complete']]
    assert complete, 'No complete forecast days to summarize'
    cheapest = min(complete, key=lambda day: day['mean_snt_kwh'])
    highest = max(complete, key=lambda day: day['mean_snt_kwh'])
    low_price = f"{cheapest['mean_snt_kwh']:.2f}".replace('.', ',')
    high_price = f"{highest['mean_snt_kwh']:.2f}".replace('.', ',')
    facts = (f"Ennusteen edullisin kokonainen päivä on {cheapest['date']}, "
             f"keskihinta {low_price} snt/kWh. "
             f"Ennusteen kallein kokonainen päivä on {highest['date']}, "
             f"keskihinta {high_price} snt/kWh. "
             'Hinnat ovat arvioita ja ennuste voi muuttua.')
    prompt = ('Kirjoita lyhyt ja sujuva sähkön hintanäkymä näiden faktojen pohjalta. '
              'Älä lisää uusia tietoja. Vastaa vain valmiilla tekstillä ilman otsikkoa. ' + facts)
    body = {'model': 'wattinfo-ahma', 'stream': False, 'keep_alive': 0,
            'messages': [{'role': 'user', 'content': prompt}],
            'options': {'num_ctx': 2048, 'num_predict': 256, 'num_thread': 2, 'temperature': 0.1}}
    text, generated_by = facts, 'computed'
    try:
        request = urllib.request.Request('http://127.0.0.1:11434/api/chat', data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            raise RuntimeError('Local Ollama: ' + error.read().decode()[:500]) from None
        candidate = result['message']['content'].strip().removeprefix('[/INST]').strip()
        (root / 'narration-last-response.json').write_text(json.dumps(result, ensure_ascii=False))
        assert result.get('done') and result.get('done_reason') != 'length', 'Narration truncated'
        validate_narration(candidate, summary)
        validate_dates(candidate, [cheapest['date'], highest['date']])
        assert re.search(r'edullis|halv', candidate, re.I) and re.search(r'kalle|korke', candidate, re.I), 'Missing cheap/expensive distinction'
        text, generated_by = candidate, 'ollama'
    except Exception as error:
        print(f'LLM commentary unavailable or rejected ({type(error).__name__}); publishing computed facts')
    # Associate commentary with exactly the numeric forecast it describes.
    payload = {'text': text, 'model': body['model'] if generated_by == 'ollama' else None, 'generatedBy': generated_by, 'generatedAt': int(time.time() * 1000),
               'forecastSha256': hashlib.sha256(raw).hexdigest()}
    target = root / 'selfhosted-narration.json'
    staging = target.with_suffix('.tmp')
    staging.write_text(json.dumps(payload, ensure_ascii=False))
    os.replace(staging, target)
    print('Published summary: ' + generated_by)


if __name__ == '__main__':
    main()
