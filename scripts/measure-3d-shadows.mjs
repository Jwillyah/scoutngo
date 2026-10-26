/*
 * BREW RIVER AT SOLAR NOON: IS THE SOUTH BANK IN SUN IN 3D, AND DOES 3D
 * AGREE WITH THE 2D SHADOW POLYGONS?
 *
 * Usage:  node scripts/measure-3d-shadows.mjs   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-3d-shadows-brew-river.md
 * Exits:  0 measured; 2 could not look.
 *
 * THE BANK. Land within 260 m south of the venue, not water, not under a
 * roof, from which walking 60 m north reaches the river: the strip along the
 * Wicomico's south side. Water is OpenStreetMap's, parsed by the app's own
 * parser (src/lib/overpass.ts), the same as the river check.
 *
 * 3D. The clay model at solar noon on the plan's date, looking straight down
 * on the bank. Each point's brightness is read off the rendered frame twice,
 * shadows on and shadows off, in the same frame of the same camera; a point
 * whose light falls below 0.8 of its unshadowed self is in shadow. Buildings
 * with no recorded height cast nothing in 3D, as in 2D.
 *
 * 2D. The same buildings the 3D view drew, through src/core/shadowMap.ts
 * with the same sun.
 */
import { writeFileSync } from 'node:fs'
import { getTimes } from 'suncalc'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { destinationPoint } from '../src/core/geo.ts'
import { pointInShadow, shadowMap } from '../src/core/shadowMap.ts'
import { isInWater } from '../src/core/siting.ts'
import { getSunPosition } from '../src/core/sun.ts'
import { formatClock } from '../src/core/timezone.ts'
import { buildQuery, parseOverpass } from '../src/lib/overpass.ts'
import { boxAround } from '../src/lib/tileRange.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

guardAudit('3d shadows')
const watchdog = startWatchdog('3d shadows', 420_000)
const VENUE = { lat: Number(CALIBRATION_VENUE.latitude), lon: Number(CALIBRATION_VENUE.longitude) }
const DATE = CALIBRATION_VENUE.date
const TZ = 'America/New_York'
const STEP = 12
const SHADOW_RATIO = 0.8

/* Solar noon on the plan's date, at the venue. */
const noon = getTimes(new Date(`${DATE}T16:00:00Z`), VENUE.lat, VENUE.lon).solarNoon
const sun = getSunPosition(noon, VENUE.lat, VENUE.lon)

/* The river, from OpenStreetMap. */
/*
 * The script's own river query may fall back to a public mirror when the main
 * server is down: this is the measurement's data, not the app's traffic, and
 * the place is the public example venue. Which one answered is recorded.
 */
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
const box = boxAround(VENUE, 400)
let res = null
let endpoint = null
for (const url of ENDPOINTS) {
  for (let attempt = 0; attempt < 3 && (res === null || !res.ok); attempt += 1) {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8', 'user-agent': 'scoutngo-measure/1.0' },
      body: buildQuery(box),
      signal: AbortSignal.timeout(120_000),
    }).catch((e) => ({ ok: false, status: String(e) }))
    if (!res.ok) await new Promise((r) => setTimeout(r, 6000))
  }
  if (res?.ok) {
    endpoint = url
    break
  }
}
if (res === null || !res.ok) {
  console.log(`=== 3D SHADOWS ABORTED: no Overpass answered (${res?.status}) ===`)
  process.exit(2)
}
const water = parseOverpass(await res.json()).land.water
if (water.length === 0) {
  console.log('=== 3D SHADOWS ABORTED: no water parsed at Brew River, so no bank to find ===')
  process.exit(2)
}

