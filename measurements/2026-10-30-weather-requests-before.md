# Open-Meteo requests (before)

Run: 2026-10-30T11:46:30.899Z · node scripts/measure-weather-requests.mjs before 5 · WebKit 390 x 844 · Virginia Beach Fishing Pier, page clock 2026-10-30T11:30:00.000Z · working tree

Weight is what Open-Meteo bills: each point is a call, times (variables x models) / 10 when over 10, times days / 14 when over 14. Free tier: 600 a minute, 5,000 an hour, 10,000 a day, per IP.

## Page load: 7 requests, weight 50.3

| for | requests | weight |
|---|---|---|
| special light, 9 points | 2 | 45.0 |
| chip: models split | 2 | 2.0 |
| marine | 2 | 2.0 |
| venue day (wind and cloud chips) | 1 | 1.3 |

## Load and 5 minutes of use: 33 requests, weight 233.7

| for | requests | weight |
|---|---|---|
| sky fire path, 8 points | 8 | 115.2 |
| special light, 9 points | 4 | 90.0 |
| venue day (wind and cloud chips) | 7 | 9.1 |
| wind models | 2 | 7.0 |
| marine | 5 | 5.0 |
| wind, 16 days | 3 | 3.4 |
| chip: models split | 2 | 2.0 |
| aerosol | 2 | 2.0 |

## Steps

- pan 120,0: 0 requests
- pan -60,90: 0 requests
- pan 0,-150: 0 requests
- pan 80,40: 0 requests
- time bar +4 h, a quarter at a time: 4 requests
- time bar back 2 h: 2 requests
- Sky › Fire: 2 requests
- Sky › Preview: 4 requests
- Sky › Special: 10 requests
- Wind chip › Five models: 4 requests
