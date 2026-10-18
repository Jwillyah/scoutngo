# The Orionid window at Little Devils Stairs Overlook, 2026-10-21

**Date:** 2026-10-18  
**Question:** What is the shootable window for the Orionid maximum at this
overlook, and does the real skyline change it?  
**Outcome:** 03:31 – 06:00, 149 minutes, over the terrain horizon.

## The venue, resolved rather than assumed

The brief gave "about 38.74, -78.30". Nominatim, which is the geocoder the
app itself uses, resolves `Little Devils Stairs Overlook` to a viewpoint node
at **38.7567229, -78.2675403** — 3.37 km north-east of the figure in the
brief. Every number below uses the resolved coordinate.

Observer elevation from the app's own DEM: **941.3 m**.
(USGS EPQS reports 951.1 m at the same point, for comparison. The DEM the app
draws with is Terrarium, which is a different raster at a different
resolution; the two are not expected to agree exactly and the app uses its
own, because that is what produced the horizon below.)

## The shower, from the table

Orionids (008ORI), IMO 2025 calendar: maximum **October 21**, radiant
**α 95°, δ +16°**, ZHR 20 under a perfect sky.

## Method

The horizon came from the running app: the camera was moved to the overlook,
terrain switched on, and the script waited for `queryTerrainElevation` to
answer before reading `MapHandle.horizonAt`, which samples 24 bearings by 12
distances out to 40 km. The window was then computed by the shipped
`src/core/skyWindow.ts`, imported directly. Nothing here reimplements either.

Terrain horizon in the eastern quadrant, where the radiant rises: 45° -0.93°, 60° -1.13°, 75° -1.07°, 90° -1.07°, 105° -1.15°, 120° -1.19°, 135° -1.18°.

## The answer

| | flat horizon | terrain horizon |
|---|---|---|
| radiant clears the horizon | 22:38 | 22:32 |
| moon below the horizon | 03:31 – 06:00 | 03:31 – 06:00 |
| astronomical dark | 19:55 – 06:00 | 19:55 – 06:00 |
| **window** | **03:31 – 06:00** | **03:31 – 06:00** |
| length | 149 min | 149 min |
| opens because | moon | moon |
| closes because | dark | dark |
| radiant altitude mid-window | 65° | 65° |
| horizonSource | flat | terrain |

## What binds it

The 2026 Orionid maximum runs into a waxing gibbous moon. The radiant is up
from mid-evening and the sky is astronomically dark from just before 20:00,
but the moon is above the horizon for most of the night, so the window does
not open until moonset and is closed by the brightening sky. The binding
constraint is the moon at the start and the dark at the end, and the app
prints exactly that rather than only the times.

## What the terrain actually changed here, which is not what was expected

The radiant clears the horizon **6 minutes EARLIER**
over the real skyline than over a flat one. Earlier, not later, and that is
the right answer rather than a sign error: this is an **overlook**. The
terrain horizon to the east averages **-1.10°**, which is BELOW
horizontal, because the shooter is standing on a ridge and the land falls
away. src/core/horizon.ts keeps negative horizon angles for exactly this
case, and this is the case.
**The window itself is unchanged.** The radiant is not what binds this
night here — the moon is — so moving the radiant rise by a few minutes
moves nothing the shooter cares about. That is worth stating plainly:
on this night, at this venue, the terrain horizon changes a reported
constraint time and does not change the answer.

## What this does not say

Nothing here says the night will be clear. Cloud is a separate line in the
app, shown only where the forecast reaches, and it says so where it does not.

Reproduce with `node --experimental-strip-types scripts/measure-orionids.mjs`.
