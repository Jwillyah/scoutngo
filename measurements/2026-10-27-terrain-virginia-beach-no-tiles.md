# Virginia Beach Fishing Pier: 3D ground against 2D, and the shoreline

Run: 2026-10-27T03:13:53.999Z · node scripts/measure-terrain-coast.mjs · pier root 36.8435575, -75.9713104
Coastline: 4 OpenStreetMap ways; 404 shoreline samples within 1 km of the pier, every 5 m.
Raw is the Terrarium tile as AWS serves it at zoom 15, decoded in this script, before the sea is put at sea level. 2D is MapLibre terrain; 3D is the clay model.
Points placed by the OpenStreetMap coastline in scripts/fixtures/virginia-beach-coastline.json (OpenStreetMap via overpass-api.de, fetched 2026-10-26T23:18:20Z (HTTP 200 after 36247 ms)).
Elevation tiles cleaned in this run, by zoom: against the map tiles' ocean none; from their own shape z0 1, z1 1, z2 1, z3 1, z4 1, z5 1, z6 2, z7 2, z8 2, z9 2, z10 3, z11 3, z12 4, z13 7, z14 5, z15 9. Below zoom 12 (the 3D view's distant ground) there are no map tiles to read, and the shape is used by design.
Overpass: BLOCKED in the browser (overpass-api.de, overpass.kumi.systems, overpass.private.coffee); the app asked 3 time(s). Nothing saved on the phone at the start.
Map tiles (tiles.openfreemap.org): BLOCKED too; the app asked 29 time(s). The elevation was cleaned from its own shape (src/core/coastArtefacts.ts).
Cleaned the way this run says: yes.

| point | lat | lon | raw (m) | 2D (m) | 3D (m) | 3D − 2D |
|---|---|---|---|---|---|---|
| beach 250 m S | 36.841323 | -75.971296 | 1.83 | 1.58 | 1.75 | 0.17 |
| beach 200 m S | 36.841763 | -75.971406 | 1.88 | 1.79 | 1.83 | 0.05 |
| beach 150 m S | 36.842160 | -75.971505 | 1.74 | 1.72 | 1.74 | 0.02 |
| beach 100 m S | 36.842601 | -75.971615 | 1.81 | 1.80 | 1.80 | 0.01 |
| beach 50 m S | 36.843051 | -75.971730 | 1.63 | 1.45 | 1.66 | 0.22 |
| beach 50 m N | 36.843888 | -75.971945 | 1.99 | 1.85 | 2.05 | 0.21 |
| beach 100 m N | 36.844328 | -75.972059 | 2.00 | 1.90 | 2.01 | 0.10 |
| beach 150 m N | 36.844772 | -75.972178 | 2.00 | 1.81 | 1.93 | 0.13 |
| beach 200 m N | 36.845167 | -75.972288 | 1.96 | 1.79 | 1.95 | 0.16 |
| beach 250 m N | 36.845606 | -75.972411 | 1.81 | 1.59 | 1.84 | 0.25 |
| pier 0 m | 36.843557 | -75.971310 | 6.83 | 0.00 | 0.00 | 0.00 |
| pier 42 m | 36.843557 | -75.970836 | 13.15 | 0.00 | 0.00 | 0.00 |
| pier 84 m | 36.843557 | -75.970361 | 24.60 | 0.00 | 0.00 | 0.00 |
| pier 126 m | 36.843557 | -75.969887 | 4.23 | 0.00 | 0.00 | 0.00 |
| pier 168 m | 36.843557 | -75.969412 | 3.15 | 0.00 | 0.00 | 0.00 |
| pier 210 m | 36.843557 | -75.968938 | 2.07 | 0.00 | 0.00 | 0.00 |
| pier 252 m | 36.843557 | -75.968464 | 1.17 | 0.00 | 0.00 | 0.00 |
| pier 294 m | 36.843557 | -75.967989 | 0.58 | 0.00 | 0.00 | 0.00 |
| pier 336 m | 36.843557 | -75.967515 | 0.26 | 0.00 | 0.00 | 0.00 |
| pier 378 m | 36.843557 | -75.967040 | 0.11 | 0.00 | 0.00 | 0.00 |

Points within 1 m of 2D: 20 of 20.
Largest step along the shoreline in 3D (on it and 15 m either side, 5 m apart): 1.67 m. The same lines in the raw tiles, with the sea bed at 0: 52.99 m.
Largest step across the shoreline in 3D (41 profiles, 60 m out to 60 m in, 5 m apart): 1.57 m.
Limit: 3 m. Pass.
