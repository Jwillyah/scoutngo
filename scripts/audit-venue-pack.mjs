/*
 * SAVE FOR OFFLINE, THEN NO SIGNAL AT ALL: DOES THE VENUE STILL WORK?
 *
 * Usage:  node scripts/audit-venue-pack.mjs [screenshot-dir]
 * Exits:  0 when, in WebKit as a tab and from the home-screen icon (insets
 *         47/34), a venue saved with "Save for offline" reloads with the
 *         network off and draws: the map picture, the chips with their age,
 *         the offline line, the tide curve, the sun line and the shadows.
 *         1 on a problem. 2 when it could not look.
 *
 * THE BUILT APP, NOT THE DEV SERVER. A reload with no network is the service
 * worker's job (src/sw/sw.ts), and the dev server has none. So dist/ (the
 * gate builds it just before) is served here, and the page is reloaded
 * offline with Playwright's context offline: every request fails, the app's
 * own origin included, which is airplane mode.
 *
 * EVERY OUTSIDE SERVICE IS ANSWERED BY A FIXTURE while saving: a flat
 * imagery tile of one known colour, flat elevation, one map tile with a
 * 20 m tall building beside the pin, and forecast, sea and tide answers
 * generated for the dates asked. The map picture is then checked for THAT
 * colour, and the shadow for THAT building: what is drawn offline can only
 * have come from the pack (docs/failure-modes.md, C).
 */
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { webkit, devices } from 'playwright'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { encodePng } from '../src/lib/png.ts'
import { encodeTestTile } from '../src/lib/mvtTestTile.ts'
import { tileAt } from '../src/lib/tileRange.ts'

guardAudit('venue pack')
const watchdog = startWatchdog('venue pack', 600_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'venue-pack')
mkdirSync(OUT, { recursive: true })

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const abort = (why) => {
  console.log(`=== VENUE PACK AUDIT ABORTED: ${why} ===`)
  process.exit(2)
}

if (!existsSync('dist/index.html') || !existsSync('dist/sw.js')) abort('no built app in dist/ (run npm run build)')
const newestSrc = ['src/lib/venuePack.ts', 'src/components/VenuePackCard.tsx', 'src/components/ChipRow.tsx'].reduce((m, f) => Math.max(m, statSync(f).mtimeMs), 0)
if (statSync('dist/index.html').mtimeMs < newestSrc) abort('dist/ is older than the pack code: this would test an old build (run npm run build)')

/* ---------------------------------------------------------------- the app */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.wasm': 'application/wasm' }
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  let file = join('dist', path)
  if (!existsSync(file) || statSync(file).isDirectory()) file = join('dist', 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(5198, '127.0.0.1', r))
const ORIGIN = 'http://127.0.0.1:5198'

