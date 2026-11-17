# Privacy on the host (Vercel)

Batch DRONE, Section 0.6 (16 Nov; CORE Section 0.3, reverted). The deploy is scoutngo.vercel.app. This says what our own code on Vercel receives and keeps, what Vercel itself keeps by default, and how it is kept small.

## Our functions log nothing

Every function in `api/` writes no log line: no `console.*` call, no request body, no coordinate, no IP. `tests/apiNoLogs.test.ts` fails if one appears. None reads a client IP header (`x-forwarded-for`, `x-real-ip`) or keeps anything between requests.

| Function | What it receives | Where |
|---|---|---|
| `/api/forecast` | An Open-Meteo request, every coordinate snapped to a 0.05° grid (about 5 km; finer is refused), and the UTC hour | URL query string |
| `/api/metar` | A station id | POST body |
| `/api/pirep` | A station id (pilot reports within 100 miles of it) | POST body |
| `/api/buoy` | A buoy number | POST body |
| `/api/sst` | The spot snapped to a half degree (about 55 km; anything finer is refused), only for a spot on the sea with no water-temperature station within 15 km. It asks NOAA CoastWatch's ERDDAP for that box (the cell is then in its outgoing URL) | POST body |
| `/api/nhc` | Nothing, or one storm's NHC product URL (which storm is near is worked out on the phone) | POST body |
| `/api/search` | What you typed, and a proximity point | POST body |
| `/api/streetview` | The spot being considered | POST body |
| `/api/calendar` | The venue to 2 decimals (about 1 km) | URL query string (a calendar app subscribes to a URL, so it cannot be a body) |

The phone asks Open-Meteo directly first (Batch DRONE 0.5); `/api/forecast` is asked only when Open-Meteo refuses the phone or cannot be reached.

## What Vercel keeps by default

From Vercel's Runtime Logs documentation (vercel.com/docs/runtime-logs, read 16 Nov 2026):

- **Runtime logs** hold each function request's method, **request path and its search parameters**, status, host, time, region, **user agent**, cache status, function metadata, and the **outgoing requests** the function made, plus anything the function prints (ours print nothing).
- Vercel matches **your IP address** and user agent against requests for its "logs from your browser" filter, so it holds the requesting IP alongside the request.
- **Retention:** Hobby 1 hour, Pro 1 day, Pro or Enterprise with Observability Plus 30 days, Enterprise 3 days.
- Static requests answered from the CDN appear only when they serve cache; all of them only through a log drain.

So, by default, Vercel can see: the forecast cache's 5 km grid point, the calendar feed's 1 km venue, and the IP and user agent of whoever asked, for the retention above. POST bodies (search text, the spot for Street View, station and buoy ids) are not in the request log.

**Not confirmed:** whether the "Outgoing Requests" panel shows the full URL of a function's own request onward. `/api/search` sends the search text and proximity point to Mapbox, and `/api/streetview` sends the spot to Google, in those URLs. If Vercel records them in full, they sit in the log for the retention period. Check one request in the dashboard (Logs › a `/api/search` row › Outgoing Requests).

## How it is kept small

Vercel's request logs cannot be switched off. They are kept small by:

1. **Shortest retention**: on Hobby, 1 hour of logs; Observability Plus (30 days) stays off. Which plan the project is on is not visible from the repo.
2. **No log drains** configured. A drain would copy every request elsewhere. Check: Project › Settings › Log Drains is empty.
3. **No Web Analytics, no Speed Insights**: neither package is in `package.json`. Check: Project › Analytics and Speed Insights are disabled.
4. **Coordinates in bodies, not URLs**, everywhere a URL is not required (search, Street View); station and buoy ids in bodies too.
5. **Coarse where a URL is required**: 0.05° for the forecast cache; 2 decimals for the calendar feed; half a degree for the satellite sea temperature's onward request (`/api/sst`).
6. **Phone first**: Open-Meteo, NOAA, NWS and the map tiles are asked by the phone directly, so Vercel never sees those requests.

Items 1–3 are dashboard settings this repo cannot see. Jwilly should confirm them once in the Vercel dashboard.
