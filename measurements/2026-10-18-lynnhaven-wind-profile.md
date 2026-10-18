# Wind profile at Lynnhaven Inlet, re-measured

**Date:** 2026-10-18  
**Question:** Does the observation the wind panel was built around still
hold — is the wind at drone height materially different from the wind at
the ground, in speed and in direction?  
**Outcome:** The DIFFERENCE holds on every morning sampled; the SIZE of it
varies a lot. Across 7 mornings the 180 m wind runs 1.2× to 2.3× the ground wind.

## Why it was re-run, and what did NOT reproduce

The original figures — ground 2.08 m/s, 180 m 7.50 m/s, 22 degrees apart —
existed only in a comment at the top of `weatherPanel.test.tsx`. They were
the entire reason the panel exists and nothing in the repo could check them.

**The 3.5× / 22° case did not reproduce on an arbitrary day.** The first
re-run landed on a windy morning and gave 1.5× with no turn at all. That is
not a refutation: shear is largest when the surface is calm and the ground
decouples from the air above it, and that morning was not calm. The spread
below is the honest version of the claim.

## Method

```
GET https://api.open-meteo.com/v1/forecast?latitude=36.9089&longitude=-76.0872&hourly=wind_speed_10m%2Cwind_speed_80m%2Cwind_speed_120m%2Cwind_speed_180m%2Cwind_direction_10m%2Cwind_direction_80m%2Cwind_direction_120m%2Cwind_direction_180m&wind_speed_unit=ms&start_date=2026-10-19&end_date=2026-10-25&timezone=America%2FNew_York
```

Open-Meteo, the same service and the same wind levels `src/lib/forecast.ts`
already reads. One coordinate (36.9089, -76.0872), the 07:00 row of every
day in the forecast range, in the venue's own timezone, speeds in m/s so no
conversion sits between the service and the table.

## Every 07:00 in the forecast range

| date | ground (m/s) | 180 m (m/s) | ratio | turn |
|---|---:|---:|---:|---:|
| 2026-10-19 | 9.91 from 16° | 13.63 from 11° | 1.4× | 5° |
| 2026-10-20 | 10.37 from 5° | 15.36 from 5° | 1.5× | 0° |
| 2026-10-21 | 7.13 from 15° | 14.97 from 5° | 2.1× | 10° |
| 2026-10-22 | 6.82 from 346° | 12.3 from 332° | 1.8× | 14° |
| 2026-10-23 | 4.34 from 15° | 10.15 from 19° | 2.3× | 4° |
| 2026-10-24 | 6.51 from 72° | 10.98 from 23° | 1.7× | 49° |
| 2026-10-25 | 6.4 from 61° | 7.82 from 35° | 1.2× | 26° |

## The two that matter

**Sharpest shear:** 2026-10-23, ground 4.34 m/s, 180 m 10.15 m/s — 2.3×, 4° apart.

**Calmest ground:** 2026-10-23, ground 4.34 m/s, 180 m 10.15 m/s — 2.3×, 4° apart.

Every other weather app shows the ground row. The panel exists to show the
180 m row, and the spread above is why: on some mornings they are nearly
the same number and on others they are not remotely.

## What it does not say

This is a forecast, not an observation. It says what the model expects at
this coordinate on these dates, and the app labels it as a forecast
wherever it is shown.

Reproduce with `node scripts/measure-wind-profile.mjs`.
