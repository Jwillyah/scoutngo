# Accuracy: the home screen against what happened, 2026-11-01 to 2026-11-07

Run 2026-11-08T23:08:07.558Z at e8d9eb8 · `node scripts/measure-accuracy.mjs`

## Run parameters

- days: 7, 2026-11-01 to 2026-11-07 (America/New_York), ending yesterday at the venue
- hours scored: 5:00 to 20:00 local, the briefing's hours; an observation counts within 30 min of the hour
- VB Pier: 36.844, -75.971, faces 100° — src/data/coastCams.ts 'va-virginia-beach-pier'
- Sandbridge: 36.727, -75.94, faces 100° — src/data/coastCams.ts 'va-sandbridge'
- Chix: 36.92, -76.1 — tests/data/sky-fire-2026-11-02-sunset.json (truth case #5 venue)
- weather: Open-Meteo previous runs, the briefing's variables (temperature_2m, wind_speed_10m, wind_gusts_10m), default model, coordinates to 2 decimals as the app asks; d0 the newest run before the hour, d1 the run a day earlier
- weather observed: Iowa State ASOS archive, routine reports, KNTU and KORF; the nearer to each spot (VB Pier KNTU, Sandbridge KNTU, Chix KORF)
- sea: Open-Meteo Marine (the Surf page's variables) vs NDBC realtime2 44099 and 44100, the nearer to each spot
- tide: NOAA CO-OPS predictions (hilo, MLLW) at the station the app picks, vs the nearest water-level gauge with observed turns
- hit: air within 2 °C (3.6 °F), wind and gust within 5 kt, wave height and surf face within 1 ft, period within 2 s, surf size the same word (Flat, Small, Fun, Solid, Big), tide turn within 15 min and 0.5 ft
- errors are forecast minus observed: a positive bias is a forecast too high, or a tide turn said later than it came

## Summary

All spots together, the newest forecast (d0) and the tide predictions. Hit rate pooled over every pair; a pair two spots share (one tide gauge) is counted once.

| item | pairs | MAE | bias | hit rate | hit is |
|---|---|---|---|---|---|
| air temperature | 336 | 1.8 °F | -0.3 °F | 87% | ±2 °C (3.6 °F) |
| wind, hourly | 334 | 2.1 kt | 0.1 kt | 93% | ±5 kt |
| gust, hourly | 334 | 4.4 kt | 3.3 kt | 63% | ±5 kt |
| day's strongest wind | 21 | 1.3 kt | -1.1 kt | 100% | ±5 kt |
| day's strongest gust | 21 | 2.8 kt | 0.9 kt | 86% | ±5 kt |
| wave height (Hs) | 224 | 1.1 ft | -1.1 ft | 49% | ±1 ft |
| wave period | 224 | 2.6 s | -2.3 s | 24% | ±2 s |
| surf face | 224 | 2.0 ft | -2.0 ft | 8% | ±1 ft |
| surf size word | 224 | — | — | 18% | same word |
| tide turn time | 54 | 7.1 min | 0.4 min | 89% | ±15 min |
| tide turn height | 54 | 0.5 ft | -0.5 ft | 54% | ±0.5 ft |

## Per spot, per item

| spot | item | lead | pairs | MAE | bias | hit rate | hit is |
|---|---|---|---|---|---|---|---|
| VB Pier | air temperature | d0 | 112 | 1.8 °F | 0.1 °F | 85% | ±2 °C (3.6 °F) |
| VB Pier | wind, hourly | d0 | 112 | 2.0 kt | 0.2 kt | 95% | ±5 kt |
| VB Pier | gust, hourly | d0 | 112 | 4.5 kt | 3.5 kt | 63% | ±5 kt |
| VB Pier | day's strongest wind | d0 | 7 | 1.3 kt | -1.2 kt | 100% | ±5 kt |
| VB Pier | day's strongest gust | d0 | 7 | 2.9 kt | 1.4 kt | 86% | ±5 kt |
| VB Pier | air temperature | d1 | 112 | 2.4 °F | -0.1 °F | 82% | ±2 °C (3.6 °F) |
| VB Pier | wind, hourly | d1 | 112 | 2.1 kt | 0.9 kt | 91% | ±5 kt |
| VB Pier | gust, hourly | d1 | 112 | 5.7 kt | 5.0 kt | 51% | ±5 kt |
| VB Pier | day's strongest wind | d1 | 7 | 1.5 kt | -0.9 kt | 100% | ±5 kt |
| VB Pier | day's strongest gust | d1 | 7 | 2.9 kt | 2.4 kt | 86% | ±5 kt |
| Sandbridge | air temperature | d0 | 112 | 2.1 °F | -0.4 °F | 82% | ±2 °C (3.6 °F) |
| Sandbridge | wind, hourly | d0 | 112 | 2.2 kt | 0.7 kt | 89% | ±5 kt |
| Sandbridge | gust, hourly | d0 | 112 | 4.7 kt | 3.7 kt | 61% | ±5 kt |
| Sandbridge | day's strongest wind | d0 | 7 | 1.3 kt | -0.9 kt | 100% | ±5 kt |
| Sandbridge | day's strongest gust | d0 | 7 | 2.7 kt | 2.0 kt | 86% | ±5 kt |
| Sandbridge | air temperature | d1 | 112 | 2.5 °F | -0.2 °F | 77% | ±2 °C (3.6 °F) |
| Sandbridge | wind, hourly | d1 | 112 | 2.6 kt | 1.3 kt | 87% | ±5 kt |
| Sandbridge | gust, hourly | d1 | 112 | 5.9 kt | 5.2 kt | 47% | ±5 kt |
| Sandbridge | day's strongest wind | d1 | 7 | 1.4 kt | -0.6 kt | 100% | ±5 kt |
| Sandbridge | day's strongest gust | d1 | 7 | 3.3 kt | 2.9 kt | 86% | ±5 kt |
| Chix | air temperature | d0 | 112 | 1.5 °F | -0.5 °F | 94% | ±2 °C (3.6 °F) |
| Chix | wind, hourly | d0 | 110 | 2.0 kt | -0.6 kt | 96% | ±5 kt |
| Chix | gust, hourly | d0 | 110 | 3.9 kt | 2.6 kt | 67% | ±5 kt |
| Chix | day's strongest wind | d0 | 7 | 1.4 kt | -1.2 kt | 100% | ±5 kt |
| Chix | day's strongest gust | d0 | 7 | 2.9 kt | -0.8 kt | 86% | ±5 kt |
| Chix | air temperature | d1 | 112 | 2.2 °F | -1.1 °F | 79% | ±2 °C (3.6 °F) |
| Chix | wind, hourly | d1 | 110 | 2.3 kt | 0.4 kt | 91% | ±5 kt |
| Chix | gust, hourly | d1 | 110 | 5.4 kt | 4.5 kt | 51% | ±5 kt |
| Chix | day's strongest wind | d1 | 7 | 1.6 kt | -0.9 kt | 100% | ±5 kt |
| Chix | day's strongest gust | d1 | 7 | 2.2 kt | 0.0 kt | 86% | ±5 kt |
| VB Pier | wave height (Hs) | d0 | 112 | 0.9 ft | -0.9 ft | 61% | ±1 ft |
| VB Pier | wave height (Hs) | d1 | 112 | 0.9 ft | -0.9 ft | 71% | ±1 ft |
| VB Pier | wave period | d0 | 112 | 2.5 s | -2.3 s | 22% | ±2 s |
| VB Pier | surf face | d0 | 112 | 1.9 ft | -1.8 ft | 13% | ±1 ft |
| VB Pier | surf size word | d0 | 112 | — | — | 21% | same word |
| Sandbridge | wave height (Hs) | d0 | 112 | 1.3 ft | -1.3 ft | 38% | ±1 ft |
| Sandbridge | wave height (Hs) | d1 | 112 | 1.3 ft | -1.3 ft | 36% | ±1 ft |
| Sandbridge | wave period | d0 | 112 | 2.6 s | -2.3 s | 25% | ±2 s |
| Sandbridge | surf face | d0 | 112 | 2.2 ft | -2.1 ft | 4% | ±1 ft |
| Sandbridge | surf size word | d0 | 112 | — | — | 16% | same word |
| VB Pier | tide turn time | NOAA | 27 | 6.4 min | 0.6 min | 89% | ±15 min |
| VB Pier | tide turn height | NOAA | 27 | 0.5 ft | -0.5 ft | 59% | ±0.5 ft |
| Sandbridge | tide turn time | NOAA | 27 | 7.7 min | 0.1 min | 89% | ±15 min |
| Sandbridge | tide turn height | NOAA | 27 | 0.5 ft | -0.5 ft | 48% | ±0.5 ft |
| Chix | tide turn time | NOAA | 27 | 6.4 min | 0.6 min | 89% | ±15 min |
| Chix | tide turn height | NOAA | 27 | 0.5 ft | -0.5 ft | 59% | ±0.5 ft |

Sources per row:

- VB Pier: Open-Meteo default model vs KNTU (6.1 km)
- Sandbridge: Open-Meteo default model vs KNTU (13.3 km)
- Chix: Open-Meteo default model vs KORF (8.4 km)
- VB Pier: Open-Meteo Marine vs NDBC 44099 (24 km)
- Sandbridge: Open-Meteo Marine vs NDBC 44099 (29 km)
- VB Pier: NOAA prediction at gauge 8638901 CBBT, Chesapeake Channel (23.3 km) vs its observed turns
- Sandbridge: NOAA prediction at gauge 8639348 Money Point (32.7 km) vs its observed turns
- Chix: NOAA prediction at gauge 8638901 CBBT, Chesapeake Channel (12.6 km) vs its observed turns

## Worst 3 items

Lowest hit rate among the d0 and tide rows at the three spots (ties: the larger mean error).

1. Sandbridge · surf face (d0): hit 4% of 112, MAE 2.2 ft, bias -2.1 ft (Open-Meteo Marine vs NDBC 44099 (29 km))
2. VB Pier · surf face (d0): hit 13% of 112, MAE 1.9 ft, bias -1.8 ft (Open-Meteo Marine vs NDBC 44099 (24 km))
3. Sandbridge · surf size word (d0): hit 16% of 112 (Open-Meteo Marine vs NDBC 44099 (29 km))

## Sunset call against the log

| spot | date | what the app said | what happened | from |
|---|---|---|---|---|
| VB Pier | 2026-11-01 | — | no log supplied | — |
| VB Pier | 2026-11-02 | — | no log supplied | — |
| VB Pier | 2026-11-03 | — | no log supplied | — |
| VB Pier | 2026-11-04 | — | no log supplied | — |
| VB Pier | 2026-11-05 | — | no log supplied | — |
| VB Pier | 2026-11-06 | — | no log supplied | — |
| VB Pier | 2026-11-07 | — | no log supplied | — |
| Sandbridge | 2026-11-01 | — | no log supplied | — |
| Sandbridge | 2026-11-02 | — | no log supplied | — |
| Sandbridge | 2026-11-03 | — | no log supplied | — |
| Sandbridge | 2026-11-04 | — | no log supplied | — |
| Sandbridge | 2026-11-05 | — | no log supplied | — |
| Sandbridge | 2026-11-06 | — | no log supplied | — |
| Sandbridge | 2026-11-07 | — | no log supplied | — |
| Chix | 2026-11-01 | — | no log supplied | — |
| Chix | 2026-11-02 | T-30, models alone: Maybe; with reports and satellite: Go (replayed after the fact) | FIRED, 5:00-5:20 PM by eye | measurements/2026-11-02-truth-5-replay.md |
| Chix | 2026-11-03 | — | no log supplied | — |
| Chix | 2026-11-04 | — | no log supplied | — |
| Chix | 2026-11-05 | — | no log supplied | — |
| Chix | 2026-11-06 | — | no log supplied | — |
| Chix | 2026-11-07 | — | no log supplied | — |

Needs Jwilly's log (20 sunsets): VB Pier 2026-11-01, VB Pier 2026-11-02, VB Pier 2026-11-03, VB Pier 2026-11-04, VB Pier 2026-11-05, VB Pier 2026-11-06, VB Pier 2026-11-07, Sandbridge 2026-11-01, Sandbridge 2026-11-02, Sandbridge 2026-11-03, Sandbridge 2026-11-04, Sandbridge 2026-11-05, Sandbridge 2026-11-06, Sandbridge 2026-11-07, Chix 2026-11-01, Chix 2026-11-03, Chix 2026-11-04, Chix 2026-11-05, Chix 2026-11-06, Chix 2026-11-07. The app keeps the log on the phone (src/lib/truthLog.ts, src/lib/fireLog.ts); export it and run again with `--sunset-log <file>`. No outcome is filled in without it.

## Notes

- VB Pier: Open-Meteo answered for its grid cell at 36.817, -75.988, 3.4 km from the spot.
- Sandbridge: Open-Meteo answered for its grid cell at 36.726, -75.946, 0.6 km from the spot.
- Chix: Open-Meteo answered for its grid cell at 36.894, -76.104, 2.9 km from the spot.
- VB Pier: Open-Meteo Marine answered for its cell at 36.958, -75.875, 15.3 km from the spot; buoy 44099 Cape Henry, VA (147), 24 km.
- Sandbridge: Open-Meteo Marine answered for its cell at 36.708, -75.875, 6.2 km from the spot; buoy 44099 Cape Henry, VA (147), 29 km.
- The surf face is the app's number (surfDay.surfAt): the swell's height and period when Open-Meteo gives them, else the whole sea's. The buoy's WVHT and DPD are the whole sea, wind waves included, put through the same formula (surf.surfEstimate). Part of a low face bias can be that choice; the wave height (Hs) row compares the whole sea with the whole sea.
- The wave height is scored at d0 and d1 (Open-Meteo Marine's wave_height_previous_day1). The period, the surf face and its word are scored at d0 only: the day-before run of the swell they are made from was not asked for.
- gauge 8638901: verified highs and lows cover only 0 turns of the week, so its preliminary levels are used
- VB Pier tide: the app's station is 8639168 Virginia Beach, 0.1 km (27 predicted turns in the week). Nearest gauge with observed turns: 8638901 CBBT, Chesapeake Channel, 23.3 km, from turns in NOAA's preliminary 6-minute water levels (2151 samples; verified highs and lows not yet published); 27 of its own predicted turns paired. Not scored, for information: the app's Virginia Beach turns against that gauge's observed ones differ by 36.5 min on average (bias -36.5 min) and 0.39 ft, over 27 pairs: the water between them, not only the prediction.
- gauge 8639348: verified highs and lows cover only 0 turns of the week, so its preliminary levels are used
- Sandbridge tide: the app's station is 8639428 Sandbridge, 4.3 km (27 predicted turns in the week). Nearest gauge with observed turns: 8639348 Money Point, 32.7 km, from turns in NOAA's preliminary 6-minute water levels (2151 samples; verified highs and lows not yet published); 27 of its own predicted turns paired. Not scored, for information: the app's Sandbridge turns against that gauge's observed ones differ by 106.1 min on average (bias -106.1 min) and 0.28 ft, over 27 pairs: the water between them, not only the prediction.
- Chix tide: the app's station is 8638888 Lynnhaven Inlet, Virginia Pilots Dock, 1.7 km (27 predicted turns in the week). Nearest gauge with observed turns: 8638901 CBBT, Chesapeake Channel, 12.6 km, from turns in NOAA's preliminary 6-minute water levels (2151 samples; verified highs and lows not yet published); 27 of its own predicted turns paired. Not scored, for information: the app's Lynnhaven Inlet, Virginia Pilots Dock turns against that gauge's observed ones differ by 34.4 min on average (bias 34.4 min) and 0.59 ft, over 27 pairs: the water between them, not only the prediction.

## Could not measure

- Chix sea: Chix is on the Chesapeake Bay; 44099 and 44100 are both on the ocean side, so neither measures its water

Times are America/New_York. The first observed turn found at gauge 8638901: high at 1:42 AM on 2026-11-01, 2.98 ft MLLW.
