# Kaafila — retail resilience

A working BIOS hackathon prototype: receive a retail disruption alert, interpret it with our own small AI model, investigate inventory and supply options, calculate stockout exposure, and present an evidence-backed recovery decision.

## Run

Node.js 22.13+ is required; Node 24 is recommended for the test runner.

```sh
npm ci
npm run dev
```

Open the printed Local URL, normally http://127.0.0.1:5173.

```sh
npm test
npm run typecheck
npm run build
```

The deployment uses the included Sites/Vinext Cloudflare Worker integration. No paid AI API, database, or secret is needed.

## Try it

1. Open the disruption desk and choose one of five sample alerts.
2. Click **Investigate alert**. Review store coverage, sales exposure and priced recovery options.
3. Open **Evidence room** to inspect all seven tool/model outputs.
4. Choose **Review & approve**, or select an alternative and record a reason.
5. Export the case as Markdown, including raw evidence and browser-local decisions.
6. Click **New alert**, paste a sample below, click **Interpret with AlertNet**, confirm the suggested fields, then investigate.

Sample custom prompt:

> Rice demand has surged 2.4x in Chandigarh and Ludhiana. Replenishment is 24 hours away.

More prompts and an easy presentation flow are in [DEMO.md](DEMO.md).

## Our own AI model

**AlertNet 1.0** is trained from scratch on 2,560 synthetic retail alerts. Two multinomial Naive Bayes heads predict event and product classes using word and character features. Deterministic rules extract cities, duration and demand multipliers. The 234 KB model runs in JavaScript; it needs no API key or Python at runtime.

```sh
python model/train.py
```

This regenerates model weights, training data, holdout data and evaluation. Both classification heads pass 640/640 held-out synthetic examples; **this is not real-world accuracy**. Read [the model card](model/MODEL_CARD.md) for architecture, scope, abstention and limitations. Manager-confirmed fields govern all downstream calculations.

## Working features

- 24 synthetic stores across six Punjab–Haryana cities; four product categories.
- Five scenarios: flood, demand surge, supplier shortfall, cold-chain breach, covered delivery delay.
- Custom model-assisted multi-city alert entry.
- Code-based stock coverage, stockout exposure, risk scoring and cost comparison.
- Four candidate actions: store transfer, backup supplier, expedite, or monitor.
- Shared source capacity, donor safety reserves, arrival windows and shelf-life checks.
- Interactive network schematic and store filtering.
- Seven inspectable evidence outputs and downloadable case report.
- Approval and override history in browser localStorage.
- Optional current weather from [Open-Meteo](https://open-meteo.com/en/docs), isolated from replay assumptions.

## Architecture

```text
Text alert → AlertNet classifier + entity rules → human-confirmed fields
           → validation → inventory/demand → transfers + supplier + route tools
           → deterministic risk and allocation engine → ranked options
           → evidence report → manager decision (browser-local)
```

React/TypeScript UI on Vinext + Vite. API routes run locally or in a Cloudflare Worker.

- `lib/kaafila/data.ts`: synthetic network and five sample scenarios.
- `lib/kaafila/alert-model.ts`: TypeScript model inference and extraction.
- `lib/kaafila/engine.ts`: validation, risk, allocation, costs and evidence.
- `app/api/interpret`: model-assisted alert parsing.
- `app/api/investigate`: complete investigation endpoint.
- `app/api/weather`: bounded current-weather fetch with failure handling.
- `model/`: training script, dataset, weights, evaluation and model card.
- `tests/`: risk invariants, model parity, ambiguity handling and API checks.

## Calculation boundaries

Stock cover = on-hand / estimated hourly demand. Shortage = max(0, ceil(demand × replenishment gap − stock)). Sales exposure = shortage × retail price. Actions are ranked by avoided retail sales minus incremental recovery cost; this proxy is **not profit or guaranteed savings**. Each plan is evaluated independently. Demand is assumed constant and original supply resumes after the stated gap. Unaffected donor stores preserve a 24-hour reserve. Unsafe cold-chain shipments and missing shipments cannot be expedited.

## Prototype boundaries

Inventory, supplier quotes, route times, retailer identity and all sample disruptions are synthetic. The map is schematic. Model scores are uncalibrated. Decision history is browser-local, not a shared or tamper-proof audit log. Approving a plan does not place an order, contact a supplier or dispatch a vehicle. Weather is optional live context; it does not verify a fictional disruption. No Telegram integration, ERP import, autonomous learning or production retailer integration is claimed.

## Android driver pilot

The dedicated Android app lives in [driver-mobile](driver-mobile/README.md). Open **Live Dispatch** from the manager website for operational assignments, drivers, vehicles and delivery evidence. Firebase setup was deferred; the current build clearly shows setup pending and offers a separate sample walkthrough.

- [Firebase setup and physical-phone launch gate](docs/FIREBASE_SETUP.md)
- [API, offline queue and stock-custody rules](docs/DISPATCH_API.md)
- [Release notes and verification](docs/DRIVER_RELEASE.md)
- [Download the signed Android APK](https://github.com/Nidhish01/Kaafila/releases/download/driver-v0.1.0/Kaafila-Driver-0.1.0.apk) — Firebase setup pending; includes the isolated sample trip.

Run `npm run test:dispatch` for domain checks and `npm run test:firebase` for isolated Auth, Firestore, Storage and Functions emulator tests (Java 21 required).
