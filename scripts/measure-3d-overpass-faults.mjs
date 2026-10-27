/*
 * THE 3D VIEW WHEN OVERPASS FAILS: BLOCKED, HANGING, AND 429.
 *
 * Usage:  node scripts/measure-3d-overpass-faults.mjs   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-3d-overpass-faults.md
 * Exits:  0 every case passed; 1 not; 2 could not look.
 *
 * On a phone-sized screen (390 x 844) at Virginia Beach Fishing Pier, with
 * nothing saved on the phone, three ways for Overpass to fail, all three of
 * its servers at once (src/lib/overpassClient.ts):
 *
 *   blocked   every request refused before it leaves (no network, a filter)
 *   hanging   every request accepted and never answered
 *   429       every server says "too many requests, retry after 2 s"
 *
 * For each: the time from opening 3D to the pill saying "Map data didn't
 * load", which must be under 60 s; how many Overpass requests were ever on
 * the wire at once, which must be 1; that the pill is one small line and no
 * error box is stacked in the legend. Then Retry is pressed with the fault
 * lifted and a small answer served in Overpass's place, and the building in
 * it must be drawn: Retry has to work, not just be there.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

guardAudit('3d overpass faults')
const watchdog = startWatchdog('3d overpass faults', 900_000)
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const PILL_WITHIN_MS = 60_000
const MODES = ['blocked', 'hanging', '429']
/* What Overpass is made to answer on Retry: one building by the pier, 20 m tall. */
const ANSWER = JSON.stringify({
  elements: [
    {
      type: 'way',
      id: 1,
      tags: { building: 'yes', height: '20' },
      geometry: [
        { lat: 36.8437, lon: -75.9722 },
        { lat: 36.8439, lon: -75.9722 },
        { lat: 36.8439, lon: -75.9719 },
        { lat: 36.8437, lon: -75.9719 },
        { lat: 36.8437, lon: -75.9722 },
      ],
    },
  ],
})

