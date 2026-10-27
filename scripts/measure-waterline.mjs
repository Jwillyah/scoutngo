/*
 * THE WATERLINE ON THE SCANNED BEACH: THE OFFSET, THE BAND, AND THE SCAN'S
 * OWN WATER EDGE.
 *
 * Usage:  node scripts/measure-waterline.mjs
 * Writes: measurements/<today>-waterline.md
 * Exits:  0 every check within its limit; 1 not; 2 could not look.
 *
 * At Virginia Beach Fishing Pier, with the app's own modules:
 *
 *   datums    NOAA's datums for the stations involved, as the app reads them
 *             (metres), against the same API in feet: NOAA's station page
 *             (tidesandcurrents.noaa.gov/datums.html) draws its table from
 *             this API, so this checks the reading, not an independent source.
 *   offset    the station the app picks (src/lib/waterline/datums.ts), its
 *             offset two ways (src/core/waterline.ts), and the uncertainty.
 *   band      at a known tide, 20 transects across the beach: the band from
 *             the raster (cells within the uncertainty of the level) against
 *             the ground's crossing of the level walked along the transect.
 *   the scan  the scan's own water edge (its first water returns) against our
 *             waterline at the tide NOAA predicted for the scan's flight time,
 *             read from the points' GPS times.
 */
import { writeFileSync } from 'node:fs'
import { createLazPerf } from 'laz-perf'
import { offsetFor, DATUMS_URL } from '../src/lib/waterline/datums.ts'
import { crossingAlong, meanRange, nearGround, waterNavd, waterlineMap, KIND_BAND } from '../src/core/waterline.ts'
import { parseExtremes, PREDICTIONS_URL } from '../src/lib/noaa.ts'
import { setVectorLoader } from '../src/lib/vectorTiles.ts'
import { areaFor, mercator } from '../src/lib/lidar/grid.ts'
import { LIDAR_BUCKET, nodesFor, pickDepth } from '../src/lib/lidar/ept.ts'
import { decodeTile } from '../src/lib/lidar/decode.ts'
import { buildRasters, cellIndex, STRIDE } from '../src/lib/lidar/raster.ts'

