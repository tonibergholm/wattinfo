import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrices, average, cheapestWindow, dayKey, time } from '../public/prices.js';
const quarter = 900_000;
const rows = Array.from({ length: 12 }, (_, i) => ({ start: i * quarter, end: (i + 1) * quarter, price: i < 4 ? 10 : -2 }));
test('cheapest future contiguous two hours supports negative prices', () => {
  assert.deepEqual(cheapestWindow(rows, 1), { start: 4 * quarter, end: 12 * quarter, price: -2 });
  assert.equal(cheapestWindow(rows.slice(0, 7), 0), null);
  assert.equal(cheapestWindow(rows.filter((_, i) => i !== 5), 0), null);
});
test('weighted averages and empty data', () => {
  assert.equal(average([{ start: 0, end: 1, price: 0 }, { start: 1, end: 4, price: 4 }]), 3);
  assert.equal(average([]), null);
});
test('source validation and inclusive end timestamps', () => {
  assert.deepEqual(parsePrices({ prices: [{ price: -1, startDate: '2026-01-01T00:00Z', endDate: '2026-01-01T00:14:59.999Z' }] })[0], { price: -1, start: 1767225600000, end: 1767226500000 });
  for (const prices of [[], [{ price: null }], [{ price: '3' }]]) assert.throws(() => parsePrices({ prices }));
});
test('Finnish dates and repeated daylight saving hour use real instants', () => {
  assert.equal(dayKey(Date.parse('2026-01-01T22:30Z')), '2026-01-02');
  assert.equal(time(Date.parse('2026-10-25T00:00Z')), time(Date.parse('2026-10-25T01:00Z')));
});

test('partial first hour leaves twelve fixed blocks and no invented two-hour average', async () => {
  const { dayBounds, dayBlocks } = await import('../public/prices.js');
  const date = Date.parse('2026-11-04T12:00Z');
  const { start, end } = dayBounds(date);
  const partial = Array.from({ length: 4 }, (_, i) => ({ start: start + i * quarter, end: start + (i + 1) * quarter, price: 30 - i * 5 }));
  const blocks = dayBlocks(partial, date);
  assert.equal(blocks.length, 12);
  assert.equal(blocks[0].start, start);
  assert.equal(blocks.at(-1).end, end);
  assert.equal(blocks[0].slots.length, 4);
  assert(blocks.every(b => !b.complete && b.price === null));
  const full = Array.from({ length: 96 }, (_, i) => ({ start: start + i * quarter, end: start + (i + 1) * quarter, price: i < 8 ? -2 : 4 }));
  assert(dayBlocks(full, date).every(b => b.complete));
  assert.equal(dayBlocks(full, date)[0].price, -2);
  assert.equal(dayBlocks(full.filter((_, i) => i !== 3), date)[0].price, null);
});
test('two-hour clock blocks cover short and long DST days without gaps', async () => {
  const { dayBounds, dayBlocks } = await import('../public/prices.js');
  for (const [date, hours] of [['2026-03-29T12:00Z', 23], ['2026-10-25T12:00Z', 25]]) {
    const { start, end } = dayBounds(Date.parse(date));
    assert.equal((end - start) / 3_600_000, hours);
    const slots = Array.from({ length: hours * 4 }, (_, i) => ({ start: start + i * quarter, end: start + (i + 1) * quarter, price: 3 }));
    const blocks = dayBlocks(slots, Date.parse(date));
    assert.equal(blocks.length, 12);
    assert(blocks.every(b => b.complete && b.price === 3));
    assert.equal(blocks.reduce((n, b) => n + b.slots.length, 0), slots.length);
  }
});

test('price heat uses fixed thresholds, including negative, boundary and missing prices', async () => {
  const { priceHeat } = await import('../public/prices.js');
  for (const [price, tone] of [[-100,'negative'],[-.001,'negative'],[0,'low'],[4.999,'low'],[5,'medium'],[9.999,'medium'],[10,'high'],[19.999,'high'],[20,'very-high'],[1000,'very-high'],[null,'missing'],[undefined,'missing'],[NaN,'missing'],[Infinity,'missing']]) {
    assert.equal(priceHeat(price).tone, tone);
    assert(priceHeat(price).label);
  }
});

test('confirmed prices replace overlapping forecast hours, including partial publication', async () => {
  const { unconfirmedForecast } = await import('../public/prices.js');
  const start = Date.parse('2026-11-03T22:00Z'); // Finnish midnight
  const forecast = Array.from({ length: 72 }, (_, i) => ({ start: start + i * 3_600_000, end: start + (i + 1) * 3_600_000, price: 2 }));
  const confirmed = Array.from({ length: 192 }, (_, i) => ({ start: start + i * quarter, end: start + (i + 1) * quarter, price: 1 }));
  assert.deepEqual(unconfirmedForecast(forecast, []), forecast);
  assert.deepEqual(unconfirmedForecast(forecast, confirmed), forecast.slice(48));
  assert.deepEqual(unconfirmedForecast(forecast, confirmed.slice(0, 1)), forecast.slice(1));
  assert.deepEqual(unconfirmedForecast(forecast, [...confirmed, { start: forecast[48].end, end: forecast[49].end, price: 1 }]), [forecast[48], ...forecast.slice(50)]);
});