const venue = { ...CALIBRATION_VENUE, name: null, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-26', startTime: '16:00', endTime: '18:00' }
const link = await shareLink('http://127.0.0.1:5173/', { id: 'vb', name: 'Virginia Beach Fishing Pier', savedAt: '2026-10-26T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })

const { send, ev, wait, dispose, onEvent } = await connect()
const rows = []
let fault = 'none'
const live = new Map()
let peak = 0
let overlapMs = 0
let asked = []
const isOverpass = (url) => /^https:\/\/(overpass-api\.de|overpass\.kumi\.systems|overpass\.private\.coffee)\//.test(url)

try {
  await send('Network.enable', {})
  /* The servers only: the app's own modules are called overpass.ts and overpassClient.ts. */
  await send('Fetch.enable', { patterns: ['overpass-api.de', 'overpass.kumi.systems', 'overpass.private.coffee'].map((host) => ({ urlPattern: `https://${host}/*`, requestStage: 'Request' })) })
  onEvent('Network.requestWillBeSent', (p) => {
    if (!isOverpass(p.request.url)) return
    live.set(p.requestId, Date.now())
    peak = Math.max(peak, live.size)
    asked.push(new URL(p.request.url).host)
  })
  /* An overlap lasts from a newer request's start until the older one's end is reported. */
  const done = (p) => {
    const started = live.get(p.requestId)
    if (started === undefined) return
    const now = Date.now()
    for (const [id, other] of live) if (id !== p.requestId && other > started) overlapMs = Math.max(overlapMs, now - other)
    live.delete(p.requestId)
  }
  onEvent('Network.loadingFinished', done)
  onEvent('Network.loadingFailed', done)
  onEvent('Fetch.requestPaused', (p) => {
    const cors = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Content-Type', value: 'application/json' }]
    if (!isOverpass(p.request.url)) return void send('Fetch.continueRequest', { requestId: p.requestId })
    if (fault === 'hanging') return
    if (fault === '429') {
      void send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 429, responseHeaders: [...cors, { name: 'Retry-After', value: '2' }], body: '' })
    } else if (fault === 'answer') {
      void send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: cors, body: Buffer.from(ANSWER).toString('base64') })
    } else {
      void send('Fetch.continueRequest', { requestId: p.requestId })
    }
  })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })

  for (const mode of MODES) {
    fault = mode
    asked = []
    peak = 0
    overlapMs = 0
    live.clear()
    await send('Network.setBlockedURLs', { urls: mode === 'blocked' ? ['*overpass-api.de*', '*overpass.kumi.systems*', '*overpass.private.coffee*'] : [] })
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
    await wait(2500)
    /* A phone that has never been here: nothing saved, the plan not yet imported. */
    await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true')`)
    await send('Page.navigate', { url: 'about:blank' })
    await wait(500)
    /* ?probe=1 puts the client's own count on window.__probe; shareLink keeps the query empty. */
    await send('Page.navigate', { url: link.replace('/#plan=', '/?probe=1#plan=') })
    let opened = false
    for (let i = 0; i < 30 && !opened; i += 1) {
      await wait(500)
      opened = await ev(`(() => { const b = document.querySelector('.confirm__yes'); if (!b) return false; b.click(); return true })()`)
    }
    if (!opened) {
      const shot = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(`${process.env.TMPDIR ?? '/tmp'}/faults-${mode}.png`, Buffer.from(shot.result?.data ?? shot.data, 'base64'))
      throw new Error(`${mode}: the shared plan for the pier was not offered (screen at ${process.env.TMPDIR ?? '/tmp'}/faults-${mode}.png; at ${await ev('location.href')})`)
    }
    const venueSet = Date.now()
    await wait(2000)
    await goToStage(ev, wait, 'plan')
    await wait(1500)
    const pressed = await ev(`(() => { const b = document.querySelector('button[aria-label="Open the 3D clay model"]'); if (!b) return false; b.click(); return true })()`)
    if (!pressed) throw new Error(`${mode}: no 3D button`)
    const tapped = Date.now()

    let pill = null
    let sawLoading = false
    while (Date.now() - tapped < PILL_WITHIN_MS + 15_000) {
      await wait(500)
      pill = JSON.parse(await ev(`JSON.stringify((() => { const p = document.querySelector('.clay__pill'); if (!p) return null; const r = p.getBoundingClientRect(); return { text: p.textContent, w: r.width, h: r.height, x: r.x, y: r.y } })())`))
      if (pill?.text.startsWith('Loading')) sawLoading = true
      if (pill?.text.startsWith("Map data didn't load")) break
    }
    const failedAt = Date.now()
    /* The client's own count of requests on the wire (src/lib/overpassClient.ts), beside the browser's. */
    const appPeak = await ev(`window.__probe?.overpass?.().peak ?? null`)
    const failed = pill?.text.startsWith("Map data didn't load") === true
    const legend = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.clay__legend > *')].map((e) => e.textContent))`))
    const stacked = legend.filter((t) => /didn't load|did not answer|Coastline/.test(t) && !t.startsWith('Map data')).length
    const errorCount = await ev(`(() => { const p = document.querySelector('.clay__pill'); return p ? 1 : 0 })()`)

    /* Retry, with Overpass answering. */
    fault = 'answer'
    await send('Network.setBlockedURLs', { urls: [] })
    const retried = await ev(`(() => { const b = document.querySelector('.clay__pillbtn'); if (!b) return false; b.click(); return true })()`)
    let drawn = 0
    for (let i = 0; i < 40 && retried; i += 1) {
      await wait(500)
      drawn = await ev(`window.__clay?.buildings().length ?? 0`)
      if (drawn > 0) break
    }
    const afterRetry = await ev(`document.querySelector('.clay__pill')?.textContent ?? 'no pill'`)

    const row = {
      mode,
      fromTap: failedAt - tapped,
      fromVenue: failedAt - venueSet,
      failed,
      sawLoading,
      requests: asked.length,
      hosts: [...new Set(asked)],
      peak,
      appPeak,
      overlapMs,
      pill,
      stacked,
      errorCount,
      drawn,
      afterRetry,
    }
    row.pass = failed && row.fromTap < PILL_WITHIN_MS && appPeak === 1 && pill !== null && pill.h <= 40 && pill.w <= 260 && stacked === 0 && drawn > 0
    rows.push(row)
    console.log(JSON.stringify(row))
  }
} catch (error) {
  console.log(`=== 3D OVERPASS FAULTS ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  watchdog.stop()
  await dispose()
  process.exit(2)
}
watchdog.stop()
await dispose()

const s = (ms) => (ms / 1000).toFixed(1)
const pass = rows.every((r) => r.pass)
const out = [
  '# The 3D view when Overpass fails: blocked, hanging, 429',
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-3d-overpass-faults.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · screen 390 x 844 · nothing saved on the phone`,
  'Faults are made in the browser (Chrome DevTools Protocol) for all three Overpass servers at once. Retry is pressed with the fault lifted and a one-building answer served in Overpass\'s place.',
  'Most at once counts requests the browser had open together; an overlap is how long a newer request had been open when the browser reported the older one ended. The client\'s own count is overpassInFlight() in src/lib/overpassClient.ts.',
  `Limits: the pill says "Map data didn't load" within ${PILL_WITHIN_MS / 1000} s of opening 3D; never more than 1 Overpass request on the wire; the pill one line (40 px tall or less, 260 px wide or less) and no other error line; Retry draws the building.`,
  '',
  '| fault | pill after opening 3D (s) | after the venue was set (s) | Overpass requests | servers asked | most at once, client | most at once, browser (longest overlap ms) | pill (w x h px) | other error lines | Retry: buildings drawn | pass |',
  '|---|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.mode} | ${r.failed ? s(r.fromTap) : 'never'} | ${s(r.fromVenue)} | ${r.requests} | ${r.hosts.join(', ')} | ${r.appPeak} | ${r.peak} (${r.overlapMs}) | ${r.pill === null ? '—' : `${Math.round(r.pill.w)} x ${Math.round(r.pill.h)}`} | ${r.stacked} | ${r.drawn} | ${r.pass ? 'yes' : 'NO'} |`),
  '',
  `${pass ? 'Pass.' : 'FAIL.'}`,
  '',
]
const file = `measurements/${new Date().toISOString().slice(0, 10)}-3d-overpass-faults.md`
writeFileSync(file, out.join('\n'))
console.log(out.join('\n'))
process.exit(pass ? 0 : 1)
