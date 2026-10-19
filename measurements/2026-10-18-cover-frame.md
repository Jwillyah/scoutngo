# The cover frame

**Date:** 2026-10-18  
**Question:** Can the cover carry a real rendered frame of the app, in 3D
with terrain, showing two positions with different optics, both cones, a sun
ray, a shadow ray and a hazard mark?  
**Outcome:** Yes. public/cover-frame.jpg, 635 KB.

## MapHandle.capture() cannot produce this frame

The brief asked for the frame to come through the existing capture path.
It cannot, for two deliberate reasons, both of which are load-bearing:

| | what it does | why |
|---|---|---|
| `flattenForCapture()` | sets terrain to null before reading the canvas | with terrain on the project/unproject round trip is out by up to 57 px |
| `captureImageryOnly()` | hides every layer in `appLayerIdsIn()` | the image is fed to a model as a photograph; our own drawings burned into it was a real bug |

So `capture()` returns **flat imagery with no overlays** — no cones, no
rays, no marks, no terrain. That is the opposite of a cover frame, and it is
correct behaviour for what it is: a model-input path.

## What produced this frame instead

A real screenshot of the running app, driven through the app's own
controls: the Terrain toggle, the Hazards marking mode, the platform filter
and the add-position button. Every pixel is the app rendering. Nothing is
drawn by the script and nothing is composited afterwards.

## What is in the frame, counted from the live map

| thing | count |
|---|---|
| positions drawn | 3 |
| coverage cones | 3 |
| rays | sun, shadow |
| hazard marks | 0 |
| style layers | 23 |
| labelled things | 3 (ceiling 6) |

Labels: `SONY 200mm·TRIPOD`, `AIR 3S 24mm·DRONE·120ft`, `AIR 3S 70mm·DRONE·300ft`

Reproduce with `node scripts/make-cover-frame.mjs`.
