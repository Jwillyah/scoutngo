/*
 * THE FOG AND RAIN FIXTURES, KEPT FOR REPLAY (Batch SIMPLE-3, Sections 1.4,
 * 1b.4 and 1c).
 *
 * Usage:  node scripts/capture-fog-fixtures.mjs
 * Writes: tests/data/wx-2026-11-21-24-vb/ (one file per source) and prints
 *         what it fetched; the run's parameters go in
 *         measurements/2026-11-24-fog-fixtures.md (written by hand from this
 *         output, never backfilled).
 *
 * Jwilly's misses at Virginia Beach (times America/New_York):
 *   21 Nov 6:30-7:30 AM   fog and a good sunrise
 *   23 Nov 11 AM          haze
 *   23 Nov 4:20-4:55 PM   sea fog on the beach, colour inland
 *   23 Nov 11:14 PM       light intermittent rain ending within the hour;
 *                         home wind 18 kt NNE gusts 22, drone 8 kt at 400 ft
 *
 * Fetched ONCE, with the ScoutNGo User-Agent and nothing else identifying:
 *   Open-Meteo historical-forecast  the app's own hourly variables, and
 *                                    minutely_15 precipitation, at the beach
 *                                    and the inland spot
 *   Open-Meteo Marine               sea_surface_temperature at the beach (the
 *                                    app's water source there: no station
 *                                    within 15 km, src/core/waterTemp.ts)
 *   NDBC 44099 (Cape Henry buoy)    its realtime file, for the measured water
 *   IEM ASOS                        KNTU, KORF, KNFE, KCPK, KPVG: every
 *                                    routine and special report, raw METAR
 *   NOAA CO-OPS                     Cape Henry (8638999) wind, 6-minute
 *   IEM radar tiles                 the N0Q composite at zoom 7, 3 x 3 tiles
 *                                    round the beach, at 03:50, 04:00, 04:10Z
 *                                    on 24 Nov (the app's three scans)
 * The two spots are the batch's own: Atlantic Park Surf (36.851, -75.980)
 * and a city-level inland point in Chesapeake (36.70, -76.30).
 */
import { mkdirSync, writeFileSync } from 'node:fs'

const UA = { 'user-agent': 'ScoutNGo (+https://github.com/Jwillyah/scoutngo)' }
const DIR = 'tests/data/wx-2026-11-21-24-vb'
mkdirSync(`${DIR}/radar`, { recursive: true })

export const BEACH = { name: 'Atlantic Park Surf', lat: 36.851, lon: -75.98 }
export const INLAND = { name: 'Chesapeake (inland)', lat: 36.7, lon: -76.3 }
const START = '2026-11-21'
const END = '2026-11-24'
const HOURLY = ['temperature_2m', 'dew_point_2m', 'visibility', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'wind_speed_120m', 'wind_direction_120m', 'wind_speed_500hPa', 'wind_direction_500hPa', 'weather_code', 'precipitation', 'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high', 'precipitation_probability']

/*
 * `node scripts/capture-fog-fixtures.mjs radar-truth` asks only for what the
 * radar did after 11:14 PM (the centre tile at 04:20 to 05:00Z), to check the
 * nowcast against; run once, after the first capture.
 */
const ONLY = process.argv[2] ?? null
const log = []
async function get(url, kind = 'json') {
  const r = await fetch(url, { headers: UA })
  const body = kind === 'bytes' ? new Uint8Array(await r.arrayBuffer()) : await r.text()
  log.push({ url, status: r.status, bytes: body.length })
  console.log(r.status, body.length, url)
  if (!r.ok) return null
  return kind === 'json' ? JSON.parse(body) : body
}

