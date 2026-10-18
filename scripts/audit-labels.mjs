/*
 * LABEL COLLISION AUDIT
 *
 * Usage:  node scripts/audit-labels.mjs
 * Needs:  the app on http://127.0.0.1:5173 and Chrome on --remote-debugging-port=9222
 * Exits:  0 when nothing on the map overlaps anything it must not, 1 otherwise.
 *
 * WHY THIS EXISTS. The complaint was a screenshot: the SUN and SHADOW readouts
 * stacked on top of the scale bar and the attribution (i) in the bottom-left
 * corner, and sat over the venue pin. src/core/labelPlacement.ts already
 * computes a clear position by sliding each label along its own ray, and it
 * works, but it can only avoid obstacles it is TOLD about. The list of floating
 * chrome in MapView was hand maintained and had drifted: maplibre's own control
 * corners were never in it, so the one corner the complaint was about was the
 * one corner the placement code could not see.
 *
 * A hand maintained list needs something that fails when it drifts again. This
 * measures the real rectangles in a real browser and reports every overlap, so
 * the next surface somebody floats over the map is caught by a run rather than
 * by a screenshot.
 *
 * WHAT COUNTS AS A COLLISION. Only chrome and the venue pin. A label among the
 * cones, the figures and the rays is a label in its natural habitat, and the
 * rays in particular must be crossed: a readout sits ON its own ray, which is
 * the whole point of it.
 */

import { guardAudit, startWatchdog } from './preflight.mjs'

/*
 * ARMED BEFORE ANYTHING ELSE CAN THROW.
 *
 * This audit used to die on a TypeError when the thing it needed was not
 * there, printing a stack trace into a log the commit hook greps for a problem
 * count. It matched nothing, so the hook refused the commit with one red line
 * and no reason. Any throw from here on prints one sentence saying the audit
 * could not LOOK, and exits 2 so that is distinguishable from a problem found.
 */
guardAudit('label')


const HERE = new URL('.', import.meta.url).pathname
const FIXTURES = process.argv[2] ?? HERE
const { ev, ws, wait, send, errs, dispose } = await (await import(FIXTURES + '/cdp.mjs')).connect()
const watchdog = startWatchdog('label')

/*
 * Everything a label must stay out from under, measured from the live DOM.
 *
 * The app's own floating surfaces, maplibre's four control corners, and the
 * venue pin. The pin is here because a readout printed over the pin hides the
 * one thing on the map that says where the venue is.
 */
export const MEASURE = `(() => {
  const map = window.__probe?.map
  if (!map) return { error: 'no probe: load with ?probe=1' }

  const box = (node) => {
    const r = node.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom,
             width: r.width, height: r.height }
  }
  const real = (b) => b.width > 0.5 && b.height > 0.5

  const CHROME = [
    '.hud', '.mapctl', '.sheet', '.dock', '.card', '.confirm',
    '.setup__search', '.picker__menu', '.overflow__menu', '.plat',
    '.newbuild', '.tapnote', '.locate',
    '.maplibregl-ctrl-bottom-left', '.maplibregl-ctrl-bottom-right',
    '.maplibregl-ctrl-top-left', '.maplibregl-ctrl-top-right',
  ]

  const chrome = []
  for (const selector of CHROME) {
    for (const node of document.querySelectorAll(selector)) {
      const b = box(node)
      if (real(b)) chrome.push({ what: selector, ...b })
    }
  }

  const pins = [...document.querySelectorAll('.pin')].map((n) => ({ what: 'pin', ...box(n) }))
  const discs = [...document.querySelectorAll('.shooter__disc')].map((n) => ({
    what: 'position disc',
    ...box(n),
  }))
  /*
   * THE WARNING WORDS ON THE MARKERS COUNT AS LABELS TOO.
   *
   * These printed the full phrase once and six positions back from a generate
   * put three overlapping red paragraphs across the map, so they were cut to a
   * bare "!". They carry one word each now, and the overlap that caused the
   * original retreat is measured here rather than avoided by saying nothing.
   */
  const labels = [...document.querySelectorAll('.ray-label, .shooter__flag')].map((n) => ({
    what: n.className.replace(/\\s+/g, '.'),
    text: n.textContent.replace(/\\s+/g, ' ').trim(),
    ...box(n),
  })).filter((l) => real(l))

  const canvas = map.getCanvas()
  const viewport = box(canvas)

  return { viewport, chrome, pins, discs, labels }
})()`