const { send, ev, wait, dispose } = await connect()
let rows = null
let meta = null
try {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await wait(2500)
  await ev(`localStorage.setItem('scoutngo.landing.v1', 'true')`)
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1' })
  await wait(8000)
  await goToStage(ev, wait, 'plan')
  await wait(1500)
  await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
  /* Buildings first: Overpass may need a retry or two (Clay3D waits them out). */
  let count = 0
  for (let i = 0; i < 200 && count === 0; i += 1) {
    await wait(1500)
    count = await ev(`window.__clay?.buildings().length ?? 0`)
  }
  if (count === 0) throw new Error('the 3D view drew no buildings, so there is nothing to compare')
  const buildings = await ev(`JSON.stringify(window.__clay.buildings().map((b) => ({ id: b.id, ring: b.ring, h: b.height.metres })))`)
  const list = JSON.parse(buildings)

  /* The bank points. */
  const footprints = list.map((b) => ({ id: b.id, ring: b.ring, heightMeters: b.h }))
  const map2d = shadowMap(footprints, { azimuth: sun.azimuth, altitude: sun.altitude })
  const underRoof = (p) => list.some((b) => inRing(p, b.ring))
  const points = []
  for (let south = 20; south <= 260; south += STEP) {
    for (let east = -250; east <= 250; east += STEP) {
      const p = destinationPoint(destinationPoint(VENUE, 180, south), 90, east)
      if (isInWater(p, water) || underRoof(p)) continue
      /* Keep it when the river is within 60 m to its north: the south bank. */
      let reaches = false
      for (let m = 6; m <= 60 && !reaches; m += 6) reaches = isInWater(destinationPoint(p, 0, m), water)
      if (reaches) points.push(p)
    }
  }
  if (points.length === 0) throw new Error('no bank points found south of the river')

  /*
   * THE CONTROL (docs/failure-modes.md, B): points the 2D code says ARE in
   * shadow, just north of each building with a recorded height. If 3D does
   * not see these as dark, the bank's "all in sun" means nothing.
   */
  /*
   * Only shadows long enough to read: at noon a 9 m building throws 6 m, and
   * from the camera a 3 x 3 pixel sample is about 3 m across, so a point in a
   * shadow that small reads half sunlit ground. 8 m or more, sampled well
   * inside.
   */
  const control = []
  for (const b of list) {
    if (b.h === null) continue
    const lats = b.ring.map(([, lat]) => lat)
    const lons = b.ring.map(([lon]) => lon)
    const top = { lat: Math.max(...lats), lon: (Math.min(...lons) + Math.max(...lons)) / 2 }
    const reach = b.h / Math.tan((sun.altitude * Math.PI) / 180)
    if (reach < 8) continue
    for (const f of [0.35, 0.65]) {
      const p = destinationPoint(top, (sun.azimuth + 180) % 360, Math.max(1.5, reach * f))
      if (!underRoof(p) && !isInWater(p, water) && pointInShadow(p, map2d) !== null) control.push(p)
    }
  }

  /* 3D: straight down, noon, each point read lit and unlit in the same frame. One pass for the bank, one for the control. */
  const readAt = (pts, height) => {
    const mid = pts.reduce((a, p) => ({ lat: a.lat + p.lat / pts.length, lon: a.lon + p.lon / pts.length }), { lat: 0, lon: 0 })
    return ev(`(async () => {
    const clay = window.__clay
    const scene = clay.widget.scene
    clay.setTime(new Date(${noon.getTime()}))
    clay.lookDown({ lat: ${mid.lat}, lon: ${mid.lon} }, ${height})
    for (let i = 0; i < 240 && !scene.globe.tilesLoaded; i++) await new Promise((r) => setTimeout(r, 250))
    await new Promise((r) => setTimeout(r, 3000))
    const pts = ${JSON.stringify(pts)}
    /* Each point at its own ground height, so the pixel read is the ground's, not a point under it. */
    const ground = await Promise.all(pts.map((p) => clay.groundAt(p)))
    const grab = () => {
      clay.widget.render()
      const c = clay.widget.canvas
      const off = document.createElement('canvas'); off.width = c.width; off.height = c.height
      const ctx = off.getContext('2d', { willReadFrequently: true }); ctx.drawImage(c, 0, 0)
      const k = c.width / c.clientWidth
      return pts.map((p, i) => {
        const s = clay.project(p, ground[i] ?? 0)
        if (s === null || s.x < 4 || s.y < 4 || s.x > c.clientWidth - 4 || s.y > c.clientHeight - 4) return null
        /* Is the pixel this ground point, or a wall or roof in front of it? Asked of the depth buffer. */
        const hit = clay.pickAt(s.x, s.y)
        if (hit === null) return null
        const dLat = (hit.lat - p.lat) * 111320
        const dLon = (hit.lon - p.lon) * 111320 * Math.cos(p.lat * Math.PI / 180)
        if (Math.hypot(dLat, dLon) > 4) return null
        let sum = 0, n = 0
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const d = ctx.getImageData(Math.round(s.x * k) + dx, Math.round(s.y * k) + dy, 1, 1).data
          sum += 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]; n++
        }
        return sum / n
      })
    }
    /*
     * Shadows on, off, on again. Tiles can still be arriving: a point whose
     * two shadowed readings differ by more than a tenth is a point whose
     * picture changed between frames, and it is dropped rather than read.
     */
    scene.shadowMap.enabled = true
    const lit = grab()
    scene.shadowMap.enabled = false
    const flat = grab()
    scene.shadowMap.enabled = true
    const again = grab()
    const steady = lit.map((l, i) => (l === null || again[i] === null || Math.abs(l - again[i]) > 0.1 * Math.max(l, again[i], 1) ? null : (l + again[i]) / 2))
    return JSON.stringify({ lit: steady, flat, loaded: scene.globe.tilesLoaded })
  })()`)
  }
  const ratios = (raw) => {
    const { lit, flat } = JSON.parse(raw)
    return lit.map((l, i) => (l === null || flat[i] === null || flat[i] < 1 ? null : l / flat[i]))
  }
  /* The tallest building with a recorded height: a transect north from its north edge, every few metres. */
  const tall = list.filter((b) => b.h !== null).sort((a, b) => b.h - a.h)[0]
  const tLats = tall.ring.map(([, lat]) => lat)
  const tLons = tall.ring.map(([lon]) => lon)
  const tTop = { lat: Math.max(...tLats), lon: (Math.min(...tLons) + Math.max(...tLons)) / 2 }
  const transect = [2, 5, 10, 15, 20, 25, 30, 35, 40].map((m) => ({ m, p: destinationPoint(tTop, (sun.azimuth + 180) % 360, m) }))
  const readTransect = await readAt(transect.map((t) => t.p), 220)
  const read = await readAt(points, 1100)
  const readControl = control.length === 0 ? null : await readAt(control, 250)
  if (typeof read !== 'string') throw new Error(`could not read the frame: ${JSON.stringify(read)}`)
  const { loaded } = JSON.parse(read)
  const bankRatios = ratios(read)
  const controlRatios = readControl === null ? [] : ratios(readControl)
  const transectRatios = ratios(readTransect)
  meta = {
    transect: transect.map((t, i) => ({ m: t.m, d2: pointInShadow(t.p, map2d) !== null, r: transectRatios[i] })),
    tallH: tall.h,
    tallReach: tall.h / Math.tan((sun.altitude * Math.PI) / 180),
  }
  meta = { ...meta, buildings: list.length, unknown: list.filter((b) => b.h === null).length, loaded, shadows2d: map2d.status }
  const ctl = controlRatios.map((ratio) => (ratio === null ? null : ratio < SHADOW_RATIO)).filter((x) => x !== null)
  meta.control = { total: control.length, seen: ctl.length, dark: ctl.filter(Boolean).length }
  rows = points.map((p, i) => {
    const ratio = bankRatios[i]
    return { p, ratio, shade3d: ratio === null ? null : ratio < SHADOW_RATIO, shade2d: pointInShadow(p, map2d) !== null }
  })
} catch (error) {
  console.log(`=== 3D SHADOWS ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  watchdog.stop()
  await dispose()
  process.exit(2)
}
watchdog.stop()
await dispose()

function inRing(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

const seen = rows.filter((r) => r.shade3d !== null)
const sun3d = seen.filter((r) => !r.shade3d).length
const agree = seen.filter((r) => r.shade3d === r.shade2d).length
const both = (a, b) => seen.filter((r) => r.shade3d === a && r.shade2d === b).length
const lines = [
  '# Brew River at solar noon: 3D shadows against the 2D shadow polygons',
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-3d-shadows.mjs · calibration venue ${VENUE.lat}, ${VENUE.lon} · river from ${endpoint}`,
  `Solar noon ${formatClock(noon, TZ, 12)} on ${DATE}: sun at azimuth ${sun.azimuth.toFixed(1)}°, altitude ${sun.altitude.toFixed(1)}°.`,
  `Buildings drawn: ${meta.buildings}, of which ${meta.unknown} have no recorded height and cast no shadow in either view. Globe loaded: ${meta.loaded}.`,
  `South bank points: ${rows.length} (land, not under a roof, river within 60 m to the north, ${STEP} m grid); ${seen.length} on screen and not hidden behind a building (checked against the depth buffer).`,
  `3D shadow rule: lit / unshadowed brightness below ${SHADOW_RATIO}, read shadows on, off, on; a point whose two shadowed readings differ by more than 10% (tiles still arriving) is dropped.`,
  '',
  `Control: ${meta.control.total} points the 2D polygons put in shadow, well inside the noon shadows at least 8 m long; ${meta.control.seen} on screen and visible, ${meta.control.dark} read as shadow in 3D. ${meta.control.seen > 0 && meta.control.dark / meta.control.seen >= 0.8 ? 'The 3D reading does see shadow where there is some.' : 'The 3D reading did NOT see shadow where 2D has it: the bank result below cannot be trusted.'}`,
  '',
  `Transect north from the tallest building with a recorded height (${meta.tallH} m; its noon shadow is ${meta.tallReach.toFixed(1)} m long in 2D):`,
  '',
  '| metres north | 2D | 3D lit / unshadowed | 3D |',
  '|---|---|---|---|',
  ...meta.transect.map((t) => `| ${t.m} | ${t.d2 ? 'shadow' : 'sun'} | ${t.r === null ? 'not visible' : t.r.toFixed(2)} | ${t.r === null ? '-' : t.r < SHADOW_RATIO ? 'shadow' : 'sun'} |`),
  '',
  `In sun in 3D: ${sun3d} of ${seen.length} (${((100 * sun3d) / Math.max(1, seen.length)).toFixed(1)}%).`,
  `3D agrees with 2D: ${agree} of ${seen.length} (${((100 * agree) / Math.max(1, seen.length)).toFixed(1)}%).`,
  '',
  '| 3D | 2D | points |',
  '|---|---|---|',
  `| sun | sun | ${both(false, false)} |`,
  `| shadow | shadow | ${both(true, true)} |`,
  `| shadow | sun | ${both(true, false)} |`,
  `| sun | shadow | ${both(false, true)} |`,
  '',
]
const out = `measurements/${new Date().toISOString().slice(0, 10)}-3d-shadows-brew-river.md`
writeFileSync(out, lines.join('\n'))
console.log(lines.join('\n'))
