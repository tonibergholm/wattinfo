import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planUsage, windowPrice, allowedWindow, rangeBlocks } from '../public/planner.js';
const q = 900_000;
const start = Date.parse('2026-11-03T12:00Z');
const rows = Array.from({ length: 96 }, (_, i) => ({ start: start + i * q, end: start + (i + 1) * q, price: i >= 12 && i < 24 ? -1 : 10 }));
test('planner finds complete cheapest quarter-hour starts and distinct alternatives', () => {
  const result = planUsage(rows, start, 3);
  assert.deepEqual(result.best[0], { start: start + 12 * q, end: start + 24 * q, price: -1 });
  assert.equal(result.nowPrice, 10);
  assert.equal(result.best.length, 3);
  for (let i = 0; i < result.best.length; i++) for (let j = i + 1; j < result.best.length; j++) assert(result.best[i].end <= result.best[j].start || result.best[i].start >= result.best[j].end);
});
test('weighted start-now comparison, gaps and expired rows', () => {
  assert.equal(windowPrice(rows, start + q / 2, start + q * 1.5), 10);
  assert.equal(windowPrice(rows.filter((_, i) => i !== 3), start, start + q * 4), null);
  assert.equal(planUsage(rows, rows.at(-1).end, 1).best.length, 0);
  assert.equal(planUsage(rows.slice(0, 3), start, 1).best.length, 0);
});
test('allowed hours cover entire cycle, overnight and midnight', () => {
  const at = s => Date.parse(s);
  assert(allowedWindow(at('2026-11-03T19:00Z'), at('2026-11-03T20:00Z'), 420, 1320));
  assert(!allowedWindow(at('2026-11-03T19:00Z'), at('2026-11-03T20:15Z'), 420, 1320));
  assert(allowedWindow(at('2026-11-03T21:00Z'), at('2026-11-04T01:00Z'), 1320, 420));
  assert(!allowedWindow(at('2026-11-04T04:30Z'), at('2026-11-04T05:30Z'), 1320, 420));
  assert.throws(() => planUsage(rows, start, 0));
  assert.throws(() => planUsage(rows, start, 3, 420, 420));
});
test('continuous 24 hours crosses midnight and retains missing intervals', () => {
  const blocks = rangeBlocks(rows.slice(0, 4), start, start + 86400000);
  assert.equal(blocks.length, 12);
  assert.equal(blocks.at(-1).end - blocks[0].start, 86400000);
  assert(blocks.every(b => b.price === null));
});
