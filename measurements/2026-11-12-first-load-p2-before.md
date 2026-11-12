# Network, offline and speed

Run 2026-11-12T00:54:57.664Z · `node scripts/measure-network.mjs /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/dist-p2-before --map-min 10 --only-load` · Chromium (Pixel 7) 412 x 915 · the VB pier saved · page clock 2026-11-02T15:30:00.000Z · the gate's server and fixture proxy (scripts/gate/server.mjs), the app's files gzipped as the host sends them (SCOUTNGO_GATE_GZIP), nothing live.


## Requests

- one app open (the home): 48 requests that are not the app's own files (72 in all)
- surf: 13 more
- tide: 5 more
- wind: 3 more
- weather: 64 more
- sky: 45 more
- map: 1601 more

## The home on slow 3G, cold (nothing cached)

- the temperature drawn as a number: 11.0 s after the open (target under 8 s)
- JavaScript asked for before it: 22 files, 324 KB gzipped (target under 250 KB)

## The home on slow 3G, the forecast cached

- the temperature drawn as a number: 1.3 s after the open (target under 3 s)

## Size

- the built app: 10.2 MB in 92 files; JavaScript 8.03 MB, 2.81 MB gzipped, in 65 files
