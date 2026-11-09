/*
 * WHAT THE OUTSIDE WORLD SAYS DURING THE GATE: A FIXED ANSWER FOR EVERY HOST.
 *
 * WHY. The gate took about half an hour and used live services: the 3D
 * network audit waited on real imagery and timed out five times in Batch C,
 * and the audits used up Open-Meteo's daily allowance for the home IP, which
 * then starved the phone on the same Wi-Fi (30 Oct). A check that depends on
 * somebody else's server is measuring that server.
 *
 * So every request the app makes to another host is answered here, from the
 * repo: weather, sea and air from scripts/openMeteoFake.mjs, tides from a
 * generated curve, NWS and METAR and the buoy from saved text, imagery and
 * elevation drawn in code, and the map's vector tiles from a small recorded
 * set (scripts/gate/tiles/, scripts/gate/record-tiles.mjs). A tile that
 * was not recorded is an empty tile, the same every run.
 *
 * `answer(url)` resolves to { status, type, body, fixture } and never touches the
 * network. `fixture` names which fixture answered, for the ledger; 'none'
 * means no fixture covers that host and the request got a 404.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeAnswer } from '../openMeteoFake.mjs'
import { encodePng } from '../../src/lib/png.ts'
import { encodeTestTile } from '../../src/lib/mvtTestTile.ts'

const ROOT = new URL('../..', import.meta.url).pathname
export const TILE_DIR = join(ROOT, 'scripts/gate/tiles')

/** The day the fixtures pretend it is, when a request names no date. */
export const FIXTURE_NOW = new Date('2026-10-30T11:30:00Z')

/*
 * Imagery: a fixed speckle of green-greys, the same on every tile, so nothing
 * in a screenshot can be mistaken for a real place and there is still detail
 * for a check that measures what a layer hides (the buildings audit).
 */
const IMAGERY = await (async () => {
  const size = 256
  const data = new Uint8ClampedArray(size * size * 4)
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  /* 8 px cells, so the detail survives the map's resampling at any zoom. */
  const cells = Array.from({ length: (size / 8) ** 2 }, () => 50 + Math.floor(rand() * 110))
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = cells[(y >> 3) * (size / 8) + (x >> 3)]
      data.set([v - 10, v + 20, v, 255], (y * size + x) * 4)
    }
  }
  return Buffer.from(await encodePng({ width: size, height: size, data }))
})()
const OVERLAY = Buffer.from(await encodePng({ width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4) }))

/*
 * ELEVATION, DRAWN. Terrarium encodes metres as R*256 + G + B/256 - 32768.
 * Zero at the sea, rising inland: a smooth swell of ground west of 78.0° W
 * reaching 120 m by 78.5° W, with a 60 m hill pattern on it, so a terrain
 * check at a coastal venue finds the ground flat and one inland (Big Meadows,
 * 78.4° W) finds relief. Virginia Beach and Wrightsville stay at a metre.
 */
export function fixtureElevation(lat, lon) {
  /* West of 78° W only: Wrightsville Beach (77.8° W) is a beach, not hills (Batch D: its sea stood 120 m up). */
  const inland = Math.max(0, Math.min(1, (-78.0 - lon) / 0.5))
  const hills = 60 * inland * (0.5 + 0.5 * Math.sin(lat * 400) * Math.cos(lon * 400))
  return 1 + 120 * inland + hills
}
const terrainCache = new Map()
async function terrainTile(z, x, y) {
  const key = `${z}/${x}/${y}`
  if (terrainCache.has(key)) return terrainCache.get(key)
  const size = 256
  const data = new Uint8ClampedArray(size * size * 4)
  const n = 2 ** z
  for (let py = 0; py < size; py += 1) {
    const ty = (y + (py + 0.5) / size) / n
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * ty))) * 180) / Math.PI
    for (let px = 0; px < size; px += 1) {
      const lon = ((x + (px + 0.5) / size) / n) * 360 - 180
      const v = fixtureElevation(lat, lon) + 32768
      const r = Math.floor(v / 256)
      const g = Math.floor(v - r * 256)
      const b = Math.round((v - r * 256 - g) * 256) & 255
      data.set([r, g, b, 255], (py * size + px) * 4)
    }
  }
  const png = Buffer.from(await encodePng({ width: size, height: size, data }))
  if (terrainCache.size > 400) terrainCache.clear()
  terrainCache.set(key, png)
  return png
}

