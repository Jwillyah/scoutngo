/*
 * THE WEATHER STORE, IN WEBKIT: a budget per load, and a 429 that leaves the
 * chips with their last value and its age.
 *
 * Usage:  node scripts/audit-weather.mjs [screenshot-dir]
 *
 * From the field test of 30 Oct: at Virginia Beach Wind and Cloud said
 * "no data". Every Open-Meteo request is answered by
 * scripts/openMeteoFake.mjs (never the live service).
 *
 *  1. Load at the pier at 7:30 AM. Open-Meteo is asked at most
 *     LOAD_BUDGET.requests times, weighing at most LOAD_BUDGET.weight as the
 *     service bills it, and the Wind and Cloud chips have values.
 *  2. Nine hours later the service answers 429 "Daily API request limit
 *     exceeded". Reloaded, the chips keep the last values with "9h ago",
 *     and one line says the service is at its limit and when it is asked
 *     again; never a bare "no data".
 *  3. While it is refusing, moving the time bar and opening Sky › Fire send
 *     nothing. An hour on (the back-off), it is asked again.
 *
 * Three looks: a Safari tab with its toolbars (390 x 664), the home-screen
 * app (390 x 844, insets 47/34), and offline.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { OPEN_METEO, fakeAnswer, requestShape } from './openMeteoFake.mjs'

/* Measured 30 Oct before the store: 7 requests, weight 50.3 (measurements/2026-10-30-weather-requests-before.md). */
export const LOAD_BUDGET = { requests: 5, weight: 30 }

guardAudit('weather')
const watchdog = startWatchdog('weather', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'weather')
mkdirSync(OUT, { recursive: true })

const NOW = new Date('2026-10-30T11:30:00Z')
const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-30', startTime: '07:00', endTime: '08:00' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'wx', name: 'Weather check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] }))

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const MODES = [
  ['tab', { width: 390, height: 664 }, { top: 0, bottom: 0 }],
  ['standalone', { width: 390, height: 844 }, { top: 47, bottom: 34 }],
]

