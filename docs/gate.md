# The gate, and why nothing in it touches the network

`.githooks/pre-commit` runs the fast checks (types, lint, the source audits,
the unit tests, the build), then every browser audit against the built app.
Since Batch C2 (1 Nov 2026) the browser half runs on this machine alone.

## What changed, and why

Through Batch C a full gate took about half an hour a commit
(measurements/2026-11-01-gate-time.md), and the audits used live services:

- the 3D network audit waited on real imagery and failed whenever it was slow;
  `SCOUTNGO_SKIP_AUDITS` was used five times in Batch C because of it;
- the audits used up Open-Meteo's daily allowance for the home IP, which then
  starved the phone on the same Wi-Fi (30 Oct, Wrightsville Beach).

A check that depends on somebody else's server is measuring that server.

## How it works

`scripts/gate/browser-gate.sh`, run by the hook after the build:

| piece | what it does |
|---|---|
| `scripts/gate/server.mjs` :5180 | serves `dist/` the way Vercel does (the page rewrites; `/api/*` from `api/*.ts`, whose upstream fetches are answered by fixtures). One server, built once, shared by every audit. No `/sw.js` here (see below). |
| `scripts/gate/server.mjs` :5181 | the fixture proxy. Every audit browser goes out through it; it terminates HTTPS with a throwaway certificate and answers from `scripts/gate/fixtures.mjs`. It never opens a connection anywhere. |
| `scripts/gate/fixtures.mjs` | Open-Meteo (all three hosts) from `scripts/openMeteoFake.mjs`; NOAA tides as a generated curve; NDBC, METAR and NWS as saved text; imagery as a fixed speckle (detail to measure, no real place); elevation drawn in code (flat at the coast, hills inland); OpenFreeMap vector tiles from `scripts/gate/tiles/` (recorded once by `scripts/gate/record-tiles.mjs` for the pier, Wrightsville, the calibration venue, Hampton Coliseum and Big Meadows), empty where not recorded. |
| `scripts/gate/playwright.mjs` | what the audits import instead of `playwright`: WebKit and Chromium launched behind the proxy. |
| `scripts/preflight.mjs` `chromeArgs` | the CDP audits' Chrome, on :9333, behind the proxy. |
| `scripts/cdp.mjs` | each CDP audit gets a browser context of its own, so audits side by side share no storage. |
| `scripts/gate/nodeGuard.mjs` | loaded into every audit process: a fetch from the audit script itself to any non-local host is refused and reported. |
| `scripts/gate/run-audits.mjs` | runs the audits four at a time (the gesture and projection audits alone, since they time things), every one even after a failure, and prints each failure's log tail. |
| `scripts/audit-network-guard.mjs` | last: proves Chrome and WebKit are behind the proxy (a request to `guard-canary.invalid` must reach it), then reads the proxy's ledger and fails on any host no fixture covers and on any request an audit's own process tried to send outside. |

The unit tests have the same rule in `tests/setup.ts`: a fetch to a host other
than this machine throws with the host's name.

An audit's own route still answers first: Playwright handles routes inside the
browser, before anything reaches the proxy. So the weather audit's 429 and the
locate audit's refusal are unchanged.

### Why no service worker on the shared server

In WebKit, requests from a page a service worker controls skip Playwright's
routes, and several audits answer a host with their own fixture through a
route. The worker is what the venue pack and service worker audits test, and
they each serve `dist/` themselves with the worker on.

## Running it by hand

```
npm run build
bash scripts/gate/browser-gate.sh                 # all of it, with the guard
bash scripts/gate/browser-gate.sh "3d network"    # one or more by name
```

Run without the gate's variables, an audit still uses the dev server on :5173
and Chrome on :9222, with the real network, as before.

## Adding a host

If the app starts talking to a new host, the network guard fails with
"no fixture for …". Add an answer to `scripts/gate/fixtures.mjs`. A recorded
answer goes under `scripts/fixtures/`; do not make the gate fetch it live.

## The emergency switch

`SCOUTNGO_SKIP_AUDITS=1 git commit …` still exists. It skips every browser
audit and the network guard, prints a loud warning, and its use goes in the
report. No audit should need it: if one fails for a reason that is not the
change, fix the audit.
