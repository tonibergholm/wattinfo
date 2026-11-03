import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

export function parseReading(data, datasetId) {
  const timestamp = Date.parse(data.startTime);
  if (data.datasetId !== datasetId || !Number.isFinite(data.value) || !Number.isFinite(timestamp)) throw new Error('Invalid Fingrid reading');
  return { value: data.value, timestamp };
}
let cache, pending, attemptedAt = 0;
export async function grid() {
  if (pending) return pending;
  if (Date.now() - attemptedAt < 300_000) {
    if (cache) return cache;
    throw new Error('Fingrid temporarily unavailable');
  }
  attemptedAt = Date.now();
  pending = (async () => {
    try {
      const key = (await readFile(process.env.FINGRID_KEY_FILE || new URL('./.fingrid-key', import.meta.url), 'utf8')).trim();
      const readings = {};
      for (const [name, id] of [['consumption', 193], ['production', 192], ['wind', 181]]) {
        // Fingrid allows one request per two seconds for each key.
        await delay(2100);
        const response = await fetch(`https://data.fingrid.fi/api/datasets/${id}/data/latest`, { headers: { 'x-api-key': key }, signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`Fingrid HTTP ${response.status}`);
        readings[name] = parseReading(await response.json(), id);
      }
      cache = { ...readings, fetchedAt: Date.now(), stale: false };
      return cache;
    } catch (error) {
      console.error('Fingrid update failed:', error.code || error.message);
      if (cache) { cache = { ...cache, stale: true }; return cache; }
      throw new Error('Fingrid unavailable');
    } finally { pending = null; }
  })();
  return pending;
}
