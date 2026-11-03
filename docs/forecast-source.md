# Forecast source: nordpool-predict-fi (Sähkövatkain)

Checked 2026-11-03 at 10:31 UTC (12:31 Europe/Helsinki). Source revision: [`5c6f3ab609360b0126537de3d3bd69fb188f0d2b`](https://github.com/vividfog/nordpool-predict-fi/tree/5c6f3ab609360b0126537de3d3bd69fb188f0d2b). This is research only; no dashboard implementation was changed.

## Recommendation

Suitable as an **optional, clearly labelled hourly estimate** beyond published prices. Keep WattInfo's published quarter-hour prices authoritative. Do not multiply the prediction by 1.255: the source declares it VAT-inclusive. Do not represent hourly estimates as independently predicted quarter-hours. No alternative comparison is needed for this limited use; this source is unsuitable for guaranteed prices, an availability SLA, or unattended safety-critical control.

## Feed contract and interval semantics

- Recommended data URL: [`https://raw.githubusercontent.com/vividfog/nordpool-predict-fi/main/deploy/prediction.json`](https://raw.githubusercontent.com/vividfog/nordpool-predict-fi/main/deploy/prediction.json). The project's [sample consumer](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/deploy/npf.py#L69) uses this URL. Also live: [`https://sahkovatkain.web.app/prediction.json`](https://sahkovatkain.web.app/prediction.json).
- Bare JSON array of two-number arrays: `[[timestampMillisecondsUTC, priceCentsPerKWh], ...]`. No wrapper, schema version, currency field, end time, generation time, confidence interval, or observed-versus-predicted flag. Timestamps can be serialized with `.0`; parse as numbers. [Format documentation](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/deploy/README.md#predictionjson-for-apexcharts), [export implementation](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/nordpool_predict_fi.py#L438-L455).
- Treat timestamp `t` as the **start** of `[t, t + 3_600_000)` in UTC. This is established by the hourly data grid and the source frontend's window calculations (last timestamp plus one hour gives interval end). Convert only for display using `Europe/Helsinki`; never apply a fixed UTC offset or require 24 rows per local day. [Hourly grid](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/nordpool_predict_fi.py#L160-L179), [window calculation](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/deploy/js/prediction.js#L873-L935).
- The file includes historical rows as well as future estimates; the exporter starts at yesterday's Finnish midnight. It exports `PricePredict_cpkWh`, not the observed price column. Do not infer that past rows are actual prices. [`--deploy` code](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/nordpool_predict_fi.py#L399-L455).
- `prediction_scaled.json` is a sparse risk-marker series with nulls, not a replacement price feed. The main prediction already receives applicable volatility scaling. [Marker documentation](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/deploy/README.md#prediction_scaledjson-for-spike-risk-markers), [scaling application](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/nordpool_predict_fi.py#L315-L333).

## VAT and units: what is verified

**Use the feed directly as snt/kWh including VAT; do not add 25.5% again.** The [feed documentation](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/deploy/README.md#predictionjson-for-apexcharts) explicitly says cents with VAT. The code fetches training prices with Sähkötin's `?vat`, divides by ten into `Price_cpkWh`, trains on that column, and exports the predicted column without an additional tax conversion. [Importer](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/util/sahkotin.py#L20-L48), [training target](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/util/train_xgb.py#L15-L29).

Exact-rate qualification: `prediction.json` itself does **not** carry `vatRate: 25.5` or apply a visible hardcoded 1.255 multiplier. To verify the current upstream tax basis, live requests [without VAT](https://sahkotin.fi/prices?start=2026-11-03&end=2026-11-04) and [with VAT](https://sahkotin.fi/prices?vat&start=2026-11-03&end=2026-11-04) returned 5.110 and 6.413 for 2026-11-03 00:00 UTC: `5.110 × 1.255 = 6.41305`, rounded to 6.413. The [API documentation](https://sahkotin.fi/api) defines `vat` as adding VAT and `fix` as converting EUR/MWh to snt/kWh. Thus **25.5% is verified in the current training source**, and VAT-inclusive output is the published contract; this is not proof that each ML estimate is exactly a hypothetical VAT-free estimate multiplied by 1.255. Historical training data and model calibration may affect the result. Distribution, electricity tax and retailer margin are not specified as components of this spot-price forecast; do not present it as a household all-in tariff.

## Actual live coverage

Both URLs returned identical 218-row arrays at the check time, with 217 consecutive deltas of exactly 3,600,000 ms, no duplicate timestamps and numeric prices throughout:

| Item | UTC | Europe/Helsinki |
| --- | --- | --- |
| First interval start | 2026-11-01 22:00 | 2026-11-02 00:00 |
| Last interval start | 2026-11-10 23:00 | 2026-11-11 01:00 |
| Exclusive coverage end | 2026-11-11 00:00 | 2026-11-11 02:00 |

181 rows started strictly after the check time, plus the current hour. This is approximately 7 days 13.5 hours of remaining coverage, not merely a README promise. Endpoint values change; these are observations, not a permanent horizon. The [generator](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/nordpool_predict_fi.py#L160-L179) extends seven days to the end of a UTC day, which explains coverage beyond seven exact days.

## Freshness and update schedule

There is no intrinsic freshness metadata in the price array. HTTP observations:

- Raw GitHub: `Cache-Control: max-age=300`, ETag, no Last-Modified observed. HTTP Date and cache age are delivery metadata, not forecast generation time.
- Hosted JSON: `Cache-Control: max-age=10800`, ETag, `Last-Modified: Tue, 03 Nov 2026 10:02:19 GMT`. This is deployment/file modification metadata, not a per-row model timestamp.
- [File commit history](https://github.com/vividfog/nordpool-predict-fi/commits/main/deploy/prediction.json) / [API](https://api.github.com/repos/vividfog/nordpool-predict-fi/commits?path=deploy/prediction.json&per_page=10): latest update 2026-11-03 10:01:54 UTC; previous updates 07:05, 01:04; preceding day 19:00, 10:04, 07:04, 01:03 UTC. Observed gaps span roughly 3–9 hours. This is evidence of active maintenance, not a guaranteed cron schedule.

The [website changelog](https://sahkovatkain.web.app/) says automatic data refresh every six hours, and the [frontend](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/deploy/js/prediction.js#L134-L152) sets a six-hour refresh guard. **Browser refetch cadence must not be confused with publisher generation cadence.** No committed scheduler or guaranteed backend publication schedule was found in the inspected repository tree.

Integration policy: fetch on the server with timeout, a shared cache (e.g. 30–60 minutes), conditional ETag revalidation where available, and last-good fallback marked stale on failure. Store `fetchedAt` separately from source modification time; a successful fetch of unchanged bytes does not prove a newly generated forecast. Check remaining future coverage as well as last observed content change. Never claim “forecast generated now” based on fetch time. A 12-hour unchanged-content warning is a reasonable local policy, not an upstream contract.

## License, attribution and reliability

The repository's [MIT license](https://github.com/vividfog/nordpool-predict-fi/blob/5c6f3ab609360b0126537de3d3bd69fb188f0d2b/LICENSE) names `Copyright (c) 2024 npf` and requires retaining its copyright and permission notice when copying substantial software/documentation. Suggested visible credit: **“Tuntiennuste: Sähkövatkain / vividfog (arvio)”**, linked to the [project](https://github.com/vividfog/nordpool-predict-fi). Retain MIT text in third-party notices if code/documentation is reused. MIT does not establish ownership of all upstream market data: [Sähkötin's API terms](https://sahkotin.fi/api) restrict its free API to noncommercial use and identify Nord Pool as spot-data owner. No separate forecast-data license or upstream-rights clearance was found; commercial redistribution needs separate clarification.

The [maintainer](https://github.com/vividfog/nordpool-predict-fi#how-long-will-this-repositorydata-be-updated) explicitly offers no continued-update guarantee. The [live site's limitations](https://sahkovatkain.web.app/) warn of unusual events, production outages and changing weather; no calibrated confidence bounds or independently verified forecast error guarantee accompanies the JSON. Volatility scaling is experimental. Hosted and GitHub URLs are mirrors of one publisher, not independent fallback models.

For WattInfo, distinguish estimates visually and in API provenance; prefer published prices wherever available, suppress invalid/missing hours rather than invent values, preserve negative prices, validate finite numbers and ordered unique hourly timestamps, and calculate forecast averages only over complete intervals. Keep published-price cheapest-window statistics separate from forecast-based suggestions. No implementation, browser/hardware tests, or multi-day uptime/accuracy study was performed.
