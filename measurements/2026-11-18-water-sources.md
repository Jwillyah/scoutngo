# The water temperature, its source at five spots (Batch 3D, Section 3.3)

Run: node scripts/measure-water-sources.mjs, 2026-11-18T01:46:43.774Z. askWater (src/lib/waterTemp.ts) with live CO-OPS, NDBC (realtime2, parsed by api/buoy.ts), USGS and Open-Meteo Marine (the spot on the 0.05° grid). Stations within 15 km first, then Open-Meteo's sea_surface_temperature for this hour, then USGS within 5 km, else "No water temp here". The sea at each spot: the map tiles' answer recorded 17 Nov for the Virginia spots, Wrightsville Beach's listed spot on the Atlantic.

| spot | at | source | reading | head (°F) | source line | asked |
|---|---|---|---|---|---|---|
| VB | 36.8418, -75.9738 | model | 14.7 °C | Water 58° · 4/3 | Open-Meteo model · not measured | https://marine-api.open-meteo.com/v1/marine |
| Croatan | 36.82, -75.97 | model | 14.9 °C | Water 59° · 4/3 | Open-Meteo model · not measured | https://marine-api.open-meteo.com/v1/marine |
| Sandbridge | 36.72, -75.93 | model | 14.9 °C | Water 59° · 4/3 | Open-Meteo model · not measured | https://marine-api.open-meteo.com/v1/marine |
| Lynnhaven | 36.91, -76.09 | model | 14.5 °C | Water 58° · 4/3 | Open-Meteo model · not measured | https://marine-api.open-meteo.com/v1/marine |
| Wrightsville Beach | 34.2104, -77.7964 | coops | 17.3 °C | Water 63° · 4/3 | Wrightsville Beach · under 1 mi · 11 min ago | https://api.tidesandcurrents.noaa.gov/api/prod/datagetter, ndbc 41110, ndbc 41038 |
