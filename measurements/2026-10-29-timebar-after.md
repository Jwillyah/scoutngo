# Scrubbing time: the ruler and the shadows

Run: 2026-10-29T00:44:46.792Z · node scripts/measure-timebar.mjs after · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation, CPU throttled 4x, Virginia Beach Fishing Pier at sunrise, sun and shadows on, working tree

Three sideways drags of 150 px on the ruler, held still 250 ms before release. Finger to ruler: px between where the finger has dragged the ruler and where it is drawn. Needle to shadows: frames since the map's shadows were last for the needle's minute.

| drag | over | frames | frame p50 ms | frame p95 ms | frames over 17.5 ms | finger to ruler p50 / p95 px | needle to shadows p50 / p95 / worst frames |
|---|---|---|---|---|---|---|---|
| slow | 2400 ms | 313 | 50.0 | 83.3 | 174 | 0.0 / 9.0 | 0 / 3 / 6 |
| medium | 900 ms | 118 | 33.3 | 83.4 | 61 | 0.0 / 10.7 | 1 / 3 / 4 |
| fast | 300 ms | 48 | 16.7 | 83.3 | 21 | 0.0 / 0.0 | 0 / 4 / 6 |
