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
| JMA | Japan | JMA's terms: reuse with credit | Japan Meteorological Agency |
| CWA | Taiwan | Taiwan Government Open Data Licence 1.0 | Central Weather Administration |
| MetMalaysia | Malaysia | as LibreWXR publishes it; not checked against MetMalaysia's own terms | MetMalaysia |
| PAGASA | the Philippines | as LibreWXR publishes it; not checked against PAGASA's own terms | PAGASA |
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
