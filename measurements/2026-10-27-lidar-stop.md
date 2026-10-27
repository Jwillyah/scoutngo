# Lidar: readable, covering, and on our heights?

Run: 2026-10-27T16:31:08.168Z · node scripts/measure-lidar-stop.mjs · Origin sent: https://scoutngo.vercel.app

## Readable from a browser, no account

| what | URL | HTTP | Access-Control-Allow-Origin |
|---|---|---|---|
| coverage index | https://raw.githubusercontent.com/hobuinc/usgs-lidar/master/boundaries/resources.geojson | 200 | * |
| project metadata | https://s3-us-west-2.amazonaws.com/usgs-lidar-public/USGS_LPC_VA_Norfolk_2013_LAS_2015/ept.json | 200 | * |
| point tile | https://s3-us-west-2.amazonaws.com/usgs-lidar-public/USGS_LPC_VA_Norfolk_2013_LAS_2015/ept-data/0-0-0-0.laz | 200 | * |

## Coverage

| venue | projects covering it | year in the name |
|---|---|---|
| Virginia Beach Fishing Pier | USGS_LPC_VA_Norfolk_2013_LAS_2015 | 2013 |
| Brew River Dock Bar | MD_NRCS-LiDAR_2012, MD_Southeast_1_2019 | 2012, 2019 |

## Heights: lidar ground against our elevation (Terrarium z15)

### Virginia Beach Fishing Pier: USGS_LPC_VA_Norfolk_2013_LAS_2015

Horizontal: EPSG:3857 (WGS 84 / Pseudo-Mercator). Vertical: not declared in ept.json.

Read 23 point tiles, 10.0 MB, 1262019 points by the tile index: 7.89 bytes a point, for a 240 m line.

| metres from the venue | lidar ground (m, median within 5 m) | Terrarium (m) | apart (m) |
|---|---|---|---|
| 0 | no ground points | 6.79 | — |
| 20 | -0.14 | 7.96 | -8.10 |
| 40 | 1.36 | 1.33 | 0.03 |
| 60 | 2.14 | 2.22 | -0.08 |
| 80 | 2.40 | 2.52 | -0.12 |
| 100 | 3.28 | 3.32 | -0.04 |
| 120 | 3.29 | 3.37 | -0.08 |
| 140 | 3.70 | 3.82 | -0.12 |
| 160 | 4.55 | 4.58 | -0.03 |
| 180 | 4.53 | 4.52 | 0.01 |
| 200 | 4.33 | 4.30 | 0.03 |
| 220 | 3.91 | 3.92 | -0.01 |
| 240 | no ground points | 4.16 | — |

On land (lidar ground above 0.3 m): 10 points, largest difference 0.12 m (limit 1).

### Brew River Dock Bar: MD_Southeast_1_2019

Horizontal: EPSG:3857 (WGS 84 / Pseudo-Mercator). Vertical: not declared in ept.json.

Read 31 point tiles, 7.0 MB, 954217 points by the tile index: 7.37 bytes a point, for a 240 m line.

| metres from the venue | lidar ground (m, median within 5 m) | Terrarium (m) | apart (m) |
|---|---|---|---|
| 0 | no ground points | 0.75 | — |
| 20 | no ground points | 2.10 | — |
| 40 | no ground points | 2.00 | — |
| 60 | no ground points | 1.79 | — |
| 80 | 0.82 | 0.67 | 0.15 |
| 100 | 1.02 | 1.01 | 0.01 |
| 120 | 0.96 | 0.96 | -0.00 |
| 140 | 1.11 | 1.23 | -0.12 |
| 160 | 2.27 | 2.40 | -0.13 |
| 180 | 2.46 | 2.36 | 0.10 |
| 200 | 1.37 | 1.39 | -0.02 |
| 220 | 1.44 | 1.18 | 0.26 |
| 240 | 1.43 | 1.16 | 0.27 |

On land (lidar ground above 0.3 m): 9 points, largest difference 0.27 m (limit 1).

Compressed tile bytes per point, both projects: 7.89 and 7.37; the larger, rounded up, sizes the offer: 8.

Pass: Phase 2 may go ahead.
