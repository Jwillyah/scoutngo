# Pinch zoom on the plan map

Run: 2026-10-28T23:00:47.707Z · node scripts/measure-pinch.mjs after · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation (Input.dispatchTouchEvent), network 150 ms / 1.6 Mbit/s, Virginia Beach Fishing Pier, sunrise, working tree

Jump: the camera moved with a finger down and no finger having moved in that frame or the two before. Off the fingers: |zoom − (zoom at touchstart + log2 of the spread ratio)|, from the fourth frame under two fingers. App move: easeTo / flyTo / jumpTo / fitBounds called with a finger down. Snap back: after release, the zoom running against the pinch. Black: canvas sample more than half black or empty (every third frame).

| pinch | zoom | frames under fingers | jumps | held: zoom off (levels) | held: place off the fingers (px) | moving: off the fingers p95 / worst (levels) | app moves | snap back | black frames | p50 ms | p95 ms | worst ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinch in | 16.50 → 18.20 | 96 | 0 | 0.000 | 0.0 | 0.077 / 0.097 | 0 | 0 | 0 of 57 | 16.7 | 183.3 | 200.1 |
| pinch out | 18.20 → 16.50 | 102 | 0 | 0.000 | 0.0 | 0.081 / 0.104 | 0 | 0 | 0 of 63 | 16.7 | 183.4 | 200.1 |
| in-out-in, fast | 16.50 → 18.08 | 59 | 0 | 0.000 | 0.0 | 0.322 / 0.354 | 0 | 0 | 0 of 47 | 16.7 | 183.3 | 200.0 |
| pinch while tiles load | 15.00 → 14.87 | 94 | 0 | 0.000 | 0.4 | 0.175 / 0.231 | 0 | 0 | 0 of 55 | 16.7 | 183.3 | 200.0 |
| pinch starting on pin | 16.50 → 17.62 | 66 | 0 | 0.000 | 0.0 | 0.067 / 0.077 | 0 | 0 | 0 of 27 | 16.7 | 200.0 | 5016.4 |
| pinch with the sheet at half | 17.62 → 19.35 | 66 | 0 | 0.000 | 0.0 | 0.110 / 0.143 | 0 | 0 | 0 of 47 | 16.7 | 183.3 | 200.0 |

| gesture | zoom | bearing | pitch | as it should |
|---|---|---|---|---|
| double tap zooms in | 19.35 → 20.35 | 0.0 → 0.0 | 0.0 → 0.0 | yes |
| two-finger tap zooms out | 20.35 → 19.35 | 0.0 → 0.0 | 0.0 → 0.0 | yes |
| one finger pans, at the same zoom | 19.35 → 19.35 | 0.0 → 0.0 | 0.0 → 0.0 | yes |
| a small slow twist does not rotate, or zoom | 19.35 → 19.35 | 0.0 → 0.0 | 0.0 → 0.0 | yes |
| a deliberate twist does rotate | 19.35 → 19.35 | 0.0 → -33.0 | 0.0 → 0.0 | yes |
| two fingers dragged up together do not tilt the 2D map | 19.35 → 19.35 | -33.0 → -33.0 | 0.0 → 0.0 | yes |

All clean.
