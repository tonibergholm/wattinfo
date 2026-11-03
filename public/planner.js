import { average } from './prices.js';
const quarter = 900_000;
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Helsinki', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function windowPrice(rows, start, end) {
  const parts = rows.filter(p => p.start < end && p.end > start).map(p => ({ ...p, start: Math.max(p.start, start), end: Math.min(p.end, end) }));
  if (!parts.length || parts[0].start !== start || parts.at(-1).end !== end || parts.some((p, i) => i && p.start !== parts[i - 1].end)) return null;
  return average(parts);
}
export function allowedWindow(start, end, from, until) {
  if (from === 0 && until === 1440) return true;
  for (let t = start; t < end; t = Math.min(end, (Math.floor(t / quarter) + 1) * quarter)) {
    const [h, m] = clock.format(t).split(':').map(Number);
    const minute = h * 60 + m;
    if (!(from < until ? minute >= from && minute < until : minute >= from || minute < until)) return false;
  }
  return true;
}
export function planUsage(rows, now, hours, from = 0, until = 1440) {
  if (!Number.isFinite(hours) || hours < .5 || hours > 6 || !Number.isInteger(from) || !Number.isInteger(until) || from < 0 || from >= 1440 || until < 0 || until > 1440 || from === until) throw new Error('Invalid planning settings');
  const duration = hours * 3_600_000;
  const horizon = now + 48 * 3_600_000;
  const candidates = [];
  for (let start = Math.ceil(now / quarter) * quarter; start + duration <= horizon; start += quarter) {
    const end = start + duration;
    if (!allowedWindow(start, end, from, until)) continue;
    const price = windowPrice(rows, start, end);
    if (price != null) candidates.push({ start, end, price });
  }
  candidates.sort((a, b) => a.price - b.price || a.start - b.start);
  const best = [];
  for (const p of candidates) {
    if (best.every(b => p.end <= b.start || p.start >= b.end)) best.push(p);
    if (best.length === 3) break;
  }
  return { best, nowPrice: allowedWindow(now, now + duration, from, until) ? windowPrice(rows, now, now + duration) : null };
}
export function rangeBlocks(rows, start, end) {
  const blocks = [];
  for (let t = start; t < end; t += 7_200_000) {
    const until = Math.min(t + 7_200_000, end);
    const slots = rows.filter(p => p.start >= t && p.end <= until);
    const price = windowPrice(rows, t, until);
    blocks.push({ start: t, end: until, slots, price, complete: price != null });
  }
  return blocks;
}
