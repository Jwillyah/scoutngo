# The shadows while the time bar is scrubbed

Run 2026-11-12T02:33:19.130Z · `node scripts/measure-shadow-fps.mjs /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/dist-p3-after` · Chromium (Pixel 7) 412 x 915, CPU slowed 4x (a mid-range Android stand-in) · the Virginia Beach oceanfront at zoom 16.5, page clock 2026-10-29T19:00:00Z · the gate's server and fixture proxy, nothing live.

- building shadows painted: 24
- frames while scrubbing: 131 in 4.1 s, 32.0 fps
- frame time: median 29.0 ms, 95th percentile 61.0 ms, worst 76.0 ms
- shadow repaints: 80, each median 7.0 ms, 95th percentile 9.0 ms
