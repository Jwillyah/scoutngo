# Scrubbing time: the ruler and the shadows

Run: 2026-10-29T00:45:25.620Z · node scripts/measure-timebar.mjs after-unthrottled · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation, CPU throttled 1x, Virginia Beach Fishing Pier at sunrise, sun and shadows on, working tree

Three sideways drags of 150 px on the ruler, held still 250 ms before release. Finger to ruler: px between where the finger has dragged the ruler and where it is drawn. Needle to shadows: frames since the map's shadows were last for the needle's minute.

| drag | over | frames | frame p50 ms | frame p95 ms | frames over 17.5 ms | finger to ruler p50 / p95 px | needle to shadows p50 / p95 / worst frames |
|---|---|---|---|---|---|---|---|
| slow | 2400 ms | 308 | 16.8 | 66.8 | 146 | 0.0 / 9.0 | 0 / 1 / 3 |
| medium | 900 ms | 135 | 16.7 | 66.7 | 55 | 0.0 / 8.0 | 0 / 1 / 1 |
| fast | 300 ms | 43 | 16.7 | 83.3 | 18 | 0.0 / 0.0 | 0 / 3 / 4 |
