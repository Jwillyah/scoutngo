/*
 * EVERY HOST THE APP TALKS TO, WHAT IT LEARNS, AND WHEN. Shown on the How
 * page (What leaves the device) and held by tests/hosts.test.ts against the
 * hosts the network audits allow. Nothing about you is stored server-side:
 * this app's own functions log nothing and keep nothing.
 */
/**
 * When it is asked: ALWAYS (the map is up), ON PIN (a venue is set, without a
 * tap), IF YOU TAP (only after you open or press the thing named). The
 * privacy page (PrivacyPage.tsx) shows these words.
 */
export type HostTrigger = 'always' | 'on-pin' | 'if-you-tap'
export const TRIGGER_WORD: Record<HostTrigger, string> = { always: 'ALWAYS', 'on-pin': 'ON PIN', 'if-you-tap': 'IF YOU TAP' }

export interface Host {
  host: string
  who: string
  learns: string
  when: string
  trigger: HostTrigger
}

export const HOSTS: readonly Host[] = [
  { host: 'server.arcgisonline.com', who: 'Esri', learns: 'which map tiles: a map cell, not a point', when: 'whenever the map shows', trigger: 'always' },
  /* The free aerial imagery the 3D view picks from (src/data/imagerySources.ts): each only where it covers the venue. */
  { host: 'vginmaps.vdem.virginia.gov', who: 'Virginia (VGIN) imagery', learns: 'which map tiles: a map cell', when: 'the 3D view at a Virginia venue', trigger: 'if-you-tap' },
  { host: 'services.nconemap.gov', who: 'NC OneMap imagery', learns: 'which map tiles: a map cell', when: 'the 3D view at a North Carolina venue', trigger: 'if-you-tap' },
  { host: 'mdgeodata.md.gov', who: 'Maryland (MD iMAP) imagery', learns: 'which map tiles: a map cell', when: 'the 3D view at a Maryland venue', trigger: 'if-you-tap' },
  { host: 'enterprise.firstmap.delaware.gov', who: 'Delaware (FirstMap) imagery', learns: 'which map tiles: a map cell', when: 'the 3D view at a Delaware venue', trigger: 'if-you-tap' },
  { host: 'tiles.arcgis.com', who: 'South Carolina imagery, hosted by Esri', learns: 'which map tiles: a map cell', when: 'the 3D view at a South Carolina venue', trigger: 'if-you-tap' },
  { host: 'imagery.nationalmap.gov', who: 'USDA NAIP imagery, from USGS', learns: 'which map tiles: a map cell', when: 'the 3D view in the lower 48 outside those states', trigger: 'if-you-tap' },
  { host: 's3.amazonaws.com', who: 'AWS Terrarium elevation', learns: 'which elevation tiles: a map cell', when: 'with terrain or 3D on', trigger: 'on-pin' },
  { host: 'tiles.openfreemap.org', who: 'OpenFreeMap', learns: 'which map tiles: a map cell', when: 'buildings, the sea, the 3D view', trigger: 'on-pin' },
  { host: 'api.open-meteo.com', who: 'Open-Meteo (directly only when this app\u2019s forecast cache does not answer)', learns: 'the venue to 2 decimals (about a kilometre) and dates; for Sky color, eight points toward the sun, and for Special light nine points round the venue, to 2 decimals', when: 'wind, cloud, Sky color, Special light, the Tide sheet, the 3D sea', trigger: 'on-pin' },
  { host: 'air-quality-api.open-meteo.com', who: 'Open-Meteo air quality', learns: 'the venue to 2 decimals (about a kilometre) and a date', when: 'Sky › Preview, for how hazy the air is; Sky color, in the three hours before a sunrise or sunset', trigger: 'on-pin' },
  { host: 'ensemble-api.open-meteo.com', who: 'Open-Meteo ensemble (GFS, 31 runs)', learns: 'eight points toward the sun, to 2 decimals, and a date: the same points Sky color asks; for Sky › Weather, the venue to 2 decimals', when: 'Sky color, in the three hours before a sunrise or sunset; Sky › Weather, the rain odds', trigger: 'on-pin' },
  { host: 'previous-runs-api.open-meteo.com', who: 'Open-Meteo previous runs', learns: 'the two nearest weather stations\u2019 own positions (not the venue) and how many days back', when: 'Sky › Weather, at most once a day: what each model forecast the day before, to score it against the stations', trigger: 'if-you-tap' },
  { host: 'marine-api.open-meteo.com', who: 'Open-Meteo Marine', learns: 'the venue to 2 decimals (about a kilometre)', when: 'the Tide sheet and the 3D sea, beaches only', trigger: 'on-pin' },
  { host: 'api.tidesandcurrents.noaa.gov', who: 'NOAA tides', learns: 'a station number and dates', when: 'tides, and the water height in 3D', trigger: 'on-pin' },
  { host: 'nominatim.openstreetmap.org', who: 'OpenStreetMap Nominatim', learns: 'what you search, or a pin to name', when: 'search and naming a pin', trigger: 'on-pin' },
  { host: 'overpass-api.de', who: 'Overpass (and two mirrors)', learns: 'a box around the venue', when: 'trees and hazards', trigger: 'on-pin' },
  { host: 's3-us-west-2.amazonaws.com', who: 'USGS 3DEP lidar', learns: 'which scan tiles: a map cell', when: 'only after you tap Download 3D scan', trigger: 'if-you-tap' },
  { host: 'overturemaps-extras-us-west-2.s3.amazonaws.com', who: 'Overture Maps', learns: 'which tiles: a map cell', when: 'only after you tap Fill in heights', trigger: 'if-you-tap' },
  { host: 'api.weather.gov', who: 'US National Weather Service', learns: 'the venue to 2 decimals (about a kilometre), then station ids and its forecast office', when: 'the home at a beach: the marine zone off it and that zone\u2019s alerts (Small Craft Advisory and the like); Sky › Weather, the alerts in force at the venue, and every severe thunderstorm and tornado warning in force in the country, asked with no place (which are upstream is worked out on the phone); the Water card and Surf page, the beach to 2 decimals (and points 1.5 and 3 km round it, for its land zone) for the rip current risk and the marine forecast; the Cloud chip and Sky color, when the time on the bar is within two hours of now; Sky color in the two hours before a sunrise or sunset; in the three hours before, the stations along the sun\u2019s line and the office\u2019s forecast discussion', trigger: 'on-pin' },
  { host: 'this app (/api/forecast)', who: 'this app\u2019s forecast cache, asking Open-Meteo', learns: 'the Open-Meteo request: the spot (or the points toward the sun) on a 0.05° grid, about 5 km, and the hour; it caches nothing finer, keeps answers only in the CDN\u2019s cache for the hour and logs nothing', when: 'every forecast: weather, wind, sea, Sky color, Special light; Open-Meteo then sees this app, not your phone', trigger: 'on-pin' },
  { host: 'this app (/api/metar)', who: 'this app', learns: 'a station id, never the venue', when: 'Sky color, when weather.gov has no METAR text; it reads aviationweather.gov', trigger: 'if-you-tap' },
  { host: 'this app (/api/pirep)', who: 'this app', learns: 'a station id, never the venue', when: 'Sky color and Today, in the three hours before a sunrise or sunset: pilots\u2019 reports of cloud bases and tops; it reads aviationweather.gov', trigger: 'on-pin' },
  { host: 'mesonet.agron.iastate.edu', who: 'Iowa Environmental Mesonet (Iowa State)', learns: 'a sounding site\u2019s id and a launch time; radar tiles along the sun\u2019s line, a map cell; two station ids and dates; every SPC watch and discussion in force, whole', when: 'Sky color and Today, in the three hours before a sunrise or sunset; Sky › Weather once a day, the stations\u2019 hourly reports to score the models; and while it is open, radar tiles round the venue (map cells) every 5 minutes, and the radar map\u2019s frames when you turn it on', trigger: 'on-pin' },
  { host: 'www.spc.noaa.gov', who: 'NOAA Storm Prediction Center', learns: 'nothing about you: the national day 1 and day 2 outlooks, whole (which one holds the venue is worked out on the phone)', when: 'Sky › Weather', trigger: 'if-you-tap' },
  { host: 'nowcoast.noaa.gov', who: 'NOAA nowCOAST', learns: 'a box round the venue to a tenth of a degree (about 10 km), and four times', when: 'Sky › Weather, every 5 minutes while it is open: the lightning map', trigger: 'if-you-tap' },
  { host: 'this app (/api/nhc)', who: 'this app', learns: 'nothing: it asks the National Hurricane Center for the active storms, and a storm\u2019s wind odds by the NHC\u2019s own link', when: 'the Surf page; which storm is near is worked out on the phone', trigger: 'if-you-tap' },
  { host: 'this app (/api/buoy)', who: 'this app', learns: 'a buoy number, never the venue', when: 'the surf row; it reads NOAA NDBC', trigger: 'on-pin' },
  /* Asked only when you open or press the thing named (29 Oct: these five were missing from this list). */
  { host: 'gibs.earthdata.nasa.gov', who: 'NASA GIBS satellite imagery', learns: 'which satellite tiles: a map cell', when: 'the satellite cloud layer; and Sky color and Today in the three hours before a sunrise or sunset, along the sun\u2019s line', trigger: 'on-pin' },
  { host: 'photon.komoot.io', who: 'Photon (komoot), a place search', learns: 'what you search', when: 'search, when OpenStreetMap finds nothing', trigger: 'if-you-tap' },
  { host: 'this app (/api/search)', who: 'this app, asking Mapbox', learns: 'what you search, never who you are', when: 'search, as the last try', trigger: 'if-you-tap' },
  { host: 'api.github.com', who: 'GitHub', learns: 'the app’s public repository name, nothing about you', when: 'Settings, to say whether a newer build exists', trigger: 'if-you-tap' },
  { host: 'api.anthropic.com', who: 'Anthropic, with your own key', learns: 'what you ask it to write, sent with your key', when: 'only when you press Write on the call sheet', trigger: 'if-you-tap' },
]
