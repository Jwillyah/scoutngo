# Accuracy report

`node scripts/measure-accuracy.mjs` sets every number the Today briefing shows
against what was observed, for the 7 days ending yesterday (America/New_York),
at VB Pier, Sandbridge and Chix:

| item | forecast | observed | hit |
|---|---|---|---|
| air, wind, gust (hourly, and the day's strongest) | Open-Meteo previous runs, the briefing's variables, d0 and d1 | ASOS KNTU / KORF (Iowa State archive), the nearer | 2 °C, 5 kt |
| wave height, period, surf face and its word | Open-Meteo Marine, as the Surf page asks | NDBC 44099 / 44100, the nearer, in the same water | 1 ft, 2 s, same word |
| tide turn time and height | NOAA predictions | the nearest water-level gauge: verified highs and lows, else turns found in the preliminary 6-minute levels | 15 min, 0.5 ft |
| sunset call | the app's call | a truth or fire log exported from the phone (`--sunset-log <file>`) | — |

The arithmetic is `src/core/accuracy.ts` (tested in `tests/accuracy.test.ts`
on fixtures). The app's own functions make the numbers being scored:
`surfDay.surfAt` and `surf.surfEstimate` for the surf, `briefing.kt` for knots,
`blendData.skillStations` for the stations, `core/tide.nearestStations` for the
tide station, `sharedSkill.errorOf` for each error.

Things it will not do: score the sea at a spot with no buoy in its water (Chix,
on the bay), score a tide against a gauge kilometres away as if it were the
spot (that is printed for information only), or fill in a sunset outcome no
log gives. Each of those is listed under "Could not measure" or "Needs
Jwilly's log" in the report.

The first run is `measurements/2026-11-accuracy.md`. The batch asked for that
name; the measurement audit checks that a cited file exists and holds the
numbers quoted, not the shape of its name, so it is accepted as it is.

## Nightly, later

It is meant to run every night in CI, the way the shared model-skill file is
(docs/model-skill.md), so the table is a running record rather than one week.
**Not now**: there is no workflow for it and none should be added until it is
asked for. When it is, it should:

- pass `--out measurements/<ISO date>-accuracy.md`, so each night is its own
  file and none overwrites the last (the default name is per month);
- run outside the commit gate, which never reaches a live host (docs/gate.md);
- fail the job on exit 1 or 2 (a kind of row with nothing scored, or nothing
  scored at all), rather than publish an empty table.
