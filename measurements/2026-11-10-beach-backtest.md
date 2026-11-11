# The right beach, 30 days back: S-Turns and Mirlo against 44095

Run 2026-11-11T00:38:08.807Z · `node scripts/measure-beach-backtest.mjs --days 30` · NDBC realtime2 44095 and 44099, the last 30 days; Open-Meteo Marine (past_days 30); OpenFreeMap tiles for the facing at the 10 Nov pin (35.5935, -75.4679).

- the facing the app read at the 10 Nov pin: 307° (the sound side)

## Before and after, the buoy through the transform

| spot | facing before | facing after | buoy hours | ≥ 2 ft | of those, under 1 ft at the beach: before | after | mean face before | after |
|---|---|---|---|---|---|---|---|---|
| S-Turns | 307° | 82° | 1428 | 1365 | 1203 (88%) | 37 (3%) | 0.5 ft | 6.1 ft |
| Mirlo Beach | 307° | 74° | 1428 | 1365 | 1203 (88%) | 33 (2%) | 0.5 ft | 6.2 ft |

## The forecast against the buoy, by region

The model's face (Open-Meteo Marine's swell at the spot) against the buoy's face at the same hour, both through the same transform and facing. Positive: the forecast high.

| region | spot | buoy | pairs | forecast mean | buoy mean | bias | ratio forecast / buoy |
|---|---|---|---|---|---|---|---|
| OBX | S-Turns | 44095 | 1428 | 2.31 ft | 6.15 ft | -3.84 ft | 0.38 |
| OBX | Mirlo Beach | 44095 | 1428 | 2.30 ft | 6.20 ft | -3.89 ft | 0.37 |
| Virginia Beach | VB Pier | 44099 | 1430 | 2.46 ft | 4.25 ft | -1.79 ft | 0.58 |
