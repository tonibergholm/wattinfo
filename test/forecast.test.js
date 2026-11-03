import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseForecast } from '../forecast.js';
test('hourly forecast preserves negative VAT-inclusive prices without extra tax', () => {
  assert.deepEqual(parseForecast([[0, -1.25], [3600000, 2.5]]), [{ start: 0, end: 3600000, price: -1.25 }, { start: 3600000, end: 7200000, price: 2.5 }]);
  for (const bad of [[], [[0,null]], [[0,'2']], [[0,1],[0,2]], [[3600000,1],[0,2]], [[1,2]]]) assert.throws(() => parseForecast(bad));
});
test('forecast shares cached fetches and marks fallback stale after failure', async () => {
  const originalFetch = globalThis.fetch, originalNow = Date.now;
  let now = originalNow(), calls = 0;
  Date.now = () => now;
  globalThis.fetch = async () => {
    calls++;
    if (calls > 1) throw new Error('Simulated outage');
    return { ok: true, headers: new Headers({ 'last-modified': new Date(now).toUTCString() }), json: async () => [[Math.ceil(now / 3600000) * 3600000, 2]] };
  };
  try {
    const { forecast } = await import('../forecast.js?cache-test');
    const [a, b] = await Promise.all([forecast(), forecast()]);
    assert.equal(calls, 1); assert.deepEqual(a, b); assert(!a.stale);
    await forecast(); assert.equal(calls, 1);
    now += 1800001;
    const old = await forecast(); assert(old.stale); assert.equal(old.fetchedAt, a.fetchedAt);
    await forecast(); assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
});
test('configured local forecast is read without contacting external publisher', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = await mkdtemp(join(tmpdir(), 'wattinfo-forecast-'));
  const oldFile = process.env.FORECAST_FILE, oldFetch = globalThis.fetch;
  try {
    const file = join(dir, 'prediction.json');
    await writeFile(file, JSON.stringify([[Math.ceil(Date.now() / 3600000) * 3600000, -2.5]]));
    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    const noteFile = join(dir, 'selfhosted-narration.json');
    const note = { text: 'Paikallinen yhteenveto', generatedAt: Date.now(), forecastSha256: createHash('sha256').update(await readFile(file)).digest('hex') };
    await writeFile(noteFile, JSON.stringify(note));
    process.env.FORECAST_FILE = file;
    globalThis.fetch = () => { throw new Error('Unexpected network request'); };
    const { forecast } = await import('../forecast.js?local-test');
    const result = await forecast();
    assert.equal(result.source, 'selfhosted');
    assert.equal(result.prices[0].price, -2.5);
    assert(Number.isFinite(result.sourceModifiedAt));
    assert.equal(result.narration.text, note.text);
    await writeFile(noteFile, JSON.stringify({ ...note, forecastSha256: 'different forecast' }));
    const mismatched = await import('../forecast.js?mismatched-commentary');
    assert.equal((await mismatched.forecast()).narration, null);
  } finally {
    if (oldFile === undefined) delete process.env.FORECAST_FILE; else process.env.FORECAST_FILE = oldFile;
    globalThis.fetch = oldFetch;
    await rm(dir, { recursive: true });
  }
});
