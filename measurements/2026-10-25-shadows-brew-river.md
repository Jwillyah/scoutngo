# Shadows at Brew River Dock Bar, Salisbury MD, solar noon

**Date:** 2026-10-25
**Script:** `scripts/measure-shadows.mjs`
**Overpass endpoint:** https://overpass-api.de/api/interpreter
**Venue:** 38.364236, -75.605912
**Shoot date:** 2026-10-26, solar noon 2026-10-26T16:46:22.812Z
**Sun:** azimuth 180.0 degrees, altitude 39.0 degrees
**Buildings in a 400 m box:** 321, of which 4 have a height or levels tag and cast a shadow; 317 have none and cast nothing
**Water polygons:** 0 from water ways, 3 stitched from river relations
**Longest shadow:** 14.8 m
**South bank points:** walked south from the venue at each east-west offset until past OSM water, then 15 m inland

## The south bank is in sun at solar noon: 9 of 9 bank points are outside every mapped shadow.

| offset east (m) | bank point | result |
|---|---|---|
| -90 | 38.362977, -75.606944 | in sun (no mapped building with a known height shades it) |
| -70 | 38.363067, -75.606715 | in sun (no mapped building with a known height shades it) |
| -50 | 38.363157, -75.606485 | in sun (no mapped building with a known height shades it) |
| -30 | 38.363247, -75.606256 | in sun (no mapped building with a known height shades it) |
| -10 | 38.363472, -75.606027 | in sun (no mapped building with a known height shades it) |
| 10 | 38.363606, -75.605797 | in sun (no mapped building with a known height shades it) |
| 30 | 38.363786, -75.605568 | in sun (no mapped building with a known height shades it) |
| 50 | 38.363876, -75.605339 | in sun (no mapped building with a known height shades it) |
| 70 | 38.364011, -75.605109 | in sun (no mapped building with a known height shades it) |
| 90 | none | no water crossed within 400 m south, so no south bank here |

In sun here means outside every shadow of a MAPPED building with a known height. Trees, awnings and buildings OSM gives no height for are not in this check.
