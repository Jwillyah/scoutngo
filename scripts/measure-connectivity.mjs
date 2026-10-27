/*
 * DOES THE APP SAY OFFLINE WHEN IT IS NOT, OR STAY OFFLINE WHEN IT IS BACK?
 *
 * Usage:  node scripts/measure-connectivity.mjs   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-connectivity.md
 * Exits:  0 every case passed; 1 not; 2 could not look.
 *
 * WHY. At Virginia Beach on 27 Oct an iPhone with five bars of 5G showed
 * OFFLINE, and Wind and Cloud said "no data". What decides offline is
 * src/lib/connectivity.ts: a failed request is a reason to check the app's own
 * origin, and offline is that check failing twice.
 *
 * HOW. Virginia Beach Fishing Pier, a 390 x 844 screen, nothing saved. The
 * plan is opened with the network whole; then the fault is put on and the app
 * is used the way it was on the beach: the map moved, the time bar moved to
 * the next hour (a new forecast), and 3D opened (buildings, terrain, trees).
 * The top bar is watched every 500 ms for WATCH_MS.
 *
 *   A host refusing is Chrome failing every request to it, at once, the way
 *   a refused connection does. A host hanging is every request held and never
 *   answered. Slow 4G is Chrome's own preset: 562.5 ms round trip, 1.44 Mbps
 *   down, 675 kbps up.
 *
 *   Pass, network up in any form: the top bar never says offline, and Wind
 *   and Cloud carry a figure at the end.
 *   Pass, network really gone (everything fails, the app's own origin too):
 *   the top bar says offline, and once the network is back it stops saying it
 *   with no reload.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { OVERPASS_SERVERS } from '../src/lib/overpassClient.ts'

guardAudit('connectivity')
const watchdog = startWatchdog('connectivity', 1_500_000)
const WATCH_MS = 60_000
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const SLOW_4G = { offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 }
const OVERPASS = OVERPASS_SERVERS.map((u) => new URL(u).host)
const TILES = 'tiles.openfreemap.org'
const IMAGERY = 'server.arcgisonline.com'
const ALL_CASES = [
  { name: 'network whole (control)', slow: false, refuse: [], hang: [], gone: false },
  { name: 'slow 4G', slow: true, refuse: [], hang: [], gone: false },
  { name: 'Overpass refusing', slow: false, refuse: OVERPASS, hang: [], gone: false },
  { name: 'map tiles refusing', slow: false, refuse: [TILES], hang: [], gone: false },
  { name: 'photo tiles hanging', slow: false, refuse: [], hang: [IMAGERY], gone: false },
  { name: 'slow 4G, Overpass and map tiles refusing', slow: true, refuse: [...OVERPASS, TILES], hang: [], gone: false },
  { name: 'network gone, then back', slow: false, refuse: [], hang: [], gone: true },
]
/* SCOUTNGO_CASE=<words> runs only the cases whose name has them, for a second look at one. */
const CASES = process.env.SCOUTNGO_CASE ? ALL_CASES.filter((c) => c.name.includes(process.env.SCOUTNGO_CASE)) : ALL_CASES

