/*
 * THE COVER FRAME: A REAL RENDER OF THE APP, NOT A MOCK OF ONE.
 *
 * Usage:  node scripts/make-cover-frame.mjs
 * Writes: public/cover-frame.jpg  and  measurements/2026-10-18-cover-frame.md
 *
 * WHY THIS IS NOT MapHandle.capture(). The brief asked for the frame to come
 * through "the existing capture path". It cannot, and the reason is worth
 * reading before anybody tries again:
 *
 *   capture() FLATTENS TERRAIN. flattenForCapture() sets terrain to null
 *   before reading the canvas, because with terrain on the project/unproject
 *   round trip is out by up to 57 px. So capture() can never return a 3D
 *   frame -- that is the whole point of it.
 *
 *   capture() HIDES EVERY OVERLAY. captureImageryOnly() walks
 *   appLayerIdsIn() and switches off cones, the sun axis, the rays, the
 *   footprints, the pilot links and the marks, because the image is fed to a
 *   model as a photograph and our own drawings burned into it were a real bug.
 *
 * So capture() returns FLAT IMAGERY WITH NO OVERLAYS: the exact opposite of
 * the frame the cover needs. It is not broken; it is a model-input path doing
 * its job.
 *
 * WHAT THIS USES INSTEAD, and why it is still not a mock: a real screenshot of
 * the running app, driven through the app's own controls. Every pixel is the
 * app rendering -- MapLibre, terrain, the real cone geometry, the real rays
 * from src/core/sun.ts, a real hazard mark. Nothing here draws anything, and
 * nothing is composited afterwards. It is the same mechanism the four audits
 * already use to photograph the app.
 */
import { writeFileSync } from 'node:fs'
import { guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('cover')

import { connect } from './cdp.mjs'

/*
 * PORTRAIT AND BIG. The cover is full bleed on a phone, so the frame is shot
 * at the cover's own aspect at 3x and lands as a JPEG: a PNG of this is about
 * 4 MB and this is a file every first-time visitor downloads.
 */
const VIEWPORT = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }

const watchdog = startWatchdog('cover')
const { ev, wait, send, dispose } = await connect()

/** Run a snippet and print what it answered, so a silent no-op cannot hide. */
const step = async (label, expression) => {
  const got = await ev(expression)
  console.log(`  ${String(label).padEnd(26)} ${JSON.stringify(got)}`)
  return got
}

let report = null

