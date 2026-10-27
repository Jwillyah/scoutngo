/*
 * THE 3D VIEW WHEN ITS MAP DATA FAILS: OVERPASS DOWN, AND THE MAP TILES DOWN.
 *
 * Usage:  node scripts/measure-3d-map-faults.mjs   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-3d-map-faults.md
 * Exits:  0 every case passed; 1 not; 2 could not look.
 *
 * WHY. At Virginia Beach Fishing Pier on 27 Oct an iPhone behind iCloud
 * Private Relay got "Map data didn't load" every time: the buildings came
 * from Overpass, which limits by address. They come from OpenFreeMap's map
 * tiles now (src/lib/vectorTiles.ts), and Overpass is asked only for the
 * trees, a failure that must never block 3D.
 *
 * On a 390 x 844 screen at the pier, nothing saved on the phone (local
 * storage and the tile cache emptied) at the start of every case:
 *
 *   Overpass blocked, hanging, or answering 429 (all three servers at once),
 *   the map tiles open: the buildings must be drawn, the pill must never say
 *   "Map data didn't load", never more than one Overpass request on the wire,
 *   and once Overpass has been given up on the legend says the trees did not
 *   load.
 *
 *   The map tiles blocked too: the pill must say "Map data didn't load", be
 *   one small line, and Retry with the tiles let through must draw the
 *   buildings.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { OVERPASS_SERVERS } from '../src/lib/overpassClient.ts'

guardAudit('3d map faults')
const watchdog = startWatchdog('3d map faults', 1_200_000)
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const WATCH_MS = 60_000
const TILE_HOST = 'tiles.openfreemap.org'
const OVERPASS_HOSTS = OVERPASS_SERVERS.map((u) => new URL(u).host)
const CASES = [
  { name: 'Overpass blocked', overpass: 'blocked', tiles: 'open' },
  { name: 'Overpass hanging', overpass: 'hanging', tiles: 'open' },
  { name: 'Overpass 429', overpass: '429', tiles: 'open' },
  { name: 'map tiles blocked', overpass: 'blocked', tiles: 'blocked' },
]

const venue = { ...CALIBRATION_VENUE, name: null, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-27', startTime: '07:11', endTime: '08:30' }
const link = await shareLink('http://127.0.0.1:5173/', { id: 'vb', name: 'Virginia Beach Fishing Pier', savedAt: '2026-10-27T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })

const { send, ev, wait, dispose, onEvent } = await connect()
const rows = []
let overpass = 'open'
const isOverpass = (url) => OVERPASS_HOSTS.includes(new URL(url).host)
let asked = 0
let tilesAsked = 0

try {
  await send('Network.enable', {})
  await send('Fetch.enable', { patterns: OVERPASS_HOSTS.map((host) => ({ urlPattern: `https://${host}/*`, requestStage: 'Request' })) })
  onEvent('Network.requestWillBeSent', (p) => {
    if (isOverpass(p.request.url)) asked += 1
    if (new URL(p.request.url).host === TILE_HOST) tilesAsked += 1
  })
  onEvent('Fetch.requestPaused', (p) => {
    if (overpass === 'hanging') return
    if (overpass === '429') {
      const headers = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Retry-After', value: '2' }]
      return void send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 429, responseHeaders: headers, body: '' })
    }
    void send('Fetch.continueRequest', { requestId: p.requestId })
  })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  for (const c of CASES) {
    overpass = c.overpass
    asked = 0
    tilesAsked = 0
    const blocked = [...(c.overpass === 'blocked' ? OVERPASS_HOSTS.map((h) => `*${h}*`) : []), ...(c.tiles === 'blocked' ? [`*${TILE_HOST}*`] : [])]
    await send('Network.setBlockedURLs', { urls: blocked })
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
    await wait(2500)
    await ev(`(async () => { localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true'); await caches.delete('scoutngo-tiles-v1'); return 1 })()`)
    await send('Page.navigate', { url: 'about:blank' })
    await wait(500)
    await send('Page.navigate', { url: link.replace('/#plan=', '/?probe=1#plan=') })
    let opened = false
    for (let i = 0; i < 30 && !opened; i += 1) {
      await wait(500)
      opened = await ev(`(() => { const b = document.querySelector('.confirm__yes'); if (!b) return false; b.click(); return true })()`)
    }
    if (!opened) throw new Error(`${c.name}: the shared plan for the pier was not offered`)
    await wait(2000)
    await goToStage(ev, wait, 'plan')
    await wait(1500)
    if (!(await ev(`(() => { const b = document.querySelector('button[aria-label="Open the 3D clay model"]'); if (!b) return false; b.click(); return true })()`))) throw new Error(`${c.name}: no 3D button`)
    const tapped = Date.now()

    let pill = null
    let pillAt = null
    let drawnAt = null
    let drawn = 0
    let trees = null
    while (Date.now() - tapped < WATCH_MS) {
      await wait(1000)
      const now = JSON.parse(
        await ev(`JSON.stringify((() => {
          const p = document.querySelector('.clay__pill'); const r = p?.getBoundingClientRect()
          return { pill: p ? { text: p.textContent, w: r.width, h: r.height } : null, drawn: window.__clay?.buildings().length ?? 0, legend: document.querySelector('.clay__legend')?.textContent ?? '' }
        })())`),
      )
      if (now.pill?.text.startsWith("Map data didn't load") && pillAt === null) {
        pill = now.pill
        pillAt = Date.now() - tapped
      }
      if (now.drawn > 0 && drawnAt === null) drawnAt = Date.now() - tapped
      drawn = now.drawn
      trees = /trees didn't load/.test(now.legend) ? "trees didn't load" : /mapped trees|no trees drawn/.test(now.legend) ? 'trees drawn' : 'not said yet'
      if (c.tiles === 'blocked' && pillAt !== null) break
      if (c.tiles === 'open' && drawnAt !== null && trees !== 'not said yet') break
    }
    const appPeak = await ev(`window.__probe?.overpass?.().peak ?? null`)

    let retried = null
    if (c.tiles === 'blocked') {
      await send('Network.setBlockedURLs', { urls: OVERPASS_HOSTS.map((h) => `*${h}*`) })
      const pressed = await ev(`(() => { const b = document.querySelector('.clay__pillbtn'); if (!b) return false; b.click(); return true })()`)
      retried = 0
      for (let i = 0; i < 30 && pressed; i += 1) {
        await wait(1000)
        retried = await ev(`window.__clay?.buildings().length ?? 0`)
        if (retried > 0) break
      }
    }

    const row = { ...c, pillAt, pill, drawnAt, drawn, trees, asked, tilesAsked, appPeak, retried }
    row.pass =
      c.tiles === 'open'
        ? pillAt === null && drawn > 0 && (appPeak === null || appPeak <= 1) && (c.overpass === 'hanging' || trees === "trees didn't load")
        : pillAt !== null && pill.h <= 40 && pill.w <= 260 && retried > 0
    rows.push(row)
    console.log(JSON.stringify(row))
  }
} catch (error) {
  console.log(`=== 3D MAP FAULTS ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  watchdog.stop()
  await dispose()
  process.exit(2)
}
watchdog.stop()
await dispose()

const s = (ms) => (ms === null ? 'never' : (ms / 1000).toFixed(1))
const pass = rows.every((r) => r.pass)
const out = [
  "# The 3D view when its map data fails: Overpass down, and the map tiles down",
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-3d-map-faults.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · screen 390 x 844 · nothing saved on the phone at the start of each case`,
  `Faults are made in the browser (Chrome DevTools Protocol): Overpass on all three servers at once (${OVERPASS_HOSTS.join(', ')}); the map tiles at ${TILE_HOST}. Watched for ${WATCH_MS / 1000} s from opening 3D.`,
  "Limits. Overpass down, tiles open: buildings drawn, the pill never says \"Map data didn't load\", never more than 1 Overpass request on the wire (the client's own count, src/lib/overpassClient.ts), and when Overpass refuses the legend says the trees did not load. Tiles down: the pill says it, one line (40 px tall or less, 260 px wide or less), and Retry with the tiles let through draws the buildings.",
  '',
  '| case | buildings drawn after opening 3D (s) | buildings | "Map data didn\'t load" after (s) | pill (w x h px) | trees | Overpass requests | most at once | map tile requests | Retry: buildings | pass |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${s(r.drawnAt)} | ${r.drawn} | ${s(r.pillAt)} | ${r.pill === null ? '—' : `${Math.round(r.pill.w)} x ${Math.round(r.pill.h)}`} | ${r.trees} | ${r.asked} | ${r.appPeak ?? 'not reported'} | ${r.tilesAsked} | ${r.retried ?? '—'} | ${r.pass ? 'yes' : 'NO'} |`),
  '',
  `${pass ? 'Pass.' : 'FAIL.'}`,
  '',
]
const file = `measurements/${new Date().toISOString().slice(0, 10)}-3d-map-faults.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
process.exit(pass ? 0 : 1)
