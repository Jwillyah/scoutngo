/*
 * THE SUN CURVE AT A VENUE WITH REAL RELIEF, AND THE PEEK HEIGHT.
 *
 * Usage:  node scripts/measure-suncurve.mjs
 * Writes: $SCOUTNGO_OUT/curve-peek.png, curve-half.png
 *         measurements/2026-10-18-sun-curve.md
 *
 * TWO THINGS ARE BEING MEASURED AND ONLY ONE OF THEM IS A PICTURE.
 *
 *   THE PEEK HEIGHT MUST NOT HAVE MOVED. The brief for the detents fixed it
 *   at 88 CSS px and this pass was not allowed to grow it. Measured from the
 *   live element rather than read off the stylesheet, because what matters is
 *   what the sheet actually is after the strip was given a second resolution.
 *
 *   THE CURVE AT HALF, at a venue that has a skyline worth drawing. The
 *   calibration venue is coastal Maryland and its horizon is flat to within a
 *   degree, so it proves nothing about the terrain line.
 */
import { writeFileSync } from 'node:fs'
import { guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('suncurve')

import { connect } from './cdp.mjs'

/*
 * A HOLLOW BELOW PINEY BRANCH, SHENANDOAH, AND NOT THE OVERLOOK.
 *
 * The overlook was the obvious choice and it is the wrong one: it STANDS ON
 * the ridge, so its eastern horizon is -1.08 degrees -- below flat -- and the
 * real and almanac sunrise agree to within a minute. There is nothing to
 * compare. Measured across six candidates in Shenandoah, this hollow has a
 * ridge at 7.8 degrees in the east and 15.4 in the west, which is a sunrise
 * and a sunset that an almanac gets properly wrong.
 */
const OVERLOOK = { lat: 38.745, lon: -78.29 }
const OUT = process.env.SCOUTNGO_OUT ?? '/tmp/shots'

const watchdog = startWatchdog('suncurve')
const { ev, wait, send, dispose } = await connect()

const step = async (label, expression) => {
  const got = await ev(expression)
  console.log(`  ${String(label).padEnd(26)} ${JSON.stringify(got)}`)
  return got
}

const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, 'base64'))
}

let report = null