const overlaps = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/** How far inside the viewport a label has to be to count as fully on screen. */
const EDGE_TOLERANCE_PX = 0.5

let problems = 0

const check = async (label) => {
  const out = await ev(MEASURE)
  if (out?.error) {
    console.log(`  ${label}: ${out.error}`)
    problems += 1
    return
  }
  const { viewport, chrome, pins, discs, labels } = out
  const hits = []

  for (const l of labels) {
    /*
     * A WARNING WORD CANNOT MOVE, so the chrome and edge rules do not apply to
     * it. It is anchored above its own marker, and the marker is wherever the
     * position is: a position near the edge of the view or under the HUD has
     * its word there too, and the only way to change that would be to detach
     * the word from the thing it describes. What IS checked for these is that
     * they do not cover another position's number, below, and that the ray
     * readouts move out of THEIR way, which is why they are obstacles in
     * MapView rather than candidates here.
     */
    const anchored = String(l.what).includes('shooter__flag')
    if (anchored) continue

    for (const c of chrome) {
      if (overlaps(l, c)) hits.push(`${l.text || l.what} over ${c.what}`)
    }
    for (const p of pins) {
      if (overlaps(l, p)) hits.push(`${l.text || l.what} over the venue pin`)
    }
    /*
     * A warning word may sit over its OWN marker's furniture, which is where
     * it belongs, but not over another position's disc: the number underneath
     * is how you tell the positions apart.
     */
    /*
     * HALF A READOUT AT THE EDGE IS A DIFFERENT NUMBER, which is worse than no
     * number, and labelPlacement already refuses a candidate that is not fully
     * on screen. This is that rule, checked against the real rectangles.
     */
    if (
      l.left < viewport.left - EDGE_TOLERANCE_PX ||
      l.right > viewport.right + EDGE_TOLERANCE_PX ||
      l.top < viewport.top - EDGE_TOLERANCE_PX ||
      l.bottom > viewport.bottom + EDGE_TOLERANCE_PX
    ) {
      hits.push(`${l.text || l.what} runs off the edge`)
    }
  }

  /*
   * A WARNING WORD MUST NOT COVER ANOTHER POSITION'S NUMBER. Its own marker is
   * fine, which is why the overlap has to be more than a touch: the word is
   * anchored directly above its own disc.
   */
  for (const l of labels) {
    if (!String(l.what).includes('shooter__flag')) continue
    for (const d of discs) {
      if (!overlaps(l, d)) continue
      const sharedWidth = Math.min(l.right, d.right) - Math.max(l.left, d.left)
      const sharedHeight = Math.min(l.bottom, d.bottom) - Math.max(l.top, d.top)
      /* Its own disc sits directly underneath, so a sliver is expected. */
      if (sharedWidth * sharedHeight > 24) {
        hits.push(`warning word "${l.text}" covers a position disc`)
      }
    }
  }

  /*
   * And nothing readable stacks on anything else readable: two readouts in one
   * place is one unreadable readout. This DOES include the warning words,
   * because a ray readout can move out of their way.
   */
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      if (overlaps(labels[i], labels[j])) {
        hits.push(`${labels[i].text || i} over ${labels[j].text || j}`)
      }
    }
  }

  problems += hits.length
  const summary = `${labels.length} label(s), ${chrome.length} chrome box(es)`
  console.log(
    `  ${label.padEnd(46)} ${summary.padEnd(30)} ${hits.length === 0 ? 'ok' : 'FAIL'}`,
  )
  for (const hit of hits) console.log(`      ${hit}`)
}

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })
await ev(`localStorage.clear()`)
await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
await wait(8000)

await ev(`[...document.querySelectorAll('.rail__btn')].find(b=>/Plan/.test(b.textContent))?.click()`)
await wait(4000)
/* The arc adds sunrise and sunset readouts, which is the crowded case. */
await ev(`[...document.querySelectorAll('button')].find(b=>/Sun arc/i.test(b.textContent))?.click()`)
await wait(1500)

/*
 * POSITIONS, SO THE WARNING WORDS EXIST TO BE MEASURED.
 *
 * Without any the marker-flag check below is vacuous.
 *
 * THE FLAG NEEDS A SUBJECT SIZE NOW. It used to fire from geometry alone,
 * against a flat 60 m standing in for the subject, which is exactly the bug
 * that put a red WIDE badge on every position of a drone shoot. The
 * calibration venue carries subjectAcrossMeters: the dock bar and its deck,
 * 45 m across. A position a few hundred metres out on the default 28mm frames
 * several hundred metres, which is many times 45, so three positions still
 * produce three flags and the collision check still has words to measure.
 */
