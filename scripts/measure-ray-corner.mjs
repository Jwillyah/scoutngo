/*
 * THE CONTROL CORNER THE RAY LABELS WERE AVOIDING.
 *
 * Usage:  node scripts/measure-ray-corner.mjs   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-ray-label-corner.md
 * Exits:  0 measured; 2 could not look (no map, no corner).
 *
 * WHY. The ray labels and the grid tags both reserve what floats over the map
 * (src/lib/floatingChrome.ts). The grid tags measured a MapLibre control
 * corner by its children; the ray labels and the label audit measured the
 * corner itself. This records the corner and what is in it at the phone size
 * the audits use, and where the ray labels sit now that the corner counts as
 * its children.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit } from './preflight.mjs'

guardAudit('ray corner')
const { send, ev, wait, dispose } = await connect()
const W = 390
const H = 844
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 3, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await wait(3000)
await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true')`)
await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
await wait(9000)
await goToStage(ev, wait, 'plan')
await wait(3000)
const seen = await ev(`(() => {
  const r = (n) => { const b = n.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } }
  const corner = document.querySelector('.maplibregl-ctrl-bottom-left')
  if (!corner || !window.__probe?.map) return null
  const box = r(corner)
  const children = [...corner.children].map((c) => ({ what: c.className.split(' ').slice(1, 2).join(''), ...r(c) }))
  const labels = [...document.querySelectorAll('.ray-label')].map((n) => ({ text: n.textContent.trim(), ...r(n) }))
  const inStrip = labels.filter((l) => l.x < box.x + box.w && l.x + l.w > box.x && l.y < box.y + box.h && l.y + l.h > box.y)
  const underChild = labels.filter((l) => children.some((c) => l.x < c.x + c.w && l.x + l.w > c.x && l.y < c.y + c.h && l.y + l.h > c.y))
  return { box, children, labels: labels.length, inStrip: inStrip.length, underChild: underChild.length }
})()`)
await send('Emulation.clearDeviceMetricsOverride')
await dispose()
if (seen === null) {
  console.log('=== RAY CORNER ABORTED: no map or no bottom-left control corner ===')
  process.exit(2)
}
const today = new Date().toLocaleDateString('en-CA')
const lines = [
  '# The bottom-left control corner and the ray labels',
  '',
  `**Date:** ${today}`,
  '**Script:** `scripts/measure-ray-corner.mjs`',
  `**Viewport:** ${W} x ${H}, Plan, the calibration venue`,
  '',
  `Corner box: ${seen.box.w} px wide by ${seen.box.h} px tall, x ${seen.box.x}, y ${seen.box.y} to ${seen.box.y + seen.box.h}.`,
  '',
  'What is in it:',
  '',
  ...seen.children.map((c) => `- ${c.what}: ${c.w} x ${c.h} at x ${c.x}, y ${c.y}`),
  '',
  `Ray labels on screen: ${seen.labels}. Inside the corner box: ${seen.inStrip}. Under a control in it: ${seen.underChild}.`,
  '',
]
const file = `measurements/${today}-ray-label-corner.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`written to ${file}`)
