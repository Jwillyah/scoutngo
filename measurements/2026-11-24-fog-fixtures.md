# Fog, rain and wind fixtures, 21-23 Nov 2026, Virginia Beach

Written by `node scripts/measure-fog-fixtures.mjs` from the recording in `tests/data/wx-2026-11-21-24-vb/`. Times America/New_York unless marked Z.

## The capture run (scripts/capture-fog-fixtures.mjs)

fetch-log.json: fetched 2026-11-24T14:38:21.407Z, User-Agent `ScoutNGo (+https://github.com/Jwillyah/scoutngo)` and no other identifying header; 34 requests.

| status | bytes | url |
|---|---|---|
| 200 | 18891 | https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=36.851&longitude=-75.98&hourly=temperature_2m%2Cdew_point_2m%2Cvisibility%2Cwind_speed_10m%2Cwind_direction_10m%2Cwind_gusts_10m%2Cwind_speed_120m%2Cwind_direction_120m%2Cwind_speed_500hPa%2Cwind_direction_500hPa%2Cweather_code%2Cprecipitation%2Ccloud_cover%2Ccloud_cover_low%2Ccloud_cover_mid%2Ccloud_cover_high%2Cprecipitation_probability&minutely_15=precipitation&wind_speed_unit=ms&start_date=2026-11-21&end_date=2026-11-24&timezone=GMT |
| 200 | 18915 | https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=36.7&longitude=-76.3&hourly=temperature_2m%2Cdew_point_2m%2Cvisibility%2Cwind_speed_10m%2Cwind_direction_10m%2Cwind_gusts_10m%2Cwind_speed_120m%2Cwind_direction_120m%2Cwind_speed_500hPa%2Cwind_direction_500hPa%2Cweather_code%2Cprecipitation%2Ccloud_cover%2Ccloud_cover_low%2Ccloud_cover_mid%2Ccloud_cover_high%2Cprecipitation_probability&minutely_15=precipitation&wind_speed_unit=ms&start_date=2026-11-21&end_date=2026-11-24&timezone=GMT |
| 200 | 2587 | https://marine-api.open-meteo.com/v1/marine?latitude=36.851&longitude=-75.98&hourly=sea_surface_temperature&start_date=2026-11-21&end_date=2026-11-24&timezone=GMT |
| 200 | 204732 | https://www.ndbc.noaa.gov/data/realtime2/44099.txt |
| 200 | 146985 | https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=NTU&station=ORF&station=NFE&station=CPK&station=PVG&data=tmpf&data=dwpf&data=sknt&data=drct&data=gust&data=vsby&data=wxcodes&data=metar&sts=2026-11-21T00%3A00Z&ets=2026-11-24T12%3A00Z&tz=Etc%2FUTC&format=onlycomma&latlon=yes&missing=null&trace=0.0001&report_type=3&report_type=4 |
| 200 | 71053 | https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=wind&application=scoutngo&begin_date=20261121+00%3A00&end_date=20261124+12%3A00&station=8638999&time_zone=gmt&units=english&format=json |
| 200 | 115 | https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=visibility&application=scoutngo&begin_date=20261121+00%3A00&end_date=20261124+12%3A00&station=8638999&time_zone=gmt&units=english&format=json |
| 200 | 46199 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/35/48.png |
| 200 | 17809 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/36/48.png |
| 200 | 9216 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/37/48.png |
| 200 | 26087 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/35/49.png |
| 200 | 14542 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/36/49.png |
| 200 | 6790 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/37/49.png |
| 200 | 2077 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/35/50.png |
| 200 | 9602 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/36/50.png |
| 200 | 4864 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240350/7/37/50.png |
| 200 | 46850 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/35/48.png |
| 200 | 19991 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/36/48.png |
| 200 | 10835 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/37/48.png |
| 200 | 31334 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/35/49.png |
| 200 | 14462 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/36/49.png |
| 200 | 7121 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/37/49.png |
| 200 | 2346 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/35/50.png |
| 200 | 9707 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/36/50.png |
| 200 | 4494 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240400/7/37/50.png |
| 200 | 46314 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/35/48.png |
| 200 | 18871 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/36/48.png |
| 200 | 11463 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/37/48.png |
| 200 | 31129 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/35/49.png |
| 200 | 14335 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/36/49.png |
| 200 | 8105 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/37/49.png |
| 200 | 2315 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/35/50.png |
| 200 | 9427 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/36/50.png |
| 200 | 5227 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240410/7/37/50.png |

