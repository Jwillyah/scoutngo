# The right beach, 30 days back: S-Turns and Mirlo against 44095

Run 2026-11-11T14:13:58.351Z · `node scripts/measure-beach-backtest.mjs --days 30 --end 2026-11-11` · NDBC realtime2 44095 and 44099, the 30 days to 2026-11-11T00:38:08.000Z; Open-Meteo Marine (past_days 30); OpenFreeMap tiles for the facing at the 10 Nov pin (35.5935, -75.4679).

- the facing the app read at the 10 Nov pin: 307° (the sound side)

## Before and after, the buoy through the transform

| spot | facing before | facing after | buoy hours | ≥ 2 ft | of those, under 1 ft at the beach: before | after | mean face before | after |
|---|---|---|---|---|---|---|---|---|
| S-Turns | 307° | 82° | 1429 | 1366 | 1204 (88%) | 37 (3%) | 0.5 ft | 6.1 ft |
| Mirlo Beach | 307° | 74° | 1429 | 1366 | 1204 (88%) | 33 (2%) | 0.5 ft | 6.2 ft |

## By the buoy's height, at today's factor

The buoy's height over these days: mean 6.4 ft, median 4.9 ft, the highest 16.7 ft. The face is worked from the buoy's whole-sea height once (src/core/surf.ts surfEstimate), never above it times the region's factor, here 1.17 (1 look at the beach, provisional).

| spot | buoy | hours | median face | 10th-90th percentile |
|---|---|---|---|---|
| S-Turns | 2-3 ft | 125 | 3.1 ft | 2.7-3.4 ft |
| S-Turns | 3-4 ft | 301 | 4.2 ft | 3.5-4.6 ft |
| S-Turns | 4-6 ft | 419 | 5.4 ft | 3.9-6.5 ft |
| S-Turns | 6-10 ft | 268 | 9.3 ft | 6.3-11.1 ft |
| S-Turns | 10 ft and up | 253 | 15.3 ft | 12.2-17.2 ft |
| Mirlo Beach | 2-3 ft | 125 | 3.1 ft | 2.7-3.4 ft |
| Mirlo Beach | 3-4 ft | 301 | 4.2 ft | 3.3-4.6 ft |
| Mirlo Beach | 4-6 ft | 419 | 5.4 ft | 4.0-6.5 ft |
| Mirlo Beach | 6-10 ft | 268 | 9.4 ft | 6.4-11.1 ft |
| Mirlo Beach | 10 ft and up | 253 | 15.3 ft | 12.6-17.2 ft |

## The forecast against the buoy, by region

The model's face (Open-Meteo Marine's swell at the spot) against the buoy's face at the same hour, both through the same transform and facing. Positive: the forecast high.

| region | spot | buoy | pairs | forecast mean | buoy mean | bias | ratio forecast / buoy |
|---|---|---|---|---|---|---|---|
| OBX | S-Turns | 44095 | 1429 | 2.31 ft | 6.15 ft | -3.84 ft | 0.38 |
| OBX | Mirlo Beach | 44095 | 1429 | 2.30 ft | 6.19 ft | -3.89 ft | 0.37 |
| Virginia Beach | VB Pier | 44099 | 1431 | 2.46 ft | 4.25 ft | -1.79 ft | 0.58 |
