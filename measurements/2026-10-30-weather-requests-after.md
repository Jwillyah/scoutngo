# Open-Meteo requests (after)

Run: 2026-10-30T11:55:04.042Z · node scripts/measure-weather-requests.mjs after 5 · WebKit 390 x 844 · Virginia Beach Fishing Pier, page clock 2026-10-30T11:30:00.000Z · working tree

Weight is what Open-Meteo bills: each point is a call, times (variables x models) / 10 when over 10, times days / 14 when over 14. Free tier: 600 a minute, 5,000 an hour, 10,000 a day, per IP.

## Page load: 4 requests, weight 25.8

| for | requests | weight |
|---|---|---|
| special light, 9 points | 1 | 22.5 |
| venue day (wind and cloud chips) | 1 | 1.3 |
| chip: models split | 1 | 1.0 |
| marine | 1 | 1.0 |

## Load and 5 minutes of use: 9 requests, weight 60.2

| for | requests | weight |
|---|---|---|
| sky fire path, 8 points | 2 | 28.8 |
| special light, 9 points | 1 | 22.5 |
| wind models | 1 | 3.5 |
| venue day (wind and cloud chips) | 1 | 1.3 |
| wind, 16 days | 1 | 1.1 |
| chip: models split | 1 | 1.0 |
| marine | 1 | 1.0 |
| aerosol | 1 | 1.0 |

## Steps

- pan 120,0: 0 requests
- pan -60,90: 0 requests
- pan 0,-150: 0 requests
- pan 80,40: 0 requests
- time bar +4 h, a quarter at a time: 0 requests
- time bar back 2 h: 0 requests
- Sky › Fire: 1 requests
- Sky › Preview: 1 requests
- Sky › Special: 2 requests
- Wind chip › Five models: 1 requests
