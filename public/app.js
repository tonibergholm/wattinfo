import { planUsage, rangeBlocks } from './planner.js';
import { time, dayKey, average, dayBounds, dayBlocks, priceHeat, PRICE_BANDS } from './prices.js';
const $ = id => document.getElementById(id);
const number = value => value == null ? '—' : value.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let data = null, selectedDay = 2, selectedSlot = null, detailStart = null, loading = false, failed = false;
const range = p => `${time(p.start)}–${time(p.end)}`;
function colorPrice(node, value) {
  const heat = priceHeat(value);
  node.dataset.heat = heat.tone;
  node.title = heat.label;
  return heat.label;
}
for (const band of PRICE_BANDS) {
  const item = document.createElement('span'); item.dataset.heat = band.tone;
  const swatch = document.createElement('i'); swatch.setAttribute('aria-hidden', 'true');
  item.append(swatch, document.createTextNode(`${band.range} ${band.label.toLowerCase()}`));
  $('price-legend').append(item);
}
function render() {
  const now = Date.now();
  $('clock').textContent = time(now);
  $('date').textContent = new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'long' }).format(now);
  if (!data) return;
  const current = data.prices.find(p => p.start <= now && now < p.end);
  const next = current && data.prices.find(p => p.start === current.end);
  const today = data.prices.filter(p => dayKey(p.start) === dayKey(now));
  const mean = dayBlocks(today, now).every(b => b.complete) ? average(today) : null;
  $('price').textContent = number(current?.price);
  $('price-level').textContent = colorPrice($('price'), current?.price);
  colorPrice($('price-level'), current?.price);
  $('slot').textContent = current ? range(current) : 'Ei ajantasaista hintaa';
  $('comparison').textContent = current && mean != null ? `${number(Math.abs(current.price - mean))} snt päivän keskihintaa ${current.price <= mean ? 'edullisempi' : 'kalliimpi'}` : current ? 'Päivän keskihinta ei ole vielä saatavilla' : 'Nykyisen vartin hintaa ei ole saatavilla';
  $('next').textContent = number(next?.price);
  $('next-level').textContent = colorPrice($('next'), next?.price);
  colorPrice($('next-level'), next?.price);
  $('next-time').textContent = next ? range(next) : '';
  $('next-change').textContent = next ? `${next.price > current.price ? '↗ Nousee' : '↘ Laskee'} ${number(Math.abs(next.price - current.price))} snt / kWh` : 'Seuraavaa hintaa ei ole julkaistu';
  const stale = failed || data.stale || now - data.fetchedAt > 900_000 || !current;
  $('status').textContent = stale ? 'Yhteyskatko / vanhentunut tieto' : 'Ajantasainen';
  $('status').className = stale ? '' : 'live';
  $('updated').textContent = `Haku ${time(data.fetchedAt)}`;
  // Noon UTC stays on the next Finnish calendar day across DST changes.
  const target = selectedDay === 1 ? new Date(`${dayKey(now)}T12:00:00Z`).getTime() + 86_400_000 : now;
  const upcomingStart = Math.floor(now / 3_600_000) * 3_600_000;
  const bounds = selectedDay === 2 ? { start: upcomingStart, end: upcomingStart + 86_400_000 } : dayBounds(target);
  const rows = data.prices.filter(p => p.start >= bounds.start && p.end <= bounds.end);
  for (const [id, value] of [['today', 0], ['tomorrow', 1], ['upcoming', 2]]) {
    $(id).classList.toggle('active', selectedDay === value);
    $(id).setAttribute('aria-pressed', String(selectedDay === value));
  }
  const blocks = selectedDay === 2 ? rangeBlocks(rows, bounds.start, bounds.end) : dayBlocks(rows, target);
  const complete = blocks.every(b => b.complete);
  const detail = blocks.find(b => b.start === detailStart);
  $('back').hidden = !detail; $('back').textContent = selectedDay === 2 ? '← Seuraavat 24 h' : '← Koko päivä';
  $('coverage').textContent = complete ? (selectedDay === 2 ? '24 tunnin hinnat saatavilla' : 'Koko päivän hinnat saatavilla') : rows.length ? `Osittaiset tiedot: ${rows.length} varttia. Puuttuvia hintoja ei ole julkaistu.` : 'Päivän hintoja ei ole vielä julkaistu.';
  if (selectedDay === 2) $('coverage').textContent = `${datedRange(bounds)} · ${$('coverage').textContent}`;
  $('average-label').textContent = `${selectedDay === 2 ? '24 H' : 'PÄIVÄN'} KESKIHINTA${complete ? '' : ' · EI VIELÄ SAATAVILLA'}`;
  $('average').textContent = number(complete ? average(rows) : null);
  colorPrice($('average'), complete ? average(rows) : null);
  const sorted = blocks.filter(b => b.complete).sort((a, b) => a.price - b.price);
  $('low').textContent = number(sorted[0]?.price); $('high').textContent = number(sorted.at(-1)?.price);
  colorPrice($('low'), sorted[0]?.price); colorPrice($('high'), sorted.at(-1)?.price);
  $('low-time').textContent = sorted.length ? (selectedDay === 2 ? datedRange(sorted[0]) : range(sorted[0])) : '';
  $('high-time').textContent = sorted.length ? (selectedDay === 2 ? datedRange(sorted.at(-1)) : range(sorted.at(-1))) : '';
  $('chart-label').textContent = detail ? `${range(detail)} · 15 minuutin hinnat · snt / kWh` : '2 tunnin keskihinnat · snt / kWh';
  drawChart(detail ? detail.slots : blocks, now, detail || bounds, !!detail);
  renderPlanner(now, stale);

}
function select(p) {
  selectedSlot = p.start;
  $('selection').textContent = `${range(p)} · ${number(p.price)} snt / kWh · ${colorPrice($('selection'), p.price)}`;
}
function drawChart(rows, now, bounds, detail) {
  const chart = $('chart');
  chart.replaceChildren();
  colorPrice($('selection'), null);
  $('selection').textContent = detail ? 'Valitse vartti nähdäksesi hinnan' : 'Avaa varttihinnat napauttamalla 2 h jaksoa';
  if (!rows.length) { const p = document.createElement('p'); p.textContent = 'Tälle jaksolle ei ole vielä julkaistu hintoja.'; chart.append(p); return; }
  const NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, text, parent) { const node = document.createElementNS(NS, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text != null) node.textContent = text; parent.append(node); return node; }
  const width = chart.clientWidth || 960, height = Math.max(110, chart.clientHeight);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': detail ? '15 minuutin hinnat' : 'Koko päivän kahden tunnin keskihinnat' }, null, chart);
  const min = Math.min(0, ...rows.filter(p => p.price != null).map(p => p.price)), max = Math.max(1, ...rows.filter(p => p.price != null).map(p => p.price));
  const span = max - min, y = v => height - 28 - (v - min) / span * (height - 40);
  for (let i = 0; i <= 3; i++) {
    const v = min + span * i / 3;
    el('line', { x1: 34, x2: width - 4, y1: y(v), y2: y(v), class: 'gridline' }, null, svg);
    el('text', { x: 26, y: y(v) + 3, 'text-anchor': 'end', class: 'axis' }, (max <= 1 && min >= 0 ? v.toFixed(1) : v.toFixed(0)), svg);
  }
  const { start, end } = bounds, x = t => 36 + (t - start) / (end - start) * (width - 40);
  const defs = el('defs', {}, null, svg);
  const pattern = el('pattern', { id: 'missing', width: 8, height: 8, patternUnits: 'userSpaceOnUse' }, null, defs);
  el('path', { d: 'M0 8L8 0', stroke: '#30382f', 'stroke-width': 1 }, null, pattern);
  for (let t = start; t <= end; t += detail ? 1_800_000 : 14_400_000) {
    el('text', { x: x(t), y: height - 3, class: 'axis', 'text-anchor': t === end ? 'end' : 'start' }, t === end && !detail && selectedDay !== 2 ? '24.00' : time(t), svg);
  }
  if ((end - start) % (detail ? 1_800_000 : 14_400_000)) el('text', { x: x(end), y: height - 3, class: 'axis', 'text-anchor': 'end' }, detail || selectedDay === 2 ? time(end) : '24.00', svg);
  rows.forEach((p, i) => {
    if (p.price == null) {
      el('rect', { x: x(p.start), y: 12, width: Math.max(1, x(p.end) - x(p.start) - 3), height: height - 40, fill: 'url(#missing)' }, null, svg);
      el('text', { x: (x(p.start) + x(p.end)) / 2, y: height / 2, class: 'axis', 'text-anchor': 'middle' }, '—', svg);
    }
    const active = p.start <= now && now < p.end;
    if (p.price != null) el('rect', { x: x(p.start), y: Math.min(y(p.price), y(0)), width: Math.max(1, x(p.end) - x(p.start) - 2), height: Math.max(1.5, Math.abs(y(p.price) - y(0))), rx: 1, 'data-heat': priceHeat(p.price).tone, class: `bar ${p.end <= now ? 'past' : ''} ${active ? 'now' : ''}`, 'aria-hidden': 'true' }, null, svg);
    const hit = el('rect', { x: x(p.start), y: 0, width: x(p.end) - x(p.start), height: height - 25, fill: 'transparent', tabindex: 0, role: 'button', 'aria-label': p.price == null ? `${range(p)}, puuttuvat tai osittaiset hinnat` : `${range(p)}, ${number(p.price)} snt / kWh, ${priceHeat(p.price).label}${detail ? '' : ' keskimäärin, avaa varttihinnat'}` }, null, svg);
    const inspect = () => { if (p.price == null) { colorPrice($('selection'), null); $('selection').textContent = `${range(p)} · hinnat puuttuvat tai ovat osittaiset`; } else select(p); };
    const open = () => { if (!detail) { detailStart = p.start; selectedSlot = null; render(); $('back').focus(); } else inspect(); };
    hit.addEventListener('pointerenter', inspect); hit.addEventListener('click', open); hit.addEventListener('focus', inspect);
    hit.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const targets = svg.querySelectorAll('[role="button"]'); targets[Math.max(0, Math.min(rows.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)))].focus(); }
    });

    if (selectedSlot === p.start && p.price != null) select(p);
  });
}
async function refresh() {
  if (loading) return;
  loading = true; $('refresh').disabled = true;
  try {
    const response = await fetch('./api/prices', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Price request failed');
    const result = await response.json();
    if (!Array.isArray(result.prices) || !Number.isFinite(result.fetchedAt)) throw new Error('Invalid response');
    data = result; failed = false;
  } catch { failed = true; $('status').textContent = 'Yhteyskatko · yritetään uudelleen'; if (!data) $('chart').textContent = 'Hintojen haku epäonnistui. Tarkista verkkoyhteys tai yritä päivittää.'; }
  finally { loading = false; $('refresh').disabled = false; render(); }
}
$('upcoming').onclick = () => { selectedDay = 2; selectedSlot = null; detailStart = null; render(); };
$('today').onclick = () => { selectedDay = 0; selectedSlot = null; detailStart = null; render(); };
$('tomorrow').onclick = () => { selectedDay = 1; selectedSlot = null; detailStart = null; render(); };
$('back').onclick = () => { detailStart = null; selectedSlot = null; render(); };
$('refresh').onclick = refresh;
setInterval(refresh, 300_000);
setInterval(render, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
render(); refresh();

let gridData = null, gridLoading = false, gridFailed = false;
function renderGrid() {
  const names = ['consumption', 'production', 'wind'];
  for (const name of names) {
    $('grid-' + name).textContent = gridData ? Math.round(gridData[name].value).toLocaleString('fi-FI') : '—';
  }
  const oldest = gridData && Math.min(...names.map(name => gridData[name].timestamp));
  $('grid-status').textContent = gridData ? `${gridFailed || gridData.stale || Date.now() - oldest > 900_000 ? 'Vanhentunut tieto · ' : ''}Mittaus ${time(oldest)}` : gridFailed ? 'Fingrid ei ole saatavilla' : 'Haetaan Fingridistä…';
}
async function refreshGrid() {
  if (gridLoading) return;
  gridLoading = true;
  try {
    const response = await fetch('./api/grid', { signal: AbortSignal.timeout(45_000) });
    if (!response.ok) throw new Error('Grid unavailable');
    const result = await response.json();
    if (!['consumption', 'production', 'wind'].every(name => Number.isFinite(result[name]?.value) && Number.isFinite(result[name]?.timestamp))) throw new Error('Invalid grid data');
    gridData = result; gridFailed = false;
  } catch { gridFailed = true; }
  finally { gridLoading = false; renderGrid(); }
}
setInterval(refreshGrid, 300_000);
setInterval(renderGrid, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshGrid(); });
refreshGrid();

function datedRange(p) {
  const date = t => new Intl.DateTimeFormat('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'numeric' }).format(t);
  return `${date(p.start)} ${time(p.start)}–${dayKey(p.start) === dayKey(p.end - 1) ? '' : date(p.end) + ' '}${time(p.end)}`;
}
function renderPlanner(now, stale) {
  const target = $('recommendation');
  target.replaceChildren(); $('alternatives').replaceChildren(); colorPrice(target, null);
  const message = document.createElement('h3');
  if (stale) { message.textContent = 'Suositus tauolla · hinnat eivät ole ajantasaisia'; target.append(message); return; }
  const [from, until] = $('allowed').value.split(',').map(Number);
  const result = planUsage(data.prices, now, Number($('duration').value), from, until);
  const best = result.best[0];
  if (!best) { message.textContent = 'Ei sopivaa kokonaista jaksoa julkaistuissa hinnoissa'; target.append(message); return; }
  colorPrice(target, best.price);
  const delayMinutes = Math.round((best.start - now) / 60_000);
  const cheaper = result.nowPrice != null && result.nowPrice - best.price > .01;
  message.textContent = delayMinutes <= 15 ? 'Hyvä aika aloittaa nyt' : cheaper ? `Odota · aloita ${datedRange(best).split('–')[0]}` : 'Halvin sopiva aloitusaika';
  target.append(message);
  const when = document.createElement('p'); when.className = 'plan-time'; when.textContent = datedRange(best); target.append(when);
  const price = document.createElement('p'); price.textContent = `Keskihinta ${number(best.price)} snt / kWh${cheaper ? ` · ${number(result.nowPrice - best.price)} snt / kWh edullisempi kuin aloittamalla nyt` : ''}`; target.append(price);
  for (const p of result.best.slice(1)) {
    const li = document.createElement('li'); colorPrice(li, p.price); li.textContent = `${datedRange(p)} · ${number(p.price)} snt / kWh`; $('alternatives').append(li);
  }
  if (result.best.length > 1) $('alternatives').setAttribute('aria-label', 'Muut edulliset vaihtoehdot');
}
for (const button of document.querySelectorAll('.appliances button')) {
  button.onclick = () => {
    for (const other of document.querySelectorAll('.appliances button')) { other.classList.toggle('active', other === button); other.setAttribute('aria-pressed', String(other === button)); }
    $('duration').value = button.dataset.hours;
    render();
  };
}
$('duration').onchange = render; $('allowed').onchange = render;
let forecastData = null, forecastLoading = false, forecastFailed = false;
function renderForecast() {
  const container = $('forecast-days');
  // Keep an open day's hour list open across the 30-second clock update.
  const openDays = new Set([...container.querySelectorAll('details[open]')].map(d => d.dataset.day));
  container.replaceChildren();
  if (!forecastData) { $('forecast-status').textContent = forecastFailed ? 'Ennuste ei ole saatavilla. Vahvistetut hinnat toimivat erikseen.' : 'Haetaan ennustetta…'; return; }
  const now = Date.now();
  $('forecast-origin').textContent = forecastData.source === 'selfhosted' ? 'Omalla palvelimella laskettu · Malli: ' : 'Tuntiennuste: ';
  $('forecast-commentary').hidden = !forecastData.narration;
  $('forecast-commentary-text').textContent = forecastData.narration?.text || '';
  const aiSummary = forecastData.narration?.generatedBy === 'ollama';
  $('forecast-commentary-heading').textContent = aiSummary ? 'AI-yhteenveto · paikallinen Ollama' : 'Yhteenveto ennusteesta';
  $('forecast-commentary-note').textContent = aiSummary ? 'Automaattinen tulkinta ennusteesta; voi sisältää virheitä.' : 'Laskettu suoraan ennusteen päiväkeskiarvoista. Hinnat ovat arvioita.';
  const modified = forecastData.sourceModifiedAt;
  const stale = forecastFailed || forecastData.stale || (modified && now - modified > 86_400_000) || now - forecastData.fetchedAt > 7_200_000;
  $('forecast-status').textContent = `${stale ? 'Vanhentunut / yhteyskatko · ' : ''}${modified ? 'Lähdetiedosto ' + new Date(modified).toLocaleString('fi-FI', { timeZone: 'Europe/Helsinki' }) : 'Lähteen päivitysaika ei tiedossa'} · Haku ${time(forecastData.fetchedAt)}`;
  const future = forecastData.prices.filter(p => p.end > now && p.start < now + 7 * 86_400_000);
  if (!future.length) { $('forecast-status').textContent = 'Ennuste on päättynyt. Odotetaan lähteen päivitystä.'; return; }
  const days = new Map();
  for (const p of future) { const key = dayKey(p.start); if (!days.has(key)) days.set(key, []); days.get(key).push(p); }
  const scale = Math.max(1, ...future.map(p => Math.abs(p.price)));
  for (const [day, rows] of days) {
    const details = document.createElement('details'); details.dataset.day = day; details.open = openDays.has(day);
    const summary = document.createElement('summary');
    const label = document.createElement('span'); label.textContent = new Date(rows[0].start).toLocaleDateString('fi-FI', { timeZone: 'Europe/Helsinki', weekday: 'short', day: 'numeric', month: 'numeric' });
    const avg = average(rows);
    const bar = document.createElement('span'); bar.className = 'forecast-bar';
    const fill = document.createElement('i'); colorPrice(fill, avg); fill.style.width = `${Math.abs(avg) / scale * 100}%`; bar.append(fill); bar.setAttribute('aria-hidden', 'true');
    const value = document.createElement('span'); value.className = 'forecast-price'; colorPrice(value, avg); value.textContent = `≈ ${number(avg)} snt/kWh`; value.setAttribute('aria-label', `Ennustettu keskihinta ${number(avg)} snt/kWh, ${priceHeat(avg).label}`);
    summary.append(label, bar, value); details.append(summary);
    const description = document.createElement('p'); description.textContent = `${rows.length} tuntiennustetta · ${datedRange({start: rows[0].start, end: rows.at(-1).end})} · näiden tuntien keskiarvo, ei hintatakuu`; details.append(description);
    const list = document.createElement('ul'); list.className = 'forecast-hours';
    for (const p of rows) { const li = document.createElement('li'); colorPrice(li, p.price); li.textContent = `${range(p)} · ≈ ${number(p.price)} snt/kWh`; li.setAttribute('aria-label', `${li.textContent}, ${priceHeat(p.price).label}`); list.append(li); }
    details.append(list); container.append(details);
  }
}
async function refreshForecast() {
  if (forecastLoading) return; forecastLoading = true;
  try {
    const response = await fetch('./api/forecast', { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Forecast unavailable');
    const result = await response.json();
    if (!Array.isArray(result.prices) || !result.prices.every(p => Number.isFinite(p.start) && Number.isFinite(p.end) && Number.isFinite(p.price))) throw new Error('Invalid forecast');
    forecastData = result; forecastFailed = false;
  } catch { forecastFailed = true; }
  finally { forecastLoading = false; renderForecast(); }
}
setInterval(refreshForecast, 300_000);
setInterval(renderForecast, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshForecast(); });
refreshForecast();
window.addEventListener('resize', render);

async function refreshAccuracy() {
  try {
    const response = await fetch('./api/accuracy', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('Accuracy unavailable');
    const report = await response.json();
    const rows = $('accuracy-rows'); rows.replaceChildren();
    const samples = report.buckets.reduce((n, b) => n + b.count, 0);
    $('accuracy-status').textContent = report.startedAt ? `Seuranta aloitettu ${new Date(report.startedAt).toLocaleString('fi-FI', {timeZone:'Europe/Helsinki'})}. ${samples ? 'Vertailu päivittyy ennusteajon yhteydessä.' : 'Ei vielä vertailtavia hintoja. Tulokset kertyvät hintojen julkaisun jälkeen.'}` : 'Kerätään vertailuhistoriaa. Tulokset näkyvät hintojen julkaisun jälkeen.';
    for (const b of report.buckets) {
      const tr = document.createElement('tr');
      for (const value of [b.label, b.mae == null ? '—' : number(b.mae), b.bias == null ? '—' : (b.bias > 0 ? '+' : '') + number(b.bias), `${b.count} (${b.hours} eri tuntia)`]) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      rows.append(tr);
    }
  } catch { $('accuracy-status').textContent = 'Vertailuhistoria ei ole nyt saatavilla.'; }
}
setInterval(refreshAccuracy, 300_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshAccuracy(); });
refreshAccuracy();
