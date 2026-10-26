# Not built, and why

From the combined brief of 25 October 2026. Each was looked at, not guessed at.

## Eye-level view (phase 8, stretch): MapLibre cannot do it well

Tried on the running app at Brew River Dock Bar, MapLibre GL 6.8.0.

- `calculateCameraOptionsFromCameraLngLatAltRotation` for a camera 1.6 m up
  threw on every height and pitch tried (1.6, 30 and 150 m; 75, 85 and 89
  degrees) once its roll was applied: the camera matrix would not invert. With
  the roll removed it returned the same zoom 12.9 view whatever height was
  asked for.
- Setting the camera directly does reach near eye level: zoom 22 at the 85
  degree pitch limit puts MapLibre's camera about 3 m above the ground.
- What it shows there is the problem. The ground is the satellite photograph
  stretched along the line of sight into smears; there are no facades, trees
  or skyline, and the only things standing up are building boxes where
  OpenStreetMap has a height (4 of 321 at this venue). It looks like a view and
  is not one, which is worse than no view.

The viewfinder (phase 5) is the honest eye-level view: the real scene through
the phone's camera, with the sun's path and the frames drawn on it.

The 3D pass (October 2026) builds an eye-level view in CesiumJS instead, on a
clay model that says what it is: buildings from map data, unknown heights
shown lighter.

## Photorealistic 3D: decided against, for privacy

**Decision, 26 October 2026: not built.** Every Photorealistic 3D tile
request tells Google the area being looked at, which is the venue, and the
viewer's IP address with it. That is the coordinate leaving the device, which
the privacy rule does not allow. The 3D view is CesiumJS drawing a clay model
from the data the app already fetches (Esri imagery, AWS Terrarium elevation,
OpenStreetMap buildings), with no Google and no Cesium ion.

The cost and terms, as looked at before the decision:


Google Map Tiles API, Photorealistic 3D Tiles: $6.00 per 1,000 root tileset
requests after a free 1,000 a month, falling to $2.40 per 1,000 past five
million, with a 10,000 a day root request quota
(developers.google.com/maps/documentation/tile/usage-and-billing).

The cost is not the blocker. Every tile request tells Google where the map is
looking, which is the venue: "the venue coordinate never leaves the device"
rules it out as a default. It would also need a ScoutNGo Google API key shipped
in the page and billing behind it. If it ever comes back it can only be like
the call sheet: the shooter's own key, off by default, saying what it sends.

## Light pollution map: licensing

The New World Atlas of Artificial Night Sky Brightness (Falchi et al. 2016),
the source most light pollution maps redraw, is CC BY-NC 4.0 since 13 November
2019 (lightpollution.it/worldatlas/pages/copyright.html). Non-commercial: fine
for a free app with attribution, not if ScoutNGo is ever sold or used for paid
work by its maker, which it is. It is also a 2.9 GB 30 arc-second GeoTIFF from
2015 VIIRS data and reports artificial light only.

The raw VIIRS Day/Night Band composites from NASA and NOAA are public domain,
but are upward radiance, not sky brightness at the observer: turning one into
the other is the radiative transfer the atlas did. Not built: the licensed
product does not fit paid work, and the free one would need modelling the
brief did not ask for.
