# Scrubbing time: the ruler and the shadows

Run: 2026-10-29T00:06:53.190Z · node scripts/measure-timebar.mjs before · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation, CPU throttled 4x, Virginia Beach Fishing Pier at sunrise, sun and shadows on, 051aa57

Three sideways drags of 150 px on the ruler, held still 250 ms before release. Finger to ruler: px between where the finger has dragged the ruler and where it is drawn. Needle to shadows: frames since the map's shadows were last for the needle's minute.

| drag | over | frames | frame p50 ms | frame p95 ms | frames over 17.5 ms | finger to ruler p50 / p95 px | needle to shadows p50 / p95 / worst frames |
|---|---|---|---|---|---|---|---|
| slow | 2400 ms | 336 | 33.2 | 83.3 | 168 | 70.6 / 142.2 | 0 / 2 / 3 |
| medium | 900 ms | 127 | 16.8 | 83.3 | 61 | 77.9 / 147.6 | 0 / 2 / 2 |
| fast | 300 ms | 53 | 33.3 | 18632.6 | 27 | 63.0 / 134.5 | 0 / 2 / 3 |
