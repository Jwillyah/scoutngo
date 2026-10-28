# Pinch zoom on the plan map

Run: 2026-10-28T22:52:37.044Z · node scripts/measure-pinch.mjs before-around-centre · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation (Input.dispatchTouchEvent), network 150 ms / 1.6 Mbit/s, Virginia Beach Fishing Pier, sunrise, working tree, with the pinch set round the screen centre at run time (fc44117's setting)

Jump: the camera moved with a finger down and no finger having moved in that frame or the two before. Off the fingers: |zoom − (zoom at touchstart + log2 of the spread ratio)|, from the fourth frame under two fingers. App move: easeTo / flyTo / jumpTo / fitBounds called with a finger down. Snap back: after release, the zoom running against the pinch. Black: canvas sample more than half black or empty (every third frame).

| pinch | zoom | frames under fingers | jumps | held: zoom off (levels) | held: place off the fingers (px) | moving: off the fingers p95 / worst (levels) | app moves | snap back | black frames | p50 ms | p95 ms | worst ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinch in | 16.50 → 18.20 | 96 | 0 | 0.000 | 58.5 | 0.077 / 0.097 | 0 | 0 | 0 of 58 | 16.7 | 183.4 | 200.1 |
| pinch out | 18.20 → 16.57 | 95 | 0 | 0.068 | 17.6 | 0.149 / 0.173 | 0 | 0 | 0 of 59 | 16.7 | 183.3 | 200.1 |
| in-out-in, fast | 16.57 → 18.15 | 58 | 0 | 0.000 | 52.0 | 0.322 / 0.354 | 0 | 0 | 0 of 43 | 16.7 | 183.3 | 200.0 |
| pinch while tiles load | 15.00 → 14.95 | 90 | 0 | 0.075 | 0.9 | 0.216 / 0.306 | 0 | 0 | 0 of 54 | 16.7 | 200.0 | 216.7 |
| pinch starting on pin | 16.50 → 17.53 | 66 | 0 | 0.082 | 64.4 | 0.148 / 0.159 | 0 | 0 | 0 of 23 | 16.7 | 183.4 | 4749.9 |
| pinch with the sheet at half | 17.53 → 19.27 | 66 | 0 | 0.000 | 60.7 | 0.110 / 0.143 | 0 | 0 | 0 of 47 | 16.7 | 183.3 | 183.4 |

NOT clean: see the table.