const EMPTY_TILE = Buffer.from(encodeTestTile({}))

function vectorTile(z, x, y) {
  const file = join(TILE_DIR, 'openfreemap', String(z), String(x), `${y}.pbf`)
  if (existsSync(file)) return { body: readFileSync(file), fixture: 'recorded vector tile' }
  return { body: EMPTY_TILE, fixture: 'empty vector tile (not recorded)' }
}

/* ------------------------------------------------------------------- tides */
const ymd = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
function noaa(u) {
  if (u.pathname.includes('/mdapi/')) {
    if (/datums/.test(u.pathname)) return { datums: [{ name: 'MHHW', value: 3.4 }, { name: 'MHW', value: 3.2 }, { name: 'MSL', value: 1.8 }, { name: 'MLW', value: 0.4 }, { name: 'MLLW', value: 0 }, { name: 'NAVD88', value: 1.9 }], units: 'feet' }
    return {
      stations: [
        { id: '8638863', name: 'Chesapeake Bay Bridge Tunnel (fixture)', lat: 36.9667, lng: -76.1133, state: 'VA', type: 'R' },
        { id: '8658163', name: 'Wrightsville Beach (fixture)', lat: 34.2133, lng: -77.7867, state: 'NC', type: 'R' },
        { id: '8571421', name: 'Bishops Head (fixture)', lat: 38.22, lng: -76.0383, state: 'MD', type: 'R' },
      ],
    }
  }
  const begin = u.searchParams.get('begin_date')
  const end = u.searchParams.get('end_date')
  const t0 = begin ? ymd(begin) : Date.parse(FIXTURE_NOW.toISOString().slice(0, 10))
  const t1 = (end ? ymd(end) : t0) + 86_400_000
  const fmt = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ')
  const period = 12.42 * 3_600_000
  const level = (t) => 1.8 + 1.6 * Math.cos((2 * Math.PI * (t - Date.UTC(2026, 9, 30, 3))) / period)
  if (u.searchParams.get('interval') === 'hilo') {
    const out = []
    const first = Date.UTC(2026, 9, 30, 3) + Math.ceil((t0 - Date.UTC(2026, 9, 30, 3)) / (period / 2)) * (period / 2)
    for (let t = first; t < t1; t += period / 2) out.push({ t: fmt(t), v: level(t).toFixed(3), type: level(t) > 1.8 ? 'H' : 'L' })
    return { predictions: out }
  }
  const step = u.searchParams.get('interval') === 'h' ? 3_600_000 : 360_000
  const out = []
  for (let t = t0; t < t1; t += step) out.push({ t: fmt(t), v: level(t).toFixed(3) })
  return { predictions: out }
}

