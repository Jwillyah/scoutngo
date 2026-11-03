# Model skill at 36.92, -76.07, live, 2026-11-03T11:53:59.769Z

Command: node scripts/measure-model-skill.mjs 36.92 -76.07
Stations: KORF (11.0 km), KNTU (11.5 km)
Days scored: 30 (2026-10-04 to 2026-11-02)

Forecast made the day before minus measured. Temperature °C, wind and gust m/s, cloud %, rain hit rate.

| model | temp bias | temp MAE | wind bias | wind MAE | gust bias | cloud bias | rain hit |
|---|---|---|---|---|---|---|---|
| NBM | -0.3 | 1.1 | 0.2 | 1.0 | 1.6 | -11.1 | 92% |
| HRRR | -0.3 | 0.9 | 0.3 | 1.0 | 2.7 | 0.0 | 92% |
| ECMWF | -0.1 | 0.9 | -0.4 | 1.1 | — | -12.7 | 89% |
| AIFS | -0.2 | 1.0 | -0.0 | 1.0 | — | -6.4 | 87% |
| GFS | 0.7 | 1.3 | 0.2 | 1.1 | 1.4 | 2.4 | 91% |
| ICON | -0.1 | 0.9 | -0.8 | 1.2 | 2.1 | 3.1 | 92% |

## The blended week, corrected

| date | high °C | spread | low °C | rain chance | wind max m/s |
|---|---|---|---|---|---|
| 2026-11-03 | 21.1 | 20.2–22.1 | 13.3 | 0% | 3.4 |
| 2026-11-04 | 23.7 | 21.6–25.0 | 15.2 | 0% | 4.7 |
| 2026-11-05 | 24.7 | 22.9–25.8 | 17.2 | 40% | 5.2 |
| 2026-11-06 | 22.7 | 20.8–24.2 | 18.0 | 100% | 3.9 |
| 2026-11-07 | 18.6 | 14.9–20.8 | 14.4 | 59% | 4.9 |
| 2026-11-08 | 16.7 | 15.3–18.0 | 11.4 | 21% | 4.3 |
| 2026-11-09 | 16.4 | 14.7–17.9 | 10.4 | 21% | 5.3 |