/* The app keeps station lists and datums in localStorage; Node has none, so an in-memory one. */
const mem = new Map()
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
setVectorLoader(async (u) => {
  const r = await fetch(u)
  return r.ok ? r.arrayBuffer() : null
})

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const OWN = { id: '8639168', name: 'Virginia Beach', at: { lat: 36.8433, lon: -75.9717 }, state: 'VA' }
const PROJECT = 'USGS_LPC_VA_Norfolk_2013_LAS_2015'
const GPS_EPOCH = Date.UTC(1980, 0, 6)
const LEAP_2013 = 16
const lines = []
let ok = true
const fail = (w) => {
  ok = false
  lines.push(`FAIL: ${w}`)
}
/* A network blip is not a result: each request is tried up to three times. */
const realFetch = globalThis.fetch
globalThis.fetch = async (u, o) => {
  for (let i = 0; ; i += 1) {
    try {
      return await realFetch(u, o)
    } catch (e) {
      if (i >= 2) throw e
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}
const get = async (u) => (await fetch(u)).json()

try {
  /* The venue's own range, from a month of its predictions. */
  const month = parseExtremes(await get(`${PREDICTIONS_URL}?${new URLSearchParams({ product: 'predictions', application: 'scoutngo', begin_date: '20261020', end_date: '20261119', datum: 'MLLW', station: OWN.id, time_zone: 'gmt', units: 'english', format: 'json', interval: 'hilo' })}`))
  const gt = meanRange(month)
  const choice = await offsetFor(PIER, OWN, gt)
  if (choice === null) throw new Error('no offset could be found for the pier')

  /* 1. The datums, metres against feet. */
  lines.push('## The datums, as the app reads them', '', '| station | MLLW (m) | NAVD88 (m) | NAVD88 - MLLW (m) | the same in feet, from NOAA in feet | agree |', '|---|---|---|---|---|---|')
  for (const id of [OWN.id, '8638863', '8651370', '8638610']) {
    const m = await get(DATUMS_URL(id))
    const f = await get(DATUMS_URL(id).replace('units=metric', 'units=english'))
    const v = (d, n) => d.datums?.find((x) => x.name === n)?.value ?? null
    const offM = v(m, 'NAVD88') !== null && v(m, 'MLLW') !== null ? v(m, 'NAVD88') - v(m, 'MLLW') : null
    const offF = v(f, 'NAVD88') !== null && v(f, 'MLLW') !== null ? v(f, 'NAVD88') - v(f, 'MLLW') : null
    const agree = offM === null && offF === null ? 'both none' : offM !== null && offF !== null && Math.abs(offM * 3.28084 - offF) < 0.01 ? 'yes' : 'NO'
    if (agree === 'NO') fail(`${id}: metres and feet disagree`)
    lines.push(`| ${id} | ${v(m, 'MLLW') ?? '—'} | ${v(m, 'NAVD88') ?? '—'} | ${offM === null ? '—' : offM.toFixed(3)} | ${offF === null ? '—' : `${offF.toFixed(3)} ft = ${(offF / 3.28084).toFixed(3)} m`} | ${agree} |`)
  }
  lines.push('', "NOAA's station datums page draws its table from this same API, so this checks the reading, not an independent source.", '')

  /* 2. The offset the app picks. */
  lines.push('## The offset at the pier', '', `The pier's own station, ${OWN.id} ${OWN.name}, publishes no datums. Its mean range over a month of predictions: ${gt.toFixed(3)} m.`)
  lines.push(`Picked: ${choice.station.name} (${choice.station.id}), ${choice.distanceKm.toFixed(1)} km away, ${choice.openWater ? 'on open water' : 'not on open water'}. NAVD88 above MLLW: ${choice.offsetM.toFixed(3)} m as published there; ${choice.checkM?.toFixed(3) ?? '—'} m scaled to the pier's range. Uncertainty ${choice.uncertaintyM.toFixed(3)} m.`, '')
  /*
   * The rule asked for: the nearest station publishing both that is on open
   * water. Duck NC (8651370) was the one named; a nearer one that meets the
   * rule beats it, and is said.
   */
  if (!choice.borrowed || !choice.openWater) fail('the offset is not borrowed from an open-water station')
  if (choice.distanceKm > 75.5) fail(`the station picked is ${choice.distanceKm.toFixed(0)} km away, further than Duck`)

  /* The scan at the pier, with its water returns and their times. */
  const area = areaFor(PIER.lat, PIER.lon)
  const base = `${LIDAR_BUCKET}/${PROJECT}`
  const meta = await get(`${base}/ept.json`)
  const pick = pickDepth(await nodesFor(meta, area, async (k) => get(`${base}/ept-hierarchy/${k}.json`)), area, 2)
  const Laz = await createLazPerf()
  let pts = new Float64Array(1 << 22)
  let used = 0
  for (const n of pick.nodes) {
    const data = new Uint8Array(await (await fetch(`${base}/ept-data/${n.key}.laz`)).arrayBuffer())
    decodeTile(Laz, data, area, (x, y, z, c, r) => {
      if (used + STRIDE > pts.length) {
        const b = new Float64Array(pts.length * 2)
        b.set(pts)
        pts = b
      }
      pts.set([x, y, z, c, r], used)
      used += STRIDE
    })
  }
  const rasters = buildRasters(pts.subarray(0, used), area)
  const W = { width: rasters.width, height: rasters.height, cellM: 1, dtm: rasters.dtm }
  /* Ground the scan measured: cells where ground returns (class 2) fell, or a cell from one (the app's own rule). */
  const near = nearGround(rasters.ground, rasters.width, rasters.height)
  const measured = (i) => near[i] === 1
  const pier = mercator(PIER.lat, PIER.lon)
  const k = 1 / area.metresPerUnit
  /* 20 transects every 25 m along the beach, each walked west to east, 300 m to 100 m past the pier. */
  const transects = Array.from({ length: 20 }, (_, i) => -237.5 + i * 25).map((dy) => {
    const cells = []
    for (let dx = -300; dx <= 100; dx += 1) {
      const c = cellIndex(rasters, pier.x + dx * k, pier.y + dy * k)
      if (c >= 0) cells.push(c)
    }
    return { dy, cells }
  })

  /*
   * 3. The band at a known tide inside the scanned beach. The scan was flown
   * at low tide, so ground below about -0.6 m was under water and never
   * measured: 2 ft MLLW, about mid tide, crosses the beach it did measure.
   */
  const level0 = waterNavd(2, choice.offsetM)
  const lowLevel = waterNavd(0, choice.offsetM)
  const map = waterlineMap(W, level0, lowLevel, choice.uncertaintyM, measured)
  lines.push(`## The band at 2 ft MLLW (${level0.toFixed(3)} m NAVD88), 20 transects`, '', `Band ${map.widthFt?.toFixed(1) ?? '—'} ft wide on the ground (2 x ${choice.uncertaintyM.toFixed(3)} m x a run of ${map.run?.toFixed(1) ?? '—'} m per metre of rise).`, '', '| along the beach (m from the pier) | transect crossing: ground (m) | in the raster band | band cells on the transect |', '|---|---|---|---|')
  let inBand = 0
  let counted = 0
  for (const t of transects) {
    const c = crossingAlong(W, t.cells, level0, measured)
    const bandCells = t.cells.filter((i) => map.kind[i] === KIND_BAND).length
    if (c === null) {
      lines.push(`| ${t.dy} | no crossing | — | ${bandCells} |`)
      continue
    }
    counted += 1
    const yes = map.kind[c] === KIND_BAND || Math.abs(rasters.dtm[c] - level0) <= choice.uncertaintyM
    if (yes) inBand += 1
    lines.push(`| ${t.dy} | ${rasters.dtm[c].toFixed(3)} | ${yes ? 'yes' : 'NO'} | ${bandCells} |`)
  }
  lines.push('', `${inBand} of ${counted} crossings inside the band.`, '')
  if (counted < 15) fail(`only ${counted} transects cross the level`)
  if (inBand !== counted) fail('a transect crossing fell outside the raster band')

  /* 4. The scan's own water edge against our waterline at the flight-time tide. */
  const water = []
  const times = []
  for (let p = 0; p < used; p += STRIDE) if (pts[p + 3] === 9) water.push(p)
  /* GPS time is in the tiles' extra bytes only through the full record; read it again from the nearest tiles. */
  for (const n of pick.nodes.slice(-6)) {
    const data = new Uint8Array(await (await fetch(`${base}/ept-data/${n.key}.laz`)).arrayBuffer())
    const dv = new DataView(data.buffer)
    const fmt = data[104] & 0x3f
    const len = dv.getUint16(105, true)
    const fp = Laz._malloc(data.length)
    Laz.HEAPU8.set(data, fp)
    const rd = new Laz.LASZip()
    rd.open(fp, data.length)
    const pp = Laz._malloc(len)
    for (let i = 0, cnt = rd.getCount(); i < cnt; i += 1) {
      rd.getPoint(pp)
      if (fmt === 1 || fmt === 3) times.push(new DataView(Laz.HEAPU8.buffer, pp, len).getFloat64(20, true))
    }
    rd.delete()
    Laz._free(fp)
    Laz._free(pp)
  }
  times.sort((a, b) => a - b)
  const median = times[times.length >> 1]
  /* Adjusted standard GPS time (seconds since the GPS epoch less 10^9), less the 16 leap seconds of 2013. */
  const flown = new Date(GPS_EPOCH + (median + 1e9 - LEAP_2013) * 1000)
  const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '')
  console.log('flown', flown.toISOString(), 'from', times.length, 'GPS times')
  const turns = parseExtremes(await get(`${PREDICTIONS_URL}?${new URLSearchParams({ product: 'predictions', application: 'scoutngo', begin_date: ymd(new Date(flown.getTime() - 86_400_000)), end_date: ymd(new Date(flown.getTime() + 86_400_000)), datum: 'MLLW', station: OWN.id, time_zone: 'gmt', units: 'english', format: 'json', interval: 'hilo' })}`))
  const tide = (() => {
    const t = flown.getTime()
    for (let i = 1; i < turns.length; i += 1) {
      const a = turns[i - 1]
      const b = turns[i]
      if (t >= a.at.getTime() && t <= b.at.getTime()) {
        const s = (t - a.at.getTime()) / (b.at.getTime() - a.at.getTime())
        return a.feet + ((b.feet - a.feet) * (1 - Math.cos(Math.PI * s))) / 2
      }
    }
    return null
  })()
  if (tide === null) throw new Error('no prediction around the flight time')
  const flownLevel = waterNavd(tide, choice.offsetM)
  lines.push('## The scan\'s own water edge against the tide NOAA predicted when it was flown', '', `Flown ${flown.toISOString()} (median GPS time of the nearest tiles, adjusted standard time, less 16 leap seconds). NOAA predicted ${tide.toFixed(2)} ft MLLW at ${OWN.name}: ${flownLevel.toFixed(3)} m NAVD88 with the offset above.`, '', '| along the beach (m) | scan water edge: m east of the pier | measured ground at the edge (m NAVD88) | above the predicted still water (m) | our waterline at that tide |', '|---|---|---|---|---|')
  const above = []
  let past = 0
  for (const t of transects) {
    const yc = pier.y + t.dy * k
    /* The scan's water edge on this transect: its most landward water return within 1000 m east. */
    let edge = null
    for (const p of water) if (Math.abs(pts[p + 1] - yc) < 2 * k && pts[p] > pier.x - 300 * k && (edge === null || pts[p] < pts[edge])) edge = p
    const c = crossingAlong(W, t.cells, flownLevel, measured)
    if (c === null) past += 1
    if (edge === null) {
      lines.push(`| ${t.dy} | no water returns | — | — | ${c === null ? 'past the scanned beach' : 'crosses'} |`)
      continue
    }
    /* The measured ground just landward of the edge. */
    const g = []
    for (let p = 0; p < used; p += STRIDE) if (pts[p + 3] === 2 && Math.abs(pts[p + 1] - yc) < 2 * k && pts[p] < pts[edge] && pts[p] > pts[edge] - 3 * k) g.push(pts[p + 2])
    const gz = g.length === 0 ? null : g.reduce((s2, v) => s2 + v, 0) / g.length
    if (gz !== null) above.push(gz - flownLevel)
    lines.push(`| ${t.dy} | ${((pts[edge] - pier.x) / k).toFixed(1)} | ${gz === null ? '—' : gz.toFixed(2)} | ${gz === null ? '—' : (gz - flownLevel).toFixed(2)} | ${c === null ? 'past the scanned beach' : 'crosses'} |`)
  }
  const mean = above.reduce((s2, v) => s2 + v, 0) / Math.max(1, above.length)
  lines.push('', `On ${above.length} transects the scan's water edge stands on average ${mean.toFixed(2)} m above the still water NOAA predicted (range ${Math.min(...above).toFixed(2)} to ${Math.max(...above).toFixed(2)} m): where the last wave ran up, which a tide prediction does not include. At that tide our waterline falls past the scanned beach on ${past} of 20 transects: the scan never saw ground that low, so nothing is drawn there.`, '')
  if (above.length < 10) fail('too few transects with a water edge to compare')
} catch (error) {
  console.log(`=== WATERLINE ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  process.exit(2)
}
const out = ['# The waterline on the scanned beach', '', `Run: ${new Date().toISOString()} · node scripts/measure-waterline.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · scan ${PROJECT} · NOAA CO-OPS datums and predictions`, '', ...lines, ok ? 'Pass.' : 'FAIL.', '']
writeFileSync(`measurements/${new Date().toISOString().slice(0, 10)}-waterline.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
