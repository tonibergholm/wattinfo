import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReading } from '../fingrid.js';
test('Fingrid readings validate identity, value, and observation time', () => {
  const row = { datasetId: 193, value: 11259.2, startTime: '2026-11-03T10:06:00.000Z' };
  assert.deepEqual(parseReading(row, 193), { value: 11259.2, timestamp: Date.parse(row.startTime) });
  for (const bad of [{ ...row, datasetId: 181 }, { ...row, value: null }, { ...row, startTime: 'bad' }]) assert.throws(() => parseReading(bad, 193));
});
