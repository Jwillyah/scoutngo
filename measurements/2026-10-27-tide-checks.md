# The tide sheet's numbers, each worked out two ways

Run: 2026-10-27T15:38:37.005Z · node scripts/measure-tide-checks.mjs · Virginia Beach Fishing Pier 36.8435575, -75.9713104 · venue clock America/New_York · NOAA CO-OPS predictions (MLLW, feet) · OpenFreeMap ocean polygons, zoom 12

Station: Virginia Beach (8639168), 0.04 km from the pier.

## High and low times: the app against NOAA local time

| date | turn | app (GMT parsed, venue clock) | NOAA (lst_ldt) | apart (min) |
|---|---|---|---|---|
| 2026-10-27 | low -0.02 ft | 02:26 | 02:26 (L -0.02 ft) | 0 |
| 2026-10-27 | high 5.05 ft | 08:51 | 08:51 (H 5.05 ft) | 0 |
| 2026-10-27 | low 0.11 ft | 15:19 | 15:19 (L 0.11 ft) | 0 |
| 2026-10-27 | high 3.81 ft | 21:13 | 21:13 (H 3.81 ft) | 0 |
| 2026-11-03 | high 3.60 ft | 02:35 | 02:35 (H 3.60 ft) | 0 |
| 2026-11-03 | low 0.73 ft | 08:38 | 08:38 (L 0.73 ft) | 0 |
| 2026-11-03 | high 3.84 ft | 14:55 | 14:55 (H 3.84 ft) | 0 |
| 2026-11-03 | low 0.47 ft | 21:17 | 21:17 (L 0.47 ft) | 0 |
| 2026-11-15 | low 1.05 ft | 04:53 | 04:53 (L 1.05 ft) | 0 |
| 2026-11-15 | high 3.64 ft | 11:15 | 11:15 (H 3.64 ft) | 0 |
| 2026-11-15 | low 0.87 ft | 17:52 | 17:52 (L 0.87 ft) | 0 |
| 2026-11-15 | high 2.86 ft | 23:45 | 23:45 (H 2.86 ft) | 0 |

Largest difference: 0 min (limit 1).

## How fast the water moves, 27 Oct (venue clock), ft/h, at station 8638863

The pier's station publishes no six-minute curve (the app uses its turns alone), so the two methods are compared at 8638863, the nearest reference station.

| time | curve slope | half cosine | apart |
|---|---|---|---|
| 00:00 | -0.76 | -0.77 | 0.01 |
| 01:00 | -0.75 | -0.68 | 0.07 |
| 02:00 | -0.45 | -0.40 | 0.06 |
| 03:00 | -0.01 | -0.01 | 0.00 |
| 04:00 | 0.42 | 0.41 | 0.01 |
| 05:00 | 0.73 | 0.73 | 0.00 |
| 06:00 | 0.87 | 0.88 | 0.01 |
| 07:00 | 0.83 | 0.83 | 0.01 |
| 08:00 | 0.60 | 0.59 | 0.01 |
| 09:00 | 0.22 | 0.22 | 0.00 |
| 10:00 | -0.19 | -0.21 | 0.02 |
| 11:00 | -0.53 | -0.58 | 0.05 |
| 12:00 | -0.78 | -0.82 | 0.04 |
| 13:00 | -0.90 | -0.86 | 0.04 |
| 14:00 | -0.76 | -0.70 | 0.06 |
| 15:00 | -0.39 | -0.37 | 0.02 |
| 16:00 | 0.05 | 0.04 | 0.01 |
| 17:00 | 0.40 | 0.39 | 0.01 |
| 18:00 | 0.62 | 0.63 | 0.01 |
| 19:00 | 0.70 | 0.71 | 0.02 |
| 20:00 | 0.60 | 0.60 | 0.01 |
| 21:00 | 0.34 | 0.32 | 0.01 |
| 22:00 | -0.04 | -0.04 | 0.01 |
| 23:00 | -0.36 | -0.42 | 0.06 |

Largest difference: 0.07 ft/h (limit 0.35).

## The moon and the size of the tides

| date | phase (suncalc) | phase (synodic) | apart (days) | the line | NOAA range that day (ft) |
|---|---|---|---|---|---|
| 2026-10-21 | 0.343 | 0.348 | 0.14 | Small tides this week (half moon) | 2.86 |
| 2026-10-24 | 0.444 | 0.450 | 0.16 | Big tides this week (full moon) | 3.97 |
| 2026-10-27 | 0.558 | 0.551 | 0.19 | Big tides this week (full moon) | 5.07 |
| 2026-10-30 | 0.670 | 0.653 | 0.50 | Small tides this week (half moon) | 4.43 |
| 2026-11-02 | 0.779 | 0.755 | 0.71 | Small tides this week (half moon) | 3.43 |
| 2026-11-05 | 0.881 | 0.856 | 0.75 | (nothing said) | 3.77 |
| 2026-11-08 | 0.976 | 0.958 | 0.54 | Big tides this week (new moon) | 4.21 |
| 2026-11-11 | 0.075 | 0.059 | 0.47 | Big tides this week (new moon) | 3.75 |
| 2026-11-14 | 0.165 | 0.161 | 0.11 | Small tides this week (half moon) | 2.94 |
| 2026-11-17 | 0.256 | 0.262 | 0.20 | Small tides this week (half moon) | 2.61 |

Largest phase difference: 0.75 days (limit 1.03). Mean NOAA range on "big tides" days 4.25 ft, on "small tides" days 3.25 ft.

## Which way the beach faces

| place | by the circle | by the nearest sea | apart | hand figure |
|---|---|---|---|---|
| Virginia Beach Fishing Pier | 78° | 78° | 0° | about 90° (east) |
| Brew River Dock Bar, Salisbury | none | none | — | none (inland) |

Pass.
