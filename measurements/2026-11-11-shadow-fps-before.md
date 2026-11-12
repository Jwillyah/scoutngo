# The shadows while the time bar is scrubbed

Run 2026-11-11T23:49:55.730Z · `node scripts/measure-shadow-fps.mjs /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/wt-commit/dist` · Chromium (Pixel 7) 412 x 915, CPU slowed 4x (a mid-range Android stand-in) · the Virginia Beach oceanfront at zoom 16.5, page clock 2026-10-29T19:00:00Z · the gate's server and fixture proxy, nothing live.

- building shadows painted: not reported by this build (before the painted shadows, its shadows were map polygons)
- frames while scrubbing: 72 in 4.1 s, 17.2 fps
- frame time: median 61.0 ms, 95th percentile 107.0 ms, worst 112.0 ms
- shadow repaints: not reported by this build