if (ONLY === null) {
for (const spot of [BEACH, INLAND]) {
  const p = new URLSearchParams({ latitude: String(spot.lat), longitude: String(spot.lon), hourly: HOURLY.join(','), minutely_15: 'precipitation', wind_speed_unit: 'ms', start_date: START, end_date: END, timezone: 'GMT' })
  const url = `https://historical-forecast-api.open-meteo.com/v1/forecast?${p}`
  const payload = await get(url)
  writeFileSync(`${DIR}/open-meteo-${spot === BEACH ? 'beach' : 'inland'}.json`, JSON.stringify({ spot, source: url, fetched: new Date().toISOString(), payload }))
}

{
  const p = new URLSearchParams({ latitude: String(BEACH.lat), longitude: String(BEACH.lon), hourly: 'sea_surface_temperature', start_date: START, end_date: END, timezone: 'GMT' })
  const url = `https://marine-api.open-meteo.com/v1/marine?${p}`
  writeFileSync(`${DIR}/marine-beach.json`, JSON.stringify({ spot: BEACH, source: url, fetched: new Date().toISOString(), payload: await get(url) }))
}

{
  const url = 'https://www.ndbc.noaa.gov/data/realtime2/44099.txt'
  const text = await get(url, 'text')
  /* Only the four days: the file holds 45. */
  const keep = (text ?? '').split('\n').filter((l) => l.startsWith('#') || /^2026 11 (2[0-4]) /.test(l))
  writeFileSync(`${DIR}/ndbc-44099.txt`, keep.join('\n') + '\n')
}

{
  const p = new URLSearchParams()
  for (const s of ['NTU', 'ORF', 'NFE', 'CPK', 'PVG']) p.append('station', s)
  for (const d of ['tmpf', 'dwpf', 'sknt', 'drct', 'gust', 'vsby', 'wxcodes', 'metar']) p.append('data', d)
  p.set('sts', '2026-11-21T00:00Z')
  p.set('ets', '2026-11-24T12:00Z')
  p.set('tz', 'Etc/UTC')
  p.set('format', 'onlycomma')
  p.set('latlon', 'yes')
  p.set('missing', 'null')
  p.set('trace', '0.0001')
  p.append('report_type', '3')
  p.append('report_type', '4')
  const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${p}`
  writeFileSync(`${DIR}/asos.csv`, (await get(url, 'text')) ?? '')
}

{
  const p = new URLSearchParams({ product: 'wind', application: 'scoutngo', begin_date: '20261121 00:00', end_date: '20261124 12:00', station: '8638999', time_zone: 'gmt', units: 'english', format: 'json' })
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${p}`
  writeFileSync(`${DIR}/coops-8638999-wind.json`, JSON.stringify({ source: url, payload: await get(url) }))
  const v = new URLSearchParams({ ...Object.fromEntries(p), product: 'visibility' })
  const vurl = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${v}`
  writeFileSync(`${DIR}/coops-8638999-visibility.json`, JSON.stringify({ source: vurl, payload: await get(vurl) }))
}

{
  const Z = 7
  const n = 256 * 2 ** Z
  const r = (BEACH.lat * Math.PI) / 180
  const tx = Math.floor((((BEACH.lon + 180) / 360) * n) / 256)
  const ty = Math.floor((((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) / 256)
  for (const stamp of ['202611240350', '202611240400', '202611240410']) {
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        const url = `https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-${stamp}/${Z}/${tx + dx}/${ty + dy}.png`
        const bytes = await get(url, 'bytes')
        if (bytes !== null) writeFileSync(`${DIR}/radar/${stamp}-${tx + dx}-${ty + dy}.png`, bytes)
      }
    }
  }
}

}

if (ONLY === 'radar-truth') {
  const Z = 7
  const n = 256 * 2 ** Z
  const r = (BEACH.lat * Math.PI) / 180
  const tx = Math.floor((((BEACH.lon + 180) / 360) * n) / 256)
  const ty = Math.floor((((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n) / 256)
  for (const stamp of ['202611240420', '202611240430', '202611240440', '202611240450', '202611240500']) {
    const bytes = await get(`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-${stamp}/${Z}/${tx}/${ty}.png`, 'bytes')
    if (bytes !== null) writeFileSync(`${DIR}/radar/truth-${stamp}-${tx}-${ty}.png`, bytes)
  }
}

writeFileSync(`${DIR}/fetch-log${ONLY === null ? '' : `-${ONLY}`}.json`, JSON.stringify({ fetched: new Date().toISOString(), userAgent: UA['user-agent'], requests: log }, null, 1))
process.exit(0)
