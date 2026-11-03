/*
 * TRUTH CASE #5, KEPT (Batch J): the 2 Nov 2026 sunset at Chix Beach,
 * Virginia Beach, that FIRED (a mid-level altocumulus deck lit orange from
 * underneath while the sun sat in a clear slot on the WSW horizon, about
 * 5:03-5:08 PM, then pink overhead, fading by about 5:25; Jwilly's drone
 * photos). At 4:28 PM the app said Maybe ("3 of 5 see lit high cirrus").
 *
 * Usage:  node scripts/capture-truth-5.mjs
 * Writes: tests/data/sky-fire-2026-11-02-sunset.json (Open-Meteo's cloud by
 *         layer along the sun's line, the app's own request) and
 *         tests/data/truth5-2026-11-02-sunset/ (everything else, as received):
 *           metars.csv     IEM ASOS archive, 18-23 Z, the stations named here
 *           pireps.csv     IEM PIREP archive, 18-23 Z, within 400 km
 *           raob.json      IEM soundings: Wallops, Sterling, Newport 12 Z
 *           profile.json   Open-Meteo pressure levels at the venue (RH, T, height)
 *           goes.json      GOES-East band 13 along the sun's line, two frames
 *           nexrad.json    IEM NEXRAD composite along the sun's line, two frames
 *           ensemble.json  Open-Meteo GFS ensemble, cloud by layer, the eight points
 *           air.json       Open-Meteo air quality: AOD, dust at the venue
 *           afd.txt        NWS Wakefield's Area Forecast Discussions that day
 *         and measurements/2026-11-02-truth-5-capture.md (what came back).
 *
 * The hours are past, so the forecast's figures are the latest runs' for
 * those hours, not the 4:28 PM run's; the measurement file says so.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { firePathsUrl, nearestHour } from '../src/lib/skyFireData.ts'
import { pathPoints } from '../src/core/skyFire.ts'
import { satSamples } from '../src/lib/goesNowcast.ts'
import { destinationPoint, distanceMeters } from '../src/core/geo.ts'
import { decodePng } from '../src/lib/png.ts'

const VENUE = { lat: 36.92, lon: -76.1 }
const DATE = '2026-11-02'
const DIR = `tests/data/truth5-${DATE}-sunset`
mkdirSync(DIR, { recursive: true })
const ran = new Date().toISOString()
const event = getTimes(new Date(`${DATE}T17:00:00Z`), VENUE.lat, VENUE.lon).sunset
const azimuth = getPosition(event, VENUE.lat, VENUE.lon).azimuth
const log = []
const note = (s) => {
  log.push(s)
  console.log(s)
}
note(`sunset ${event.toISOString()}, azimuth ${azimuth.toFixed(1)}°`)

/* 1. The forecast, the app's own request. */
const url = firePathsUrl(VENUE, azimuth, DATE)
const payload = await fetch(url).then((r) => r.json())
writeFileSync(`tests/data/sky-fire-${DATE}-sunset.json`, JSON.stringify({ ran, url, venue: VENUE, date: DATE, kind: 'sunset', event: event.toISOString(), azimuth, hour: nearestHour(event), payload }, null, 1) + '\n')
note(`forecast: ${Array.isArray(payload) ? payload.length : 1} points`)

/* 2. METARs: the venue's two and every station within 60 km of the line out to 320 km. */
const STATIONS = ['NTU', 'ORF', 'SFQ', 'FKN', 'EMV', 'RIC', 'AVC', 'ASJ', 'IXA', 'RWI', 'HNZ', 'LHZ', 'RDU', 'TDF', 'W63', 'DAN', 'BUY', 'TTA', 'HRJ', 'ECG', 'ONX', 'PHF', 'AKQ', 'JGG', 'GSO', 'INT', 'EXX', 'LKU', 'FYJ', 'FAY', 'GSB', 'PGV', 'MQI', 'CPK', 'PVG', 'TQV']
const iem = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?${STATIONS.map((s) => `station=${s}`).join('&')}&data=metar&year1=2026&month1=11&day1=2&hour1=18&minute1=0&year2=2026&month2=11&day2=2&hour2=23&minute2=30&tz=Etc/UTC&format=onlycomma&latlon=yes&report_type=3&report_type=4`
const metars = await fetch(iem).then((r) => r.text())
writeFileSync(`${DIR}/metars.csv`, `# IEM ASOS archive, fetched ${ran}\n# ${iem}\n${metars}`)
note(`metars: ${metars.trim().split('\n').length - 1} reports`)

