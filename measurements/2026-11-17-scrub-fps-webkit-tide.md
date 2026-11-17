# The timeline bar's scrub, frames a second (2026-11-17)

Written by `scripts/measure-scrub-fps.mjs` (Batch DRONE, Section 3).

## Parameters

- url: http://127.0.0.1:5196/?probe=1
- layer: tide
- browser: WebKit, iPhone 13 profile, 390 x 844
- CPU throttle: none (WebKit has no DevTools protocol to slow it)
- drag: 3015 ms across the day strip and back, 130 finger moves

## Result

- frames drawn while the finger was down: 176
- frames a second: 58.4
- longest gap between two frames: 31 ms
- requests during the drag: 0
- the flag read at the end: 3 AM
