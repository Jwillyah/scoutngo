# The moon at Chic's Beach, ours against USNO

**Date:** 2026-11-19
**Script:** `scripts/measure-moon-fixture.mjs` (no network; reads the saved answers)
**Place:** 36.92, -76.1, sea level, America/New_York (EST, UTC−5, all dates here)
**Ours:** suncalc 2.0.2 through `src/core/moonTimes.ts` moonTimesOnLocalDay (rise, set), suncalc getMoonPosition (bearing), getTimes at local noon (sunrise, sunset), `src/core/moonPhases.ts` (full, new)
**Second ephemeris:** US Naval Observatory API 4.0.1, fetched once on 2026-11-19 with User-Agent "ScoutNGo (+https://github.com/Jwillyah/scoutngo)" and saved in `tests/data/usno-moon-2026-11-19/`: rstt/oneday (tz=-5, dst=false), moon/phases/date (nump=8), celnav at each USNO rise and set minute (Zn, the bearing)
**Tolerance:** 5 min, 2°. USNO prints to the minute, so up to 0.5 min of each gap is its rounding.

## The fixture: batch, ours, USNO

| | batch fixture | ours | USNO | ours − USNO | |
|---|---|---|---|---|---|
| Thu 19 Nov moonrise | 1:47 PM | Thu, Nov 19 1:44 PM · 90.3° | Thu, Nov 19 1:44 PM · 90.3° | +0.1 min · +0.0° | ok |
| Fri 20 Nov moonset | 2:10 AM ~273° | Fri, Nov 20 2:13 AM · 273.7° | Fri, Nov 20 2:14 AM · 273.7° | -0.4 min · -0.1° | ok |
| Full moon | Tue 24 Nov 9:53 AM | Tue, Nov 24 9:53 AM | Tue, Nov 24 9:53 AM | +0.5 min | ok |
| Tue 24 Nov moonrise | 4:41 PM ~57° | Tue, Nov 24 4:38 PM · 56.6° | Tue, Nov 24 4:38 PM · 56.6° | +0.2 min · +0.0° | ok |
| Tue 24 Nov sunset | 4:46 PM | Tue, Nov 24 4:49 PM | Tue, Nov 24 4:50 PM · 244.5° | -0.1 min | ok |
| Mon 23 Nov moonset | 6:57 AM ~296° | Mon, Nov 23 5:44 AM · 296.5° | Mon, Nov 23 5:44 AM · 296.5° | +0.3 min · +0.0° | ok |
| Mon 23 Nov sunrise | 6:54 AM | Mon, Nov 23 6:51 AM | Mon, Nov 23 6:51 AM · 115.1° | +0.1 min | ok |
| New moon | Tue 8 Dec 7:51 PM | Tue, Dec 8 7:51 PM | Tue, Dec 8 7:52 PM | -0.1 min | ok |
| Tue 24 Nov moonset (not in the batch) | — | Tue, Nov 24 7:01 AM · 301.9° | Tue, Nov 24 7:01 AM · 301.9° | +0.1 min · +0.0° | ok |
| Tue 24 Nov sunrise (not in the batch) | — | Tue, Nov 24 6:52 AM | Tue, Nov 24 6:52 AM · 115.4° | +0.1 min | ok |

## Every moonrise and moonset in the saved days