/* 3. PIREPs within 400 km. */
const pirepUrl = 'https://mesonet.agron.iastate.edu/cgi-bin/request/gis/pireps.py?sts=2026-11-02T18:00Z&ets=2026-11-02T23:30Z&artcc=_ALL&fmt=csv'
const pireps = (await fetch(pirepUrl).then((r) => r.text())).split('\n')
const near = pireps.filter((l, i) => {
  if (i === 0) return true
  const f = l.split(',')
  const lat = Number(f[f.length - 2])
  const lon = Number(f[f.length - 1])
  return Number.isFinite(lat) && distanceMeters(VENUE, { lat, lon }) <= 400_000
})
writeFileSync(`${DIR}/pireps.csv`, `# IEM PIREP archive, fetched ${ran}, rows within 400 km of ${VENUE.lat},${VENUE.lon}\n# ${pirepUrl}\n${near.join('\n')}\n`)
note(`pireps: ${near.length - 1} within 400 km, ${near.filter((l) => /\/SK /.test(l)).length} with a sky group`)

/* 4. Soundings. */
const raob = {}
for (const s of ['KWAL', 'KIAD', 'KMHX']) {
  for (const ts of ['202611021200', '202611030000']) {
    const j = await fetch(`https://mesonet.agron.iastate.edu/json/raob.py?ts=${ts}&station=${s}`).then((r) => r.json()).catch(() => null)
    raob[`${s}-${ts}`] = j?.profiles?.[0] ?? null
  }
}
writeFileSync(`${DIR}/raob.json`, JSON.stringify({ ran, raob }, null, 1) + '\n')
note(`soundings: ${Object.entries(raob).map(([k, v]) => `${k} ${v === null ? 'none' : `${v.profile.length} levels`}`).join(', ')}`)

/* 5. Pressure levels at the venue. */
const LEVELS = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200]
const vars = LEVELS.flatMap((p) => [`relative_humidity_${p}hPa`, `temperature_${p}hPa`, `geopotential_height_${p}hPa`])
const profUrl = `https://api.open-meteo.com/v1/forecast?latitude=${VENUE.lat.toFixed(2)}&longitude=${VENUE.lon.toFixed(2)}&hourly=${vars.join(',')},temperature_2m,precipitation&start_date=${DATE}&end_date=${DATE}&timezone=GMT`
const profile = await fetch(profUrl).then((r) => r.json())
writeFileSync(`${DIR}/profile.json`, JSON.stringify({ ran, url: profUrl, payload: profile }, null, 1) + '\n')
note(`profile: ${profile?.hourly?.time?.length ?? 0} hours`)

/* 6. GOES along the line, two frames: T-70 min (what the app could see at T-60) and T-30. */
const goes = {}
for (const lead of [70, 30]) {
  const frame = new Date(Math.floor((event.getTime() - lead * 60_000) / 600_000) * 600_000)
  goes[frame.toISOString()] = await satSamples(VENUE, azimuth, frame, { eastKm: 0, northKm: 0 })
}
writeFileSync(`${DIR}/goes.json`, JSON.stringify({ ran, venue: VENUE, event: event.toISOString(), azimuthDeg: azimuth, frames: goes }, null, 1) + '\n')
note(`goes: ${Object.entries(goes).map(([f, s]) => `${f} ${s === null ? 'none' : s.map((x) => (x.c === null ? '·' : Math.round(x.c))).join(' ')}`).join(' | ')}`)

