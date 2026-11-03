import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
export function parseForecast(data) {
  if (!Array.isArray(data) || !data.length || data.length > 1000) throw new Error('Invalid forecast');
  return data.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isSafeInteger(p[0]) || p[0] % 3_600_000 !== 0 || !Number.isFinite(p[1]) || (i && p[0] <= data[i - 1][0])) throw new Error('Invalid forecast interval');
    return { start: p[0], end: p[0] + 3_600_000, price: p[1] };
  });
}
let cache, pending, attemptedAt = 0;
export async function forecast() {
  if (pending) return pending;
  if (Date.now() - attemptedAt < (process.env.FORECAST_FILE ? 60_000 : 1_800_000)) {
    if (cache) return cache;
    throw new Error('Forecast unavailable');
  }
  attemptedAt = Date.now();
  pending = (async () => {
    try {
      let rows, modified, source, narration = null;
      if (process.env.FORECAST_FILE) {
        const file = process.env.FORECAST_FILE;
        const info = await stat(file);
        const raw = await readFile(file, 'utf8');
        rows = parseForecast(JSON.parse(raw));
        try {
          const note = JSON.parse(await readFile(join(dirname(file), 'selfhosted-narration.json'), 'utf8'));
          if (note.forecastSha256 === createHash('sha256').update(raw).digest('hex') && typeof note.text === 'string' && note.text.length <= 2000 && Number.isFinite(note.generatedAt) && note.generatedAt >= info.mtimeMs - 1000) narration = note;
        } catch { /* Commentary is optional; numeric forecasts remain available. */ }
        modified = info.mtimeMs;
        source = 'selfhosted';
      } else {
        const response = await fetch('https://sahkovatkain.web.app/prediction.json', { signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`Forecast HTTP ${response.status}`);
        rows = parseForecast(await response.json());
        modified = Date.parse(response.headers.get('last-modified'));
        source = 'sahkovatkain';
      }
      if (!rows.some(p => p.start > Date.now())) throw new Error('Forecast has expired');
      cache = { prices: rows, fetchedAt: Date.now(), sourceModifiedAt: Number.isFinite(modified) ? modified : null, source, narration, stale: false };
      return cache;
    } catch (error) {
      console.error(error.message);
      if (cache) { cache = { ...cache, stale: true }; return cache; }
      throw error;
    } finally { pending = null; }
  })();
  return pending;
}
