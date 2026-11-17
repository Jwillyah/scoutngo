# The timeline bar's scrub, frames a second (2026-11-17)

Written by `scripts/measure-scrub-fps.mjs` (Batch DRONE, Section 3).

## Parameters

- url: http://127.0.0.1:5196/?probe=1
- layer: tide
- browser: Chromium, Pixel 7 profile, 412 x 915
- CPU throttle: 1x
- drag: 3000 ms across the day strip and back, 65 finger moves

## Result

- frames drawn while the finger was down: 91
- frames a second: 30.3
- longest gap between two frames: 33 ms
- requests during the drag: 10 (127.0.0.1:5196 1, api.open-meteo.com 9)
- the flag read at the end: 8 AM

## Notes (Batch DRONE, Section 3)

- Build: aae0d73's dist, served by scripts/gate/server.mjs with its fixture proxy (SCOUTNGO_PROXY), a saved spot at the Virginia Beach Fishing Pier.
- Wind and clouds could not be measured in the same run: their bars drew nothing in 20 s, since the gate fixtures carry no wind or cloud hours for the page's own clock (the script does not set one).
- The same 30 frames a second throttled 4x and not throttled, with the same longest gap, points at this headless Chromium's own frame clock, not the app; 60 is not shown here.
- The requests during the drag were Open-Meteo's at the spot (cloud_cover_low by model, and the wind by height), asked again at each hour crossed: "no refetch while scrubbing" is not met for those two.