/* 7. NEXRAD composite along the line (IEM's tile cache), dBZ by colour index, two frames. */
const nexrad = {}
const Z = 7
const tileOf = (at) => {
  const n = 2 ** Z
  const x = ((at.lon + 180) / 360) * n
  const r = (at.lat * Math.PI) / 180
  return { x, y: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n }
}
for (const lead of [70, 30]) {
  const t = new Date(Math.floor((event.getTime() - lead * 60_000) / 300_000) * 300_000)
  const stamp = t.toISOString().replace(/[-:T]/g, '').slice(0, 12)
  const cache = new Map()
  const out = []
  for (let km = 0; km <= 300; km += 10) {
    const at = km === 0 ? VENUE : destinationPoint(VENUE, azimuth, km * 1000)
    const p = tileOf(at)
    const key = `${Math.floor(p.x)}/${Math.floor(p.y)}`
    if (!cache.has(key)) {
      const r = await fetch(`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-${stamp}/${Z}/${key}.png`).catch(() => null)
      cache.set(key, r?.ok ? await decodePng(new Uint8Array(await r.arrayBuffer())) : null)
    }
    const img = cache.get(key)
    if (img == null) {
      out.push({ km, alpha: null })
      continue
    }
    const px = Math.min(img.width - 1, Math.floor((p.x - Math.floor(p.x)) * img.width))
    const py = Math.min(img.height - 1, Math.floor((p.y - Math.floor(p.y)) * img.height))
    const i = (py * img.width + px) * 4
    out.push({ km, rgba: [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]] })
  }
  nexrad[stamp] = out
}
writeFileSync(`${DIR}/nexrad.json`, JSON.stringify({ ran, zoom: Z, frames: nexrad }, null, 1) + '\n')
note(`nexrad: ${Object.entries(nexrad).map(([s, xs]) => `${s} ${xs.filter((x) => x.rgba?.[3] > 0).length} echo samples of ${xs.length}`).join(', ')}`)

/* 8. The GFS ensemble along the line. */
const pts = pathPoints(VENUE, azimuth)
const ensUrl = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${pts.map((p) => p.at.lat.toFixed(2)).join(',')}&longitude=${pts.map((p) => p.at.lon.toFixed(2)).join(',')}&hourly=cloud_cover&models=gfs025&start_date=${DATE}&end_date=${DATE}&timezone=GMT`
const ens = await fetch(ensUrl).then((r) => r.json()).catch(() => null)
writeFileSync(`${DIR}/ensemble.json`, JSON.stringify({ ran, url: ensUrl, payload: ens }, null, 1) + '\n')
note(`ensemble: ${Array.isArray(ens) ? ens.length : ens === null ? 0 : 1} points`)

/* 9. Air quality. */
const airUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${VENUE.lat.toFixed(2)}&longitude=${VENUE.lon.toFixed(2)}&hourly=aerosol_optical_depth,dust,pm2_5&start_date=${DATE}&end_date=${DATE}&timezone=GMT`
const air = await fetch(airUrl).then((r) => r.json()).catch(() => null)
writeFileSync(`${DIR}/air.json`, JSON.stringify({ ran, url: airUrl, payload: air }, null, 1) + '\n')
const hi = air?.hourly?.time?.indexOf(nearestHour(event)) ?? -1
note(`air: AOD ${air?.hourly?.aerosol_optical_depth?.[hi]}, dust ${air?.hourly?.dust?.[hi]}`)

/* 10. The forecast discussion. */
const afdUrl = 'https://mesonet.agron.iastate.edu/cgi-bin/afos/retrieve.py?pil=AFDAKQ&sdate=2026-11-02&edate=2026-11-03&limit=4&fmt=text'
const afd = await fetch(afdUrl).then((r) => r.text()).catch(() => '')
writeFileSync(`${DIR}/afd.txt`, afd)
note(`afd: ${afd.length} bytes`)

writeFileSync(
  `measurements/${DATE}-truth-5-capture.md`,
  [
    `# Truth case #5 captured: Chix Beach sunset, ${DATE}`,
    '',
    `Run: ${ran} · node scripts/capture-truth-5.mjs · venue ${VENUE.lat}, ${VENUE.lon} · sunset ${event.toISOString()}, azimuth ${azimuth.toFixed(1)}°. The hours are past: Open-Meteo's figures are the latest runs' for them, not the 4:28 PM run's.`,
    '',
    ...log.map((l) => `- ${l}`),
    '',
  ].join('\n'),
)
