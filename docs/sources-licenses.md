# Sources and licences

Every outside thing ScoutNGo touches. Generated from `src/core/credits.ts` by `node scripts/write-sources-doc.ts`; the in-app "Data & credits" page (/credits) shows the same list, and `tests/credits.test.ts` fails when a host in `src/lib/hosts.ts` has no row.

Status: **ok** used within its terms as far as we know · **fix** something to change · **check** terms not yet confirmed.

| Source | What we use | Licence / terms | Credit | Key | Rate limit | Status |
|---|---|---|---|---|---|---|
| OpenStreetMap | Place names, search, beaches, piers and parks near a spot | ODbL 1.0 (data); Nominatim and Overpass usage policies | © OpenStreetMap contributors | No | Nominatim: at most 1 request a second, no heavy use; Overpass: fair use | **ok** |
| OpenFreeMap | Map labels, buildings, the sea, the 3D view | Free to use; map data ODbL (OpenStreetMap), schema OpenMapTiles | OpenFreeMap © OpenMapTiles · Data from OpenStreetMap | No | None stated; fair use | **ok** |
| Esri World Imagery | The satellite photo under the map; South Carolina imagery for 3D | Esri Master Agreement / Terms of Use | Powered by Esri · Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community | The tile URL answers without one; Esri points developers to ArcGIS Location Platform (free tier, API key) | Free tier limits on ArcGIS Location Platform | **fix** · Needs an ArcGIS Location Platform key from Jwilly’s own Esri account (free tier), or a switch to USGS imagery in the US. Credit added. |
| State imagery (VGIN, NC OneMap, MD iMAP, Delaware FirstMap) | Sharper ground photos for the 3D view in those states | Public state services | Imagery: Virginia VGIN, NC OneMap, Maryland MD iMAP, Delaware FirstMap | No | None stated | **ok** |
| USGS (NAIP imagery, 3DEP lidar) | Ground photos for 3D in the lower 48; lidar scans when you tap Download | US public domain | USGS The National Map; USDA NAIP | No | None stated | **ok** |
| Terrain tiles (AWS Open Data, Terrarium) | Ground height for terrain and 3D | Open data; sources include SRTM, USGS 3DEP, GMTED, ETOPO1 | Terrain: Mapzen terrain tiles (SRTM, USGS, GMTED, ETOPO1) on AWS Open Data | No | None stated | **ok** |
| Overture Maps | Building heights, when you tap Fill in heights | ODbL (buildings), CDLA Permissive 2.0 (other themes) | © OpenStreetMap contributors, Overture Maps Foundation | No | None stated | **ok** |
| Open-Meteo | Wind, cloud, rain, waves, air quality, the five models; through this app’s forecast cache (/api/forecast), else asked directly | Data CC BY 4.0; free API for non-commercial use | Weather data by Open-Meteo.com (CC BY 4.0) | No (free tier) | 600 a minute, 5,000 an hour, 10,000 a day, per address | **ok** · No ads, no subscriptions. |
| ECMWF, NOAA GFS/HRRR, DWD ICON, Météo-France, JMA and others (through Open-Meteo) | The models behind Open-Meteo’s answers | Each centre’s open-data licence (ECMWF: CC BY 4.0) | Model data: ECMWF, NOAA, DWD, Météo-France, JMA (via Open-Meteo) | No | Through Open-Meteo | **ok** |
| NOAA / National Weather Service | Station reports, marine and rip current forecasts, alerts, storm outlooks, lightning, hurricanes, the K index | US public domain | NOAA / National Weather Service | No (a User-Agent is asked) | None published; reasonable use | **ok** |
| NOAA CO-OPS (tides) | Tide predictions, water levels, coastal station wind | US public domain | NOAA CO-OPS Tides & Currents | No | None published | **ok** |
| NOAA NDBC (buoys) | Buoy wave height, period and direction | US public domain | NOAA National Data Buoy Center | No | None published | **ok** |
| Aviation Weather Center (METARs, PIREPs) | Airport station reports and pilot reports of cloud | US public domain | NOAA Aviation Weather Center | No | About 100 requests a minute | **ok** |
| NASA GIBS | Satellite cloud pictures (GOES) on the map and for Sky color | NASA open data; no restrictions | Imagery: NASA EOSDIS GIBS | No | None stated | **ok** |
| Iowa Environmental Mesonet | Weather balloon soundings, radar along the sun’s line, station history, SPC watches | Free, public | Iowa Environmental Mesonet, Iowa State University | No | Fair use | **ok** |
| LibreWXR | Radar and satellite rain on the map | CC BY 4.0 | Radar: LibreWXR (CC BY 4.0) | No | None stated | **ok** |
| Photon (komoot) | Search, when OpenStreetMap finds nothing | Free public instance, fair use; data ODbL | Search: Photon by komoot · © OpenStreetMap contributors | No | Fair use; no heavy use | **ok** |
| Mapbox Search | Search, as the last try | Mapbox Terms of Service | Search by Mapbox | Yes, on the server (Vercel environment) | Free tier monthly allowance | **check** · Mapbox’s terms limit how geocoding results are shown and kept; confirm they allow results on a non-Mapbox map, else remove this last try. |
| Google Street View | The ground picture at a planned spot (this app’s /api/streetview) | Google Maps Platform Terms | Google | Yes, on the server (Vercel environment) | Google Maps Platform free monthly credit | **check** · Confirm the Street View Static API terms allow the picture shown as it is; the picture must carry Google’s logo and credit. |
| Beach and road cams (SurfChex, Surfline, piers, VDOT, NCDOT, DelDOT, MD CHART) | Links to the operator’s own page, in a new tab | Each operator’s terms | none asked | No | Not asked: nothing is fetched | **ok** · Link out only: no embed, no frame, no image, no logo, no numbers copied (tests/camsLinkOnly.test.ts). |
| GitHub | Settings: whether a newer build exists | GitHub Terms of Service | none asked | No | 60 requests an hour per address, unauthenticated | **ok** |
| Anthropic (your own key) | Writing the call sheet, only when you press Write | Anthropic terms, under your own key | none asked | Yes, yours, kept on your phone | Your key’s limits | **ok** |
| This app’s calendar feed | The calendar subscription (/api/calendar), asking the sources above | This app (MIT) | none asked | No | Each calendar app’s refresh | **ok** |

## Rules (Batch CORE, 16 Nov)

- Third-party surf sites (Surfline, Surfchex and the like): links that open their page in a new tab only. No embedding or framing of their cams or pages, no scraping, no copying their numbers into the app, no logos. Checked 16 Nov: the app links out only (src/components/CamsSheet.tsx, CamList.tsx, SurfPageV2.tsx, all `target="_blank"`); nothing embeds, frames, scrapes or copies. Nothing was removed.
- Cams: every cam the app lists is a link to its operator's page (src/data/coastCams.ts, src/data/vdotCams.ts; tests/camsLinkOnly.test.ts). None is embedded.
- Truth fixtures may carry a hand-written note such as "Surfline said Flat". Nothing fetches one automatically.
- Open-Meteo is asked from the phone; this app's cache (/api/forecast) only when Open-Meteo refuses the phone or cannot be reached.
- Licence: MIT (LICENSE), with its no-warranty clause. No keys are in the repository or its history (scanned 16 Nov for Anthropic, AWS, Google, Mapbox and GitHub key patterns: none; the only "sk-ant-" string is a test's placeholder).
