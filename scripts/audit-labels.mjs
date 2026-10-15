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

const HERE = new URL('.', import.meta.url).pathname
const FIXTURES = process.argv[2] ?? HERE
const { ev, ws, wait, send, errs } = await (await import(FIXTURES + '/cdp.mjs')).connect()
setTimeout(() => { console.log('TIMED OUT'); process.exit(2) }, 290000)

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
  const labels = [...document.querySelectorAll('.ray-label')].map((n) => ({
    what: n.className.replace(/\\s+/g, '.'),
    text: n.textContent.replace(/\\s+/g, ' ').trim(),
    ...box(n),
  })).filter((l) => real(l))

  const canvas = map.getCanvas()
  const viewport = box(canvas)

  return { viewport, chrome, pins, labels }
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
  const { viewport, chrome, pins, labels } = out
  const hits = []

  for (const l of labels) {
    for (const c of chrome) {
      if (overlaps(l, c)) hits.push(`${l.text || l.what} over ${c.what}`)
    }
    for (const p of pins) {
      if (overlaps(l, p)) hits.push(`${l.text || l.what} over the venue pin`)
    }
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

  /* And labels must not stack on each other: two readouts in one place is one unreadable one. */
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
ws.close()
process.exit(problems === 0 ? 0 : 1)
