# The waterline on the scanned beach

Run: 2026-10-27T19:27:12.519Z · node scripts/measure-waterline.mjs · Virginia Beach Fishing Pier 36.8435575, -75.9713104 · scan USGS_LPC_VA_Norfolk_2013_LAS_2015 · NOAA CO-OPS datums and predictions

## The datums, as the app reads them

| station | MLLW (m) | NAVD88 (m) | NAVD88 - MLLW (m) | the same in feet, from NOAA in feet | agree |
|---|---|---|---|---|---|
| 8639168 | — | — | — | — | both none |
| 8638863 | 7.704 | — | — | — | both none |
| 8651370 | 5.663 | 6.33 | 0.667 | 2.190 ft = 0.668 m | yes |
| 8638610 | 1.336 | 1.827 | 0.491 | 1.610 ft = 0.491 m | yes |

NOAA's station datums page draws its table from this same API, so this checks the reading, not an independent source.

## The offset at the pier

The pier's own station, 8639168 Virginia Beach, publishes no datums. Its mean range over a month of predictions: 0.983 m.
Picked: Rudee Inlet entrance (8639208), 1.3 km away, on open water. NAVD88 above MLLW: 0.757 m as published there; 0.687 m scaled to the pier's range. Uncertainty 0.070 m.

## The band at 2 ft MLLW (-0.147 m NAVD88), 20 transects

Band 6.7 ft wide on the ground (2 x 0.070 m x a run of 14.7 m per metre of rise).

| along the beach (m from the pier) | transect crossing: ground (m) | in the raster band | band cells on the transect |
|---|---|---|---|
| -237.5 | -0.195 | yes | 2 |
| -212.5 | -0.126 | yes | 2 |
| -187.5 | -0.135 | yes | 3 |
| -162.5 | -0.129 | yes | 4 |
| -137.5 | -0.190 | yes | 1 |
| -112.5 | -0.180 | yes | 2 |
| -87.5 | -0.120 | yes | 1 |
| -62.5 | -0.160 | yes | 4 |
| -37.5 | -0.110 | yes | 3 |
| -12.5 | -0.130 | yes | 1 |
| 12.5 | -0.170 | yes | 1 |
| 37.5 | -0.150 | yes | 3 |
| 62.5 | -0.150 | yes | 3 |
| 87.5 | -0.136 | yes | 3 |
| 112.5 | -0.205 | yes | 1 |
| 137.5 | -0.167 | yes | 2 |
| 162.5 | -0.125 | yes | 1 |
| 187.5 | -0.133 | yes | 2 |
| 212.5 | -0.140 | yes | 3 |
| 237.5 | -0.170 | yes | 1 |

20 of 20 crossings inside the band.

## The scan's own water edge against the tide NOAA predicted when it was flown

Flown 2013-03-29T20:38:16.308Z (median GPS time of the nearest tiles, adjusted standard time, less 16 leap seconds). NOAA predicted -0.27 ft MLLW at Virginia Beach: -0.840 m NAVD88 with the offset above.

| along the beach (m) | scan water edge: m east of the pier | measured ground at the edge (m NAVD88) | above the predicted still water (m) | our waterline at that tide |
|---|---|---|---|---|
| -237.5 | -299.8 | — | — | past the scanned beach |
| -212.5 | 25.2 | -0.67 | 0.17 | past the scanned beach |
| -187.5 | 19.1 | -0.48 | 0.36 | past the scanned beach |
| -162.5 | 15.0 | -0.34 | 0.50 | past the scanned beach |
| -137.5 | 12.6 | -0.49 | 0.35 | past the scanned beach |
| -112.5 | 14.7 | -0.62 | 0.22 | past the scanned beach |
| -87.5 | 1.0 | -0.43 | 0.41 | past the scanned beach |
| -62.5 | -2.9 | -0.37 | 0.47 | past the scanned beach |
| -37.5 | -9.2 | -0.44 | 0.40 | past the scanned beach |
| -12.5 | -13.5 | -0.56 | 0.28 | crosses |
| 12.5 | -20.4 | -0.24 | 0.60 | past the scanned beach |
| 37.5 | -7.5 | — | — | past the scanned beach |
| 62.5 | -13.8 | -0.35 | 0.49 | past the scanned beach |
| 87.5 | -19.8 | -0.62 | 0.22 | past the scanned beach |
| 112.5 | -29.6 | -0.47 | 0.37 | past the scanned beach |
| 137.5 | -42.9 | -0.24 | 0.60 | past the scanned beach |
| 162.5 | -49.5 | -0.35 | 0.49 | past the scanned beach |
| 187.5 | -55.3 | -0.37 | 0.47 | past the scanned beach |
| 212.5 | -62.3 | -0.54 | 0.30 | past the scanned beach |
| 237.5 | -69.4 | -0.58 | 0.26 | past the scanned beach |

On 18 transects the scan's water edge stands on average 0.39 m above the still water NOAA predicted (range 0.17 to 0.60 m): where the last wave ran up, which a tide prediction does not include. At that tide our waterline falls past the scanned beach on 19 of 20 transects: the scan never saw ground that low, so nothing is drawn there.

Pass.
