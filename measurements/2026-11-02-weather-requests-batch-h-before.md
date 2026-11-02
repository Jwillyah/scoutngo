# Open-Meteo requests (batch-h-before)

Run: 2026-11-02T17:32:42.831Z · node scripts/measure-weather-requests.mjs batch-h-before 5 · WebKit 390 x 844 · Virginia Beach Fishing Pier, page clock 2026-10-30T11:30:00.000Z · working tree

Weight is what Open-Meteo bills: each point is a call, times (variables x models) / 10 when over 10, times days / 14 when over 14. Free tier: 600 a minute, 5,000 an hour, 10,000 a day, per IP.

## Page load: 5 requests, weight 27.4

| for | requests | weight |
|---|---|---|
| special light, 9 points | 1 | 22.5 |
| marine | 1 | 1.6 |
| venue day (wind and cloud chips) | 1 | 1.3 |
| chip: models split | 1 | 1.0 |
| other: https://api.open-meteo.com/v1/forecast?latitude=36.84&longitude=-75.97&hourly=cloud_cover_mid%2Ccloud_cover_high&models= | 1 | 1.0 |

## Load and 5 minutes of use: 10 requests, weight 48.6

| for | requests | weight |
|---|---|---|
| special light, 9 points | 1 | 22.5 |
| sky fire path, 8 points | 1 | 14.4 |
| wind models | 1 | 3.5 |
| marine | 1 | 1.6 |
| venue day (wind and cloud chips) | 1 | 1.3 |
| sky hours, 16 days | 1 | 1.1 |
| wind, 16 days | 1 | 1.1 |
| chip: models split | 1 | 1.0 |
| other: https://api.open-meteo.com/v1/forecast?latitude=36.84&longitude=-75.97&hourly=cloud_cover_mid%2Ccloud_cover_high&models= | 1 | 1.0 |
| aerosol | 1 | 1.0 |

## Steps

- pan 120,0: 0 requests
- pan -60,90: 0 requests
- pan 0,-150: 0 requests
- pan 80,40: 0 requests
- pin dragged 70,0 px: 0 requests
- pin dragged -70,0 px: 0 requests
- pin dragged 0,70 px: 0 requests
- pin dragged 0,-70 px: 0 requests
- time bar +4 h, a quarter at a time: 0 requests
- time bar back 2 h: 0 requests
- Sky › Fire: 3 requests
- Sky › Preview: could not (TimeoutError: locator.tap: Timeout 30000ms exceeded.)
- Sky › Preview: 0 requests
- Sky › Special: could not (TimeoutError: locator.tap: Timeout 4000ms exceeded.)
- Sky › Special: 0 requests
- Wind chip › Five models: 2 requests
