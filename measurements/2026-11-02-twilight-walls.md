# The oceanfront at the VB pier, 27 Oct, before and after Batch F Section 2

Screenshots from the app in WebKit, 390 x 844 at 3x, the 3D view posed by window.__clay.droneView: walls from 36.8436, -75.9688, 35 m up, heading 272, tilt -8, 24 mm; the photo pose from DJI_20261027072107_0052_D (36.8330, -75.9741, 58.1 m, heading -4.5, tilt -3.3, 70 mm). Before = 85e198d, after = the Section 2 change. Boxes in CSS px: the hotel walls 20,388,330,404; the sky band just above the horizon 20,330,370,356.

# East-facing hotel walls, sun 3 degrees up (7:40 AM)

Run 2026-11-02T04:16:05.903160Z by scripts/measure-region.py, box 20,388,330,404 (CSS px, read at 3x).

| picture | mean colour | luminance | hue |
|---|---|---|---|
| before | #30313a | 50 | 231 |
| after | #5f514a | 84 | 19 |

# The same walls, sun 1 degree below the horizon (7:21 AM)

Run 2026-11-02T04:16:06.089310Z by scripts/measure-region.py, box 20,388,330,404 (CSS px, read at 3x).

| picture | mean colour | luminance | hue |
|---|---|---|---|
| before | #2f2728 | 41 | 351 |
| after | #422f26 | 51 | 19 |

# The sky band just above the horizon at the photo's pose (7:21 AM, looking north)

Run 2026-11-02T04:16:06.292848Z by scripts/measure-region.py, box 20,330,370,356 (CSS px, read at 3x).

| picture | mean colour | luminance | hue |
|---|---|---|---|
| before | #b2918c | 152 | 8 |
| after | #d1af98 | 181 | 24 |

For comparison, the DJI photo's own sky, sampled from the left half of measurements/2026-11-02-compare/DJI_20261027072107_0052_D-pair.jpg (rows 180 and 250 of 900): #fea99d and #cfa3a7, hue about 0 to 15. The Lightroom edit brightened it, so its luminance is not a target; its hue is.

The sky band's pose shot was taken before the ambient change was strengthened; the sky shader did not change after it.
