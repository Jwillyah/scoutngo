# Network, offline and speed

Run 2026-11-11T14:31:27.686Z · `node scripts/measure-network.mjs /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/dist-p1a --map-min 10 --only-load` · Chromium (Pixel 7) 412 x 915 · the VB pier saved · page clock 2026-11-02T15:30:00.000Z · the gate's server and fixture proxy (scripts/gate/server.mjs), the app's files gzipped as the host sends them (SCOUTNGO_GATE_GZIP), nothing live.


## Requests

- one app open (the home): 48 requests that are not the app's own files (54 in all)
- surf: 45 more
- tide: 3 more
- wind: 3 more
- weather: 61 more
- sky: 44 more
- map: 1602 more

## The home on slow 3G, cold (nothing cached)

- the temperature drawn as a number: 23.8 s after the open (target under 8 s)
- JavaScript asked for before it: 4 files, 996 KB gzipped (target under 250 KB)

## The home on slow 3G, the forecast cached

- the temperature drawn as a number: 1.3 s after the open (target under 3 s)

## Size

- the built app: 10.1 MB in 36 files; JavaScript 7.98 MB, 2.78 MB gzipped, in 16 files
