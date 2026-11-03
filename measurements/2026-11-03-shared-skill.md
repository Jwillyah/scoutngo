# Shared model-accuracy file: first run, 2026-11-03

Made by `node scripts/skill/build-shared.ts skill/midatl.json <out>` at 2026-11-03T20:49:46.222Z, on this machine (the nightly Action is not switched on: docs/model-skill.md).
Written by `node scripts/measure-shared-skill.mjs <out> KNTU,KORF`.

- window: 2026-10-04 to 2026-11-02 (30 days, America/New_York)
- stations: 48 (39 ASOS, 9 NDBC buoys)
- rows (station x model x variable x lead x hour cells with at least one hour): 118665
- size: 2659852 bytes of JSON, 517132 gzipped (2026-11-03.json.gz)

Held-out check, temperature 0-24 h ahead: the last 7 days as forecast, and with the bias of the 23 days before taken out. °C.

## KNTU Oceana (718 hours scored)

| model | bias as forecast | bias corrected | MAE as forecast | MAE corrected | hours |
|---|---|---|---|---|---|
| NBM | -0.37 | -0.3 | 1.28 | 1.26 | 169 |
| HRRR | -0.3 | 0 | 0.79 | 0.77 | 169 |
| ECMWF | 0.37 | 0.14 | 1.27 | 1.29 | 169 |
| AIFS | 0.29 | 0.16 | 1.33 | 1.32 | 169 |
| GFS | 1.5 | 0.52 | 2 | 1.77 | 169 |
| ICON | -0.27 | -0.17 | 0.99 | 0.96 | 169 |

## KORF Norfolk (721 hours scored)

| model | bias as forecast | bias corrected | MAE as forecast | MAE corrected | hours |
|---|---|---|---|---|---|
| NBM | -0.3 | -0.12 | 0.92 | 0.87 | 169 |
| HRRR | -0.2 | 0.09 | 0.62 | 0.61 | 169 |
| ECMWF | -0.77 | 0.09 | 1.32 | 1.14 | 169 |
| AIFS | -0.59 | 0.15 | 0.99 | 0.86 | 169 |
| GFS | 1.32 | 0.57 | 1.37 | 0.97 | 169 |
| ICON | -0.12 | -0.17 | 0.75 | 0.76 | 169 |
