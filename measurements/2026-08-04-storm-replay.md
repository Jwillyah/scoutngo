# Storm day replay: 4 Aug 2026, KORF (Norfolk airport)

Command: node scripts/replay-storm-day.mjs
Run: 2026-11-03T20:58:19.391Z

METAR (IEM archive): thunder began 17:20Z (TSB20); heavy rain began 17:43Z (RAB43); rain again from 18:55Z (RAB1855).

Radar: Iowa State national composite, scans 20, 10 and 0 minutes before each time below, tracked by src/core/stormCells.ts.

Forming signal (Batch L): radar cells new in the last two scans within 30 mi, backed by the HRRR's forecast reflectivity for the next hour or by the day's HRRR CAPE 2640 J/kg and CIN 0 J/kg (12-20Z at KORF, Open-Meteo previous runs).

| scan | lead to rain | first cell said to reach KORF | arrives | error vs METAR | forming signal |
|---|---|---|---|---|---|
| 16:30Z | 75 min to 17:43Z | none arriving; nearest: Cell 4 mi NW · moving N 5 mph | — | — | New cells forming within 5 mi · moving slowly (CAPE 2,640 J/kg) |
| 16:45Z | 60 min to 17:43Z | none arriving; nearest: Cell 6 mi WNW · moving W 7 mph | — | — | nothing |
| 17:00Z | 45 min to 17:43Z | none arriving; nearest: Cell 22 mi W · moving E 24 mph · passes 6 mi S of you about 17:51Z | — | — | nothing |
| 17:15Z | 30 min to 17:43Z | none arriving; nearest: Cell 13 mi WSW · moving N 5 mph · passes 9 mi W of you roughly 18:13Z | — | — | New cells forming within 25 mi · moving slowly (CAPE 2,640 J/kg) |
| 17:30Z | 15 min to 17:43Z | Cell over you · moving NW 14 mph · ends ~17:58Z | 17:30Z | -13 min | nothing |
| 17:55Z | 60 min to 18:55Z | Cell 2 mi ESE · moving NW 5 mph · arrives about 18:13Z · ends about 18:39Z | 18:13Z | -41 min | nothing |
| 18:10Z | 45 min to 18:55Z | Cell over you · moving NNW 8 mph · ends about 18:21Z | 18:10Z | -45 min | New cells forming within 5 mi · moving slowly (CAPE 2,640 J/kg) |
| 18:25Z | 30 min to 18:55Z | Cell over you · moving NW 5 mph · ends roughly 19:16Z | 18:25Z | -30 min | nothing |
| 18:40Z | 15 min to 18:55Z | Cell over you · moving N 6 mph · ends roughly 19:55Z | 18:40Z | -15 min | New cells forming within 15 mi · moving slowly (HRRR has storms within 15 mi by 20:00Z · CAPE 2,640 J/kg) |

Thunder at KORF began 17:20Z, before the rain: the cells' lightning was reported distant west from 17:20.

Reading it: the first round formed almost in place (cells moving 5-7 mph at T-75 and T-60), which a straight-line track cannot see coming; the tracker said nothing arriving until the cell was over KORF at 17:30Z, 13 min before the METAR's rain. KORF had rain without a break from 17:43Z to 18:50Z (RAE50), so the "over you" scans at 18:10Z-18:40Z were right, and the error column against the 18:55Z restart overstates the miss for those rows.

## Lead time to the first round of rain (17:43Z)

- before (the tracker alone): 15 min (scan 17:30Z)
- after (the tracker or the forming signal): 75 min (scan 16:30Z)
- the forming signal was on at 16:30Z, 17:15Z: 2 of the 5 scans before the rain. It is not steady: a new cell counts as new for two scans, and a cell that merges or fades takes it away.