const browser = await webkit.launch()
try {
  for (const [label, viewport, insets] of MODES) {
    console.log(`\n### ${label}`)
    /* Workers blocked: in WebKit a page a service worker controls sends its requests past the routes (docs/failure-modes.md, the venue pack audit), to the live service. */
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport, serviceWorkers: 'block' })
    let refuse = false
    const asked = []
    await ctx.route(/^https:\/\/api\.weather\.gov|\/api\/(buoy|metar)/, (r) => r.fulfill({ status: 503, body: 'not in this audit' }))
    await ctx.route(OPEN_METEO, (r) => {
      const href = r.request().url()
      asked.push({ t: Date.now(), refused: refuse, weight: requestShape(href).weight })
      return refuse
        ? r.fulfill({ status: 429, json: { reason: 'Daily API request limit exceeded. Please try again tomorrow.', error: true } })
        : r.fulfill({ json: fakeAnswer(href, NOW) })
    })
    await ctx.addInitScript(([top, bottom]) => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
      const add = () => {
        const s = document.createElement('style')
        s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    }, [insets.top, insets.bottom])
    const page = await ctx.newPage()
    await page.clock.install({ time: NOW })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    const settle = async () => {
      for (let quiet = 0; quiet < 4; ) {
        const n = asked.length
        await wait(1000)
        quiet = asked.length === n ? quiet + 1 : 0
      }
    }
    const read = () =>
      ev(`(() => {
        const chip = (re) => { const c = [...document.querySelectorAll('.chip2')].find((b) => re.test(b.textContent)); const l = c?.querySelector('.chip2__label'); return c ? { label: l?.textContent ?? '', cut: l !== null && l !== undefined && l.scrollWidth > l.clientWidth + 1, value: c.querySelector('.chip2__value')?.textContent ?? '', text: c.textContent } : null }
        return { wind: chip(/WIND/), cloud: chip(/CLOUD/), line: document.querySelector('.offline-line')?.textContent ?? null, lineCut: (() => { const l = document.querySelector('.offline-line'); return l !== null && l.scrollWidth > l.clientWidth + 1 })(), map: (() => { const c = document.querySelector('.maplibregl-canvas'); if (!c) return 0; const r = c.getBoundingClientRect(); return (r.width * r.height) / (innerWidth * innerHeight) })() }
      })()`)
    const open = async () => {
      /* about:blank first: the same URL with a hash is not a reload, and the reload is the point. */
      await page.goto('about:blank')
      await page.goto(url.href)
      await wait(3000)
      await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
      await page.getByText('Open the map', { exact: true }).click({ timeout: 3000 }).catch(() => {})
      await goToStage(ev, wait, 'plan')
      await settle()
    }

    /* 1. A fresh load, under budget, with values. */
    await open()
    const load = asked.slice()
    const weight = load.reduce((a, r) => a + r.weight, 0)
    const first = await read()
    looked += 1
    console.log(`  load: ${load.length} requests, weight ${weight.toFixed(1)} · wind ${first.wind?.value} · cloud ${first.cloud?.value}`)
    if (first.map < 0.6) fail(`${label}: the map is not on screen (${first.map.toFixed(2)} of the viewport)`)
    if (load.length === 0) fail(`${label}: the app asked Open-Meteo for nothing, so there was nothing to count`)
    if (load.length > LOAD_BUDGET.requests) fail(`${label}: ${load.length} requests on load, over the budget of ${LOAD_BUDGET.requests}`)
    if (weight > LOAD_BUDGET.weight) fail(`${label}: load weighs ${weight.toFixed(1)} calls, over the budget of ${LOAD_BUDGET.weight}`)
    if (first.wind === null || /—|no data/.test(first.wind.value)) fail(`${label}: no wind on a good load (${JSON.stringify(first.wind)})`)
    if (first.cloud === null || /—|no data/.test(first.cloud.value)) fail(`${label}: no cloud on a good load (${JSON.stringify(first.cloud)})`)
    await page.screenshot({ path: join(OUT, `weather-good-${label}.png`) })

    /* 2. Nine hours on, the service at its daily limit. */
    await page.clock.fastForward('09:00:00')
    refuse = true
    const before = asked.length
    await open()
    const clockNow = await ev('Date.now()')
    if (clockNow - NOW.getTime() < 8.9 * 3_600_000) fail(`${label}: the page clock is not nine hours on after the reload (${new Date(clockNow).toISOString()}), so "9h ago" cannot be checked`)
    const busy = await read()
    const refusedNow = asked.length - before
    console.log(`  429: ${refusedNow} requests refused · wind "${busy.wind?.text}" · cloud "${busy.cloud?.text}" · line "${busy.line}"`)
    if (refusedNow === 0) fail(`${label}: nothing was asked after the reload, so no 429 was seen`)
    for (const [name, c] of [['wind', busy.wind], ['cloud', busy.cloud]]) {
      if (c === null || /—|no data/.test(c.value)) fail(`${label}: the ${name} chip lost its last value under a 429 (${JSON.stringify(c)})`)
      else if (!/9h ago/.test(c.label)) fail(`${label}: the ${name} chip does not say its value is 9h old ("${c.label}")`)
      if (c !== null && c.cut) fail(`${label}: the ${name} chip's label is cut off ("${c.label}", ux-rules 4)`)
    }
    if (busy.line === null || !/^Weather daily limit reached, retrying in (59|60) min$/.test(busy.line)) fail(`${label}: the line under the chips reads ${JSON.stringify(busy.line)}, not the service at its limit and when it is asked again`)
    if (busy.lineCut) fail(`${label}: the status line is cut off ("${busy.line}", ux-rules 4)`)
    await page.screenshot({ path: join(OUT, `weather-429-${label}.png`) })

    /* 3. Quiet while it refuses: the time bar and Sky › Fire send nothing. */
    const quiet = asked.length
    const bar = page.getByRole('slider', { name: /Time of day/ })
    await bar.focus()
    for (let i = 0; i < 12; i += 1) await page.keyboard.press('ArrowRight')
    await wait(1500)
    await page.locator('button[aria-label="Menu"]').first().tap()
    await wait(500)
    await page.getByText('Sky', { exact: true }).first().tap()
    await wait(800)
    await page.getByRole('tab', { name: 'Fire' }).tap({ timeout: 4000 }).catch(() => fail(`${label}: no Fire tab to open`))
    await wait(2500)
    const fireNote = await ev(`[...document.querySelectorAll('.fire .fire__note')].map((p) => p.textContent).join(' | ')`)
    console.log(`  while refusing: ${asked.length - quiet} more requests · fire: ${fireNote.slice(0, 120)}`)
    if (asked.length !== quiet) fail(`${label}: ${asked.length - quiet} requests sent during the back-off`)
    if (/no data/.test(fireNote)) fail(`${label}: Sky fire says no data`)
    await page.screenshot({ path: join(OUT, `weather-fire-429-${label}.png`) })

    /* The back-off ends: asked again, by itself. */
    await page.clock.fastForward('01:01:00')
    await wait(3000)
    console.log(`  an hour on: ${asked.length - quiet} requests`)
    if (asked.length === quiet) fail(`${label}: nothing was asked again after the hour's back-off`)

    /* Offline, for the third look. */
    await page.keyboard.press('Escape')
    await goToStage(ev, wait, 'plan')
    await ctx.setOffline(true)
    await wait(2500)
    const off = await read()
    console.log(`  offline: wind "${off.wind?.label}" · cloud "${off.cloud?.label}" · line "${off.line}"`)
    for (const [name, c] of [['wind', off.wind], ['cloud', off.cloud]]) if (c !== null && c.cut) fail(`${label}: offline, the ${name} chip's label is cut off ("${c.label}")`)
    if (off.lineCut) fail(`${label}: offline, the status line is cut off ("${off.line}")`)
    await page.screenshot({ path: join(OUT, `weather-offline-${label}.png`) })
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== WEATHER AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== WEATHER PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