try {
  await send('Emulation.setDeviceMetricsOverride', VIEWPORT)
  await ev('localStorage.clear()')
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
  await wait(8000)

  /*
   * DISMISS THE LANDING FIRST.
   *
   * localStorage.clear() above resets scoutngo.landing.v1, so the cover page
   * renders OVER the app. Every programmatic click still lands -- the map
   * underneath really did get two positions and two cones -- so the run
   * reported success and wrote a screenshot OF THE OLD COVER PAGE. The counts
   * were right and the pixels were of the wrong screen entirely, which is why
   * the frame is looked at and not just counted.
   */
  /*
   * MARK THE COVER SEEN AND RELOAD, rather than hunting for its button.
   *
   * Clicking it was fragile: a run reported "no landing shown", carried on,
   * and photographed the cover page while every click landed correctly on the
   * map underneath. Setting the flag and reloading means the cover never
   * renders at all, which cannot half-work.
   */
  /*
   * BOTH SET BEFORE THE RELOAD. Numerals were being switched on AFTER the
   * page had rendered, so nothing re-read them and SUN and SHADOW stayed
   * bare -- one flag drives both plates, so they are both labelled or
   * neither is, and "neither" was not the intent.
   */
  await step(
    'mark the cover seen, numerals on',
    `(() => {
       localStorage.setItem('scoutngo.landing.v1', 'true')
       const raw = localStorage.getItem('scoutngo.settings')
       const settings = raw ? JSON.parse(raw) : {}
       /* The key is showNumbers, not showNumerals -- a first attempt wrote a
        * field nothing reads and the plates stayed bare. */
       settings.showNumbers = true
       localStorage.setItem('scoutngo.settings', JSON.stringify(settings))
       return 'set'
     })()`,
  )
  await send('Page.reload', {})
  await wait(8000)
  await step('cover gone', `document.querySelector('.cover') === null`)


  /*
   * PACK THE DRONE FIRST, IN SETUP.
   *
   * The AIR segment is enabled by the kit SELECTION, not by the kit profile:
   * defaultOpticFor('air', ...) reads which gear is ticked. This flow went
   * straight to Plan and never visited Setup, so the selection was empty and
   * AIR came back DISABLED -- which the guard caught rather than quietly
   * placing three ground positions and labelling two of them wrong.
   */
  await step(
    'into setup',
    `(() => { const b = [...document.querySelectorAll('.rail__btn')].find(x=>/Setup/.test(x.textContent)); if(!b) return 'no setup'; b.click(); return 'ok' })()`,
  )
  await wait(2500)
  await step(
    'pack the drone',
    `(() => {
       const chip = [...document.querySelectorAll('.kitchip')].find(c => /air 3s/i.test(c.textContent ?? ''))
       if (!chip) return 'no drone chip'
       if (chip.getAttribute('aria-pressed') !== 'true') chip.click()
       return chip.getAttribute('aria-pressed') === 'true' ? 'packed' : 'still off'
     })()`,
  )
  await wait(1200)

  await step(
    'into plan',
    `(() => { const b = [...document.querySelectorAll('.rail__btn')].find(x=>/Plan/.test(x.textContent)); if(!b) return 'no plan button'; b.click(); return 'ok' })()`,
  )
  await wait(4000)

  /* Open the sheet to FULL, which is where Layers and Hazards live. */
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`)
  await wait(400)
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`)
  await wait(1200)

  await step(
    'terrain on',
    `(() => {
       const b = [...document.querySelectorAll('button')].find(x=>/^Terrain/.test((x.textContent??'').trim()))
       if(!b) return 'no terrain toggle'
       if(b.getAttribute('aria-pressed') !== 'true') b.click()
       return 'on'
     })()`,
  )
  await wait(3500)

  /*
   * THE HAZARD MARK FIRST, while the map is still flat and unrotated, because
   * a tap at a screen point is only predictable before the camera is tilted.
   */
  await step(
    'arm marking',
    `(() => { const b = document.querySelector('.hz__arm'); if(!b) return 'no arm button'; b.click(); return b.textContent })()`,
  )
  await wait(600)
  const tap = (fx, fy) => `(() => {
    const c = document.querySelector('.maplibregl-canvas')
    const r = c.getBoundingClientRect()
    for (const t of ['pointerdown','pointerup','click']) {
      c.dispatchEvent(new PointerEvent(t, { clientX: r.left + r.width*${fx},
        clientY: r.top + r.height*${fy}, bubbles: true, pointerId: 1, isPrimary: true }))
    }
    return 'tapped'
  })()`
  await ev(tap(0.62, 0.3))
  await wait(1500)
  await step('marks placed', `(window.__probe.map.getStyle().sources['site-marks']?.data?.features ?? []).length`)

  /*
   * CLOSE THE EDITOR FIRST, THEN DISARM. Tapping the map selects the new mark,
   * which swaps HazardPanel into its editing view -- and that view has no arm
   * button, so a first draft looked for `.hz__arm`, got nothing, reported
   * "gone" and left marking ARMED. The next three taps, meant to place
   * positions, became three more hazard marks instead: the run finished with
   * 0 positions and 3 marks and no error anywhere.
   */
  await ev(`document.querySelector('.hz__x')?.click()`)
  await wait(600)
  await step(
    'disarm marking',
    `(() => {
       const b = document.querySelector('.hz__arm')
       if(!b) return 'NO ARM BUTTON -- still armed'
       if(/stop/i.test(b.textContent)) { b.click(); return 'disarmed' }
       return 'already off: ' + b.textContent
     })()`,
  )
  await wait(500)

  /*
   * THREE POSITIONS, AND TWO OF THEM FLY.
   *
   * A bare focal length does not distinguish a drone from a tripod, which is
   * the only reason to show more than one. So the frame carries a ground
   * position on long glass and two air positions on the drone's 70mm, and the
   * plates now say which is which.
   *
   * THE PLATFORM SEGMENT DECIDES WHAT THE NEXT TAP MAKES. A previous run
   * found AIR disabled and silently placed a second ground position instead;
   * this one asserts the segment took.
   */
  const platform = async (which) => {
    const got = await step(
      `platform ${which}`,
      `(() => {
         const b = [...document.querySelectorAll('.plat__btn')]
           .find(x => /${which}/i.test(x.querySelector('.plat__label')?.textContent ?? ''))
         if (!b) return 'no segment'
         if (b.disabled) return 'DISABLED'
         b.click(); return 'ok'
       })()`,
    )
    if (got === 'DISABLED' || got === 'no segment') {
      const state = await ev(`JSON.stringify({
        buttons: [...document.querySelectorAll('.plat__btn')].map(b => ({
          text: (b.textContent ?? '').trim(), disabled: b.disabled, title: b.title,
        })),
        chips: [...document.querySelectorAll('.kitchip')].map(c => (c.textContent ?? '').trim() + '=' + c.getAttribute('aria-pressed')),
        landing: document.querySelector('.cover') !== null,
      })`)
      console.log(`      STATE: ${state}`)
      throw new Error(`the ${which} segment is ${got}; the frame would be wrong about its platforms`)
    }
    await wait(800)
  }

  /*
   * ARM, TAP, OPTIONALLY CHANGE THE LENS, CLOSE THE CARD.
   *
   * The lens is changed through the card's own optic picker with the native
   * value setter, so React sees it. Null leaves whatever the platform's
   * default optic is, which for air is the drone's own camera.
   */
  const addAt = async (label, fx, fy, lensMatch) => {
    await step(
      `arm add (${label})`,
      `(() => { const b = document.querySelector('.plist__add'); if(!b) return 'no add button'; b.click(); return 'armed' })()`,
    )
    await wait(500)
    await ev(tap(fx, fy))
    await wait(2000)
    if (lensMatch !== null) {
      await step(
        `lens -> ${lensMatch}`,
        `(() => {
           const sel = document.querySelector('.optic__select')
           if(!sel) return 'no optic picker'
           const option = [...sel.options].find(o => /${lensMatch}/i.test(o.textContent))
           if(!option) return 'no option matching: ' + [...sel.options].map(o=>o.textContent).join('|')
           const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
           setter.call(sel, option.value)
           sel.dispatchEvent(new Event('change', { bubbles: true }))
           return option.textContent
         })()`,
      )
      await wait(1200)
    }
    await ev(`document.querySelector('.card__close')?.click()`)
    await wait(600)
  }

  /*
   * LEFT, ground, on the long glass. Then two over the field on the drone.
   * Placed before the camera is tilted, so a screen fraction is predictable.
   */
  /*
   * AIR FIRST, AND THE ORDER IS NOT COSMETIC.
   *
   * Selecting GROUND re-packs the kit selection without the drone, which then
   * disables the AIR segment: "No drone in the kit", with every kit chip
   * ticked. Measured, with the state dumped at the failure. That is shape D
   * in docs/failure-modes.md -- the drone chip deriving its enabled state
   * from the selection it exists to change -- still live in the platform
   * filter, and it makes the transition one-way.
   *
   * This script works around it by taking the air positions before the ground
   * one. The app should not need the workaround; flagged rather than fixed
   * here, because this pass is about the cover.
   */
  await platform('air')
  await addAt('right air', 0.70, 0.47, 'tele')
  await addAt('behind air', 0.50, 0.405, 'tele')

  await platform('ground')
  await addAt('left ground', 0.54, 0.62, '200-600')

  await platform('both')

  /*
   * CONES ARE OFF BY DEFAULT. conePlan is empty unless coneMode is 'all' or a
   * position is isolated, so a first run produced two positions and zero
   * cones. The control lives in Layers, where ConePicker is rendered, and this
   * clicks the real one.
   */
  await step(
    'open cone picker',
    `(() => {
       const b = [...document.querySelectorAll('.picker > button')]
         .find(x => /cones|lenses|isolated/i.test(x.textContent ?? ''))
       if(!b) return 'no picker trigger'
       if(b.getAttribute('aria-expanded') !== 'true') b.click()
       return b.textContent
     })()`,
  )
  await wait(600)
  await step(
    'show every cone',
    `(() => {
       const b = [...document.querySelectorAll('button')].find(x => /show every cone/i.test(x.textContent ?? ''))
       if(!b) return 'no cone control'
       if(b.getAttribute('aria-pressed') !== 'true') b.click()
       return 'cones on'
     })()`,
  )
  await wait(1000)
  /* Shut the menu again so it is not a popover sitting in the cover frame. */
  await ev(`(() => { const b = [...document.querySelectorAll('.picker > button')][0]; if(b && b.getAttribute('aria-expanded')==='true') b.click() })()`)
  await wait(600)

  const positions = await step('positions on map', `document.querySelectorAll('.shooter').length`)
  const cones = await step(
    'cone features',
    `(window.__probe.map.getStyle().sources['fov-cones']?.data?.features ?? []).length`,
  )
  const rays = await step(
    'ray kinds',
    `JSON.stringify((window.__probe.map.getStyle().sources['sun-rays']?.data?.features ?? []).map(f=>f.properties.kind))`,
  )
  const marks = await step(
    'mark features',
    `(window.__probe.map.getStyle().sources['site-marks']?.data?.features ?? []).length`,
  )

  /* Close the sheet so the map is the whole frame, then tilt into 3D. */
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`)
  await wait(900)
  await step(
    'camera',
    `(() => {
       const m = window.__probe.map
       /*
        * OFFSET UP, because the scrim eats the bottom third.
        *
        * A cover frame is not a centred map. The scrim starts at 42% and is
        * solid by 72%, so anything the picture is MEANT to show -- the pin,
        * the two cones, the plates -- has to live above that. offset moves
        * the target away from the container centre, which puts the plan in
        * the top half and leaves the ground below it to be covered by type.
        */
       m.easeTo({ pitch: 54, bearing: -12, zoom: 16.7, offset: [206, -248], duration: 0 })
       return JSON.stringify({ pitch: m.getPitch(), bearing: Math.round(m.getBearing()), zoom: +m.getZoom().toFixed(2), terrain: m.getTerrain() !== null })
     })()`,
  )
  await wait(4500)

  /*
   * COUNT THE LABELLED THINGS. The brief put the ceiling at six, and the real
   * render carries terrain and buildings that the old placeholder did not.
   */
  /*
   * COUNTED WITHOUT DOUBLE COUNTING. A first pass pushed .shooter__focal AND
   * the .shooter__optic inside it AND the digits inside that, and reported 16
   * labelled things when there were six. A label is a LEAF here: an element
   * with text that contains no other counted element.
   */
  const labels = await ev(`(() => {
    /*
     * THE NUMBERED DISC IS THE MARKER, NOT A LABEL. It is the pin itself --
     * the thing the chip is attached to -- so counting it doubles every
     * position. Five labelled things means three chips, SUN and SHADOW.
     */
    const nodes = [...document.querySelectorAll('.shooter__focal, .shooter__flag')].filter((n) => n.getBoundingClientRect().width > 0)
    const outer = nodes.filter((n) => !nodes.some((other) => other !== n && other.contains(n)))
    const readouts = [...document.querySelectorAll('.ray-label')]
      .filter((n) => n.getBoundingClientRect().width > 0)
    const all = [...outer, ...readouts.filter((r) => !outer.includes(r))]
    return all.map((n) => (n.textContent ?? '').trim()).filter((t) => t !== '')
  })()`)
  console.log(`  ${'labelled things'.padEnd(26)} ${labels.length}: ${JSON.stringify(labels)}`)

  const errors = await ev(
    `JSON.stringify((window.__probe.map.getStyle().layers ?? []).length)`,
  )

  /*
   * THE APP'S OWN CHROME COMES OFF BEFORE THE SHUTTER.
   *
   * The cover puts its own wordmark, headline and button on top of this
   * image. Leaving the real sheet, rail, dock and map controls baked in would
   * put two sets of UI on one screen. What stays is the MAP and everything
   * the app DREW on it.
   *
   * This step was lost in an edit and the loss was nearly invisible: the
   * frame came back with the sheet and the dock in it, and the guard below
   * passed it at 0.67 because the floor was set at 0.60. A floor loose enough
   * to admit a third of the frame being covered is not a guard.
   */
  await step(
    'hide app chrome',
    `(() => {
       const gone = []
       for (const sel of ['.sheet', '.dock', '.rail2', '.maplibregl-ctrl-bottom-left',
                          '.maplibregl-ctrl-bottom-right', '.maplibregl-ctrl-top-right',
                          '.shell__now', '.nowbtn']) {
         for (const n of document.querySelectorAll(sel)) { n.style.display = 'none'; gone.push(sel) }
       }
       return gone.join(' ')
     })()`,
  )
  await wait(1200)

  /*
   * THE MAP MUST BE THE FRAME, ASSERTED POSITIVELY.
   *
   * THE GUARD THIS REPLACES NAMED WHAT IT DID NOT WANT. It looked for '.land'
   * and refused if it found one. The cover pass renamed that class to
   * '.cover', which disarmed the guard without touching it: it went on
   * running, went on passing, and a cover-page screenshot went through
   * underneath it. A negative guard depends on every name it excludes, and
   * nothing records that dependency.
   *
   * SO THIS ASSERTS A PROPERTY OF THE THING IT WANTS. The map canvas must be
   * visible and must cover most of the viewport. Rename every overlay in the
   * app and this still holds, because it describes the object being measured
   * rather than the objects that might be in front of it.
   *
   * 95%, not 60. The chrome is hidden above, so a healthy frame measures
   * 1.00 and there is nothing legitimate left to cover the map. A floor of
   * 0.60 was tried first and it passed a frame with the sheet and the dock
   * still in it -- loose enough to admit the exact failure it was written
   * for.
   */
  const framing = await ev(`(() => {
    const canvas = document.querySelector('.maplibregl-canvas')
    if (!canvas) return JSON.stringify({ ok: false, why: 'there is no map canvas on the page' })
    const map = canvas.closest('.maplibregl-map') ?? canvas.parentElement ?? canvas
    const r = canvas.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) {
      return JSON.stringify({ ok: false, why: 'the map canvas has no size' })
    }
    const style = getComputedStyle(canvas)
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) {
      return JSON.stringify({ ok: false, why: 'the map canvas is not visible' })
    }

    /*
     * VISIBLE share, not laid-out share: sample a grid of points across the
     * canvas and ask the document what is actually on top at each one. That
     * is what catches something covering it, whatever the covering thing is
     * called.
     */
    let onTop = 0
    let total = 0
    for (let fx = 0.1; fx <= 0.9; fx += 0.1) {
      for (let fy = 0.1; fy <= 0.9; fy += 0.1) {
        const x = r.left + r.width * fx
        const y = r.top + r.height * fy
        const hit = document.elementFromPoint(x, y)
        total += 1
        /*
         * THE MAP AND ITS OWN OVERLAYS COUNT AS THE MAP.
         *
         * Testing against the bare canvas scored 0.91 on a perfectly good
         * frame, because the app's markers -- the chips, the ray plates, the
         * pins -- are DOM elements over the canvas and they are exactly what
         * the frame is FOR. MapLibre puts them inside its own container, so
         * the honest question is whether the hit is inside the map at all.
         * A cover page, a sheet or a modal is not.
         */
        if (map.contains(hit)) onTop += 1
      }
    }
    const share = total === 0 ? 0 : onTop / total
    return JSON.stringify({
      ok: share >= 0.95,
      share: +share.toFixed(2),
      why: share >= 0.95 ? 'the map is the frame' : 'something is covering the map: visible share ' + share.toFixed(2),
    })
  })()`)
  const frame = JSON.parse(framing)
  console.log(`  ${'map is the frame'.padEnd(26)} ${frame.share ?? '—'} (${frame.why})`)
  if (!frame.ok) throw new Error(frame.why)

  const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86 })
  const bytes = Buffer.from(shot.result.data, 'base64')
  writeFileSync('public/cover-frame.jpg', bytes)

  report = {
    positions,
    cones,
    rays: JSON.parse(rays),
    marks,
    labels,
    bytes: bytes.length,
    layers: JSON.parse(errors),
    chipProblems: chips.problems,
  }
} finally {
  watchdog.stop()
  await dispose()
}

if (report === null) {
  console.log('\n=== COVER FRAME ABORTED: nothing was captured ===')
  process.exit(2)
}

/*
 * THE FRAME HAS TO CONTAIN WHAT THE BRIEF LISTED, and this refuses rather than
 * shipping a frame that is missing half of it. A cover whose whole argument is
 * "this is the real thing" cannot be a real render of an empty map.
 */
const missing = []
if (report.positions < 3) missing.push(`three positions (found ${report.positions})`)
if (report.cones < 3) missing.push(`three coverage cones (found ${report.cones})`)
for (const problem of report.chipProblems ?? []) missing.push(problem)
if (!report.rays.includes('sun')) missing.push('a sun ray')
if (!report.rays.includes('shadow')) missing.push('a shadow ray')
if (report.marks < 1) missing.push(`one hazard mark (found ${report.marks})`)

const out = 'measurements/2026-10-18-cover-frame.md'
writeFileSync(
  out,
  [
    '# The cover frame',
    '',
    '**Date:** 2026-10-18  ',
    '**Question:** Can the cover carry a real rendered frame of the app, in 3D',
    'with terrain, showing two positions with different optics, both cones, a sun',
    'ray, a shadow ray and a hazard mark?  ',
    `**Outcome:** ${missing.length === 0 ? 'Yes. public/cover-frame.jpg, ' + Math.round(report.bytes / 1024) + ' KB.' : 'No: missing ' + missing.join(', ')}`,
    '',
    '## MapHandle.capture() cannot produce this frame',
    '',
    'The brief asked for the frame to come through the existing capture path.',
    'It cannot, for two deliberate reasons, both of which are load-bearing:',
    '',
    '| | what it does | why |',
    '|---|---|---|',
    '| `flattenForCapture()` | sets terrain to null before reading the canvas | with terrain on the project/unproject round trip is out by up to 57 px |',
    '| `captureImageryOnly()` | hides every layer in `appLayerIdsIn()` | the image is fed to a model as a photograph; our own drawings burned into it was a real bug |',
    '',
    'So `capture()` returns **flat imagery with no overlays** — no cones, no',
    'rays, no marks, no terrain. That is the opposite of a cover frame, and it is',
    'correct behaviour for what it is: a model-input path.',
    '',
    '## What produced this frame instead',
    '',
    'A real screenshot of the running app, driven through the app\'s own',
    'controls: the Terrain toggle, the Hazards marking mode, the platform filter',
    'and the add-position button. Every pixel is the app rendering. Nothing is',
    'drawn by the script and nothing is composited afterwards.',
    '',
    '## What is in the frame, counted from the live map',
    '',
    '| thing | count |',
    '|---|---|',
    `| positions drawn | ${report.positions} |`,
    `| coverage cones | ${report.cones} |`,
    `| rays | ${report.rays.join(', ')} |`,
    `| hazard marks | ${report.marks} |`,
    `| style layers | ${report.layers} |`,
    `| labelled things | ${report.labels.length} (ceiling 6) |`,
    '',
    `Labels: ${report.labels.map((l) => `\`${l}\``).join(', ')}`,
    '',
    'Reproduce with `node scripts/make-cover-frame.mjs`.',
    '',
  ].join('\n'),
)

console.log('')
if (missing.length > 0) {
  console.log(`=== COVER FRAME INCOMPLETE: missing ${missing.join(', ')} ===`)
  console.log(`    Written anyway for inspection, and recorded in ${out}`)
  process.exit(1)
}
console.log(`=== COVER FRAME OK: ${Math.round(report.bytes / 1024)} KB -> public/cover-frame.jpg ===`)
console.log(`    ${report.labels.length} labelled things (ceiling 6) -> ${out}`)
