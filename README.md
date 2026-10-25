# Kaafila — retail disruption desk

A working hackathon prototype for the BIOS retail supply-chain disruption challenge. Investigate a disruption, inspect store-level risk, compare priced recovery plans, review supporting evidence, and record a manager decision.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run dev
```

Open the Local URL printed by the server (normally http://127.0.0.1:5173).

```sh
node --test tests/engine.test.ts
npx tsc --noEmit
npm run build
```

## Working features

- Five sample scenarios: flood, demand surge, supplier shortfall, cold-chain breach, covered delivery delay.
- 24 synthetic stores across six Punjab–Haryana cities and four product categories.
- Validated investigation API, deterministic risk calculations, capacity-constrained recovery allocation.
- Evidence room with six inspectable tool results, formulas and assumptions.
- Interactive network schematic, store filters, report download, approvals and overrides.
- Optional live weather context from Open-Meteo with explicit failure handling.

## Prototype boundaries

Retail inventory, prices, route times and supplier quotes are synthetic. Sales exposure is not profit or guaranteed lost sales. Approval records a decision in browser localStorage; it does not order goods or dispatch vehicles. The initial replay uses a deterministic planner. A purpose-built alert classification model is being added in the next update.

## Architecture

React + TypeScript with the Vinext/Vite Sites starter. API routes run locally and in a Cloudflare Worker. `lib/kaafila/data.ts` defines the demo network; `lib/kaafila/engine.ts` owns risk and recovery math. `app/api/investigate/route.ts` validates incoming alerts. No API key is needed.

Weather reference: https://open-meteo.com/en/docs
