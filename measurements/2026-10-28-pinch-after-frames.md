# Pinch zoom on the plan map

Run: 2026-10-28T23:02:23.124Z · node scripts/measure-pinch.mjs after-frames · Chrome headless (SwiftShader WebGL), 390 x 844, touch emulation (Input.dispatchTouchEvent), network 150 ms / 1.6 Mbit/s, Virginia Beach Fishing Pier, sunrise, working tree, no canvas readback (frame times only; black not sampled)

Jump: the camera moved with a finger down and no finger having moved in that frame or the two before. Off the fingers: |zoom − (zoom at touchstart + log2 of the spread ratio)|, from the fourth frame under two fingers. App move: easeTo / flyTo / jumpTo / fitBounds called with a finger down. Snap back: after release, the zoom running against the pinch. Black: canvas sample more than half black or empty (every third frame).

| pinch | zoom | frames under fingers | jumps | held: zoom off (levels) | held: place off the fingers (px) | moving: off the fingers p95 / worst (levels) | app moves | snap back | black frames | p50 ms | p95 ms | worst ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| pinch in | 16.50 → 18.20 | 96 | 0 | 0.000 | 0.0 | 0.077 / 0.097 | 0 | 0 | 0 of 0 | 16.7 | 66.7 | 83.4 |
| pinch out | 18.20 → 16.50 | 83 | 0 | 0.000 | 0.0 | 0.086 / 0.104 | 0 | 0 | 0 of 0 | 16.7 | 66.7 | 66.7 |
| in-out-in, fast | 16.50 → 18.08 | 59 | 0 | 0.000 | 0.0 | 0.322 / 0.354 | 0 | 0 | 0 of 0 | 16.7 | 66.7 | 83.2 |
| pinch while tiles load | 15.00 → 14.87 | 89 | 0 | 0.000 | 0.0 | 0.175 / 0.231 | 0 | 0 | 0 of 0 | 16.8 | 83.2 | 83.4 |
| pinch starting on pin | 16.50 → 17.62 | 69 | 0 | 0.000 | 0.1 | 0.064 / 0.077 | 0 | 0 | 0 of 0 | 66.6 | 83.3 | 4483.2 |
| pinch with the sheet at half | 17.62 → 19.35 | 65 | 0 | 0.000 | 0.0 | 0.110 / 0.143 | 0 | 0 | 0 of 0 | 16.7 | 116.6 | 183.4 |

| gesture | zoom | bearing | pitch | as it should |
|---|---|---|---|---|
| double tap zooms in | 19.35 → 20.35 | 0.0 → 0.0 | 0.0 → 0.0 | yes |
| two-finger tap zooms out | 20.35 → 19.35 | 0.0 → 0.0 | 0.0 → 0.0 | yes |
| one finger pans, at the same zoom | 19.35 → 19.35 | 0.0 → 0.0 | 0.0 → 0.0 | yes |
| a small slow twist does not rotate, or zoom | 19.35 → 19.35 | 0.0 → 0.0 | 0.0 → 0.0 | yes |
| a deliberate twist does rotate | 19.35 → 19.35 | 0.0 → -33.0 | 0.0 → 0.0 | yes |
| two fingers dragged up together do not tilt the 2D map | 19.35 → 19.35 | -33.0 → -33.0 | 0.0 → 0.0 | yes |

All clean.
