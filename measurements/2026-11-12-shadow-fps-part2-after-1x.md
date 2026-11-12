# The shadows while the time bar is scrubbed

Run 2026-11-12T02:34:27.774Z · `node scripts/measure-shadow-fps.mjs /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/dist-p3-after` · Chromium (Pixel 7) 412 x 915, CPU not slowed · the Virginia Beach oceanfront at zoom 16.5, page clock 2026-10-29T19:00:00Z · the gate's server and fixture proxy, nothing live.

- building shadows painted: 24
- frames while scrubbing: 251 in 4.0 s, 62.7 fps
- frame time: median 16.0 ms, 95th percentile 20.0 ms, worst 25.0 ms
- shadow repaints: 105, each median 4.0 ms, 95th percentile 5.0 ms
