export const time = (date) => new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
export const dayKey = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Helsinki', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
export function parsePrices(data) {
  if (!Array.isArray(data.prices) || !data.prices.length) throw new Error('Empty price response');
  const rows = data.prices.map(p => {
    const start = Date.parse(p.startDate), end = Date.parse(p.endDate) + 1;
    if (!Number.isFinite(p.price) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Invalid price response');
    return { price: p.price, start, end };
  }).sort((a, b) => a.start - b.start);
  if (rows.some((p, i) => i && p.start < rows[i - 1].end)) throw new Error('Overlapping prices');
  return rows;
}
export function average(rows) {
  const duration = rows.reduce((sum, p) => sum + p.end - p.start, 0);
  return duration ? rows.reduce((sum, p) => sum + p.price * (p.end - p.start), 0) / duration : null;
}
export function cheapestWindow(rows, now, duration = 7_200_000) {
  let best = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].start < now) continue;
    const window = [];
    let end = rows[i].start;
    for (let j = i; j < rows.length && end - rows[i].start < duration; j++) {
      if (rows[j].start !== end) break;
      window.push(rows[j]); end = rows[j].end;
    }
    if (end - rows[i].start !== duration) continue;
    const price = average(window);
    if (!best || price < best.price) best = { start: rows[i].start, end, price };
  }
  return best;
}

// Find Finnish midnight in UTC; DST days have 23 or 25 elapsed hours.
export function dayBounds(date) {
  const key = dayKey(date), hour = 3_600_000;
  let start = Date.parse(`${key}T00:00:00Z`) - 4 * hour;
  while (dayKey(start) !== key) start += hour;
  let end = start + hour;
  while (dayKey(end) === key) end += hour;
  return { start, end };
}
export function dayBlocks(rows, date) {
  const { start, end } = dayBounds(date);
  const boundaries = [start];
  for (let t = start + 3_600_000; t < end; t += 3_600_000) {
    const hour = Number(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Helsinki', hour: '2-digit', hourCycle: 'h23' }).format(t));
    if (hour % 2 === 0) boundaries.push(t);
  }
  boundaries.push(end);
  return boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1];
    const slots = rows.filter(p => p.start >= start && p.end <= end);
    const complete = slots.length > 0 && slots[0].start === start && slots.at(-1).end === end && slots.every((p, j) => !j || p.start === slots[j - 1].end);
    return { start, end, slots, complete, price: complete ? average(slots) : null };
  });
}

export const PRICE_BANDS = [
  { max: 0, tone: 'negative', label: 'Negatiivinen', range: '< 0' },
  { max: 5, tone: 'low', label: 'Edullinen', range: '0–<5' },
  { max: 10, tone: 'medium', label: 'Kohtalainen', range: '5–<10' },
  { max: 20, tone: 'high', label: 'Kallis', range: '10–<20' },
  { max: Infinity, tone: 'very-high', label: 'Erittäin kallis', range: '≥20' },
];
const noPrice = { tone: 'missing', label: 'Ei hintaa' };
export function priceHeat(price) {
  return Number.isFinite(price) ? PRICE_BANDS.find(band => price < band.max) : noPrice;
}

export function unconfirmedForecast(forecast, confirmed) {
  return forecast.filter(p => !confirmed.some(actual => actual.start < p.end && actual.end > p.start));
}
// Round axis: step is 1, 2 or 5 × 10^k, aiming for ~4 intervals; ticks cover [lo, hi].
export function niceTicks(lo, hi) {
  const raw = Math.max(hi - lo, 1e-9) / 4, pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map(m => m * pow).find(s => s >= raw - 1e-12);
  const first = Math.floor(lo / step + 1e-9), last = Math.ceil(hi / step - 1e-9);
  const ticks = Array.from({ length: last - first + 1 }, (_, i) => Math.round((first + i) * step * 1e6) / 1e6);
  return { ticks, decimals: Math.max(0, -Math.floor(Math.log10(step) + 1e-9)) };
}
