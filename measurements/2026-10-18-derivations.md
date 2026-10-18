# Three re-derived claims

**Date:** 2026-10-18  
**Question:** Three numeric claims in comments had no artefact. What do
they come out as, recomputed from the shipped modules?  
**Outcome:** All three reproduce. Numbers below.

## 1 · GOES legibility at Virginia Beach

How many SCREEN pixels one satellite pixel covers, which is what decides
whether the cloud layer carries detail or is a flat wash. Computed from
the band's ground sample distance and the map's metres-per-pixel, not from
a zoom somebody picked by eye.

Site 36.85 N, screen width 390 px.

Band ground sample distance, from the shipped table: Visible 1000 m, Infrared 2000 m.

| zoom | infrared pixel covers | visible pixel covers | layer readable |
|---:|---:|---:|---|
| 7 | 2 px | 1 px | yes |
| 9 | 8 px | 4 px | yes |
| 11 | 33 px | 16 px | yes |
| 13 | 131 px | 65 px | no — one infrared pixel covers 34% of the screen. Zoom out to see cloud. |
| 16 | 1046 px | 523 px | no — one infrared pixel covers 3 screens. Zoom out to see cloud. |

One satellite pixel covering a third of the screen is the reported symptom:
the layer looked broken at venue zoom. The layer was fine; the zoom was.

## 2 · The sunrise window at Lesner Bridge

The window that prompted the band work: every altitude in it was being
reported as "nothing to light a position with".

Lesner Bridge, 36.9089 N -76.0872 E, 20 October 2026.
Sunrise, from suncalc: **07:16:40 local**.

| minutes before sunrise | sun altitude | band |
|---:|---:|---|
| 60 | -12.21° | night |
| 50 | -10.21° | nautical |
| 40 | -8.23° | nautical |
| 30 | -6.25° | nautical |
| 20 | -4.27° | blue-hour |
| 10 | -2.31° | afterglow |
| 0 | -0.35° | horizon |

## 3 · Meridian convergence over 400 m

The forward and reverse azimuths between two points are not exactly 180
apart on a sphere. The claim was 6e-5 degrees over 400 m at this latitude,
and it is the reason the card carries both bearings rather than deriving
one from the other.

| from | to | forward | reverse | 180 − |difference| |
|---|---|---:|---:|---:|
| base | 400 m north | 0.000000° | 180.000000° | 0.0e+0° |
| base | 400 m east | 89.998649° | 270.001351° | 2.7e-3° |
| base | 400 m north-east | 45.663302° | 225.665224° | 1.9e-3° |

Largest departure from exactly 180: **2.7e-3 degrees**.

### Checked by hand, because the comment it replaces was wrong by 45x

The textbook convergence is the longitude difference times sin(latitude).

```
dLon for 400 m east at 36.9089 N = 400 / (111320 * cos(lat)) = 0.004494 deg
sin(lat)                             = 0.6005
convergence = dLon * sin(lat)        = 2.70e-3 deg
```

The comment in `src/core/shotType.ts` said 6e-5 degrees. It is 2.7e-3.

Tiny, and that is the point: it is small enough to be invisible and real
enough that deriving one bearing from the other would put an approximation
on the card and in the Street View link where an exact number was already
available.

Reproduce with `node --experimental-strip-types scripts/measure-derivations.mjs`.
