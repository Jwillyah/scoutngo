# Wind nowcast, before and after, against the stations

Batch MAP2, Section 2. Run 2026-11-09T19:29:04.752Z by scripts/measure-wind-nowcast.mjs.

Parameters: 2026-11-02 to 2026-11-09, the routine
reports (IEM ASOS archive, report types 3 and 4: KFFA is an AWOS that files every 20 minutes) at KNTU and KFFA; the model is
Open-Meteo's historical forecast, best match, at each station's point; the
nowcast is src/core/nowcast.ts (fade 3 h). For every report, the forecast
for 0, 1, 2 and 3 hours later is scored against the report then: mean
absolute speed error, knots.

| Station | Hours after the report | Pairs | Model alone (kt) | With the nowcast (kt) |
|---|---|---|---|---|
| KNTU, Oceana NAS | 0 | 225 | 1.94 | 0.29 |
| KNTU, Oceana NAS | 1 | 221 | 1.97 | 1.74 |
| KNTU, Oceana NAS | 2 | 216 | 2.07 | 1.82 |
| KNTU, Oceana NAS | 3 | 213 | 2.10 | 2.10 |
| KFFA, First Flight | 0 | 503 | 2.66 | 0.02 |
| KFFA, First Flight | 1 | 499 | 2.65 | 1.62 |
| KFFA, First Flight | 2 | 496 | 2.63 | 2.05 |
| KFFA, First Flight | 3 | 493 | 2.64 | 2.64 |

At 0 hours the nowcast leans fully on a report at, or within 20 minutes
of, the one it is scored against, so it is near 0 by construction; 1 to 3
hours are the test, and at 3 hours the lean has faded back to the model.
