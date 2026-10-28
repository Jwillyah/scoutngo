# Pinch zoom on the plan map

Run: 2026-10-28T22:47:52.610Z · node scripts/measure-pinch.mjs before · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation (Input.dispatchTouchEvent), network 150 ms / 1.6 Mbit/s, Virginia Beach Fishing Pier, sunrise, fc44117

Jump: the camera moved with a finger down and no finger having moved in that frame or the two before. Off the fingers: |zoom − (zoom at touchstart + log2 of the spread ratio)|, from the fourth frame under two fingers. App move: easeTo / flyTo / jumpTo / fitBounds called with a finger down. Snap back: after release, the zoom running against the pinch. Black: canvas sample more than half black or empty (every third frame).

| pinch | zoom | frames under fingers | jumps | off the fingers p95 / worst (levels) | app moves | snap back | black frames | p50 ms | p95 ms | worst ms |
|---|---|---|---|---|---|---|---|---|---|---|
| pinch in | 16.50 → 18.20 | 91 | 0 | 0.077 / 0.097 | 0 | 0 | 0 of 50 | 16.7 | 183.3 | 183.4 |
| pinch out | 18.20 → 16.57 | 94 | 0 | 0.149 / 0.173 | 0 | 0 | 0 of 56 | 16.7 | 183.3 | 200.1 |
| in-out-in, fast | 16.57 → 18.15 | 54 | 0 | 0.322 / 0.354 | 0 | 0 | 0 of 41 | 16.7 | 183.3 | 200.1 |
| pinch while tiles load | 15.00 → 14.95 | 87 | 0 | 0.216 / 0.306 | 0 | 0 | 19 of 46 | 16.7 | 166.7 | 183.4 |
| pinch starting on pin | 16.50 → 17.53 | 63 | 0 | 0.148 / 0.159 | 0 | 0 | 0 of 23 | 16.7 | 166.6 | 4516.5 |
| pinch with the sheet at half | 17.53 → 19.27 | 61 | 0 | 0.120 / 0.143 | 0 | 0 | 0 of 40 | 16.7 | 200.0 | 200.1 |

NOT clean: see the table.