/* ------------------------------------------------------------- fixtures */
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const IMAGERY_RGB = [47, 107, 58]
const solid = (rgb) => {
  const data = new Uint8ClampedArray(256 * 256 * 4)
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i)
  return encodePng({ width: 256, height: 256, data })
}
const IMAGERY = Buffer.from(await solid(IMAGERY_RGB))
/* Terrarium 0 m: R*256 + G + B/256 - 32768 = 0. */
const TERRAIN = Buffer.from(await solid([128, 0, 0]))
const BUILDING_TILE = tileAt(PIER, 14)
/* A 20 m tall block 40 m west of the pin, in the z14 tile's 4096 units. */
const unit = (lat, lon) => {
  const n = 2 ** 14
  const x = ((lon + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  return { x: Math.round((x - BUILDING_TILE.x) * 4096), y: Math.round((y - BUILDING_TILE.y) * 4096) }
}
const c = unit(PIER.lat, PIER.lon - 0.0005)
const s = 12
const BUILDING = Buffer.from(encodeTestTile({ building: [{ rings: [[{ x: c.x - s, y: c.y - s }, { x: c.x + s, y: c.y - s }, { x: c.x + s, y: c.y + s }, { x: c.x - s, y: c.y + s }]], properties: { render_height: 20, render_min_height: 0 } }] }))
const EMPTY = Buffer.from(encodeTestTile({}))

const asked = {}
const count = (k) => (asked[k] = (asked[k] ?? 0) + 1)

/** Open-Meteo: every hourly variable asked for, over the days asked for, plausible and constant. */
function openMeteo(u) {
  const vars = (u.searchParams.get('hourly') ?? '').split(',').filter(Boolean)
  const start = u.searchParams.get('start_date')
  const days = start === null ? Number(u.searchParams.get('forecast_days') ?? 7) : Math.round((Date.parse(u.searchParams.get('end_date')) - Date.parse(start)) / 86_400_000) + 1
  const from = start ?? '2026-10-29'
  const time = []
  for (let d = 0; d < days; d += 1) for (let h = 0; h < 24; h += 1) time.push(`${new Date(Date.parse(from) + d * 86_400_000).toISOString().slice(0, 10)}T${String(h).padStart(2, '0')}:00`)
  const value = (v) => (/direction/.test(v) ? 200 : /cloud_cover_low/.test(v) ? 60 : /cloud_cover/.test(v) ? 20 : /visibility/.test(v) ? 24000 : /gust/.test(v) ? 7 : /wind_speed/.test(v) ? 4 : /wave_height|swell_wave_height/.test(v) ? 0.6 : /period/.test(v) ? 8 : /sea_surface_temperature/.test(v) ? 18 : /aerosol/.test(v) ? 0.1 : 1)
  const one = { latitude: PIER.lat, longitude: PIER.lon, hourly: Object.fromEntries([['time', time], ...vars.map((v) => [v, time.map(() => value(v))])]) }
  const lats = (u.searchParams.get('latitude') ?? '').split(',')
  return lats.length > 1 ? lats.map(() => one) : one
}

/** NOAA: one station by the pier; highs and lows every 6 h 12 m, and the curve between them. */
function noaa(u) {
  if (u.pathname.includes('/mdapi/')) return { stations: [{ id: 'TEST001', name: 'Virginia Beach pier (audit)', lat: PIER.lat + 0.002, lng: PIER.lon, state: 'VA' }] }
  const day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8))
  const begin = day(u.searchParams.get('begin_date'))
  const end = day(u.searchParams.get('end_date')) + 86_400_000
  const fmt = (t) => new Date(t).toISOString().slice(0, 16).replace('T', ' ')
  const period = 12.42 * 3_600_000
  const level = (t) => 1.8 + 1.6 * Math.cos((2 * Math.PI * (t - begin)) / period)
  if (u.searchParams.get('interval') === 'hilo') {
    const out = []
    for (let t = begin, k = 0; t < end; t += period / 2, k += 1) out.push({ t: fmt(t), v: level(t).toFixed(3), type: k % 2 === 0 ? 'H' : 'L' })
    return { predictions: out }
  }
  const out = []
  for (let t = begin; t < end; t += 360_000) out.push({ t: fmt(t), v: level(t).toFixed(3) })
  return { predictions: out }
}