fetch-log-radar-truth.json: fetched 2026-11-24T14:42:28.863Z, User-Agent `ScoutNGo (+https://github.com/Jwillyah/scoutngo)` and no other identifying header; 5 requests.

| status | bytes | url |
|---|---|---|
| 200 | 14150 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240420/7/36/49.png |
| 200 | 14983 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240430/7/36/49.png |
| 200 | 15474 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240440/7/36/49.png |
| 200 | 16315 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240450/7/36/49.png |
| 200 | 16970 | https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611240500/7/36/49.png |

Spots: Atlantic Park Surf (36.851, -75.98, facing 100°) and Chesapeake (inland) (36.7, -76.3). Water at the beach: Open-Meteo Marine sea_surface_temperature (the app's source there: no station within 15 km). Stations: KNTU, KORF, KNFE, KCPK, KPVG (IEM ASOS, routine and special reports); Cape Henry CO-OPS 8638999 wind. Cape Henry answered "No data was found" for visibility: no station on the water near the beach reports visibility in this recording.

## Fog, before and after

Before: the app's two fog signals. The sky word says "Fog" only when the nearest fresh airport reads under 1 mile (src/core/skyWord.ts); the Sky page's special-light fog rule reads the forecast hour (src/core/specialLight.ts fogRule). After: src/core/fogRisk.ts with the station reports made by then. The sky call column feeds a Go into fogSkyCall.

| moment | spot | before: sky word | before: special-light rule | after: level, kind | after: line | Go becomes |
|---|---|---|---|---|---|---|
| 21 Nov 6:30 AM (6:30 AM) | beach | none (KNTU 10 mi) | none | moderate, radiation | Fog possible now | — |
| 21 Nov 6:30 AM (6:30 AM) | inland | none (KCPK 10 mi) | none | moderate, radiation | Fog possible now | — |
| 21 Nov sunrise (6:48 AM) | beach | none (KNTU 10 mi) | none | moderate, radiation | Fog possible now | Go |
| 21 Nov sunrise (6:48 AM) | inland | none (KCPK 10 mi) | none | moderate, radiation | Fog possible now | Go |
| 21 Nov 7:30 AM (7:30 AM) | beach | none (KNTU 8 mi) | none | high, radiation | Fog now | — |
| 21 Nov 7:30 AM (7:30 AM) | inland | none (KCPK 10 mi) | none | low, — | — | — |
| 23 Nov 8 AM (8:00 AM) | beach | Fog (KNTU 0.5 mi) | fog | high, reported | Fog now | — |
| 23 Nov 8 AM (8:00 AM) | inland | Fog (KCPK 0.25 mi) | fog | high, reported | Fog now | — |
| 23 Nov 11 AM (11:00 AM) | beach | none (KNTU 10 mi) | fog | low, — | Fog likely 2–6 PM | — |
| 23 Nov 11 AM (11:00 AM) | inland | none (KCPK 10 mi) | none | low, — | Fog likely 8–9 PM | — |
| 23 Nov 4:20 PM (4:20 PM) | beach | none (KNTU 10 mi) | none | high, sea | Fog on the beach | — |
| 23 Nov 4:20 PM (4:20 PM) | inland | none (KCPK 10 mi) | none | low, — | Fog likely 8–9 PM | — |
| 23 Nov sunset (4:50 PM) | beach | none (KNTU 10 mi) | none | high, sea | Fog on the beach | Maybe · "Color above the fog inland" |
| 23 Nov sunset (4:50 PM) | inland | none (KCPK 10 mi) | none | low, — | Fog likely 8–9 PM | Go |
| 23 Nov 4:55 PM (4:55 PM) | beach | none (KNTU 10 mi) | none | high, sea | Fog on the beach | — |
| 23 Nov 4:55 PM (4:55 PM) | inland | none (KCPK 10 mi) | none | low, — | Fog likely 8–9 PM | — |

Why, at the beach:

- 21 Nov 6:30 AM: air within 1.1 °F of its dew point (KNTU); wind 3 kt; clear-ish sky at night or early; visibility 9 mi or more
- 21 Nov sunrise: air within 1.1 °F of its dew point (KNTU); wind 3 kt; clear-ish sky at night or early; visibility 9 mi or more
- 21 Nov 7:30 AM: air within 0.9 °F of its dew point (KNTU); wind 3 kt; clear-ish sky at night or early; KNTU 8 mi MIFG
- 23 Nov 8 AM: KNTU 0.5 mi FG; KORF 2 mi BR; KNFE 1 mi BR; forecast visibility under 1/4 mi
- 23 Nov 11 AM: no rule held, nothing seen
- 23 Nov 4:20 PM: dew 62 °F (KNTU) at or above the water 59 °F less 1; wind 3 kt onshore
- 23 Nov sunset: dew 62 °F (KNTU) at or above the water 59 °F less 1; wind 3 kt onshore
- 23 Nov 4:55 PM: dew 62 °F (KNTU) at or above the water 59 °F less 1; wind 3 kt onshore

Read strictly, with every visibility allowed to step sea fog down (the airports' 10 mi and the forecast's), the beach at sunset is moderate, sea: "Fog possible now", and a Go stays Go. That is the batch's rule word for word, and it misses the fog Jwilly saw; src/core/fogRisk.ts lets only a station on the water step sea fog down (decision logged for Jwilly).

## Rain at 11:14 PM, 23 Nov, at the beach

Radar scans read: 3 (03:50, 04:00, 04:10Z). Motion of the tracked cells: toward 178° at 8.5 km/h. At the spot: no echo; 10 mi upstream: no echo; nearest rain (20 dBZ or more): 7.7 km at 43°.

Station reports with rain, 10 PM to midnight: KORF 11:36 PM `KORF 240436Z 02016G25KT 9SM -RA BKN030 OVC043 13/12 A3006`; KORF 11:51 PM `KORF 240451Z 02011G23KT 8SM -RA FEW013 OVC030 14/12 A3006`; KPVG 11:56 PM `KPVG 240456Z AUTO 03006KT 10SM -RA OVC029 14/14 A3008`.

Open-Meteo minutely_15 precipitation for the next 2 h at the beach (archive): 0, 0, 0, 0, 0, 0, 0, 0 mm.

What the radar did at the beach afterwards (centre tile, recorded for this check; the 3 x 3 grid is not recorded for these times, so a scan reads only the centre tile): 04:20Z no echo; 04:30Z no echo; 04:40Z no echo; 04:50Z no echo; 05:00Z no echo.

Nowcast: state nearby; line "Showers nearby · moving S"; by: radar rain 5 mi NE.

**The archive does not show rain at Atlantic Park Surf at 11:14 PM.** No station within 15 mi reported rain by then (KORF began at 11:17 PM), the composite had no echo over the beach from 11:10 PM to midnight, and the archived minutely_15 forecast was dry. The light rain Jwilly was told of fell near, not over, this spot: the nowcast says "Showers nearby", not "Light rain now". The "Light rain now · ends ~…" phrase is tested on made-up reads (tests/rainNow.test.ts), not on this fixture.

## The two winds at 11:14 PM (Section 1c)

- Cape Henry at 11:12 PM: 26.63 kt gusting 32.66 from 18° at its anemometer; carried to 10 m over the beach: 24.1 kt gusting 29.6 (factor 0.906). The front reached it at 10:42 PM (3.7 kt SW at 10:36, 20.6 kt N at 10:42).
- The model at 10 m for the half hour: 7.4 kt.
- Home Wind (windAt, leaned to the station): 22.4 kt gusting 27.7.
- Home Drone tile before: the briefing's day hours end at 8:30 PM, so at 11:14 PM it read 8:30 PM's model 120 m: 5.1 kt, with no station in it.
- Drone page before: the model's 120 m at the hour nearest now, no station: 22.2 kt.
- After (droneWindAt, both screens): 22.2 kt at 400 ft, model 120 m 22.2 kt, floored false; at least 0.9 of the surface 22.4 kt.

The archive's run has the front at 11 PM (120 m 22 kt); the phone's run that night evidently did not (it drew 8 kt). Either way the tile read the wrong hour and no station; tests/windAloft.test.ts holds both cases.
