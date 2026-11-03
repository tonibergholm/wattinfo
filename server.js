import http from 'node:http';
import { forecast } from './forecast.js';
import { grid } from './fingrid.js';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parsePrices } from './public/prices.js';

let cache;
let pending;
async function prices() {
  if (cache && Date.now() - cache.fetchedAt < 300_000) return cache;
  if (!pending) pending = (async () => {
    const response = await fetch('https://api.porssisahko.net/v2/latest-prices.json', { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Price source: ${response.status}`);
    cache = { prices: parsePrices(await response.json()), fetchedAt: Date.now() };
    return cache;
  })().finally(() => { pending = null; });
  return pending;
}
const files = { '/': ['index.html', 'text/html'], '/style.css': ['style.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'], '/prices.js': ['prices.js', 'text/javascript'], '/planner.js': ['planner.js', 'text/javascript'], '/refresh.js': ['refresh.js', 'text/javascript'] };
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    if (path === '/api/accuracy') {
      res.setHeader('Content-Type', 'application/json');
      try { res.end(await readFile(new URL('./forecast-accuracy.json', import.meta.url), 'utf8')); }
      catch { res.end(JSON.stringify({ startedAt: null, buckets: [] })); }
      return;
    }
    if (path === '/api/forecast') {
      res.setHeader('Content-Type', 'application/json');
      try { res.end(JSON.stringify(await forecast())); }
      catch { res.statusCode = 503; res.end(JSON.stringify({ error: 'Ennuste ei ole saatavilla' })); }
      return;
    }
    if (path === '/api/grid') {
      res.setHeader('Content-Type', 'application/json');
      try { res.end(JSON.stringify(await grid())); }
      catch { res.statusCode = 503; res.end(JSON.stringify({ error: 'Fingrid ei ole saatavilla' })); }
      return;
    }
    if (path === '/api/prices') {
      try { const data = await prices(); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); }
      catch (error) {
        console.error(error.message);
        res.setHeader('Content-Type', 'application/json');
        if (cache) res.end(JSON.stringify({ ...cache, stale: true }));
        else { res.statusCode = 502; res.end(JSON.stringify({ error: 'Hintojen haku epäonnistui' })); }
      }
      return;
    }
    if (!files[path]) { res.writeHead(404); res.end('Not found'); return; }
    const [file, type] = files[path];
    const body = await readFile(fileURLToPath(new URL(`./public/${file}`, import.meta.url)));
    res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }); res.end(body);
  } catch (error) { console.error(error.message); res.writeHead(500); res.end('Server error'); }
});
server.listen(process.env.PORT || 3000, process.env.HOST || '0.0.0.0', () => console.log(`WattInfo: http://localhost:${server.address().port}`));