async function routes(ctx) {
  await ctx.route(/server\.arcgisonline\.com/, (r) => (count('imagery'), r.fulfill({ body: IMAGERY, contentType: 'image/png', headers: { 'content-length': String(IMAGERY.length), 'access-control-allow-origin': '*' } })))
  await ctx.route(/elevation-tiles-prod/, (r) => (count('terrain'), r.fulfill({ body: TERRAIN, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' } })))
  await ctx.route(/tiles\.openfreemap\.org/, (r) => {
    count('vector')
    const m = /\/(\d+)\/(\d+)\/(\d+)\.pbf/.exec(r.request().url())
    const hit = m !== null && +m[1] === 14 && +m[2] === BUILDING_TILE.x && +m[3] === BUILDING_TILE.y
    return r.fulfill({ body: hit ? BUILDING : EMPTY, contentType: 'application/x-protobuf', headers: { 'access-control-allow-origin': '*' } })
  })
  await ctx.route(/open-meteo\.com/, (r) => (count('open-meteo'), r.fulfill({ json: openMeteo(new URL(r.request().url())), headers: { 'access-control-allow-origin': '*' } })))
  await ctx.route(/tidesandcurrents\.noaa\.gov/, (r) => (count('noaa'), r.fulfill({ json: noaa(new URL(r.request().url())), headers: { 'access-control-allow-origin': '*' } })))
  /* Anything else outside: refused, so nothing real is reached and nothing hangs. */
  await ctx.route((url) => !url.href.startsWith(ORIGIN) && !/arcgisonline|elevation-tiles|openfreemap|open-meteo|tidesandcurrents/.test(url.href), (r) => (count('other'), r.abort()))
}

/* -------------------------------------------------------------- the run */
const venue = {
  ...CALIBRATION_VENUE,
  name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' },
  latitude: String(PIER.lat),
  longitude: String(PIER.lon),
  date: '2026-10-30',
  startTime: '09:00',
  endTime: '11:00',
}
const link = new URL(await shareLink(`${ORIGIN}/`, { id: 'pack', name: 'Pack check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
link.search = '?probe=1'

/*
 * TWO SITTINGS ON ONE PHONE (one profile on disk). WebKit sends every request
 * of a page a service worker controls past Playwright's routes, even ones the
 * worker passes through, so a pack saved under the worker would download the
 * real tiles and not the fixture. So the pack is saved first with service
 * workers blocked, the fixtures answering; then the same profile is opened
 * with the worker allowed, which installs on a light page; then the network
 * goes and the venue is opened.
 */
const sizes = []
const profiles = []
const browserInsets = [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]
const open = async (dir, insets, serviceWorkers) => {
  const ctx = await webkit.launchPersistentContext(dir, { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers })
  await routes(ctx)
  await ctx.addInitScript(([top, bottom]) => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank has no storage. */
    }
    const add = () => {
      const st = document.createElement('style')
      st.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
      document.head.appendChild(st)
    }
    if (document.head) add()
    else document.addEventListener('DOMContentLoaded', add)
  }, [insets.top, insets.bottom])
  const page = ctx.pages()[0] ?? (await ctx.newPage())
  page.on('pageerror', (e) => console.log(`  page error: ${String(e).slice(0, 300)}`))
  await page.clock.setFixedTime(new Date('2026-10-29T22:00:00Z'))
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const until = async (expr, ms) => {
    for (let t = 0; t < ms; t += 500) {
      const v = await ev(expr).catch(() => null)
      if (v) return v
      await wait(500)
    }
    return null
  }
  const toVenue = async () => {
    /* Not a hash change on the same page: a fresh load, as a link from another app is. */
    await page.goto('about:blank')
    await page.goto(link.href).catch(() => {})
    await wait(3000)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await page.getByText('Open the map', { exact: true }).click({ timeout: 3000 }).catch(() => {})
    await until(`!!window.__probe?.map`, 20000)
    await goToStage(ev, wait, 'plan').catch(() => {})
    await wait(3000)
    const where = await ev(`(() => { const c = window.__probe?.map?.getCenter(); return c ? { lat: c.lat, lon: c.lng } : null })()`).catch(() => null)
    return where !== null && Math.abs(where.lat - PIER.lat) < 0.05 && Math.abs(where.lon - PIER.lon) < 0.05
  }
  /* The card is in the sheet: raised to full (two taps on its handle) and scrolled to, for its picture. */
  const showCard = async () => {
    for (let i = 0; i < 3; i += 1) {
      if (await ev(`/full/.test(document.querySelector('.sheet__handle')?.getAttribute('aria-label') ?? '')`)) break
      await ev(`document.querySelector('.sheet__handle')?.click()`)
      await wait(500)
    }
    await ev(`document.querySelector('.vpack')?.scrollIntoView({ block: 'center' })`)
    await wait(400)
  }
  return { ctx, page, wait, ev, until, toVenue, showCard }
}

try {
  for (const [label, insets] of browserInsets) {
    console.log(`\n### ${label}`)
    for (const k of Object.keys(asked)) delete asked[k]
    const dir = mkdtempSync(join(tmpdir(), 'scoutngo-pack-'))
    profiles.push(dir)

    /* FIRST SITTING: save, with the fixtures answering. */
    const a = await open(dir, insets, 'block')
    if (!(await a.toVenue())) {
      await a.page.screenshot({ path: join(OUT, `not-at-venue-${label}.png`) })
      abort(`${label}: the app is not at the pier the link names`)
    }
    if ((await a.page.locator('.vpack__go').count()) === 0) {
      fail(`${label}: no "Save for offline" on the shoot card`)
      await a.page.screenshot({ path: join(OUT, `pack-missing-${label}.png`) })
      await a.ctx.close()
      continue
    }
    /* In the sheet, below the fold at its resting height: clicked as a tap on it would. */
    await a.ev(`document.querySelector('.vpack__go')?.click()`)
    const measured = await a.until(`(() => { const b = [...document.querySelectorAll('.vpack__go')].find((x) => /^Save \\d/.test(x.textContent)); return b ? document.querySelector('.vpack__line')?.textContent ?? 'measured' : null })()`, 30000)
    console.log(`  measured: ${measured}`)
    if (measured === null) fail(`${label}: no size was shown before saving`)
    else if (!/^About [\d.]+ MB$/.test(measured)) fail(`${label}: the size line reads "${measured}"`)
    await a.showCard()
    await a.page.screenshot({ path: join(OUT, `pack-measured-${label}.png`) })
    await a.ev(`document.querySelector('.vpack__go')?.click()`)
    const saved = await a.until(`document.querySelector('.vpack[data-pack="saved"] .vpack__line')?.textContent ?? null`, 240000)
    console.log(`  saved: ${saved}`)
    watchdog.note(`${label}: saved`)
    if (saved === null) {
      fail(`${label}: the pack never finished saving`)
      await a.ctx.close()
      continue
    }
    const record = await a.ev(`JSON.parse(localStorage.getItem('scoutngo.venuePacks.v1') ?? '[]')[0] ?? null`)
    console.log(`  pack: ${JSON.stringify({ tiles: record?.tileBytes, data: record?.dataBytes, keys: record?.keys?.length, kept: record?.data })}`)
    console.log(`  asked while saving: ${JSON.stringify(asked)}`)
    if (!(asked.imagery > 3000)) fail(`${label}: only ${asked.imagery} imagery tiles came from the fixture; a pack is over 3000`)
    if (record?.data?.tideDays !== 7) fail(`${label}: the pack kept ${record?.data?.tideDays} days of tides, not 7`)
    if (record?.data?.day !== true || record?.data?.hours !== true || record?.data?.marine !== true) fail(`${label}: the pack is missing forecast data ${JSON.stringify(record?.data)}`)
    sizes.push({ label, tileBytes: record?.tileBytes, dataBytes: record?.dataBytes })
    await a.showCard()
    await a.page.screenshot({ path: join(OUT, `pack-saved-${label}.png`) })
    await a.ctx.close()

    /* SECOND SITTING: the service worker installs on a page with no map, then the network goes. */
    const b = await open(dir, insets, 'allow')
    await b.page.goto(`${ORIGIN}/how`)
    await b.ev(`navigator.serviceWorker?.ready.then(() => true)`)
    await b.page.reload()
    if (!(await b.until(`!!navigator.serviceWorker?.controller`, 15000))) abort(`${label}: the service worker never took the page, so a launch with no network cannot be tested`)
    await b.ctx.setOffline(true)
    const there = await b.toVenue()
    if (!there) {
      await b.page.screenshot({ path: join(OUT, `offline-not-at-venue-${label}.png`) })
      fail(`${label}: with no network the app did not open on the pier`)
    }
    await b.wait(6000)
    const { page, ev, wait, ctx } = b
    looked += 1

    const line = await ev(`document.querySelector('.offline-line')?.textContent ?? null`)
    console.log(`  offline line: ${line}`)
    if (line === null || !/^Offline · using saved data from \d{1,2}:\d{2}/.test(line)) fail(`${label}: the offline line reads ${JSON.stringify(line)}`)
    const lineBox = await ev(`(() => { const e = document.querySelector('.offline-line'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, h: r.height, wraps: e.scrollWidth > e.clientWidth + 1 } })()`)
    if (lineBox !== null && (lineBox.top < insets.top || lineBox.wraps || lineBox.h > 24)) fail(`${label}: the offline line is under the status bar, cut or two lines ${JSON.stringify(lineBox)}`)

    const chips = await ev(`[...document.querySelectorAll('.chip2')].map((c) => ({ label: c.querySelector('.chip2__label')?.textContent ?? '', value: c.querySelector('.chip2__value')?.textContent ?? '', age: c.querySelector('.chip2__age')?.textContent ?? null }))`)
    console.log(`  chips: ${JSON.stringify(chips)}`)
    const wind = chips.find((c) => /WIND/.test(c.label))
    if (wind === undefined || /no data|^—/.test(wind.value)) fail(`${label}: the wind chip has no value offline (${JSON.stringify(wind)})`)
    const cloud = chips.find((c) => /CLOUD/.test(c.label))
    if (cloud === undefined || /no data|^—/.test(cloud.value)) fail(`${label}: the cloud chip has no value offline (${JSON.stringify(cloud)})`)
    if (!chips.some((c) => c.age !== null)) fail(`${label}: no chip says how old its saved value is`)
    const cut = await ev(`[...document.querySelectorAll('.chip2__label, .chip2__value')].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent)`)
    if (cut.length > 0) fail(`${label}: chip text cut off offline: ${JSON.stringify(cut)}`)

    /* The picture: the fixture's colour, which only the pack could have supplied. */
    const shot = await page.screenshot({ path: join(OUT, `offline-map-${label}.png`) })
    const share = await ev(`(async () => {
      const img = new Image()
      img.src = 'data:image/png;base64,${shot.toString('base64')}'
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      const x = c.getContext('2d'); x.drawImage(img, 0, 0)
      const d = x.getImageData(0, Math.round(img.height * 0.2), img.width, Math.round(img.height * 0.3)).data
      let hit = 0
      for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - ${IMAGERY_RGB[0]}) < 40 && Math.abs(d[i + 1] - ${IMAGERY_RGB[1]}) < 40 && Math.abs(d[i + 2] - ${IMAGERY_RGB[2]}) < 40) hit += 1
      return hit / (d.length / 4)
    })()`)
    console.log(`  map picture from the pack: ${(share * 100).toFixed(0)}% of the band below the chips`)
    if (!(share > 0.3)) fail(`${label}: the map picture is not the saved imagery (${(share * 100).toFixed(0)}% of the band)`)

    const drawn = await ev(`(() => {
      const m = window.__probe?.map
      if (!m) return null
      const ids = (re) => m.getStyle().layers.filter((l) => re.test(l.id) || re.test(String(l.source))).map((l) => l.id)
      const n = (re) => { const l = ids(re); return l.length === 0 ? -1 : m.queryRenderedFeatures({ layers: l }).length }
      return { sun: n(/^sun-(axis|rays)/), shadows: n(/^shadow-fill$/) }
    })()`)
    console.log(`  drawn offline: ${JSON.stringify(drawn)}`)
    if (drawn === null) fail(`${label}: no map probe after the offline reload`)
    else {
      if (!(drawn.sun > 0)) fail(`${label}: no sun line on the glass offline`)
      if (!(drawn.shadows > 0)) fail(`${label}: no shadow on the glass offline (the pack's building)`)
    }

    /* The tide curve. */
    await page.locator('.chip2', { hasText: 'TIDE' }).first().click({ timeout: 3000 }).catch(() => {})
    await wait(2500)
    const tide = await ev(`(() => { const p = document.querySelector('.tpage'); const path = document.querySelector('.tpage .tides__line'); return { page: !!p, curve: !!path && (path.getAttribute('d') ?? '').length > 20, text: p?.textContent ?? '' } })()`)
    console.log(`  tides offline: ${JSON.stringify({ page: tide.page, curve: tide.curve })}`)
    if (!tide.curve) fail(`${label}: no tide curve offline`)
    if (/didn.t load/.test(tide.text)) fail(`${label}: part of the Tides page did not load offline: "${tide.text.match(/[^.]*didn.t load[^.]*/)?.[0]}"`)
    await page.screenshot({ path: join(OUT, `offline-tides-${label}.png`) })
    await ctx.close()
    watchdog.note(`${label}: offline checked`)
  }
} finally {
  server.close()
  for (const dir of profiles) rmSync(dir, { recursive: true, force: true })
}
watchdog.stop()
if (looked === 0) abort('no offline reload was looked at')
console.log(`  pack sizes with the fixture tiles: ${JSON.stringify(sizes)} (the real size per venue is measured by scripts/measure-venue-pack.mjs)`)
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== VENUE PACK PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
