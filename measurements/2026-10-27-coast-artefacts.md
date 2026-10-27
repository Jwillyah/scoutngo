# The elevation cleaned with no coastline (src/core/coastArtefacts.ts)

Run: 2026-10-27T00:20:59.770Z · node scripts/measure-coast-artefacts.mjs · raw Terrarium tiles from AWS, cleaned one tile at a time with its neighbours
Pier: 36.8435575, -75.9713104; 404 shoreline samples within 1 km, every 5 m, placed by the OpenStreetMap coastline in scripts/fixtures/virginia-beach-coastline.json.
Limit: no step over 3 m along or across the shoreline, at the margin the app uses (128 px).

## Virginia Beach Fishing Pier

| zoom | margin (px) | raw along (m) | raw across (m) | cleaned along (m) | cleaned across (m) | wall rule (px) | spikes (px) | ms per tile |
|---|---|---|---|---|---|---|---|---|
| 15 | 128 | 32.48 | 32.43 | 2.33 | 2.80 | 199674 | 512 | 215 |
| 15 | 64 | 32.48 | 32.43 | 16.18 | 4.26 | 116984 | 211 | 80 |
| 14 | 128 | 28.23 | 23.66 | 2.13 | 1.82 | 67339 | 818 | 160 |
| 14 | 64 | 28.23 | 23.66 | 2.13 | 1.82 | 26375 | 309 | 40 |
| 13 | 128 | 17.22 | 11.64 | 0.98 | 0.93 | 17608 | 574 | 98 |
| 13 | 64 | 17.22 | 11.64 | 17.22 | 11.64 | 5944 | 223 | 34 |

Raw is the tile as served with only the sea bed drawn at 0. The ms per tile are this laptop, not a phone.

## Real coasts that must come through

The middle tile of 3 x 3 at each place. Changed counts every pixel lowered by any rule; over 10 m counts those that stood over 10 m.

| place | zoom | wall rule (px) | spikes (px) | changed (px) | over 10 m (px) | largest drop (m) |
|---|---|---|---|---|---|---|
| Dover, the chalk cliffs | 15 | 0 | 2 | 2 | 0 | 3.07 |
| Dover, the chalk cliffs | 13 | 0 | 155 | 26 | 1 | 10.13 |
| Big Sur, Bixby Creek | 15 | 0 | 0 | 0 | 0 | 0.00 |
| Big Sur, Bixby Creek | 13 | 0 | 0 | 0 | 0 | 0.00 |
| Point Lobos | 15 | 0 | 0 | 0 | 0 | 0.00 |
| Point Lobos | 13 | 0 | 0 | 0 | 0 | 0.00 |
| Jockey's Ridge | 15 | 999 | 113 | 15 | 0 | 5.36 |
| Jockey's Ridge | 13 | 0 | 96 | 67 | 0 | 8.00 |
| Cape Hatteras | 15 | 0 | 15 | 0 | 0 | 0.00 |
| Cape Hatteras | 13 | 0 | 161 | 125 | 0 | 6.29 |
| Brew River (calibration venue) | 15 | 0 | 0 | 0 | 0 | 0.00 |
| Brew River (calibration venue) | 13 | 0 | 0 | 0 | 0 | 0.00 |

Pass.
