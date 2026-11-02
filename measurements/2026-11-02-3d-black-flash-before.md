# The 3D view's black flash, shown

Run 2026-11-02T22:41:03.136Z · node scripts/measure-3d-black-flash.mjs before · WebKit iPhone 13 390 x 844 · VB pier 3D view still · the gate's fixtures.

| Moment | Mean luminance of the canvas (0-255) |
|---|---|
| Up and still, pixel ratio 2 | 118.4 |
| 300 ms after the pixel ratio dropped by 0.1, no frame asked for (what the old code did after a slow frame) | 118.5 |
| After the next frame is asked for | 118.5 |

Pixel ratio changes at rest over 20 s (before): 0 (from 2.0 to 2.0; the device's own ratio is 3, capped at 2).
