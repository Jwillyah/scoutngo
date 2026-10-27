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
  { host: 's3.amazonaws.com', who: 'AWS Terrarium elevation', learns: 'which elevation tiles: a map cell', when: 'with terrain or 3D on' },
  { host: 'tiles.openfreemap.org', who: 'OpenFreeMap', learns: 'which map tiles: a map cell', when: 'buildings, the sea, the 3D view' },
  { host: 'api.open-meteo.com', who: 'Open-Meteo', learns: 'the venue coordinate and dates', when: 'wind, cloud, the Tide sheet' },
  { host: 'marine-api.open-meteo.com', who: 'Open-Meteo Marine', learns: 'the venue coordinate', when: 'the Tide sheet, beaches only' },
  { host: 'api.tidesandcurrents.noaa.gov', who: 'NOAA tides', learns: 'a station number and dates', when: 'tides' },
  { host: 'nominatim.openstreetmap.org', who: 'OpenStreetMap Nominatim', learns: 'what you search, or a pin to name', when: 'search and naming a pin' },
  { host: 'overpass-api.de', who: 'Overpass (and two mirrors)', learns: 'a box around the venue', when: 'trees and hazards' },
  { host: 's3-us-west-2.amazonaws.com', who: 'USGS 3DEP lidar', learns: 'which scan tiles: a map cell', when: 'only after you tap Download 3D scan' },
  { host: 'overturemaps-extras-us-west-2.s3.amazonaws.com', who: 'Overture Maps', learns: 'which tiles: a map cell', when: 'only after you tap Fill in heights' },
  { host: 'this app (/api/buoy)', who: 'this app', learns: 'a buoy number, never the venue', when: 'the surf row; it reads NOAA NDBC' },
]
