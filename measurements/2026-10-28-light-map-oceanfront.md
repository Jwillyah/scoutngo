# The light map against the sunrise photo

Run: 2026-10-28T14:25:15.661Z · node scripts/measure-light-map-oceanfront.mjs · USGS 3DEP lidar (the app's download, depth 2) · suncalc · photo DJI_20261027073735_0094_D (07:37:35 EDT, from offshore, looking north-northwest)

## Virginia Beach Oceanfront

Scan USGS_LPC_VA_Norfolk_2013_LAS_2015, 1230 x 1230 cells of 1.000 m around 36.838, -75.9737; sea taken out as the app does. 1148 rows meet a hotel more than 15 m tall facing at least 20 m of beach; 83583 beach cells; 6496 ground cells within 40 m behind the hotels.

Sunrise (suncalc): 11:22 UTC.

| time | sun azimuth, altitude | east fronts lit (the app walls) | east fronts lit (skylines) | beach lit (rays) | beach lit (skylines, 200 cells) | ground behind in shade (rays) | behind in shade (skylines, 200 cells) |
|---|---|---|---|---|---|---|---|
| 07:25 EDT | 105.8°, 0.06° | 81.5% of 1044 (104 rows with no wall found) | 81.3% | 55.5% | 61.5% | 99.8% | 100.0% |
| 07:37 EDT (the photo) | 107.7°, 2.27° | 83.8% of 1044 (104 rows with no wall found) | 84.3% | 62.1% | 66.5% | 99.7% | 100.0% |

At 07:25 EDT, the 192 unlit fronts: 72 shaded by a building, 120 by something else the scan measured (trees, posts); the nearest blocker a median 22 m away toward the sun, standing 3 m over the point on the wall.

At 07:37 EDT (the photo), the 163 unlit fronts: 59 shaded by a building, 104 by something else the scan measured (trees, posts); the nearest blocker a median 15 m away toward the sun, standing 6 m over the point on the wall.

What the photo shows at 07:37: the east fronts lit, and the ground at the hotels' feet in shade. The map: 83.8% of fronts lit, 99.7% of the ground behind the hotels in shade, 62.1% of the beach in front of them lit. It matches: fronts lit, behind them shade.

Pass.