| date (EST) | event | ours | USNO | ours − USNO | |
|---|---|---|---|---|---|
| 2026-11-19 | moonrise | 1:44 PM · 90.3° | 1:44 PM · 90.3° | +0.1 min · +0.0° | ok |
| 2026-11-19 | moonset | 1:10 AM · 265.8° | 1:10 AM · 265.7° | +0.4 min · +0.1° | ok |
| 2026-11-20 | moonrise | 2:09 PM · 82.5° | 2:09 PM · 82.5° | +0.3 min · +0.0° | ok |
| 2026-11-20 | moonset | 2:13 AM · 273.7° | 2:14 AM · 273.7° | -0.4 min · -0.1° | ok |
| 2026-11-21 | moonrise | 2:37 PM · 74.7° | 2:37 PM · 74.7° | +0.2 min · +0.0° | ok |
| 2026-11-21 | moonset | 3:19 AM · 281.7° | 3:20 AM · 281.7° | -0.3 min · -0.0° | ok |
| 2026-11-22 | moonrise | 3:09 PM · 67.4° | 3:10 PM · 67.5° | -0.4 min · -0.1° | ok |
| 2026-11-22 | moonset | 4:29 AM · 289.5° | 4:30 AM · 289.5° | -0.1 min · -0.0° | ok |
| 2026-11-23 | moonrise | 3:49 PM · 61.1° | 3:49 PM · 61.1° | +0.0 min · +0.0° | ok |
| 2026-11-23 | moonset | 5:44 AM · 296.5° | 5:44 AM · 296.5° | +0.3 min · +0.0° | ok |
| 2026-11-24 | moonrise | 4:38 PM · 56.6° | 4:38 PM · 56.6° | +0.2 min · +0.0° | ok |
| 2026-11-24 | moonset | 7:01 AM · 301.9° | 7:01 AM · 301.9° | +0.1 min · +0.0° | ok |
| 2026-11-25 | moonrise | 5:38 PM · 54.7° | 5:39 PM · 54.7° | -0.4 min · -0.1° | ok |
| 2026-11-25 | moonset | 8:15 AM · 304.9° | 8:16 AM · 305.0° | -0.3 min · -0.0° | ok |
| 2026-11-26 | moonrise | 6:48 PM · 55.8° | 6:49 PM · 55.8° | -0.1 min · -0.0° | ok |
| 2026-11-26 | moonset | 9:22 AM · 305.0° | 9:23 AM · 305.0° | -0.2 min · -0.0° | ok |
| 2026-12-07 | moonrise | 5:57 AM · 121.4° | 5:58 AM · — | -0.0 min | ok |
| 2026-12-07 | moonset | 3:31 PM · 237.3° | 3:32 PM · — | -0.4 min | ok |
| 2026-12-08 | moonrise | 6:57 AM · 124.4° | 6:57 AM · — | +0.4 min | ok |
| 2026-12-08 | moonset | 4:15 PM · 235.0° | 4:15 PM · — | +0.5 min | ok |
| 2026-12-09 | moonrise | 7:52 AM · 125.5° | 7:52 AM · — | +0.4 min | ok |
| 2026-12-09 | moonset | 5:05 PM · 234.6° | 5:06 PM · — | -0.3 min | ok |

## The full and new moon instant, four ways

USNO: full Tue, Nov 24 9:53 AM, new Tue, Dec 8 7:52 PM.

| method | full (− USNO) | new (− USNO) |
|---|---|---|
| skyEvents.ts moonTurningPoints, 6-hour grid | Tue, Nov 24 1:00 PM (+187.0 min) | Tue, Dec 8 7:00 PM (-52.0 min) |
| suncalc's share lit at its extreme, every minute | Tue, Nov 24 10:00 AM (+7.0 min) | Tue, Dec 8 8:16 PM (+24.0 min) |
| suncalc's phase crossing 0.5 (full) and 1 → 0 (new), every minute | Tue, Nov 24 11:36 AM (+103.0 min) | Tue, Dec 8 8:51 PM (+59.0 min) |
| moonPhases.ts, Meeus chapter 49 (the app now) | Tue, Nov 24 9:53 AM (+0.5 min) | Tue, Dec 8 7:51 PM (-0.1 min) |

## The Night tab on the fixture, Thu 19 Nov 7:00 PM

- Strip: 11-19, 11-20, 11-21, 11-22, 11-23, 11-24 FULL, 11-25, 11-26, 11-27, 11-28, 11-29, 11-30, 12-01, 12-02
- Mon 23 Nov: moonset 5:44 AM at 97.8% lit, sunrise 6:51 AM, 67 min apart: lit enough, not close enough.
- Moonset at sunrise 2026-11-24: sets 7:01 AM at 301.9° (WNW), sunrise 6:52 AM, 9 min after sunrise, 99.8% lit
- Big moonrise 2026-11-24: rises 4:38 PM at 56.6° (ENE), sunset 4:49 PM, 12 min before sunset, 99.7% lit

## Within 5 min and 2° of USNO.
