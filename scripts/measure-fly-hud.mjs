/*
 * THE FLY SCREEN, FLOWN BY TOUCH, IN LANDSCAPE AND IN PORTRAIT.
 *
 * Usage:  node scripts/measure-fly-hud.mjs   (app on :5173, Chrome on :9222)
 * Writes: measurements/<today>-fly-hud.md, and screenshots to $SCOUTNGO_OUT when set
 * Exits:  0 every check passed; 1 not; 2 could not look.
 *
 * At the Virginia Beach pier, Preflight's Fly it yourself, with touch input
 * through the browser (Input.dispatchTouchEvent) on the sticks:
 *
 *   one system of units in the bottom readout (ft and mph by default)
 *   the app's dock, sheet and time bar hidden while flying
 *   two sticks about 120 px across, in the bottom corners in landscape
 *   the look Animated on the ground (below 150 ft), Real after climbing
 *   Land asks first, and lands only on the second tap
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { guardAudit } from './preflight.mjs'
import { openShared } from './openShared.mjs'

guardAudit('fly hud')
const OUT = process.env.SCOUTNGO_OUT ?? null
const c = await connect()
const { send, ev, wait, dispose } = c
const rows = []
let problems = 0
const check = (ok, what) => {
  rows.push(`- ${ok ? 'ok' : 'FAIL'}: ${what}`)
  if (!ok) problems += 1
}

const STATE = `JSON.stringify((() => {
  const q = (s) => document.querySelector(s)
  const shown = (s) => { const e = q(s); return e !== null && getComputedStyle(e).display !== 'none' }
  const sticks = [...document.querySelectorAll('.fly__stick')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  return {
    readout: [...document.querySelectorAll('.fly__readout > span')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()).join(' | ') || null,
    look: q('.fly__look .fly__seg--on')?.textContent ?? null,
    ring: !!q('.fly__ring'),
    arcs: document.querySelectorAll('.fly__arc').length,
    modes: [...document.querySelectorAll('.fly__modes .fly__seg')].map((b) => b.textContent),
    chrome: { topbar: shown('.topbar'), sheet: shown('.sheet'), tooldock: shown('.tooldock') },
    sticks, vw: innerWidth, vh: innerHeight,
    land: q('.fly__land')?.textContent ?? null,
  }
})())`

async function hold(i, dx, dy, ms) {
  const r = JSON.parse(await ev(`JSON.stringify(document.querySelectorAll('.fly__stick')[${i}].getBoundingClientRect())`))
  const x = r.x + r.width / 2
  const y = r.y + r.height / 2
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * r.width * 0.45, y: y + dy * r.height * 0.45 }] })
  await wait(ms)
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

try {
  for (const [label, size] of [['landscape', { width: 844, height: 390 }], ['portrait', { width: 390, height: 844 }]]) {
    await send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 2, mobile: true })
    await openShared(c, { lat: 36.8435575, lon: -75.9713104, name: 'Virginia Beach Fishing Pier', date: '2026-10-28', start: '16:30', end: '17:30' })
    await ev(`document.querySelector('button[aria-label="Map and layers"]')?.click()`)
    await wait(900)
    await ev(`[...document.querySelectorAll('button.tile')].find(t => t.querySelector('.tile__label')?.textContent === 'Preflight')?.click()`)
    await wait(1500)
    await ev(`[...document.querySelectorAll('.pf button')].find(b => b.textContent === 'Fly it yourself')?.click()`)
    let up = false
    for (let i = 0; i < 90 && !up; i += 1) {
      await wait(1000)
      up = await ev(`!!document.querySelector('.fly__stick')`)
    }
    if (!up) throw new Error(`${label}: the fly screen never came up`)
    await wait(2500)
    rows.push(`## ${label}, ${size.width} x ${size.height}`, '')
    let s = JSON.parse(await ev(STATE))
    check(s.ring && s.arcs >= 0, `the attitude ring is drawn (${s.arcs} obstacle arcs)`)
    check(JSON.stringify(s.modes) === JSON.stringify(['C', 'N', 'S']), `one C / N / S pill: ${s.modes.join(' ')}`)
    check(!s.chrome.topbar && !s.chrome.sheet && !s.chrome.tooldock, `the top bar, the sheet and the dock are hidden (${JSON.stringify(s.chrome)})`)
    check(s.sticks.length === 2 && s.sticks.every((k) => k.w >= 110 && k.w <= 130), `two sticks about 120 px: ${s.sticks.map((k) => Math.round(k.w)).join(' and ')} px`)
    if (label === 'landscape') {
      const [l, r] = s.sticks
      check(l.x < s.vw * 0.25 && r.x + r.w > s.vw * 0.75 && l.y + l.h > s.vh * 0.6, `in the bottom corners: left at ${Math.round(l.x)} px, right ending at ${Math.round(r.x + r.w)} px of ${s.vw}`)
    }
    check(s.look === 'Animated', `on the ground the look is ${s.look} (Animated below 150 ft)`)
    if (OUT !== null) await c.shot(OUT, `fly-${label}-ground`)
    /*
     * Climb: the left stick up, in 10 s holds until the readout passes 160 ft
     * (two minutes at most). Software-drawn frames are slow and the flight
     * model's clock steps with them, so a fixed hold climbs less here than on
     * a phone.
     */
    let h = 0
    for (let k = 0; k < 12 && !(h > 160); k += 1) {
      await hold(0, 0, -1, 10000)
      await wait(600)
      s = JSON.parse(await ev(STATE))
      h = Number(/H\s*(\d+)/.exec(s.readout ?? '')?.[1] ?? Number.NaN)
    }
    rows.push(`Readout after the climb: "${(s.readout ?? '').replace(/\s+/g, ' ').trim()}"`, '')
    check(/\bft\b/.test(s.readout ?? '') && /\bmph\b/.test(s.readout ?? '') && !/\bm\/s\b|\d\s*m\b/.test(s.readout ?? ''), 'the readout is in ft and mph only')
    check(h > 150 && s.look === 'Real', `after climbing to H ${h} ft the look is ${s.look} (Real above 150 ft)`)
    if (OUT !== null) await c.shot(OUT, `fly-${label}`)
    /* Land asks first. */
    await ev(`document.querySelector('.fly__land')?.click()`)
    await wait(400)
    const asked = await ev(`!!document.querySelector('.fly__confirm') && !!document.querySelector('.fly__stick')`)
    check(asked, 'Land asks "Land and keep this flight?" and keeps flying until answered')
    await ev(`[...document.querySelectorAll('.fly__confirm button')].find((b) => b.textContent === 'Land')?.click()`)
    await wait(2000)
    const landed = await ev(`!document.querySelector('.fly__stick') && getComputedStyle(document.querySelector('.sheet')).display !== 'none'`)
    check(landed, 'the second tap lands, and the app comes back')
    rows.push('')
  }
} catch (error) {
  console.log(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  await dispose()
  process.exit(2)
}
await dispose()
const date = new Date().toISOString().slice(0, 10)
const out = ['# The fly screen, flown by touch', '', `Run: ${new Date().toISOString()} · node scripts/measure-fly-hud.mjs · Chrome headless (software WebGL), touch emulation, the Virginia Beach pier, units as the app's default`, '', ...rows, problems === 0 ? 'Pass.' : `FAIL: ${problems}.`, '']
writeFileSync(`measurements/${date}-fly-hud.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(problems === 0 ? 0 : 1)
