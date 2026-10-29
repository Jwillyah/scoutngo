# The calendar's low tide near sunrise and sunset, two ways

Run: 2026-10-29T02:05:42.026Z · node scripts/measure-calendar-tides.mjs · Virginia Beach Fishing Pier 36.8435575, -75.9713104 · station 8639168 · within 90 min

App: src/core/calendarMonth.ts on NOAA's turns asked in GMT, sunrise and sunset on the calibrated horizon. Second way: NOAA's own local-time table read as text, and suncalc's getTimes().

| date | NOAA local table | suncalc sunrise / sunset | app: near sunrise / sunset | second way | |
|---|---|---|---|---|---|
| 2026-11-03 | H 02:35, L 08:38, H 14:55, L 21:17 | 11:29Z / 22:04Z | no / no | no / no | agree |
| 2026-11-15 | L 04:53, H 11:15, L 17:52, H 23:45 | 11:42Z / 21:54Z | no / yes | no / yes | agree |
| 2026-11-27 | L 02:48, H 09:20, L 15:54, H 21:49 | 11:54Z / 21:48Z | no / yes | no / yes | agree |

The two agree on every date.
