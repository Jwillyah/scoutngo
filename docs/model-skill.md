# The shared model-accuracy file

How each of the six weather models has been wrong at each station on the
Mid-Atlantic coast over the last 30 days, scored once a night for everyone
and published as one static file. The phone downloads the whole region's file
(the same bytes for every phone, no coordinates, no query string), picks the
nearest station itself, and corrects the blend with it. Batch L, Section 1.

- Made by `scripts/skill/build-shared.ts`, from the stations in
  `skill/<region>.json`. Scored with `src/core/sharedSkill.ts`, the same code
  the phone reads the file with.
- Read by `src/lib/sharedSkillData.ts`. Used when it is at most **3 days**
  old and has a station within **60 km** of the venue; otherwise the phone's
  own scoring (Batch K, `src/lib/blendData.ts`) is used. Never a mix.
- **Published nightly from the repository itself (Batch N, Section 0 F).**
  `.github/workflows/model-skill.yml` runs the script at 07:30 UTC into
  `public/skill/v1/<region>/` and commits that folder only; the next deploy
  serves it from the app's own host (`/skill/v1/...`), so the phone asks
  nobody else. Two days are kept (today and yesterday). GitHub Pages is not
  used.

## Sources

| What | Where | Notes |
|---|---|---|
| ASOS station reports | IEM `cgi-bin/request/asos.py`, routine reports | temp, dew point, wind, gust, direction, cloud layers, precipitation, weather codes |
| Buoy reports | NDBC `data/realtime2/<id>.txt`, 45 days | ATMP, DEWP, WSPD, GST, WDIR; no cloud, no rain |
| Forecasts | Open-Meteo previous runs, six models | lead `d0` is the plain variable, `d1` `_previous_day1`, `d2` `_previous_day2` |

## Never partial

The script exits non-zero and writes nothing when IEM or NDBC does not
answer, a configured station or buoy has no reports in the window, or a model
has no 0-24 h temperature at a station. Remove a station that has stopped
reporting from the config rather than publishing without it. (Removed on 3 Nov 2026 for that reason, by the script's own refusal: KTGI,
Tangier Island, no reports; buoy 44014, Virginia Beach offshore, no wind,
air temperature or dew point in the 30 days.)

## Files

```
skill/v1/<region>/<date>.json.gz   the file, gzipped; <date> is the local date it was made
skill/v1/<region>/latest.json      { schema, region, date, generated, file, bytes, rawBytes,
                                     sha256, stations, rows, history: [newest first, up to 7] }
```

The phone asks `latest.json`, then the file it names.

## Schema `scoutngo.model-skill/1`

```ts
{
  schema: 'scoutngo.model-skill/1',
  region: 'midatl', name: string, timeZone: 'America/New_York',
  generated: ISO instant, date: 'YYYY-MM-DD',
  window: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', days: 30 },   // local dates, inclusive
  models: ['ncep_nbm_conus', 'gfs_hrrr', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'gfs_global', 'icon_seamless'],
  vars: ['temp', 'dew', 'wind', 'gust', 'dir', 'cloud', 'rain'],
  leads: ['d0', 'd1', 'd2'],                                       // 0-24 h, 24-48 h, 48-72 h ahead
  stations: [{ id, kind: 'asos' | 'ndbc', name, lat, lon, obs }], // obs: hours scored
  cells: { [station]: { [model]: { [var]: { [lead]: Cell } } } },
  check: { [station]: { [model]: { rawBias, corrBias, rawMae, corrMae, n } } },
}

Cell = {          // each an array of 24, by local hour of the day in timeZone
  b: (number|null)[]   // mean error, forecast minus measured (the bias)
  m: (number|null)[]   // mean absolute error
  s: (number|null)[]   // the error's spread around its mean: what is left after the bias
  h: (number|null)[]   // hit rate: rain called right; for the rest, within TOL
  n: number[]          // hours scored
}
```

Units: temp and dew °C, wind and gust m/s, dir degrees (wrapped to ±180,
scored only when the measured wind is 2 m/s or more), cloud %. TOL: temp 2,
dew 2, wind 2, gust 3, dir 30, cloud 25. Rain is yes/no at 0.1 mm in the hour;
`b`, `m`, `s` are null for it. A cell with no hour scored is left out; HRRR
has no `d2` (it runs 48 h); AIFS has no gust.

Cloud is scored only when the station reports a layer (CLR means nothing
below 12,000 ft and says nothing above). A missing gust group is scored
against the steady wind.

`check` is a held-out test, temperature at `d0`: the bias of the first 23
days taken out of the last 7, and the bias and MAE before and after.

## How the phone uses it

`sharedScores()` answers the blend's questions (`src/core/modelSkill.ts`)
from the nearest station's cells: the bias at that hour and lead is
subtracted, the weight is `1 / max(FLOOR, s)²`, rain's weight is its hit rate.
A lead with no cell falls back to the nearest lead that has one; past 72 h
uses `d2`. Fewer than 3 hours in a cell: no correction there.
