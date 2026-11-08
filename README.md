<img src="assets/icon.svg" width="64" height="64" alt="">

# WattInfo

[Live dashboard](https://bergholm.net/wattinfo/) · [GitHub repository](https://github.com/tonibergholm/wattinfo)

A lightweight Finnish spot-electricity dashboard for a Raspberry Pi touchscreen or an iPad browser. Finnish interface, current and next quarter-hour price, today/tomorrow chart with two-hour averages and tap-to-open quarter-hour detail, daily statistics, appliance start-time planning, and a separate seven-day price outlook.

## Run

Install Node.js 22 or newer, then:

```sh
npm start
```

Open **http://localhost:3000**. No dependencies, install step, API key, or build step. Set `PORT` to change the port. `npm test` checks price calculations, source validation, and Finnish timezone behavior.

## Raspberry Pi 3 + 7-inch touchscreen

Run the server on the Pi with a compatible Node.js installation, or on another always-on computer on your home network. Open Chromium at `http://localhost:3000` on the Pi (or the server's LAN address). The layout includes a compact 800×480 landscape mode.

For kiosk display, run from the Pi's graphical desktop, adjusting the installed browser command if needed:

```sh
chromium --kiosk --noerrdialogs http://localhost:3000
```

Keep the server running in a separate terminal. Automatic boot startup and screen power settings are not configured by this project.

## iPad Mini

Keep the server running on the Pi or another computer. On the same home network, open `http://<server-lan-ip>:3000` in Safari. Optionally use Safari's **Add to Home Screen**. Set Auto-Lock to Never for an always-on display if your iPad supports it. The iPad is the display; it does not run this Node server. Compatibility with your particular iPad/iPadOS version needs testing.

The server listens on all network interfaces so the iPad can reach it. It has no authentication; keep it on a trusted LAN and do not expose port 3000 to the internet.

## Prices and freshness

Source: [Porssisahko.net](https://porssisahko.net), using its `/v2/latest-prices.json` endpoint. Prices are **snt/kWh including VAT (25.5%)**, excluding distribution, electricity tax and retailer margin. These are published day-ahead prices, not a changing live market quote. Missing published-price intervals stay empty until the source provides them; the separately labelled forecast outlook never fills gaps in the confirmed-price chart.

The browser refreshes every five minutes and updates the active price from the downloaded intervals every 30 seconds. The server caches upstream responses for five minutes and coalesces simultaneous requests. A manual refresh uses that cache when still fresh. Fetches have timeouts. If the upstream fails, the server returns its last in-memory data marked stale. Without a current interval the display shows no current price. Restarting the server clears its cache.

All dates use Europe/Helsinki regardless of the display device's timezone. The chart preserves the extra or missing hour on daylight-saving days. The chart opens on the next 24 hours; Today and Tomorrow cover the full Finnish calendar day, including missing periods shown with hatching. Only complete two-hour blocks get an average. Tap a block to inspect its quarter-hour prices, then choose “Koko päivä” to return. The daily average is withheld until the entire day is available; minimum/maximum statistics compare complete published two-hour blocks. Keyboard users can focus blocks, use arrow keys, and press Enter to open them.

No analytics, external fonts, frontend framework, or local account. No hardware control or consumption tracking.

## Hosted deployment

Live at **https://bergholm.net/wattinfo/**. The Pi or iPad can open this URL directly; no local server is needed when using the hosted version.

For your own deployment, run the Node server behind a reverse proxy with HTTPS. Set `HOST=127.0.0.1` when the proxy runs on the same machine and select an available `PORT`. Keep API keys and generated files outside the public document root. Use your preferred process manager to restart the app after a reboot.


## Fingrid grid readings

The dashboard shows national consumption (dataset 193), production (192), and wind power (181) in MW. These are national power readings, not household consumption or energy in kWh. Measurements show their source time and are marked stale after 15 minutes or a fetch failure.

Store a Fingrid API key in `.fingrid-key` beside `server.js`, with file permissions `600`, or set `FINGRID_KEY_FILE` to a private file. The key is never served to browsers and is excluded from Git. The hosted server has this private file configured. No key is needed for the price chart.

The server fetches three readings sequentially with over two seconds between requests and caches the result for five minutes for all visitors. Failed attempts are also throttled for five minutes. Existing readings remain visible with a stale label on failure. The first load can take several seconds. Fingrid data appears below prices, so small screens may need scrolling.


## Appliance planning and price outlook

The chart opens on a continuous 24-hour view from the start of the current hour, including tonight and tomorrow morning; Today and Tomorrow remain available. Only published prices appear in this chart. Missing periods stay hatched.

Choose dishwasher (default 3 hours), washing machine (2 hours), or sauna (1.5 hours), then adjust to your actual program duration and allowed operating hours. Defaults are examples, not appliance-specific measurements. The planner considers quarter-hour starts over the next 48 hours and requires complete, contiguous published prices over the whole cycle. It shows the lowest duration-weighted mean and up to two non-overlapping alternatives, with dates across midnight. It compares with starting immediately only when that full cycle is known and allowed. Recommendations pause when published prices are stale.

Allowed hours constrain the entire cycle (including overnight windows), not just its start. Rankings assume uniform consumption over the cycle; heating phases and your appliance's load profile can change actual costs. No euro estimates, remote switching, or appliance control are included.

The separate seven-day outlook uses hourly predictions produced by [Sähkövatkain / vividfog's nordpool-predict-fi](https://github.com/vividfog/nordpool-predict-fi). By default the app reads the public forecast feed, requiring no registration or model installation. The hosted deployment runs this engine locally, as described below. VAT is already included and is not added again. Forecast hours overlapping published prices are omitted, and the outlook updates when confirmed prices refresh. Generated commentary is hidden when this filtering changes its source forecast. Daily summaries average the available forecast hours, show their coverage on expansion, and are always labelled estimates. Confirmed prices remain the only input for appliance recommendations. The forecast is not a guarantee and has no calibrated uncertainty bounds.

The server fetches `https://sahkovatkain.web.app/prediction.json` at most once per 30 minutes, shares concurrent requests, validates the numeric hourly series, and retains last-good data labelled stale on failure. The UI shows the source file's Last-Modified (when available), separately from fetch time; neither is claimed as model generation time. A source file older than 24 hours is flagged stale, as is a client fetch older than two hours. This is our display policy, not the publisher's promised schedule. Details and licensing caveats are in [docs/forecast-source.md](docs/forecast-source.md).


## Self-hosted engine

The engine setup, resource limits, secrets handling, atomic publication, schedule and optional local Ollama commentary are documented in [docs/self-hosted-forecast.md](docs/self-hosted-forecast.md). Set `FORECAST_FILE` to select a private generated JSON file; the API identifies it as `selfhosted`. Commentary is independent and shown only when its SHA-256 and publication time match the numeric forecast. Local Ollama uses Finnish-specific Ahma 3B; rejected or failed output falls back to a clearly labelled computed fact summary. Test its summary grouping with `python3 -m unittest discover -s test -p '*_test.py'`.


### Learning from confirmed prices

The self-hosted engine retrains every six hours on refreshed input data. A separate SQLite ledger preserves each issued forecast and compares it with published hourly averages, excluding prices already known when the forecast was issued. Expand **“Kuinka hyvin ennuste osuu?”** for errors grouped by forecast lead time. The history starts at installation; empty results mean there are not yet eligible observations, not zero error. No automatic hyperparameter changes or bias correction are applied from small samples.

## Price heat colours

Current/next prices, published chart bars (including quarter-hour detail), daily statistics, planner windows and forecast prices use one fixed VAT-inclusive snt/kWh scale: blue below 0, green from 0 to below 5, yellow from 5 to below 10, orange from 10 to below 20, and red from 20 upward. These are display bands, not official market classifications. Colours never rescale to the day's minimum/maximum. The legend and numeric prices remain visible; the current chart interval has a white outline and missing intervals remain neutral/hatched. Forecast bars retain their segmented pattern and estimate labels. Aggregate colours refer to the displayed average, so inspect individual intervals for price spikes within a block or day.


## Refreshing the dashboard

Tap **Päivitä** in the header (the refresh icon on narrow screens), or pull down from the top of the page and release when **Vapauta päivittääksesi** appears. Pulling while scrolled down, swiping sideways, or touching form controls does not trigger refresh.

All four data sources refresh together every five minutes while the page is visible. Returning from the background, restoring the page from browser history or regaining connectivity also checks the data. iPadOS can suspend webapps in the background; the app refreshes on return rather than relying on background timers.

Updates fetch JSON only; they do not reload the document, scripts or styles. Selected chart views, appliance settings and expanded forecast days remain in place. Unchanged chart and forecast data keeps the existing DOM nodes to avoid flicker and lost focus. A failed source keeps its previous readings and reports the failure. Manual requests share an in-flight update instead of duplicating it, and server-side caching still applies.

The custom pull gesture targets modern touch browsers; the header button is also available for keyboard users and devices without touch. Test the installed home-screen webapp on your own iPad/iPadOS version.

## License

WattInfo's code is released under the [MIT License](LICENSE).

Data and third-party code keep their own terms and are not covered by that license:

- Prices come from [Porssisahko.net](https://porssisahko.net); grid readings come from [Fingrid](https://data.fingrid.fi). Check their terms before redistributing the data or running a public instance.
- The forecast outlook uses [vividfog's nordpool-predict-fi](https://github.com/vividfog/nordpool-predict-fi) (MIT, Copyright (c) 2024 npf). `deploy/forecast-no-narration.patch` is a modification of that project. Its upstream data has noncommercial limits, described in [docs/forecast-source.md](docs/forecast-source.md#license-attribution-and-reliability).
