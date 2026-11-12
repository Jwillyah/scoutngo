# The shadows while the time bar is scrubbed

Run 2026-11-12T16:43:14.638Z · `node scripts/measure-shadow-fps.mjs /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/wt-dry/dist` · Chromium (Pixel 7) 412 x 915, CPU slowed 4x (a mid-range Android stand-in) · the Virginia Beach oceanfront at zoom 16.5, page clock 2026-10-29T19:00:00Z · the gate's server and fixture proxy, nothing live · the raster painted in a worker (OffscreenCanvas), Chromium.

- building shadows painted: 24
- frames while scrubbing: 99 in 4.1 s, 23.8 fps
- frame time: median 45.0 ms, 95th percentile 88.0 ms, worst 124.0 ms
- shadow repaints: 43, each median 4.3 ms, 95th percentile 6.4 ms
