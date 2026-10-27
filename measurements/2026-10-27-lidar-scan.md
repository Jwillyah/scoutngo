# A venue's 3D scan, end to end

Run: 2026-10-27T16:38:04.219Z · node scripts/measure-lidar-scan.mjs · USGS 3DEP via https://s3-us-west-2.amazonaws.com/usgs-lidar-public · footprints from OpenFreeMap · density asked for 2 per m²

## Virginia Beach Fishing Pier

Project USGS_LPC_VA_Norfolk_2013_LAS_2015 (scanned 2013). Patch -16518/8627, 1229 m square on the ground.
Offer, worked out with no network: about 32.2 MB at 2.00 points per m². Downloaded: 101 tiles to depth 9, 41.1 MB, 3444775 points in the patch (2.28 per m² by the index), in 57 s on this Mac.
Rasters 1230 x 1230 at 1 m: ground 161740 cells, building 0, vegetation 0, water 140454, nothing measured 265623.

Footprints from the map tiles: 214. Measured by the scan: 190. Newer than the scan (no building points): 7.
Heights two ways (95th percentile of roof points, and of surface cells, minus the ground): 182 of 190 within 1.5 m (96%, limit 80%); largest difference 10.5 m.

| building | map height (m, OSM via the tiles) | scan, by points (m) | scan, by surface (m) |
|---|---|---|---|
| t14/4734/6385/3/89 | 7 | 4.7 | 4.7 |
| t14/4734/6385/4/93 | 8 | 5.0 | 5.0 |
| t14/4734/6385/4/97 | 8 | 3.0 | 5.9 |
| t14/4734/6385/4/98 | 8 | 3.0 | 3.1 |
| t14/4734/6385/4/99 | 8 | 4.3 | 3.9 |
| t14/4734/6385/5/95 | 9 | 6.2 | 6.3 |
| t14/4734/6385/5/96 | 9 | 9.3 | 9.4 |
| t14/4734/6385/5/97 | 9 | 7.3 | 7.4 |
| t14/4734/6385/5/98 | 9 | 4.8 | 5.0 |
| t14/4734/6385/6/48 | 10 | 5.4 | 5.5 |
| t14/4734/6385/6/49 | 10 | 5.6 | 5.7 |
| t14/4734/6385/7/25 | 11 | 7.6 | 7.6 |

## Brew River Dock Bar

Project MD_Southeast_1_2019 (scanned 2019). Patch -16439/9044, 1204 m square on the ground.
Offer, worked out with no network: about 30.9 MB at 2.00 points per m². Downloaded: 105 tiles to depth 9, 30.4 MB, 3072321 points in the patch (2.16 per m² by the index), in 34 s on this Mac.
Rasters 1205 x 1205 at 1 m: ground 545266 cells, building 0, vegetation 0, water 62743, nothing measured 340116.

Footprints from the map tiles: 960. Measured by the scan: 890. Newer than the scan (no building points): 28.
Heights two ways (95th percentile of roof points, and of surface cells, minus the ground): 804 of 890 within 1.5 m (90%, limit 80%); largest difference 12.9 m.

| building | map height (m, OSM via the tiles) | scan, by points (m) | scan, by surface (m) |
|---|---|---|---|
| t14/4751/6298/3/0 | 8 | 6.7 | 6.7 |
| t14/4751/6298/4/0 | 11 | 11.4 | 11.5 |
| t14/4751/6298/4/1 | 11 | 17.0 | 17.2 |
| t14/4751/6298/4/2 | 11 | 13.0 | 12.9 |
| t14/4751/6298/6/0 | 15 | 15.2 | 17.4 |
| t14/4751/6298/6/1 | 15 | 11.4 | 11.9 |
| t14/4751/6298/7/0 | 22 | 19.4 | 19.4 |
| t14/4751/6298/8/0 | 26 | 27.6 | 27.8 |

Pass.
