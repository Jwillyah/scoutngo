/*
 * THE HOME PAGE'S TYPE, ON WHAT IS ACTUALLY BEHIND IT.
 *
 * Usage:  node scripts/measure-home-contrast.mjs   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-home-contrast.md
 * Exits:  0 every label in its band and at 4.5:1 or better; 1 not; 2 could not look.
 *
 * Reads each label's box on the real page at 390 x 844, and its colour, and
 * walks the sky (src/lib/homeSky.ts) down every pixel row the label covers
 * for the worst ratio. The footer is checked against the scrim over a white
 * roof, which is the worst the photograph can put under it.
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { guardAudit } from './preflight.mjs'
import { contrastRatio, mixHex } from '../src/core/contrast.ts'
import { FOOT_SCRIM, FOOT_SOLID_AT, FRAME, skyAt, TYPE_BANDS } from '../src/lib/homeSky.ts'

guardAudit('home contrast')
const { send, ev, wait, dispose } = await connect()
await send('Emulation.setDeviceMetricsOverride', { width: FRAME.width, height: FRAME.height, deviceScaleFactor: 2, mobile: true })
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await wait(2000)
await ev('localStorage.clear()')
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
await wait(4000)
const seen = await ev(`JSON.stringify([...document.querySelectorAll('.cover__name, .cover__head, .cover__featlabel, .cover__licence')].map((e) => {
  const r = e.getBoundingClientRect(); const c = getComputedStyle(e).color.match(/\\d+/g).slice(0, 3).map(Number)
  return { what: e.className.replace('cover__', ''), text: e.textContent.trim().slice(0, 40), top: Math.round(r.top), bottom: Math.round(r.bottom), ink: '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('') }
}))`)
await dispose()
const labels = JSON.parse(seen ?? '[]')
if (labels.length < 7) {
  console.log(`could not look: found ${labels.length} labels on the home page, expected at least 7`)
  process.exit(2)
}

const rows = []
let problems = 0
for (const l of labels) {
  let band, worst
  if (l.what === 'licence') {
    band = `top at or below ${Math.round(TYPE_BANDS.footerFrom * FRAME.height)}`
    const inBand = l.top >= TYPE_BANDS.footerFrom * FRAME.height && l.top >= FOOT_SOLID_AT * FRAME.height
    worst = contrastRatio(l.ink, mixHex('#ffffff', FOOT_SCRIM.colour, FOOT_SCRIM.opacity))
    if (!inBand) problems += 1
    l.inBand = inBand
  } else {
    const b = l.what === 'featlabel' ? TYPE_BANDS.dark : TYPE_BANDS.light
    band = `${b.from} to ${b.to}`
    l.inBand = l.top >= b.from && l.bottom <= b.to
    if (!l.inBand) problems += 1
    worst = Infinity
    for (let y = l.top; y <= l.bottom; y += 1) worst = Math.min(worst, contrastRatio(l.ink, skyAt(y) ?? '#000000'))
  }
  if (worst < 4.5) problems += 1
  rows.push(`| ${l.text} | ${l.ink} | ${l.top} to ${l.bottom} | ${band} | ${l.inBand ? 'yes' : 'NO'} | ${worst.toFixed(2)} |`)
}

const today = new Date().toISOString().slice(0, 10)
const out = `measurements/${today}-home-contrast.md`
const lines = [
  '# Home page type against what is behind it',
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-home-contrast.mjs · 390 x 844`,
  'Sky colours from src/lib/homeSky.ts, walked down every pixel row each label covers; the footer against its scrim over white.',
  '',
  '| label | ink | rows (px) | band | in band | worst ratio |',
  '|---|---|---|---|---|---|',
  ...rows,
  '',
  `Problems: ${problems}.`,
  '',
]
writeFileSync(out, lines.join('\n'))
console.log(lines.join('\n'))
process.exit(problems === 0 ? 0 : 1)
