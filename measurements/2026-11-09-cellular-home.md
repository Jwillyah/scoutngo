# Cellular: what one open asks Open-Meteo, and what the home shows when refused

Run 2026-11-09T00:19:08.986Z · node scripts/measure-cellular.mjs before-batch-m <dist at e8d9eb8> section-1 <dist at 57935d2> new-home <dist of this commit> · Chromium (Pixel 7) 412 x 915 · VB pier saved, bare launch, page clock 2026-11-02T13:30:00.000Z · the gate's fixtures, nothing live.

Weight is what Open-Meteo bills (scripts/openMeteoFake.mjs requestShape; the live service’s X-RateLimit-Cost header said the same 14.4 for an 8-point colour path, checked by hand with curl on 8 Nov). Free tier: 600 a minute, 5,000 an hour, 10,000 a day, per IP address.

## before-batch-m (<dist at e8d9eb8>)

- one open: 11 Open-Meteo requests, weight 94.9, 0 through the forecast cache, 11 direct
- Open-Meteo refusing the phone's address (429): the home showed 46 dashes (7 when answered); 6 requests refused
- second open, 2 h later, 3 s latency: a wind number on the home 0.1 s after the page loaded; 65 dashes 1.5 s after that; its status line: "Checked — · next check —"

| request | count | weight | via |
|---|---|---|---|
| api · 8 points · cloud_cover_low,cloud_cover_mid,cloud_cover_high · 6 models | 6 | 86.4 | direct |
| api · 1 point · cape,convective_inhibition,lifted_index… · 4 models | 1 | 3.6 | direct |
| marine-api · 1 point · wave_height,wave_direction,wave_period… | 1 | 1.6 | direct |
| api · 1 point · wind_speed_10m,wind_direction_10m,wind_speed_80m… | 1 | 1.3 | direct |
| api · 1 point · wind_speed_10m,wind_direction_10m,wind_gusts_10m… | 1 | 1.0 | direct |
| ensemble-api · 1 point · precipitation · 1 models | 1 | 1.0 | direct |

## section-1 (<dist at 57935d2>)

- one open: 6 Open-Meteo requests, weight 37.3, 6 through the forecast cache, 0 direct
- Open-Meteo refusing the phone's address (429): the home showed 7 dashes (7 when answered); 0 requests refused
- second open, 2 h later, 3 s latency: a wind number on the home 0.1 s after the page loaded; 35 dashes 1.5 s after that; its status line: "Updated 8:30 AM · refreshing"

| request | count | weight | via |
|---|---|---|---|
| api · 16 points · cloud_cover_low,cloud_cover_mid,cloud_cover_high · 6 models | 1 | 28.8 | cache |
| api · 1 point · cape,convective_inhibition,lifted_index… · 4 models | 1 | 3.6 | cache |
| marine-api · 1 point · wave_height,wave_direction,wave_period… | 1 | 1.6 | cache |
| api · 1 point · wind_speed_10m,wind_direction_10m,wind_speed_80m… | 1 | 1.3 | cache |
| ensemble-api · 1 point · precipitation · 1 models | 1 | 1.0 | cache |
| api · 1 point · wind_speed_10m,wind_direction_10m,wind_gusts_10m… | 1 | 1.0 | cache |

## new-home (<dist of this commit>)

- one open: 6 Open-Meteo requests, weight 37.3, 6 through the forecast cache, 0 direct
- Open-Meteo refusing the phone's address (429): the home showed 10 dashes (10 when answered); 0 requests refused
- second open, 2 h later, 3 s latency: a wind number on the home 0.6 s after the page loaded; 13 dashes 1.5 s after that; its status line: "Updated 8:30 AM · refreshing"

| request | count | weight | via |
|---|---|---|---|
| api · 16 points · cloud_cover_low,cloud_cover_mid,cloud_cover_high · 6 models | 1 | 28.8 | cache |
| api · 1 point · cape,convective_inhibition,lifted_index… · 4 models | 1 | 3.6 | cache |
| marine-api · 1 point · wave_height,wave_direction,wave_period… | 1 | 1.6 | cache |
| api · 1 point · wind_speed_10m,wind_direction_10m,wind_speed_80m… | 1 | 1.3 | cache |
| api · 1 point · wind_speed_10m,wind_direction_10m,wind_gusts_10m… | 1 | 1.0 | cache |
| ensemble-api · 1 point · precipitation · 1 models | 1 | 1.0 | cache |
