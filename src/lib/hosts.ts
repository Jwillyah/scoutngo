/*
 * EVERY HOST THE APP TALKS TO, WHAT IT LEARNS, AND WHEN. Shown on the How
 * page (What leaves the device) and held by tests/hosts.test.ts against the
 * hosts the network audits allow. Nothing about you is stored server-side:
 * this app's own functions log nothing and keep nothing.
 */
export interface Host {
  host: string
  who: string
  learns: string
  when: string
}

export const HOSTS: readonly Host[] = [
  { host: 'server.arcgisonline.com', who: 'Esri', learns: 'which map tiles: a map cell, not a point', when: 'whenever the map shows' },
  /* The free aerial imagery the 3D view picks from (src/data/imagerySources.ts): each only where it covers the venue. */
  { host: 'vginmaps.vdem.virginia.gov', who: 'Virginia (VGIN) imagery', learns: 'which map tiles: a map cell', when: 'the 3D view at a Virginia venue' },
  { host: 'services.nconemap.gov', who: 'NC OneMap imagery', learns: 'which map tiles: a map cell', when: 'the 3D view at a North Carolina venue' },
  { host: 'mdgeodata.md.gov', who: 'Maryland (MD iMAP) imagery', learns: 'which map tiles: a map cell', when: 'the 3D view at a Maryland venue' },
  { host: 'enterprise.firstmap.delaware.gov', who: 'Delaware (FirstMap) imagery', learns: 'which map tiles: a map cell', when: 'the 3D view at a Delaware venue' },
  { host: 'tiles.arcgis.com', who: 'South Carolina imagery, hosted by Esri', learns: 'which map tiles: a map cell', when: 'the 3D view at a South Carolina venue' },
  { host: 'imagery.nationalmap.gov', who: 'USDA NAIP imagery, from USGS', learns: 'which map tiles: a map cell', when: 'the 3D view in the lower 48 outside those states' },
  { host: 's3.amazonaws.com', who: 'AWS Terrarium elevation', learns: 'which elevation tiles: a map cell', when: 'with terrain or 3D on' },
  { host: 'tiles.openfreemap.org', who: 'OpenFreeMap', learns: 'which map tiles: a map cell', when: 'buildings, the sea, the 3D view' },
  { host: 'api.open-meteo.com', who: 'Open-Meteo', learns: 'the venue coordinate and dates', when: 'wind, cloud, the Tide sheet, the 3D sea' },
  { host: 'marine-api.open-meteo.com', who: 'Open-Meteo Marine', learns: 'the venue coordinate', when: 'the Tide sheet and the 3D sea, beaches only' },
  { host: 'api.tidesandcurrents.noaa.gov', who: 'NOAA tides', learns: 'a station number and dates', when: 'tides, and the water height in 3D' },
  { host: 'nominatim.openstreetmap.org', who: 'OpenStreetMap Nominatim', learns: 'what you search, or a pin to name', when: 'search and naming a pin' },
  { host: 'overpass-api.de', who: 'Overpass (and two mirrors)', learns: 'a box around the venue', when: 'trees and hazards' },
  { host: 's3-us-west-2.amazonaws.com', who: 'USGS 3DEP lidar', learns: 'which scan tiles: a map cell', when: 'only after you tap Download 3D scan' },
  { host: 'overturemaps-extras-us-west-2.s3.amazonaws.com', who: 'Overture Maps', learns: 'which tiles: a map cell', when: 'only after you tap Fill in heights' },
  { host: 'this app (/api/buoy)', who: 'this app', learns: 'a buoy number, never the venue', when: 'the surf row; it reads NOAA NDBC' },
]
