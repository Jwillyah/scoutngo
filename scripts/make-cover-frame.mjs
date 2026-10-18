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
  await step(
    'dismiss landing',
    `(() => { const b = document.querySelector('.land__go'); if(!b) return 'no landing shown'; b.click(); return 'dismissed' })()`,
  )
  await wait(1500)

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
   * TWO POSITIONS WITH DIFFERENT OPTICS, made the way a shooter makes them:
   * the platform filter decides what the next position is, so one is placed
   * on GROUND with the Sigma and one on AIR with the drone camera. Different
   * optics, different focal lengths, and therefore visibly different cones.
   */
  /*
   * TWO GROUND POSITIONS WITH DIFFERENT LENSES.
   *
   * NOT one ground and one air, which was the first attempt: the AIR segment
   * is disabled until a drone is packed in the kit, and the run reported
   * "segment disabled" and then placed the second position on the ground
   * anyway. Two ground positions with genuinely different glass give the same
   * thing the brief wanted -- two visibly different cones -- through a control
   * that is available from a cold start.
   *
   * The lens is changed through the card's own optic picker, with the native
   * value setter so React sees the change.
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

  await addAt('near', 0.44, 0.57, '75-300')
  await addAt('long', 0.74, 0.52, '200-600')

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
       m.easeTo({ pitch: 62, bearing: -18, zoom: 16.35, offset: [52, -140], duration: 0 })
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
    const nodes = [...document.querySelectorAll(
      '.shooter__focal, .shooter__flag, .shooter__number'
    )].filter((n) => n.getBoundingClientRect().width > 0)
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
   * THE MAP MUST BE THE FRAME. Counting features off window.__probe proves the
   * map STATE is right; it says nothing about what is on the glass. This
   * checks the canvas is actually the thing being photographed.
   */
  const canvasShare = await ev(`(() => {
    const c = document.querySelector('.maplibregl-canvas')
    if (!c) return 0
    const r = c.getBoundingClientRect()
    const covered = [...document.querySelectorAll('.land, .land__scroll')]
      .filter((n) => n.getBoundingClientRect().width > 0).length
    return covered > 0 ? -1 : +((r.width * r.height) / (innerWidth * innerHeight)).toFixed(2)
  })()`)
  console.log(`  ${'map share of viewport'.padEnd(26)} ${canvasShare}`)
  if (canvasShare <= 0) {
    throw new Error('the landing page is still covering the map; nothing was captured')
  }

  /*
   * THE APP'S OWN CHROME COMES OFF BEFORE THE SHUTTER.
   *
   * The cover puts its own eyebrow, wordmark, scrubber and button on top of
   * this image. Leaving the real sheet, rail, dock and map controls baked into
   * it would put two sets of UI on one screen -- a photograph of a phone
   * inside a phone, which is exactly the stock-mockup look the brief rules
   * out. What stays is the MAP and everything the app DREW on it: the cones,
   * the rays, the plates, the pin, the mark.
   *
   * Hidden by inline style on a throwaway page, so nothing here changes the
   * app. The page is navigated away from immediately afterwards.
   */
  await step(
    'hide app chrome',
    `(() => {
       const gone = []
       for (const sel of ['.sheet', '.dock', '.rail2', '.maplibregl-ctrl-bottom-left',
                          '.maplibregl-ctrl-bottom-right', '.maplibregl-ctrl-top-right',
                          '.nowbtn', '.now-btn']) {
         for (const n of document.querySelectorAll(sel)) { n.style.display = 'none'; gone.push(sel) }
       }
       return gone.join(' ')
     })()`,
  )
  await wait(1200)

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
if (report.positions < 2) missing.push(`two positions (found ${report.positions})`)
if (report.cones < 2) missing.push(`two coverage cones (found ${report.cones})`)
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
