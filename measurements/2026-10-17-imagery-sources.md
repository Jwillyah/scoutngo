# High-zoom imagery over rural CONUS: USGS vs Esri

**Date:** 2026-10-17
**Question:** Esri World Imagery is mush at venue zoom over rural areas. Is
there a keyless public-domain source that beats it at z17–19?
**Outcome:** No. Nothing wired. Esri stays at `maxzoom: 19`.

> There is no `measurements/` convention in this repo yet and no measurement
> audit script. This file follows the shape of the inline A/B record in
> `src/core/capture.ts`: the question, the method, the raw numbers, and the
> decision that follows from them.

## Why a declaration could not settle it

Both services declare LODs they do not serve.

| service | declares | actually serves (rural) |
|---|---|---|
| Esri World Imagery | maxLOD 23 | real tiles to z19, placeholder at z20 |
| USGS ImageryOnly | lods 0–23, `maxScale 9027.977411` (= level 16) | 404 from z17 |

Esri's declaration is wrong by four levels. USGS's `maxScale` turns out to be
honest, but that could not be known in advance, which is why both were measured
rather than read.

## Method

One tile per site per zoom, fetched directly, compared on **byte length and
md5**. A service that has run out of imagery does one of two things: it 404s,
or it returns a single shared placeholder. The placeholder is only detectable
by comparing two *different* rural locations: identical bytes at two places
hundreds of miles apart cannot both be photographs.

Sites: Big Meadow Shenandoah (38.5195, −78.4440), rural Nevada (39.5, −117.0),
Manhattan (40.7580, −73.9855). Manhattan is the control: a city keeps real
imagery higher than countryside does, so it separates "the service stopped"
from "this place stopped".

Tile axis order is `/{z}/{y}/{x}` for both services, which is Esri's
convention and not the usual XYZ.

## Esri World Imagery

| z | Big Meadow | rural Nevada | Manhattan |
|---|---|---|---|
| 14 | 14061 B `a8a2a192836f` | 14036 B `ee4284c0d995` | 26105 B `7b3aea81c1be` |
| 15 | 16637 B `42d1dc5534df` | 9729 B `96872ce273fe` | 25183 B `630d29df0166` |
| 16 | 17864 B `c718b0dbf497` | 13292 B `424747f7c32c` | 25718 B `ff0e8c6025ef` |
| 17 | 17184 B `16cd0d46b20c` | 18340 B `5677f3d4b78e` | 19803 B `841db1ab360e` |
| 18 | 18208 B `529fe99dcc40` | 21811 B `32556da2698e` | 19129 B `fb417d8c34dc` |
| 19 | 18853 B `c58e69be466b` | 18634 B `7ab541487eb4` | 14971 B `7973b32ee6d7` |
| 20 | **2521 B `f27d9de7f80c`** | **2521 B `f27d9de7f80c`** | 13129 B `4024fe954eeb` |

**z20 is the hard stop rurally.** Big Meadow and rural Nevada return
byte-identical tiles — one shared "no data" placeholder. Manhattan still
returns real imagery at z20, so the cutoff is per-location, not per-service.

**z17–19 rurally are real, distinct tiles.** This corrects the premise behind
the request: Esri does not "run out" at z17. It serves distinct imagery at
17, 18 and 19. What degrades is the *source photography* being resampled —
which is what "mush" looks like — not the tile service running dry. That
distinction matters, because a different tile service cannot fix resampled
source imagery.

## USGS The National Map, ImageryOnly

| z | Big Meadow | rural Nevada | Manhattan |
|---|---|---|---|
| 14 | 20453 B `f7203bfdd44e` | 24184 B `eabfe5a5d2f6` | 33853 B `14f7f0cbe17a` |
| 15 | 26174 B `faa3c38291e1` | 18016 B `904d8313ecd0` | 31422 B `2a0ea1fe7ad3` |
| 16 | 28604 B `c69eb75fbd4e` | 21345 B `e2295039622c` | 24213 B `1ef4ff9a838e` |
| 17 | HTTP 404 | HTTP 404 | HTTP 404 |
| 18 | HTTP 404 | HTTP 404 | HTTP 404 |
| 19 | HTTP 404 | HTTP 404 | HTTP 404 |
| 20 | HTTP 404 | HTTP 404 | HTTP 404 |

Serves 14–16 and nothing above, at every site including the city control. The
`maxScale` declaration was accurate.

The tile given in the request, `/17/50312/36979`, returns 404 — as does the
tile my own arithmetic puts Big Meadow in at z17, `/17/50317/36975`. Both 404
because **the service serves no z17 anywhere**, not because either tile
reference was wrong.

## Decision

**Nothing wired. Esri stays at `maxzoom: 19`.**

Venue zoom is 17–19. USGS serves nothing there. Adding it as a "high-zoom
source" would hand off at z17 to a source that 404s, which is worse than
over-zooming a real z19 tile.

USGS tiles ARE larger at z14–16 (20–28 KB against Esri's 10–18 KB), which may
mean more detail at regional zoom. That is below the zoom anyone plans at, byte
size is a proxy for compression rather than resolution, and switching basemaps
by zoom costs a second source, a second attribution and a visible seam. Not
worth it for a band nobody is complaining about.

**NAIP direct** (`gis.apfo.usda.gov`) resets the TLS handshake from both the
sandbox and the requester's laptop. Server-side; not retried.

## What was implemented instead

The part that needed no new source: the layers list states the imagery source,
its native zoom, and whether the current view is past it.
