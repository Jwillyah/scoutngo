# Capture round-trip drift with terrain on

**Date:** 2026-10-18  
**Question:** How far is `project(unproject(p))` from `p` when terrain is on
and the map has NOT been flattened — the state `flattenForCapture()` exists
to avoid?  
**Outcome:** Up to **381.0 px** at capture resolution. Not zero, and not small.

## Why it was measured

`src/core/captureTerrain.ts` carried the figure "57 pixels" as the
justification for flattening the map before every capture. It was a real
number behind a real decision with no artefact anywhere in the repo, which
is exactly what the measurement audit exists to find.

## Method

A Shenandoah hollow (38.745, -78.290) at zoom 15 with terrain on, which is
where the relief is. A 5x5 grid of screen pixels across the middle 70% of
the canvas, unprojected to a coordinate and projected straight back; the
error is the distance between the pixel that went in and the one that came
out. Four cameras, from flat to 75 degrees of pitch.

**Two arms, and the second one is the point.**

- `settled` — move the camera, let a frame draw, then round-trip.
- `immediate` — move the camera and round-trip with no frame drawn in
  between, which is the sequence `capture()` actually performs.

A first run measured only the settled arm and got 0.0 px everywhere, which
would have read as "the 57 px claim is wrong". It was a measurement of the
wrong thing: the original finding was explicitly that `project` disagrees
when **no frame has been drawn since the camera moved**.

The app is driven through its own controls and the terrain tiles are waited
for, not slept on.

## Raw numbers

| arm | pitch | bearing | worst (px) | mean (px) |
|---|---:|---:|---:|---:|
| settled | 0° | 0° | 0 | 0 |
| immediate | 0° | 0° | 0 | 0 |
| settled | 45° | 40° | 0 | 0 |
| immediate | 45° | 40° | 54.4 | 2.2 |
| settled | 60° | 135° | 0 | 0 |
| immediate | 60° | 135° | 324.5 | 44 |
| settled | 75° | 250° | 0 | 0 |
| immediate | 75° | 250° | 381 | 135 |

## What it means

Settled, the round trip is exact: 0.0 px at every camera. The drift is not a
property of terrain, it is a property of asking `project` about a camera it
has not drawn yet — and it grows sharply with pitch, because a steeper ray
crosses more terrain to reach the ground.

The original comment said 57 px. The moderate-pitch case here is 54.4 px at
45 degrees, so that figure was sound; what it did not say is that the same
sequence reaches 381 px at 75 degrees of pitch, which the app now allows.

That is the whole argument for flattening: the model is handed an image, and
the coordinates it replies with are inverted against the camera that took it.
If the inversion is out by tens of pixels, every generated position lands
somewhere other than where the model put it, and nothing on screen looks
wrong.

The projection audit asserts the flattened path is at **0 px** at the same
cameras, which is the other half of the same claim.

Reproduce with `node scripts/measure-terrain-drift.mjs`.
