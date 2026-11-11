/*
 * THE MAP'S WEATHER LAYERS AND THE FEATURES SHEET, ON A PHONE.
 *
 * Usage:  node scripts/audit-map-layers.mjs [screenshot-dir]
 * Exits:  0 clean; 1 a problem; 2 could not look.
 *
 * Three bugs from the iPhone on 8 Nov, each held here:
 *
 *   wind      Features › Weather › Wind drew nothing. The grid it draws is 25
 *             points and the forecast cache (api/forecast.ts) refused more
 *             than 16 with a 400, so the overlay had no cells and hid its
 *             canvas. Here the wind canvas must be on show, the size of the
 *             map, and have drawn pixels: its own pixels are read back and
 *             counted, not a data attribute (failure-modes.md, C: counts are
 *             not pictures).
 *   radar     The radar legend sat in the card under the time bar: it ran
 *             toward the bottom edge and went with the card when the sheet was
 *             lowered to see the map. While radar is on it is in the time
 *             sheet's place: inside the sheet's peek, no time bar beside it,
 *             fully on screen (above the home indicator standalone), and
 *             still there 5 s later and with the sheet raised.
 *   features  Closing Features opened the shoot card at full height (the old
 *             Plan sheet). Closing it must leave the map: the sheet at peek,
 *             no card on show, the map canvas over most of the screen.
 *
 * At 390 x 844 (WebKit, tab and home-screen insets) and 412 x 915 (Chromium).
 * Facts only: nothing on the legend says safe or clear (ux rule 28).
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit, devices } from './gate/playwright.mjs'
import { ensureApp, findChrome, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('map layers')
const watchdog = startWatchdog('map layers', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'map-layers')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '14:00', endTime: '16:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'layers', name: 'Map layers check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

let problems = 0
const looked = { wind: 0, radar: 0, features: 0 }
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const LOOKS = [
  ['iPhone tab', 'webkit', { width: 390, height: 844 }, { top: 0, bottom: 0 }],
  ['iPhone home screen', 'webkit', { width: 390, height: 844 }, { top: 47, bottom: 34 }],
  ['Android tab', 'chromium', { width: 412, height: 915 }, { top: 0, bottom: 0 }],
]

/* The sheet, the card on show, the map's canvas and the time bar, as they are now. */
const SHEET = `JSON.stringify((() => {
  const s = document.querySelector('.sheet')
  const body = s?.querySelector('.sheet__body')
  const cards = [...document.querySelectorAll('.sheet .card2')].filter((c) => !c.closest('[hidden]') && c.getBoundingClientRect().height > 0).map((c) => c.getAttribute('aria-label'))
  const m = document.querySelector('.map canvas.maplibregl-canvas')
  const mr = m?.getBoundingClientRect()
  const top = s ? s.getBoundingClientRect().top : innerHeight
  return {
    detent: s?.dataset.detent ?? null,
    bodyShown: !!body && !body.hidden,
    cards,
    timebar: !!document.querySelector('.sheet__peek .tbar'),
    mapShare: mr ? Math.max(0, Math.min(top, mr.bottom) - Math.max(0, mr.top)) * Math.max(0, Math.min(innerWidth, mr.right) - Math.max(0, mr.left)) / (innerWidth * innerHeight) : 0,
  }
})())`

/* The wind canvas, and the number of its pixels that are not transparent, read from the canvas itself. */
/*
 * Batch Map, Section 1: the wind layer v3. Its colour canvas must cover the
 * WHOLE map: read back in a 6 x 6 grid of spots, every spot painted (the old
 * layer covered a 5 x 5 block of squares around the spot). Its particles
 * move (a count and the frame rate the layer itself counts), the crosshair's
 * readout says a speed and where from, the legend has its seven stops, the
 * wind's time bar is in the time sheet's place with Blend chosen, and the
 * sun's lines are off while it is on.
 */
const WIND = `JSON.stringify((() => {
  const c = document.querySelector('canvas.windv3__field')
  if (!c) return { present: false }
  const r = c.getBoundingClientRect()
  let painted = 0
  const spots = []
  if (c.width > 0 && c.height > 0) {
    const g = c.getContext('2d')
    for (let i = 0; i < 6; i += 1) for (let j = 0; j < 6; j += 1) {
      const a = g.getImageData(Math.floor(((i + 0.5) / 6) * c.width), Math.floor(((j + 0.5) / 6) * c.height), 1, 1).data[3]
      spots.push(a)
      if (a > 0) painted += 1
    }
  }
  const t = document.querySelector('canvas.windv3__trails')
  const read = document.querySelector('[data-wind-readout]')
  const bar = document.querySelector('[data-wind-timebar]')
  return {
    present: true,
    hidden: c.hidden || getComputedStyle(c).display === 'none',
    w: Math.round(r.width),
    h: Math.round(r.height),
    painted,
    particles: Number(t?.dataset.particles ?? 0),
    fps: Number(t?.dataset.fps ?? 0),
    readout: read?.textContent ?? null,
    legend: document.querySelectorAll('.windv3__bar span').length,
    bar: bar === null ? null : { inPeek: !!bar.closest('.sheet__peek'), models: [...bar.querySelectorAll('[role=radio]')].map((b) => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')) },
    pills: document.querySelectorAll('.raypills > *').length,
    cross: !!document.querySelector('.windv3__cross'),
  }
})())`