await ev(`window.__probe.map.jumpTo({ zoom: 15 }), 'ok'`)
await wait(500)

/*
 * ARMING PLACEMENT MOVED INTO THE SHEET, so this audit has to open the sheet.
 *
 * It used to click `.peek__go`, a primary button in the peek. Item 3 took the
 * peek down to the shoot line and the scrubber, and the add control went where
 * the thing it acts on lives: `.plist__add`, in the positions list at HALF.
 *
 * WHAT THAT COST, AND WHY IT IS WORTH READING. Nobody changed a label, a
 * placement rule or a collision. The selector this script drives the app with
 * went stale, every position tap landed on an unarmed map, and the run came
 * back with no figures at all. The two checks below then reported exactly the
 * right thing -- "no warning word rendered, so the marker check tests
 * nothing", not "the labels are fine" -- which is the only reason this was a
 * refused commit rather than a silent green one over an app with no markers.
 *
 * A check that cannot tell "the code is broken" from "I could not look" would
 * have passed here. That is the fifth time this week, and it stayed caught
 * because both checks fail on an empty list instead of iterating over it.
 */
await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`)
await wait(600)
const armable = await ev(`document.querySelector('.plist__add') !== null`)
console.log(`  add control reachable at half: ${armable}`)
if (armable !== true) {
  console.log('      PROBLEM: no .plist__add at half, so no position can be placed')
  problems += 1
}

for (const [fx, fy] of [[0.3, 0.3], [0.44, 0.34], [0.58, 0.3]]) {
  await ev(`document.querySelector('.plist__add')?.click()`)
  await wait(350)
  await ev(`(() => {
    const c = document.querySelector('.maplibregl-canvas')
    const r = c.getBoundingClientRect()
    for (const t of ['pointerdown','pointerup','click']) {
      c.dispatchEvent(new PointerEvent(t, { clientX: r.left + r.width*${fx},
        clientY: r.top + r.height*${fy}, bubbles: true, pointerId: 1, isPrimary: true }))
    }
    return 'ok'
  })()`)
  await wait(1500)
  await ev(`document.querySelector('.card__close')?.click()`)
  await wait(500)
}

const flagged = await ev(
  `[...document.querySelectorAll('.shooter__flag')].map((n) => n.textContent)`,
)
console.log(`\n  warning words on the map: ${JSON.stringify(flagged)}`)
if (!Array.isArray(flagged) || flagged.length === 0) {
  console.log('      PROBLEM: no warning word rendered, so the marker check tests nothing')
  problems += 1
} else if (flagged.some((w) => !w || w === '!' || w.length < 3)) {
  console.log('      PROBLEM: a marker is flagged without saying why')
  problems += 1
}

/*
 * AND THE PLATE SAYS WHAT DISTINGUISHES IT, AND NOTHING ELSE.
 *
 * This check used to be "every plate names its optic", added when a bare "28"
 * could not say whether the geometry under it was drawn for a lens in a hand
 * or a camera on an aircraft.
 *
 * That was half the rule. The other half arrived as six plates reading SIGMA
 * 40, SIGMA 50, SIGMA 55, SIGMA 65, SIGMA 70, SIGMA 75: a word on all six
 * carries no information and six copies of it is noise over the map. So the
 * rule is now the shooter's own: a label repeats nothing that every other
 * label also says.
 *
 * WHAT THAT MEANS HERE, and it is stricter than what it replaced:
 *
 *   ALL the plates carry a tag, or NONE of them do. A mix would make the
 *   PRESENCE of a word a code for "this one is different", which is a thing
 *   nobody can read off a map.
 *
 *   When none of them do, the optic is named ONCE somewhere else. Dropping it
 *   from the plates is only honest if the answer to "28 on what" still exists.
 */
const plates = await ev(
  `[...document.querySelectorAll('.shooter__focal')].map((n) => n.textContent)`,
)
console.log(`  focal plates: ${JSON.stringify(plates)}`)

const tagged = (t) => /[A-Z]{3}/.test(String(t))
if (!Array.isArray(plates) || plates.length === 0) {
  console.log('      PROBLEM: no focal plate rendered, so the labels are untested')
  problems += 1
} else if (plates.some(tagged) && !plates.every(tagged)) {
  console.log('      PROBLEM: some plates name an optic and some do not, which reads as a code')
  problems += 1
} else if (!plates.some(tagged)) {
  /* No plate names it, so the plan has to, exactly once. */
  const summary = await ev(`document.querySelector('.peek')?.textContent ?? ''`)
  const named = /Sigma|Sony|Air 3S|Laowa/.test(String(summary))
  console.log(`  optic named once: ${named}`)
  if (!named) {
    console.log('      PROBLEM: no plate names the optic and neither does the plan summary')
    problems += 1
  }
}

console.log('\n### label collisions')

/*
 * THE VENUE IN EVERY CORNER AND EDGE OF THE VIEW.
 *
 * Which ray runs into which piece of chrome depends entirely on where the pin
 * sits: with the venue near the top a northward ray goes under the HUD, near
 * the bottom it goes under the sheet, and bottom-left is the corner the scale
 * bar and the attribution live in. Nine positions, so every one gets exercised.
 */
const PLACES = [
  ['centre', 0.5, 0.5],
  ['top-left', 0.12, 0.12],
  ['top', 0.5, 0.08],
  ['top-right', 0.88, 0.12],
  ['right', 0.92, 0.5],
  ['bottom-right', 0.88, 0.9],
  ['bottom', 0.5, 0.93],
  ['bottom-left', 0.12, 0.9],
  ['left', 0.08, 0.5],
]

for (const [name, fx, fy] of PLACES) {
  /*
   * The CAMERA moves, not the venue: panning so the pin lands at each spot
   * leaves the venue where it is and tests the real thing, which is the pin's
   * position ON SCREEN relative to the chrome.
   */
  await ev(`(() => {
    const map = window.__probe.map
    const c = map.getCanvas()
    const centre = map.getCenter()
    const want = map.unproject([c.clientWidth * ${fx}, c.clientHeight * ${fy}])
    map.panBy([map.project(centre).x - map.project(want).x,
               map.project(centre).y - map.project(want).y], { duration: 0 })
    return 'panned'
  })()`)
  await wait(700)
  await check(`pin ${name}`)
}

/*
 * And at a few zooms, because the label distance is a fraction of the view.
 *
 * RE-CENTRED FIRST. The sweep above leaves the pin at the left edge, and
 * zooming in from there walks it off the screen entirely, at which point no
 * label can be placed and a clean run means nothing. Centring the venue makes
 * the zoom cases about the zoom.
 */
await ev(`window.__probe.map.jumpTo({ center: [-75.605912, 38.364236] }), 'ok'`)
await wait(500)

for (const zoom of [11, 13, 15, 17, 19]) {
  await ev(`window.__probe.map.jumpTo({ zoom: ${zoom} }), 'ok'`)
  await wait(700)
  await check(`zoom ${zoom}`)
}

/*
 * With the sheet open, which is the biggest obstacle on the screen, and at a
 * zoom where the labels have somewhere to go.
 */
await ev(`window.__probe.map.jumpTo({ center: [-75.605912, 38.364236], zoom: 15 }), 'ok'`)
await wait(500)
await ev(`document.querySelector('.peek__summary')?.click()`)
await wait(1500)
await check('sheet open')

/*
 * HOW MANY READOUTS SURVIVE, which is the other half of the complaint. A run
 * with every label hidden has no collisions and is no use: the readings are
 * the point. Reported rather than asserted at a threshold, because how many
 * can fit genuinely depends on where the pin is, and a hard number here would
 * be a number invented to make a test pass.
 */
/*
 * The sheet is CLOSED for this, because with it open the pin itself is behind
 * it and hiding every readout is then the right answer. The question here is
 * whether the ordinary case has somewhere to put them.
 */
await ev(`document.querySelector('.peek__summary')?.click()`)
await wait(1200)
await ev(`window.__probe.map.jumpTo({ center: [-75.605912, 38.364236], zoom: 15 }), 'ok'`)
await wait(900)
const visible = await ev(`document.querySelectorAll('.ray-label').length`)
console.log(`\n  readouts visible, venue centred at zoom 15, sheet at peek: ${visible}`)
if (visible === 0) {
  console.log('      PROBLEM: every readout is hidden, so the placement has nowhere to go')
  problems += 1
}

console.log('\n=== LABEL PROBLEMS: ' + problems + ' ===')
if (errs.length > 0) console.log('console errors:', JSON.stringify(errs.slice(0, 3)))
watchdog.stop()
ws.close()
await dispose()
process.exit(problems === 0 ? 0 : 1)