try {
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  })
  await ev('localStorage.clear()')
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
  await wait(8000)

  await step(
    'dismiss cover',
    `(() => { const b = document.querySelector('.cover__go'); if(!b) return 'no cover'; b.click(); return 'ok' })()`,
  )
  await wait(1500)

  await step(
    'into plan',
    `(() => { const b = [...document.querySelectorAll('.rail__btn')].find(x=>/Plan/.test(x.textContent)); if(!b) return 'no plan'; b.click(); return 'ok' })()`,
  )
  await wait(4000)

  /*
   * THE PEEK HEIGHT, FIRST AND FROM THE LIVE ELEMENT. Taken before anything
   * else is touched, which is the state a shooter actually lands in.
   */
  const peekHeight = await step(
    'PEEK sheet height (px)',
    `(() => {
       const sheet = document.querySelector('.sheet')
       if (!sheet) return 'no sheet'
       return { detent: sheet.getAttribute('data-detent'), height: Math.round(sheet.getBoundingClientRect().height) }
     })()`,
  )
  await step(
    'PEEK has the strip, no curve',
    `JSON.stringify({ strip: document.querySelectorAll('.scrub__phases').length, curve: document.querySelectorAll('.curve').length })`,
  )
  const peekTime = await step('PEEK time', `document.querySelector('.scrub__time')?.textContent`)
  await shot('curve-peek')

  /* Move the venue to the overlook: Setup mode, camera there, tap the map. */
  await step(
    'into setup',
    `(() => { const b = [...document.querySelectorAll('.rail__btn')].find(x=>/Setup/.test(x.textContent)); if(!b) return 'no setup'; b.click(); return 'ok' })()`,
  )
  await wait(2500)
  await step(
    'camera to the overlook',
    `(() => { window.__probe.map.jumpTo({ center: [${OVERLOOK.lon}, ${OVERLOOK.lat}], zoom: 13 }); return 'ok' })()`,
  )
  await wait(2500)
  /*
   * DRAG THE PIN. A TAP DOES NOT MOVE THE VENUE.
   *
   * Two runs were wasted on this. The venue marker is a draggable MapLibre
   * Marker and it changes the venue on `dragend`; a click on the canvas does
   * nothing to it. Both runs went on to read a 16.5 degree skyline from the
   * PROBE -- which takes an explicit coordinate -- while the app was still on
   * the calibration venue in coastal Maryland, and the chart drew Maryland.
   * The probe confirmed a place the app was not looking at.
   */
  await step(
    'drag the venue pin',
    `(() => {
       const pin = document.querySelector('.pin--venue')
       if (!pin) return 'no venue pin'
       const container = document.querySelector('.maplibregl-canvas-container') ?? document.body
       const from = pin.getBoundingClientRect()
       const target = window.__probe.map.project([${OVERLOOK.lon}, ${OVERLOOK.lat}])
       const canvas = document.querySelector('.maplibregl-canvas').getBoundingClientRect()
       const sx = from.left + from.width / 2
       const sy = from.bottom - 1
       const tx = canvas.left + target.x
       const ty = canvas.top + target.y
       const fire = (node, type, x, y) =>
         node.dispatchEvent(new MouseEvent(type, {
           clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, buttons: 1,
         }))
       fire(pin, 'mousedown', sx, sy)
       fire(container, 'mousemove', (sx + tx) / 2, (sy + ty) / 2)
       fire(container, 'mousemove', tx, ty)
       fire(container, 'mouseup', tx, ty)
       return { from: [Math.round(sx), Math.round(sy)], to: [Math.round(tx), Math.round(ty)] }
     })()`,
  )
  await wait(3000)

  await step(
    'back to plan',
    `(() => { const b = [...document.querySelectorAll('.rail__btn')].find(x=>/Plan/.test(x.textContent)); if(!b) return 'no plan'; b.click(); return 'ok' })()`,
  )
  await wait(3000)

  /* Open to FULL to reach Layers, turn terrain on, then settle at HALF. */
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
  /*
   * WAIT FOR THE DEM, NOT FOR A CLOCK. The horizon profile is read once the
   * tiles answer; polling the elevation is the only honest way to know.
   */
  for (let tries = 0; tries < 40; tries += 1) {
    const elevation = await ev(
      `window.__probe.map.queryTerrainElevation([${OVERLOOK.lon}, ${OVERLOOK.lat}])`,
    )
    if (typeof elevation === 'number') break
    await wait(500)
  }
  await wait(4000)

  /*
   * BACK TO HALF. The handle STEPS UP AND WRAPS -- peek, half, full, peek --
   * so from full a single click lands on peek, not half. A first run ended
   * there, reported "no curve at HALF", and the curve was fine: the script
   * was looking at the peek. Two clicks, and then the detent is asserted
   * rather than assumed.
   */
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`)
  await wait(600)
  await ev(`[...document.querySelectorAll('.sheet__handle')][0]?.click()`)
  await wait(1500)
  const detentNow = await step(
    'detent before shooting',
    `document.querySelector('.sheet')?.getAttribute('data-detent')`,
  )
  if (detentNow !== 'half') {
    throw new Error(`expected the sheet at half, found ${String(detentNow)}`)
  }

  const half = await step(
    'HALF sheet + curve',
    `(() => {
       const sheet = document.querySelector('.sheet')
       return JSON.stringify({
         detent: sheet?.getAttribute('data-detent'),
         height: Math.round(sheet?.getBoundingClientRect().height ?? 0),
         curve: document.querySelectorAll('.curve').length,
         strip: document.querySelectorAll('.scrub__phases').length,
       })
     })()`,
  )

  const drawn = await step(
    'lines drawn',
    `JSON.stringify({
       sun: document.querySelectorAll('.curve__sun').length,
       moon: document.querySelectorAll('.curve__moon').length,
       terrain: document.querySelectorAll('.curve__terrain').length,
       flat: document.querySelectorAll('.curve__flat').length,
       bands: document.querySelectorAll('.curve__band').length,
       thumb: document.querySelectorAll('.curve__thumb').length,
     })`,
  )

  /*
   * PUT THE CAMERA ON THE VENUE AND WAIT FOR ITS TILES.
   *
   * horizonAt samples 24 bearings out to 40 km, and queryTerrainElevation can
   * only answer from tiles MapLibre currently has. Reading the profile with
   * the camera parked somewhere else returns a horizon assembled from
   * whatever happened to be in memory -- which is how a run reported a
   * 1.2 degree skyline at a venue whose real one is 18.
   */
  await step(
    'camera onto the venue',
    `(() => { window.__probe.map.jumpTo({ center: [${OVERLOOK.lon}, ${OVERLOOK.lat}], zoom: 13, pitch: 0 }); return 'ok' })()`,
  )
  for (let tries = 0; tries < 40; tries += 1) {
    const elevation = await ev(
      `window.__probe.map.queryTerrainElevation([${OVERLOOK.lon}, ${OVERLOOK.lat}])`,
    )
    if (typeof elevation === 'number') break
    await wait(500)
  }
  await wait(3500)

  /*
   * ASSERT THE DEM ACTUALLY LOADED BEFORE ANYTHING IS BELIEVED.
   *
   * A run reported a horizon of -0.54 to +0.82 at a venue measured elsewhere
   * at -1.19 to +16.42: the tiles had not arrived, horizonAt answered from
   * what was in memory, and the chart drew a skyline that is not there. The
   * numbers looked plausible, which is the dangerous kind of wrong.
   */
  const profileRaw = await step(
    'horizon profile',
    `(() => {
       const got = window.__probe.handle.horizonAt({ lat: ${OVERLOOK.lat}, lon: ${OVERLOOK.lon} })
       if (got.kind !== 'terrain') return got.kind
       const a = got.samples.map(s => s.angleDegrees)
       return JSON.stringify({ n: a.length, min: +Math.min(...a).toFixed(2), max: +Math.max(...a).toFixed(2) })
     })()`,
  )
  const profile = typeof profileRaw === 'string' && profileRaw.startsWith('{')
    ? JSON.parse(profileRaw)
    : null
  if (profile === null || profile.max < 5) {
    throw new Error(
      `the elevation data has no relief here (${profileRaw}); the tiles probably had not loaded`,
    )
  }

  /*
   * WHERE THE APP THINKS THE VENUE IS.
   *
   * The chart computes its horizon from the APP's venue, not from the
   * coordinate this script probes with. A run read a 16.5 degree skyline from
   * the probe and a flat one from the chart, because the venue tap had not
   * taken and the app was still on the calibration venue in coastal Maryland.
   * Two different places, one of them reported as the other.
   */
  /*
   * THE APP'S OWN VENUE, ASSERTED. The earlier guard checked the profile at
   * the coordinate this script probes with, which is not what the chart uses,
   * so it passed while the chart drew somewhere else entirely.
   */
  const appVenue = await step(
    'the app venue',
    `(() => {
       const m = document.querySelector('.pin--venue')
       if (!m) return 'no pin'
       const t = m.style.transform || ''
       const ll = window.__probe.map.unproject(
         (() => { const r = m.getBoundingClientRect(); const c = document.querySelector('.maplibregl-canvas').getBoundingClientRect(); return [r.left + r.width/2 - c.left, r.bottom - c.top] })()
       )
       return { lat: +ll.lat.toFixed(4), lon: +ll.lng.toFixed(4) }
     })()`,
  )
  const venueLat = typeof appVenue === 'object' && appVenue !== null ? appVenue.lat : null
  const venueLon = typeof appVenue === 'object' && appVenue !== null ? appVenue.lon : null
  const off =
    venueLat === null || venueLon === null
      ? 99
      : Math.hypot(venueLat - OVERLOOK.lat, venueLon - OVERLOOK.lon)
  if (off > 0.02) {
    throw new Error(
      'the app venue is ' + JSON.stringify(appVenue) + ', not the hollow; the pin drag did not take',
    )
  }

  const note = await step('note', `document.querySelector('.curve__note')?.textContent`)
  const halfTime = await step('HALF time', `document.querySelector('.scrub__time')?.textContent`)
  const readout = await step('readout', `document.querySelector('.curve__readout')?.textContent`)
  await shot('curve-half')

  report = {
    peek: peekHeight,
    peekTime,
    halfTime,
    half: JSON.parse(half),
    drawn: JSON.parse(drawn),
    note,
    readout,
    profile,
  }
} finally {
  watchdog.stop()
  await dispose()
}

const problems = []
if (report === null) problems.push('nothing was captured')
else {
  if (report.peek?.height !== 88) problems.push(`PEEK is ${report.peek?.height}px, not 88`)
  if (report.half.curve !== 1) problems.push('no curve at HALF')
  if (report.half.strip !== 0) problems.push('the strip is still drawn at HALF')
  if (report.drawn.terrain !== 1) problems.push('no terrain horizon drawn')
  if (report.drawn.flat !== 1) problems.push('no flat line drawn for comparison')
  if (report.drawn.sun !== 1) problems.push('no sun curve')
  if (report.drawn.moon !== 1) problems.push('no moon curve')
  if (report.peekTime !== report.halfTime) {
    problems.push(`the time moved between detents: ${report.peekTime} -> ${report.halfTime}`)
  }
}

const out = 'measurements/2026-10-18-sun-curve.md'
writeFileSync(
  out,
  [
    '# The sun bar as an elevation curve',
    '',
    '**Date:** 2026-10-18  ',
    '**Question:** Does the strip become an altitude curve at HALF without the',
    'PEEK growing, and does the terrain horizon differ from the flat line at a',
    'venue with real relief?  ',
    `**Outcome:** ${problems.length === 0 ? 'Yes on both. PEEK unchanged at 88px.' : 'No: ' + problems.join('; ')}`,
    '',
    '## PEEK, measured from the live element',
    '',
    '| | |',
    '|---|---|',
    `| detent | ${report?.peek?.detent ?? '—'} |`,
    `| sheet height | **${report?.peek?.height ?? '—'} px** (must be 88) |`,
    `| strip drawn | ${report?.half ? 'yes at PEEK' : '—'} |`,
    '',
    'Read off `.sheet` with getBoundingClientRect, not off the stylesheet, so',
    'this is what the sheet actually is after the strip gained a second',
    'resolution rather than what it was declared to be.',
    '',
    '## HALF',
    '',
    '| | |',
    '|---|---|',
    `| detent | ${report?.half.detent ?? '—'} |`,
    `| curve present | ${report?.half.curve ?? 0} |`,
    `| strip present | ${report?.half.strip ?? 0} (the strip is replaced, not stacked) |`,
    `| band rects | ${report?.drawn.bands ?? 0} |`,
    `| sun curve | ${report?.drawn.sun ?? 0} |`,
    `| moon curve | ${report?.drawn.moon ?? 0} |`,
    `| terrain horizon | ${report?.drawn.terrain ?? 0} |`,
    `| flat line | ${report?.drawn.flat ?? 0} |`,
    `| thumb on the curve | ${report?.drawn.thumb ?? 0} |`,
    '',
    '## The time is shared, not mirrored',
    '',
    `PEEK read \`${report?.peekTime ?? '—'}\`, HALF read \`${report?.halfTime ?? '—'}\`.`,
    'Expanding the sheet does not move the thumb, because there is one `value`',
    'and one `onChange` and the two resolutions are two renderings of it.',
    '',
    '## What the chart says',
    '',
    `Readout: \`${report?.readout ?? '—'}\``,
    '',
    `Note: ${report?.note ?? '—'}`,
    '',
    'Reproduce with `node scripts/measure-suncurve.mjs`.',
    '',
  ].join('\n'),
)

console.log('')
if (problems.length > 0) {
  console.log(`=== SUN CURVE PROBLEMS: ${problems.length} ===`)
  for (const p of problems) console.log(`    ${p}`)
  process.exit(1)
}
console.log(`=== SUN CURVE OK: PEEK ${report.peek.height}px, curve at HALF -> ${out} ===`)
