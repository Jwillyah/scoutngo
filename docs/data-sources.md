# Data sources

Where the layers come from and what each licence asks. Airspace has its own page (docs/airspace-sources.md).

## World rain (Batch Map, Section 5, 9 Nov 2026)

The Rain layer draws LibreWXR's tiles (src/lib/worldRain.ts): radar where an
open network exists, NOAA's satellite rain estimate elsewhere, hatched on
the map. The client speaks the RainViewer v2 tile API, so LibreWXR's public
server or a copy this app runs work alike (`RAIN_HOST`).

| Source | Coverage | Licence, as published | Credit |
|---|---|---|---|
| LibreWXR public tiles (api.librewxr.net) | the merged world below | tiles CC BY 4.0 (Italy's DPC region CC BY-SA 4.0); software AGPL-3.0-or-later | "LibreWXR" |
| NOAA MRMS (via LibreWXR; the US layer on top stays Iowa State's N0Q composite) | US, Alaska, Hawaii, Puerto Rico | US Government work, public domain | NOAA |
| Environment and Climate Change Canada, MSC GeoMet | Canada | Open Government Licence – Canada | ECCC |
| EUMETNET OPERA composite | Europe, about 155 radars in 24 countries | CC BY 4.0 | EUMETNET OPERA |
| JMA | Japan | Public Data License 1.0, compatible with CC BY 4.0, commercial use allowed (jma.go.jp/jma/en/copyright.html, checked 9 Nov); forecasting services and warnings are separately regulated, and this is neither | Source: Japan Meteorological Agency |
| CWA | Taiwan | Open Government Data License, Taiwan, 1.0: reuse including commercial, attribution required (cwa.gov.tw/V8/E/information.html, checked 9 Nov) | Central Weather Administration |
| MetMalaysia | Malaysia | DROPPED (9 Nov): its open data page (met.gov.my/en/info/data-terbuka) lists forecasts, warnings and climate, not radar | none: cleared from the tiles on the phone |
| PAGASA | the Philippines | DROPPED (9 Nov): its radar is marked "All Rights Reserved" and its data terms forbid public redistribution | none: cleared from the tiles on the phone |
| NOAA RRQPE (GOES / Himawari / Meteosat) | the gaps, 60°S to 70°N | US Government work, public domain | NOAA NESDIS |

Not used: RainViewer's own free API (personal and educational use only since
2026, zoom capped at 7, no forecast).

Public server or our own: the public server costs nothing and needs no key;
it states no rate limit and promises no uptime, and the phone asks it for
map tiles only (a map cell, like any tile host). Running our own copy is
Docker Compose (`ghcr.io/joshuakimsey/librewxr`): one or two render workers
on a small server, about 16 GB of memory at production size, and we would
owe AGPL source to its users. Decision for Jwilly; the public server is wired
in now.

In Malaysia and the Philippines the map draws no rain at all now: LibreWXR
merges radar and the satellite estimate into one tile, so clearing the
radar clears the estimate there too (src/lib/worldRain.ts DROPPED). Both
are hatched with the rest of the world that has no radar.