/* The radar legend: where it is, whether it is in the peek, and the slider's box. */
const RADAR = `JSON.stringify((() => {
  const l = document.querySelector('.wlay__legend[aria-label^="Radar colours"]')
  if (!l) return { present: false }
  const shown = (e) => !!e && !e.closest('[hidden]') && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden'
  const box = (e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] }
  const wrap = l.closest('.wlay')
  const range = wrap?.querySelector('.rslide__range') ?? null
  return {
    present: true,
    shown: shown(l),
    inPeek: !!l.closest('.sheet__peek'),
    legend: box(l),
    whole: wrap ? box(wrap) : null,
    range: range && shown(range) ? box(range) : null,
    text: wrap?.innerText ?? '',
    bar: !!l.querySelector('.wlay__bar') && /Light/.test(l.textContent) && /Extreme/.test(l.textContent),
  }
})())`

const browsers = {}
try {
  for (const [label, engine, viewport, insets] of LOOKS) {
    console.log(`\n### ${label}`)
    browsers[engine] ??= engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: findChrome() })
    const ctx = await browsers[engine].newContext({ ...(engine === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7']), viewport })
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
    /* Inside the fixtures' week (scripts/gate/fixtures.mjs FIXTURE_NOW, 30 Oct): the wind grid's three days start there. */
    await page.clock.install({ time: new Date('2026-10-30T15:00:00Z') })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    const shot = (name) => page.screenshot({ path: join(OUT, `${name}-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
    await page.goto(url)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await goToStage(ev, wait, 'plan')
    await wait(2500)
    const features = page.locator('.rail2__btn[aria-label="Features"]').first()
    const openFeatures = async () => {
      /* The rail is not drawn over a full sheet: lowered first (the handle steps full → peek), so one failure here does not hide the next check. */
      if (JSON.parse(await ev(SHEET)).detent === 'full') {
        await page.locator('.sheet__handle').click()
        await wait(900)
      }
      await features.click({ timeout: 5000 })
      await wait(900)
      const s = JSON.parse(await ev(SHEET))
      if (!s.cards.includes('Map')) throw new Error(`${label}: the Features button opened ${JSON.stringify(s.cards)}, not the Map sheet`)
    }

    /* FEATURES: closing it is back to the map. */
    await openFeatures()
    await page.locator('.card2[aria-label="Map"] .card2__x').click()
    await wait(1200)
    const closed = JSON.parse(await ev(SHEET))
    looked.features += 1
    console.log(`  features closed: ${JSON.stringify(closed)}`)
    if (closed.detent !== 'peek') fail(`${label}: closing Features left the sheet at ${closed.detent}, not peek`)
    if (closed.cards.length > 0) fail(`${label}: closing Features opened ${JSON.stringify(closed.cards)}`)
    if (closed.mapShare < 0.6) fail(`${label}: after closing Features the map shows over ${Math.round(closed.mapShare * 100)}% of the screen, not most of it`)
    await shot('features-closed')
    watchdog.note(`${label} features`)

    /* WIND: the canvas has drawn pixels. */
    /* The wind's grid requests for this one view: no more than MAX_BLOCKS (src/core/windViewport.ts). */
    let gridAsks = 0
    page.on('request', (rq) => {
      if (/wind_speed_10m%2Cwind_direction_10m%2Cwind_gusts_10m|wind_speed_10m,wind_direction_10m,wind_gusts_10m/.test(rq.url())) gridAsks += 1
    })
    await openFeatures()
    await page.locator('[data-weather="wind"]').click()
    let w = null
    for (let i = 0; i < 24; i += 1) {
      await wait(500)
      w = JSON.parse(await ev(WIND))
      if (w.present && !w.hidden && w.painted >= 36 && w.particles > 0 && /from/.test(w.readout ?? '')) break
    }
    looked.wind += 1
    console.log(`  wind layer: ${JSON.stringify(w)}`)
    if (!w.present) fail(`${label}: no wind layer canvas on the page`)
    else {
      if (w.hidden) fail(`${label}: the wind canvas is hidden with the Wind layer on`)
      if (w.w < viewport.width * 0.9 || w.h < viewport.height * 0.6) fail(`${label}: the wind canvas is ${w.w} x ${w.h}, not the map's size`)
      if (w.painted < 36) fail(`${label}: the wind colour covers ${w.painted} of 36 spots across the screen, not all of it`)
      if (w.particles === 0) fail(`${label}: no particles`)
      if (!/\d+ (kt|mph|km\/h|m\/s) from [NESW]/.test(w.readout ?? '')) fail(`${label}: the crosshair's readout says "${w.readout}"`)
      if (!w.cross) fail(`${label}: no crosshair`)
      if (w.legend !== 7) fail(`${label}: the legend has ${w.legend} stops, not 7`)
      if (w.bar === null) fail(`${label}: no wind time bar`)
      else {
        if (!w.bar.inPeek) fail(`${label}: the wind time bar is not in the time sheet's place`)
        if (JSON.stringify(w.bar.models) !== JSON.stringify(['HRRR', 'Blend*', 'ECMWF'])) fail(`${label}: the models read ${JSON.stringify(w.bar.models)}, not HRRR · Blend (chosen) · ECMWF`)
      }
      if (w.pills > 0) fail(`${label}: the sun's line labels are on the map with the wind layer on`)
      console.log(`  wind grid requests for this view: ${gridAsks}; frame rate ${w.fps} fps`)
      if (gridAsks === 0 || gridAsks > 9) fail(`${label}: ${gridAsks} wind grid requests for one view (1 to 9)`)
    }
    await shot('wind')
    /*
     * Batch MAP2: the drone's 400 ft in the same look. Switching to it once
     * blanked the app (an update loop); here the layer must still draw, with
     * its readout, after the switch.
     */
    const crashed = []
    page.on('pageerror', (e) => crashed.push(String(e).slice(0, 120)))
    await page.locator('.seg__btn', { hasText: '400 ft' }).first().click({ timeout: 4000 }).catch(() => fail(`${label}: no 400 ft choice on the wind card`))
    let w4 = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      w4 = JSON.parse(await ev(WIND))
      if (w4.present && w4.painted >= 36 && /from/.test(w4.readout ?? '')) break
    }
    console.log(`  wind at 400 ft: ${JSON.stringify({ painted: w4?.painted, particles: w4?.particles, readout: w4?.readout })}`)
    if (crashed.length > 0) fail(`${label}: the page crashed at 400 ft: ${crashed[0]}`)
    else if (!w4?.present || w4.painted < 36 || !/from/.test(w4.readout ?? '')) fail(`${label}: the wind layer did not draw at 400 ft`)
    await page.locator('.seg__btn', { hasText: 'Surface' }).first().click({ timeout: 4000 }).catch(() => {})
    await wait(800)
    watchdog.note(`${label} wind`)

    /* RADAR: the legend in the time sheet's place, on screen, and staying. */
    await openFeatures()
    await page.locator('[data-weather="radar"]').click()
    await wait(800)
    const checkRadar = async (when) => {
      const r = JSON.parse(await ev(RADAR))
      const s = JSON.parse(await ev(SHEET))
      console.log(`  radar ${when}: ${JSON.stringify({ ...r, text: r.text?.slice(0, 60) })} sheet ${s.detent}${s.timebar ? ' with the time bar' : ''}`)
      if (!r.present || !r.shown) return fail(`${label}, radar ${when}: the radar legend is not on show`)
      if (!r.inPeek) fail(`${label}, radar ${when}: the legend is not in the time sheet's place (it is in the card)`)
      if (s.timebar) fail(`${label}, radar ${when}: the time bar is still in the peek beside the legend`)
      if (!r.bar) fail(`${label}, radar ${when}: no labelled bar, light to extreme, in the legend`)
      const floor = viewport.height - insets.bottom
      for (const [name, b] of [['legend', r.legend], ['legend and timeline', r.whole], ['radar slider', r.range]]) {
        if (b === null) {
          if (name === 'radar slider') fail(`${label}, radar ${when}: no radar slider on show`)
          continue
        }
        if (b[0] < 0 || b[1] < 0 || b[2] > viewport.width || b[3] > floor) fail(`${label}, radar ${when}: the ${name} runs off the screen: ${JSON.stringify(b)} in ${viewport.width} x ${floor}`)
      }
      if (/\bsafe\b|\ball clear\b|\bclear to\b|\bclear of\b/i.test(r.text)) fail(`${label}, radar ${when}: the legend says safe or clear: ${JSON.stringify(r.text)}`)
    }
    await checkRadar('on')
    looked.radar += 1
    await shot('radar')
    await wait(5000)
    await checkRadar('after 5 s')
    /* Raised: the legend is the peek's, so it stays at every height. */
    await page.locator('.sheet__handle').click()
    await wait(900)
    await checkRadar('with the sheet raised')
    await shot('radar-raised')
    watchdog.note(`${label} radar`)
    await ctx.close()
  }
} finally {
  for (const b of Object.values(browsers)) await b.close()
}
watchdog.stop()
if (looked.wind === 0 || looked.radar === 0 || looked.features === 0) {
  console.log(`=== MAP LAYERS AUDIT ABORTED: nothing was looked at ${JSON.stringify(looked)} ===`)
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== MAP LAYERS PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