const venue = { ...CALIBRATION_VENUE, name: null, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-27', startTime: '06:45', endTime: '07:45' }
const link = await shareLink('http://127.0.0.1:5173/', { id: 'vb', name: 'Virginia Beach Fishing Pier', savedAt: '2026-10-27T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })

const { send, ev, wait, dispose, onEvent } = await connect()
const rows = []
let fault = { refuse: [], hang: [] }
let probes = 0
const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const OFFLINE_MARK = `!!document.querySelector('[aria-label="No connection"]')`
const chips = `JSON.stringify(Object.fromEntries([...document.querySelectorAll('.chip2')].map((c) => { const t = c.textContent.trim(); const k = (t.match(/^[A-Z ]+/) ?? [''])[0].trim(); return [k, t.slice(k.length).trim()] })))`

try {
  await send('Network.enable', {})
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
  onEvent('Fetch.requestPaused', (p) => {
    const host = hostOf(p.request.url)
    if (host === '127.0.0.1:5173' && p.request.method === 'HEAD') probes += 1
    if (fault.refuse.includes(host)) return void send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'ConnectionRefused' })
    if (fault.hang.includes(host)) return
    void send('Fetch.continueRequest', { requestId: p.requestId })
  })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  for (const c of CASES) {
    fault = { refuse: [], hang: [] }
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
    await wait(2500)
    await ev(`(async () => { localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true'); for (const k of await caches.keys()) await caches.delete(k); return 1 })()`)
    await send('Page.navigate', { url: 'about:blank' })
    await wait(300)
    await send('Page.navigate', { url: link })
    let opened = false
    for (let i = 0; i < 30 && !opened; i += 1) {
      await wait(500)
      opened = await ev(`(() => { const b = document.querySelector('.confirm__yes'); if (!b) return false; b.click(); return true })()`)
    }
    if (!opened) throw new Error(`${c.name}: the shared plan for the pier was not offered`)
    await wait(1500)
    await goToStage(ev, wait, 'plan')
    await wait(1500)

    /* The fault goes on, and the app is used. */
    fault = { refuse: c.refuse, hang: c.hang }
    probes = 0
    if (c.slow) await send('Network.emulateNetworkConditions', SLOW_4G)
    if (c.gone) await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    const start = Date.now()
    await ev(`(() => { const m = window.__probe?.map; if (m) m.panBy([180, 120], { duration: 0 }); return 1 })()`)
    await ev(`(() => { const el = document.querySelector('.tbar__jump'); if (!el) return 0; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, '2026-10-27T08:30'); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return 1 })()`)
    await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)

    let offlineMs = 0
    let firstOffline = null
    let backAt = null
    let restoredAt = null
    while (Date.now() - start < WATCH_MS) {
      await wait(500)
      const off = await ev(OFFLINE_MARK)
      if (off === true) {
        offlineMs += 500
        if (firstOffline === null) firstOffline = Date.now() - start
      }
      /* Half way through, the network comes back: the mark must go by itself. */
      if (c.gone && restoredAt === null && Date.now() - start > WATCH_MS / 2) {
        await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
        restoredAt = Date.now() - start
      }
      if (c.gone && restoredAt !== null && backAt === null && off === false) backAt = Date.now() - start
    }
    const end = JSON.parse(await ev(chips))
    const reloaded = await ev(`performance.getEntriesByType('navigation')[0]?.type ?? null`)
    const row = { name: c.name, offlineMs, firstOffline, restoredAt, backAt, wind: end.WIND ?? '—', cloud: end.CLOUD ?? '—', probes, reloaded }
    const figure = (s) => /\d/.test(s)
    row.pass = c.gone
      ? firstOffline !== null && firstOffline < restoredAt && backAt !== null && backAt - restoredAt <= 15_000
      : offlineMs === 0 && figure(row.wind) && figure(row.cloud)
    rows.push(row)
    console.log(JSON.stringify(row))
    watchdog.note(c.name)
  }
} catch (error) {
  console.log(`=== CONNECTIVITY ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  watchdog.stop()
  await dispose()
  process.exit(2)
}
await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
await send('Fetch.disable')
watchdog.stop()
await dispose()

const s = (ms) => (ms === null ? '—' : (ms / 1000).toFixed(1))
const pass = rows.every((r) => r.pass)
const out = [
  '# Does the app say offline when it is not, or stay offline when it is back?',
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-connectivity.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · screen 390 x 844 · nothing saved at the start of each case · watched ${WATCH_MS / 1000} s from when the fault went on`,
  `Faults (Chrome DevTools Protocol): refusing = every request to the host failed at once (ConnectionRefused); hanging = held, never answered; slow 4G = ${SLOW_4G.latency} ms round trip, ${(SLOW_4G.downloadThroughput * 8) / 1000} kbps down, ${(SLOW_4G.uploadThroughput * 8) / 1000} kbps up; network gone = Chrome offline, the app's own origin included, put back half way through.`,
  'After the fault: the map moved, the time bar moved to 8:30 AM (a new forecast hour), 3D opened. Overpass hosts: ' + OVERPASS.join(', ') + `; map tiles ${TILES}; photo tiles ${IMAGERY}.`,
  'Pass: with the network up in any form, the top bar never says offline and Wind and Cloud carry a figure at the end. With it gone, the top bar says offline, and says it no longer within 15 s of the network coming back, with no reload.',
  '',
  '| case | top bar said offline (s of the watch) | first said it at (s) | network back at (s) | mark gone at (s) | Wind at the end | Cloud at the end | checks of the app origin | page navigation type | pass |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} | ${s(r.offlineMs)} | ${s(r.firstOffline)} | ${s(r.restoredAt)} | ${s(r.backAt)} | ${r.wind} | ${r.cloud} | ${r.probes} | ${r.reloaded} | ${r.pass ? 'yes' : 'NO'} |`),
  '',
  pass ? 'Pass.' : 'FAIL.',
  '',
]
const file = process.env.SCOUTNGO_OUT_FILE ?? `measurements/${new Date().toISOString().slice(0, 10)}-connectivity${process.env.SCOUTNGO_LABEL ? '-' + process.env.SCOUTNGO_LABEL : ''}.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
process.exit(pass ? 0 : 1)
