/*
 * THE OFFLINE AUDIT: WITH THE RADIO OFF, DOES EVERYTHING COMPUTED STILL PAINT?
 *
 * Usage:  node scripts/audit-offline.mjs [fail|hang|both|online]   (default both)
 *         `online` is the control: the same assertions with the network up,
 *         which is how a run proves the audit itself can pass.
 * Exits:  0 when, in every mode run, the sun and moon readings, a position,
 *         its coverage cone and the sun ray are ON THE GLASS with no error
 *         state on any of them. 1 on a problem found. 2 when it could not look.
 *
 * WHY THIS EXISTS. ScoutNGo was unusable in Shenandoah with no service. The
 * geometry runs on the device -- suncalc and turf -- so nothing computed had
 * any reason to need a network, and yet the trip failed. This is the check
 * that holds the line: the app is loaded, every request that is not to the
 * app's own origin is cut, and what the shooter needs is asserted on screen.
 *
 * TWO WAYS TO HAVE NO SIGNAL, and they fail differently:
 *
 *   fail  airplane mode. Every request errors at once and navigator.onLine
 *         is false. MapLibre marks the tiles errored and moves on.
 *   hang  one bar, or none, with the radio on. Requests are sent and never
 *         answered, and navigator.onLine is TRUE. This is a mountain. A map
 *         that waits for its tiles to settle waits for as long as the
 *         browser's own timeout, which is minutes.
 *
 * THE APP'S OWN ORIGIN STAYS UP on purpose. This audits what happens once the
 * app is running; whether a cold launch can load the app at all with no
 * network is a separate question about the document cache, recorded in
 * docs/offline.md, and is not something a headless browser can answer for
 * iOS.
 *
 * SHAPE C GUARDS. Counts are not pictures: the cone and the ray are asserted
 * with queryRenderedFeatures, which answers from what was drawn, and the
 * venue is asserted to be the calibration venue the run asked for, not
 * whatever the map happened to be on. A run that placed no position fails
 * rather than passing over zero positions.
 */
import { mkdirSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('offline')
const watchdog = startWatchdog('offline', 600_000)

const which = process.argv[2] ?? 'both'
const MODES = which === 'both' ? ['fail', 'hang'] : [which]
if (!MODES.every((m) => m === 'fail' || m === 'hang' || m === 'online')) {
  console.log(`=== OFFLINE AUDIT ABORTED: unknown mode "${which}". Use fail, hang, both or online. ===`)
  process.exit(2)
}

const OUT = process.env.SCOUTNGO_OUT ?? `${process.env.TMPDIR ?? '/tmp'}/scoutngo-offline`
mkdirSync(OUT, { recursive: true })

const { send, ev, wait, shot, ws, dispose } = await connect()

let problems = 0
const problem = (mode, line) => {
  console.log(`      PROBLEM [${mode}]: ${line}`)
  problems += 1
}

/*
 * WORDS THAT MEAN A COMPUTED VALUE WAS REPLACED BY A FAILURE. Read only from
 * the cards that carry computed values, never from the whole page: a forecast
 * card saying it has nothing saved is the honest outcome, not a defect.
 */
const ERROR_WORDS = /\b(error|failed|could not|couldn't|timed out|unavailable|try again)\b/i

/*
 * Every request off the app's own origin, cut. Held requests in hang mode are
 * kept and never answered, which is what a dead cell does.
 */
let mode = 'fail'
const held = []
ws.addEventListener('message', (event) => {
  const m = JSON.parse(event.data)
  if (m.method !== 'Fetch.requestPaused') return
  const url = new URL(m.params.request.url)
  /*
   * THE CONNECTIVITY CHECK IS CUT TOO. The origin stays up so the dev server
   * can keep serving modules, but on a real dead cell the app's own HEAD /
   * (src/lib/connectivity.ts) fails like everything else.
   */
  const check = m.params.request.method === 'HEAD' && url.pathname === '/'
  const local = (url.hostname === '127.0.0.1' || url.hostname === 'localhost') && !check
  if (local || mode === 'online') {
    void send('Fetch.continueRequest', { requestId: m.params.requestId })
  } else if (mode === 'fail') {
    void send('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'InternetDisconnected' })
  } else {
    held.push(m.params.requestId)
  }
})

for (const run of MODES) {
  mode = run
  console.log(`\n### ${run === 'fail' ? 'airplane mode (requests fail)' : run === 'hang' ? 'no bars (requests hang)' : 'CONTROL: network on'}`)

  /*
   * ON THE APP'S ORIGIN FIRST, so clearing storage clears the app's storage
   * and not about:blank's. Then the landing is marked seen, as the surface
   * audit does, or every assertion below is made against the cover picture.
   */
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
  await wait(3000)
  await ev(`localStorage.clear()`)
  await ev(`localStorage.setItem('scoutngo.landing.v1','true')`)
  /* Caches too: a cache filled by an earlier run would make this a cache test. */
  await ev(`caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))).then(() => 'ok')`)

  /* navigator.onLine follows the mode: false in airplane mode, true on a mountain. */
  const onLineScript = await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `Object.defineProperty(Navigator.prototype, 'onLine', { get: () => ${run !== 'fail'} })`,
  })
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })

  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
  await wait(8000)
  watchdog.note(`${run}: loaded`)

  /* THE OBJECT, NOT A PROXY: the app must be on the venue this run asked for. */
  const venue = await ev(`(() => {
    const m = window.__probe?.map
    if (!m) return null
    const c = m.getCenter()
    return { lat: +c.lat.toFixed(3), lon: +c.lng.toFixed(3) }
  })()`)
  if (venue === null) {
    console.log('=== OFFLINE AUDIT ABORTED: no map probe on the page, so nothing could be measured ===')
    process.exit(2)
  }
  if (Math.abs(venue.lat - 38.364) > 0.01 || Math.abs(venue.lon + 75.606) > 0.01) {
    console.log(`=== OFFLINE AUDIT ABORTED: the map is at ${venue.lat},${venue.lon}, not the calibration venue ===`)
    process.exit(2)
  }

  await goToStage(ev, wait, 'plan')

  /*
   * THE MAP IS WHAT IS ON THE GLASS. A positive property of the thing being
   * measured, not the absence of a cover by name: the first run of this audit
   * photographed the landing page and asserted against it.
   */
  const onGlass = await ev(`(() => {
    const m = window.__probe.map
    const canvas = m.getCanvas()
    const r = canvas.getBoundingClientRect()
    const share = (r.width * r.height) / (innerWidth * innerHeight)
    const top = document.elementFromPoint(innerWidth / 2, innerHeight / 3)
    return { share: +share.toFixed(2), canvasOnTop: top === canvas || canvas.parentElement?.contains(top) === true }
  })()`)
  if (!(onGlass.share > 0.6) || !onGlass.canvasOnTop) {
    console.log(`=== OFFLINE AUDIT ABORTED: the map is not what is on screen (canvas ${onGlass.share} of the viewport, on top: ${onGlass.canvasOnTop}) ===`)
    process.exit(2)
  }

  /*
   * CONES ON. They are off by default and the control is the Cones tile in
   * the layers card; asserting coverage with them off would be asserting
   * nothing. Fails if the tile is not there or does not turn on.
   */
  await ev(`document.querySelector('nav[aria-label="Tools"] button[aria-label="Map and layers"]')?.click()`)
  await wait(700)
  const cones = await ev(`(() => {
    const tile = [...document.querySelectorAll('.tile')]
      .find((t) => /^cones/i.test((t.querySelector('.tile__label')?.textContent ?? '').trim()))
    if (!tile) return 'no Cones tile in the layers card'
    if (/^off$/i.test((tile.querySelector('.tile__state')?.textContent ?? '').trim())) tile.click()
    return 'ok'
  })()`)
  await wait(500)
  const conesState = await ev(`[...document.querySelectorAll('.tile')]
    .find((t) => /^cones/i.test((t.querySelector('.tile__label')?.textContent ?? '').trim()))
    ?.querySelector('.tile__state')?.textContent?.trim() ?? 'gone'`)
  if (cones !== 'ok' || conesState !== 'ON') problem(run, `could not turn cones on: ${cones}, state ${conesState}`)
  await ev(`document.querySelector('button[aria-label="Back to the shoot"]')?.click()`)
  await wait(600)

  /* A position, placed by hand through the map's own click handler. */
  const armed = await ev(`(() => {
    const add = document.querySelector('.shootc__add')
    if (!add) return 'no add-position control on the shoot card'
    add.click()
    return 'clicked'
  })()`)
  if (armed !== 'clicked') problem(run, `could not arm placement: ${armed}`)
  await wait(500)
  await ev(`(() => {
    const map = window.__probe.map
    const c = map.getCanvas()
    const point = { x: c.clientWidth / 2, y: c.clientHeight / 3 }
    map.fire('click', { lngLat: map.unproject([point.x, point.y]), point, originalEvent: { target: c } })
  })()`)
  await wait(3000)
  watchdog.note(`${run}: position placed`)

  /* The position card is open now. Its computed rows, and any error in them. */
  const card = await ev(`(() => {
    const el = document.querySelector('.sheet') ?? document.body
    return el.textContent
  })()`)
  /*
   * THE COMPUTED ROWS OF A POSITION: its light class (from the sun and the
   * camera bearing), its frame width (from the FOV) and its range.
   */
  const computed = {
    light: /(Front-lit|Backlit|Side-lit|Sidelit|Back-lit)/i.exec(card ?? '')?.[1] ?? null,
    frame: /Frame width\s*([\d.]+\s*m)/.exec(card ?? '')?.[1] ?? null,
    range: /Range\s*([\d.]+\s*(m|ft))/.exec(card ?? '')?.[1] ?? null,
  }
  console.log(`  position card: ${JSON.stringify(computed)}`)
  for (const [key, value] of Object.entries(computed)) {
    if (value === null) problem(run, `the position card shows no ${key}`)
  }
  const cardError = (card ?? '').split(/(?<=[.!?])\s+/).filter((l) => ERROR_WORDS.test(l))
  for (const line of cardError) problem(run, `position card: "${line.trim()}"`)

  await ev(`(document.querySelector('.card__close') ?? document.querySelector('button[aria-label="Back to the shoot"]'))?.click()`)
  await wait(800)

  const positions = await ev(`document.querySelectorAll('.shots button').length`)
  console.log(`  positions on the shoot card: ${positions}`)
  if (!(positions > 0)) problem(run, 'no position was placed, so nothing below examined one')

  /* ON THE GLASS: rendered cone and ray features, not source data. */
  const drawn = await ev(`(() => {
    const m = window.__probe.map
    const layersOf = (source) => m.getStyle().layers.filter((l) => l.source === source).map((l) => l.id)
    const count = (source) => {
      const layers = layersOf(source)
      return layers.length === 0 ? -1 : m.queryRenderedFeatures({ layers }).length
    }
    return { cones: count('fov-cones'), rays: count('sun-rays'), sun: count('sun-axis') }
  })()`)
  console.log(`  drawn: cones ${drawn.cones}, sun rays ${drawn.rays}, sun axis ${drawn.sun}`)
  if (!(drawn.cones > 0)) problem(run, `no coverage cone on the glass (${drawn.cones})`)
  if (!(drawn.rays > 0 || drawn.sun > 0)) problem(run, 'no sun or shadow ray on the glass')

  await shot(OUT, `offline-${run}-map`)

  /* THE LIGHT CARD: sun at start, mid, end. */
  await ev(`[...document.querySelectorAll('.chip2')].find((b) => /GOLDEN/.test(b.textContent))?.click()`)
  await wait(900)
  const light = await ev(`document.querySelector('.readout')?.textContent ?? null`)
  /*
   * THE LIGHT CARD READS IN WORDS: a time, a compass point and a band at the
   * start, middle and end of the window. Three of each, or it did not compute.
   */
  const times = (light ?? '').match(/\d{1,2}:\d{2}/g) ?? []
  const azimuth = /Azimuth((?:[NSEW]{1,3}){3})Altitude/.exec(light ?? '')?.[1] ?? null
  console.log(`  light card: ${times.length} times, azimuth row ${JSON.stringify(azimuth)}`)
  if (times.length < 3) problem(run, `the light card shows ${times.length} sample times`)
  if (azimuth === null) problem(run, 'the light card shows no azimuth row')
  for (const line of (light ?? '').split(/(?<=[.!?])\s+/).filter((l) => ERROR_WORDS.test(l))) {
    problem(run, `light card: "${line.trim()}"`)
  }

  /* THE DAY: the sun and moon curves and the readout under them. */
  const opened = await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /The sun through the day/.test(x.textContent))
    if (!b) return false
    b.click()
    return true
  })()`)
  await wait(900)
  if (!opened) problem(run, 'no door to the day curve on the light card')
  const day = await ev(`(() => ({
    readout: document.querySelector('.curve__readout')?.innerText ?? null,
    moonCurve: document.querySelectorAll('.curve__moon').length,
    sunTimes: document.querySelector('.curve')?.parentElement?.innerText ?? '',
  }))()`)
  console.log(`  day readout: ${JSON.stringify(day.readout)}`)
  console.log(`  moon curve drawn: ${day.moonCurve > 0}`)
  if (day.readout === null || !/° up/.test(day.readout)) problem(run, 'the day card has no sun altitude')
  if (!(day.moonCurve > 0)) problem(run, 'the day card draws no moon curve')
  for (const line of day.sunTimes.split('\n').filter((l) => ERROR_WORDS.test(l))) {
    problem(run, `day card: "${line.trim()}"`)
  }
  await shot(OUT, `offline-${run}-day`)

  /*
   * TERRAIN ON, NO SIGNAL: the day card used to say "waiting for the
   * elevation data" forever. Past the tile give-up it must say nothing came,
   * and keep the flat horizon. Online the DEM arrives, so only the two
   * no-signal modes are judged.
   */
  if (run !== 'online') {
    const turned = await ev(`(() => {
      const fix = document.querySelector('.curve__fix')
      if (!fix) return 'no terrain control on the day card'
      fix.click()
      return 'ok'
    })()`)
    if (turned !== 'ok') problem(run, turned)
    await wait(1500)
    const early = await ev(`document.querySelector('.curve__fix')?.textContent ?? ''`)
    await wait(9000)
    const late = await ev(`document.querySelector('.curve__fix')?.textContent ?? ''`)
    console.log(`  terrain on, after 1.5 s: ${/waiting/.test(early) ? 'waiting' : JSON.stringify(early.slice(0, 60))}`)
    console.log(`  terrain on, after 10.5 s: ${/no elevation arrived/.test(late) ? 'gave up, flat horizon' : JSON.stringify(late.slice(0, 80))}`)
    if (/waiting/.test(late)) problem(run, 'terrain is still "waiting for the elevation data" after 10 s')
    if (!/no elevation arrived/.test(late)) problem(run, `the day card does not say elevation never came: "${late.slice(0, 80)}"`)
  }

  /*
   * A5: ONE QUIET MARK, and A4: AN EMPTY FORECAST SAYS WHY. Only in the two
   * no-signal modes; with the network up the mark must NOT be there, which is
   * what makes the check able to fail in both directions.
   */
  const mark = await ev(`document.querySelector('.offline-line')?.textContent ?? null`)
  console.log(`  offline line under the chips: ${JSON.stringify(mark)}`)
  if (run === 'online' && mark !== null) problem(run, 'the offline line shows with the network up')
  if (run !== 'online' && (mark === null || !/^Offline · /.test(mark))) problem(run, 'no offline line under the chips')
  const modal = await ev(`document.querySelector('[role="dialog"], [role="alertdialog"]') !== null`)
  if (modal) problem(run, 'a dialog is open: no signal is not a reason to interrupt')

  if (run !== 'online') {
    await ev(`[...document.querySelectorAll('.chip2')].find((b) => /CLOUD/.test(b.textContent))?.click()`)
    await wait(900)
    const cloud = await ev(`document.querySelector('.wx')?.textContent ?? ''`)
    const says = /Nothing is saved for this venue and day|Saved forecast|Old forecast/.test(cloud)
    console.log(`  cloud card says why it is empty: ${says}`)
    if (!says) problem(run, `the cloud card does not say why: "${cloud.slice(0, 120)}"`)
  }

  await send('Fetch.disable')
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: onLineScript.result.identifier })
  held.length = 0
  watchdog.note(`${run}: done`)
}

watchdog.stop()
console.log(`\n  screenshots in ${OUT}`)
console.log(`\n=== OFFLINE PROBLEMS: ${problems} across ${MODES.join(' and ')} ===`)
await dispose()
process.exit(problems === 0 ? 0 : 1)
