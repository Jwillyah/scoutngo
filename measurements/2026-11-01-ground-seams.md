# Seams in the 3D ground, before and after Batch D

Run: 2026-11-01 · node scripts/audit-ground-seams.mjs · WebKit 390 x 844 ·
the Virginia Beach Fishing Pier, looking 30° down toward 300°, every imagery
tile answered with one smooth colour field (a function of latitude and
longitude only), flat elevation, no buildings or water. A straight line of
hard edges at least a quarter of the frame long, in the 3D canvas's own
frame below the horizon, is a seam.

Before: the Cesium clay model at 94b26c2, served from its own build, the
same audit (SCOUTNGO_APP pointed at it). After: the three.js scene.

| height | before: seam lines | before: hard-edge pixels | after: seam lines | after: hard-edge pixels |
|---|---|---|---|---|
| 150 ft | 0 | 0 | 0 | 0 |
| 400 ft | 6 | 762 | 0 | 0 |
| 800 ft | 6 | 1432 | 0 | 0 |

At 150 ft the old view's whole frame was inside one zoom; from 400 ft its
levels met in view as stripes (before-800ft.png). The new near ground is one
atlas texture on one mesh, so there is no tile edge inside it to show.
