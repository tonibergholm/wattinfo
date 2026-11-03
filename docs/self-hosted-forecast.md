# Self-hosted forecasts

WattInfo can read a locally generated hourly forecast instead of the default public feed. Forecasts remain estimates and are kept separate from confirmed prices and appliance recommendations.

## Forecast engine

Use [nordpool-predict-fi](https://github.com/vividfog/nordpool-predict-fi) in an isolated Python environment. The integration was developed against revision `5c6f3ab609360b0126537de3d3bd69fb188f0d2b`. `deploy/forecast-requirements.txt` contains CPU runtime dependencies; optional neural-network models are omitted.

Configure the engine using its environment template. Fingrid and ENTSO-E credentials belong in a private `.env.local` file with owner-only permissions. Never commit credentials, database files, generated forecasts or logs.

Restore historical training data according to the engine's documentation, using a staging database first. The tested upstream SQL dump references `sqlite_sequence` even when no AUTOINCREMENT table exists; if needed, create and drop a temporary AUTOINCREMENT table before importing it. Back up existing training history before restoring anything.

`deploy/forecast-no-narration.patch` moves the upstream LLM import into its optional narration branch. This allows numeric forecasts to run without external LLM credentials. Check whether the patch is still needed when upgrading the engine.

## Generating and serving forecasts

Run the engine with `--predict --commit --deploy`. It refreshes input data, retrains the models and exports hourly predictions.

The provided scripts and user systemd units are examples with an expected `$HOME/apps` directory layout. Adapt their paths, schedule and resource limits to your own environment before installation. They validate newly generated numeric output and publish it atomically. Failed generation leaves the previous forecast intact.

Set `FORECAST_FILE` to the absolute path of the private JSON file that WattInfo should read. The format is `[[UTC_timestamp_ms, VAT_inclusive_snt_per_kWh], ...]`, with hourly interval starts. The API identifies this source as `selfhosted`. Without this setting, WattInfo reads the upstream public forecast feed.

The local file is cached for one minute and browsers check every five minutes. Files older than 24 hours are marked stale. Source-file modification time reflects publication and does not prove that every external input was recently updated.

Keep engine logs private: upstream request errors may contain credentials in URLs. Back up the training database and forecast evaluation history.

## Optional local Ollama summary

`deploy/Ahma.Modelfile` defines a local alias for a quantized [Finnish-NLP/Ahma-3B-Instruct](https://huggingface.co/Finnish-NLP/Ahma-3B-Instruct) model. The template follows the model author's Llama 2 prompt format. Create the alias on your own Ollama installation before enabling narration.

`deploy/narrate-forecast.py` computes the cheapest and most expensive complete Finnish calendar days, including DST changes, then asks local Ollama to rewrite those facts. The request has a bounded context and output length and asks for the model to unload afterward. Ollama's resource use is independent of the numeric generation service's limits.

Dates, units and price values are checked before publication. If generation or validation fails, the script publishes the directly computed facts instead. The dashboard labels AI-written and computed summaries differently. Even validated prose can contain mistakes; it never controls appliances or changes numeric prices.

The summary is matched to the exact forecast using SHA-256 and publication time. Old summaries are suppressed after a new forecast is published.

## Learning and accuracy history

The engine retrains on refreshed input data during generation. `deploy/track-forecast.py` separately preserves issued predictions and stores complete hourly averages derived from published quarter-hour prices.

Accuracy scoring excludes prices already known when a prediction was issued, and excludes issues whose publication status could not be established. It compares hourly means by forecast lead time: under 24 hours, 24–48, 48–72 and beyond 72. MAE is the mean absolute error; bias is forecast minus actual. Point counts and distinct target-hour counts are reported because multiple issues can predict the same hour.

Results accumulate from installation onward. Missed observations outside the source's rolling window remain unscored. Old predictions are not replaced by newer ones. Automatic hyperparameter changes and bias corrections are not applied from small samples.

The SQLite ledger and aggregate accuracy report are runtime data, excluded from Git. The public API exposes only aggregate accuracy statistics.

## Checks and updates

Run `npm test`, `python3 -m unittest discover -s test -p '*_test.py'` and `bash -n deploy/run-forecast.sh`. Verify adapted systemd units and complete a live generation before selecting the local feed.

For upgrades, back up databases, pin a reviewed engine revision, check the compatibility patch, install compatible dependencies and inspect data-source warnings. Benchmark resource use on your own machine. See [forecast-source.md](forecast-source.md) for source contracts, licensing and reliability limits.