/* --------------------------------------------------------------- the rest */
/* 44099's spectral summary as published on 2 Nov 2026 (tests/data/ndbc-2026-11-02/44099.spec). */
const NDBC_SPEC = readFileSync(new URL('../../tests/data/ndbc-2026-11-02/44099.spec', import.meta.url), 'utf8')
const NDBC_TEXT = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 10 30 11 20 200  4.0  6.0   0.6     8   6.1  95 1016.2  15.0  18.0  12.0   MM   MM    MM
`
const METAR = 'KORF 301051Z 20008KT 10SM FEW040 SCT120 BKN250 15/12 A3001 RMK AO2 SLP162'

/*
 * IEM's hourly reports for the stations asked, every hour of the range at :51:
 * 57 °F, 8 kt, a broken deck, dry. The fake models say 15 °C (59 °F), so
 * every model scores about +1.1 °C warm, the same every run.
 */
function asosCsv(u) {
  const ids = u.searchParams.getAll('station')
  const t0 = Date.parse(u.searchParams.get('sts') ?? FIXTURE_NOW.toISOString())
  const t1 = Math.min(Date.parse(u.searchParams.get('ets') ?? FIXTURE_NOW.toISOString()), t0 + 40 * 86_400_000)
  const rows = ['station,valid,tmpf,sknt,gust,skyc1,skyc2,skyc3,skyc4,p01i,wxcodes']
  for (let t = Math.floor(t0 / 3_600_000) * 3_600_000 + 51 * 60_000; t <= t1; t += 3_600_000) {
    for (const id of ids) rows.push(`${id},${new Date(t).toISOString().slice(0, 16).replace('T', ' ')},57.00,8.00,null,BKN,null,null,null,0.00,null`)
  }
  return rows.join('\n')
}

const json = (value, fixture) => ({ status: 200, type: 'application/json', body: Buffer.from(JSON.stringify(value)), fixture })
const text = (value, type, fixture) => ({ status: 200, type, body: Buffer.from(value), fixture })

/** The fixed answer for a request to another host. Pure: no network, ever. */
export async function answer(href) {
  const u = new URL(href)
  const host = u.hostname
  if (/(^|\.)open-meteo\.com$/.test(host)) return json(fakeAnswer(href, FIXTURE_NOW), 'Open-Meteo fake')
  if (host === 'api.tidesandcurrents.noaa.gov') return json(noaa(u), 'tide curve')
  if (host === 'server.arcgisonline.com' && /World_Imagery/.test(u.pathname)) return { status: 200, type: 'image/png', body: IMAGERY, fixture: 'flat imagery' }
  if (host === 'server.arcgisonline.com') return { status: 200, type: 'image/png', body: OVERLAY, fixture: 'clear overlay' }
  if (/vdem\.virginia\.gov|nconemap\.gov|mdgeodata\.md\.gov|firstmap\.delaware\.gov|tiles\.arcgis\.com|nationalmap\.gov|gibs\.earthdata\.nasa\.gov/.test(host)) return { status: 200, type: 'image/png', body: IMAGERY, fixture: 'flat imagery' }
  if (host === 's3.amazonaws.com' && /elevation-tiles-prod/.test(u.pathname)) {
    const m = /terrarium\/(\d+)\/(\d+)\/(\d+)\.png/.exec(u.pathname)
    if (m) return { status: 200, type: 'image/png', body: await terrainTile(+m[1], +m[2], +m[3]), fixture: 'drawn elevation' }
  }
  if (host === 'tiles.openfreemap.org') {
    const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(u.pathname)
    if (m) {
      const t = vectorTile(+m[1], +m[2], +m[3])
      return { status: 200, type: 'application/x-protobuf', body: t.body, fixture: t.fixture }
    }
  }
  if (/^overpass/.test(host) || host === 'overpass-api.de') return json({ version: 0.6, elements: [] }, 'empty Overpass')
  if (host === 'nominatim.openstreetmap.org') {
    if (u.pathname.startsWith('/reverse')) return json({ display_name: 'Fixture Place, Virginia Beach, Virginia', name: 'Fixture Place', address: { city: 'Virginia Beach', state: 'Virginia', country_code: 'us' } }, 'Nominatim fixture')
    return json([], 'Nominatim fixture')
  }
  if (host === 'photon.komoot.io') return json({ type: 'FeatureCollection', features: [] }, 'Photon fixture')
  if (host === 'api.weather.gov') return { status: 503, type: 'application/json', body: Buffer.from('{}'), fixture: 'NWS unavailable' }
  if (host === 'www.ndbc.noaa.gov' && u.pathname.endsWith('.spec')) return text(NDBC_SPEC, 'text/plain', 'NDBC spectral summary')
  if (host === 'www.ndbc.noaa.gov') return text(NDBC_TEXT, 'text/plain', 'NDBC buoy text')
  if (host === 'aviationweather.gov') return text(METAR, 'text/plain', 'METAR text')
  /* Soundings: none launched in the fixture's world; radar: no echoes (a clear tile). */
  if (host === 'mesonet.agron.iastate.edu' && u.pathname.startsWith('/json/raob')) return json({ profiles: [] }, 'no sounding')
  if (host === 'mesonet.agron.iastate.edu' && u.pathname.startsWith('/cgi-bin/request/asos.py')) return text(asosCsv(u), 'text/plain', 'station reports')
  /* The SPC outlooks, watches and discussions: none over anywhere in the fixture's world. */
  if (host === 'www.spc.noaa.gov' || (host === 'mesonet.agron.iastate.edu' && u.pathname.startsWith('/api/1/'))) return json({ type: 'FeatureCollection', features: [] }, 'no SPC risk')
  if (host === 'mesonet.agron.iastate.edu' && u.pathname.endsWith('/USCOMP/n0q_0.json')) return json({ meta: { product: 'N0Q', site: 'USCOMP', valid: new Date(Math.floor(FIXTURE_NOW.getTime() / 300_000) * 300_000).toISOString().replace('.000', '') } }, 'radar composite time')
  /* Lightning: no strikes in the fixture's world (a clear map). */
  if (host === 'nowcoast.noaa.gov') return { status: 200, type: 'image/png', body: OVERLAY, fixture: 'no lightning' }
  /* Batch Map, Section 5: the world's rain (LibreWXR, RainViewer v2 API): frames every 10 minutes to the fixture's now, and clear tiles. */
  if (host === 'api.librewxr.net' && u.pathname === '/public/weather-maps.json') {
    const now = Math.floor(FIXTURE_NOW.getTime() / 600_000) * 600
    const past = Array.from({ length: 13 }, (_, i) => ({ time: now - (12 - i) * 600, path: `/v2/radar/${now - (12 - i) * 600}` }))
    return json({ version: '2.0', generated: now, host: 'https://api.librewxr.net', radar: { past, nowcast: [] }, satellite: { infrared: [] } }, 'world rain frames')
  }
  if (host === 'api.librewxr.net') return { status: 200, type: 'image/png', body: OVERLAY, fixture: 'no rain' }
  if (host === 'mesonet.agron.iastate.edu' && u.pathname.startsWith('/cache/tile.py')) return { status: 200, type: 'image/png', body: OVERLAY, fixture: 'no radar echoes' }
  /* The hurricane centre: no active storms in the fixture's world. */
  /* The shared model-accuracy file (docs/model-skill.md): not published yet, as on the real site; the phone's own scores are used. */
  if (host === 'jwillyah.github.io') return { status: 404, type: 'text/plain', body: Buffer.from('not found'), fixture: 'no shared skill file' }
  if (host === 'www.nhc.noaa.gov') return json({ activeStorms: [] }, 'no active storms')
  if (host === 'api.github.com') return json({ sha: '0000000000000000000000000000000000000000', commit: { committer: { date: '2026-10-30T00:00:00Z' } } }, 'GitHub fixture')
  if (host === 'api.anthropic.com') return { status: 401, type: 'application/json', body: Buffer.from('{"type":"error"}'), fixture: 'Anthropic refused' }
  if (/s3[.-]us-west-2\.amazonaws\.com$|overturemaps/.test(host)) return { status: 404, type: 'text/plain', body: Buffer.from(''), fixture: 'scan not in fixtures' }
  /*
   * The browser's own calls home, which the flags in chromeArgs mostly stop:
   * refused here, and named as the browser's so the guard does not count
   * them as the app's. Nothing reaches Google either way.
   */
  if (/(^|\.)(google\.com|googleapis\.com|gstatic\.com|gvt1\.com)$/.test(host)) return { status: 204, type: 'text/plain', body: Buffer.alloc(0), fixture: "browser's own call home, refused" }
  return { status: 404, type: 'text/plain', body: Buffer.from('no fixture for this host'), fixture: 'none' }
}
