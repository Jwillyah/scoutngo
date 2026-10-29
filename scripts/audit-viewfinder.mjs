/*
 * THE VIEWFINDER, IN WEBKIT, AS A TAB AND FROM THE HOME-SCREEN ICON.
 *
 * Usage:  node scripts/audit-viewfinder.mjs [screenshot-dir]
 *
 * WHY THIS EXISTS. 29 Oct, on an iPhone: the camera's green dot on and the
 * screen black, the "sees wider than this phone's camera" line once per
 * body, and controls covering half the picture. Playwright's WebKit has no
 * camera, so getUserMedia is answered here with a moving test picture (or no
 * picture at all, or a refusal), and the compass with a synthetic
 * deviceorientation pointed at the sun. What it cannot show is iOS's own
 * camera pipeline; that is in the report's on-device checklist.
 *
 *   picture   the <video> is playing with a picture (videoWidth > 0)
 *   no frames a stream that never sends a frame says so in one line with Retry
 *   refusal   one line with Retry
 *   wider     one "Wider than your phone's camera" line however many bodies,
 *             and "Switch to 0.5×" asks for the listed ultra-wide by id
 *   frame     at 28 mm a frame rectangle is drawn, and no "wider" line
 *   controls  the bar is at most a quarter of the screen; X and "i" top right,
 *             below the status bar; compass offset and FOV only in the "i"
 *   calibrate sun up: "Calibrate on sun"; sun down, moon up: "Calibrate on
 *             moon"; both down: grey text, not a button
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { getPosition } from 'suncalc'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { project, visibleFov, PHONE_MAIN_LONG_SIDE_DEG } from '../src/core/arProjection.ts'

guardAudit('viewfinder')
const watchdog = startWatchdog('viewfinder', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'viewfinder')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const SUN_UP = '2026-10-29T17:00:00Z'
const MOON_ONLY = '2026-10-29T05:00:00Z'
const BOTH_DOWN = '2026-10-29T23:00:00Z'
const ULTRA_ID = 'ultra-wide-test-id'

await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-29', startTime: '07:00', endTime: '08:30' }
const kit = { bodyIds: ['a7iv', 'a7iii'], lensIds: ['sigma-28-75', 'sony-10-18'], droneIds: [], styleNotes: '' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'vf', name: 'Viewfinder check', savedAt: '2026-10-29T00:00:00Z', venue, kit, positions: [] }))

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/* The phone upright, turned to the sun, tilted until the sun is inside the picture. */
function aimAtSun(when) {
  const sun = getPosition(new Date(when), PIER.lat, PIER.lon)
  const fov = visibleFov(390, 844, PHONE_MAIN_LONG_SIDE_DEG)
  for (let beta = 60; beta <= 150; beta += 1) {
    const alpha = (360 - sun.azimuth) % 360
    const at = project(sun.azimuth, sun.altitude, { alpha, beta, gamma: 0 }, fov)
    if (at !== null && Math.abs(at.y - 0.4) < 0.05 && at.x > 0.3 && at.x < 0.7) return { heading: sun.azimuth, beta }
  }
  throw new Error('no tilt puts the sun inside the picture')
}

const browser = await webkit.launch()

async function session(label, insets, when, camera) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(([top, bottom, cameraMode, ultraId]) => {
    const add = () => {
      const s = document.createElement('style')
      s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
      document.head.appendChild(s)
    }
    if (document.head) add()
    else document.addEventListener('DOMContentLoaded', add)
    /* The test camera: a moving picture, a stream with no frames, or a refusal. */
    window.__asked = []
    /* On the prototype: WebKit ignores a getUserMedia set on the instance. */
    const stub = (name, fn) => Object.defineProperty(MediaDevices.prototype, name, { value: fn, configurable: true, writable: true })
    stub('getUserMedia', async (constraints) => {
      window.__asked.push(JSON.stringify(constraints.video))
      if (cameraMode === 'refuse') throw new DOMException('denied', 'NotAllowedError')
      if (cameraMode === 'blank') return new MediaStream()
      const c = document.createElement('canvas')
      c.width = 640
      c.height = 480
      const g = c.getContext('2d')
      let n = 0
      setInterval(() => {
        n += 1
        g.fillStyle = `hsl(${(n * 7) % 360} 60% 45%)`
        g.fillRect(0, 0, 640, 480)
        g.fillStyle = '#fff'
        g.fillRect((n * 9) % 640, 200, 60, 60)
      }, 50)
      return c.captureStream(20)
    })
    stub('enumerateDevices', async () => [
      { kind: 'videoinput', deviceId: 'back-main', label: 'Back Camera' },
      { kind: 'videoinput', deviceId: ultraId, label: 'Back Ultra Wide Camera' },
    ])
  }, [insets.top, insets.bottom, camera, ULTRA_ID])
  const page = await ctx.newPage()
  await page.clock.setFixedTime(new Date(when))
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  await page.goto(url.href)
  await wait(3500)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await wait(1500)
  await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
  await wait(1500)
  await goToStage(ev, wait, 'plan')
  await wait(2500)
  await page.locator('button[aria-label="Menu"]').first().tap()
  await wait(800)
  await page.getByText('Viewfinder', { exact: true }).first().tap()
  await wait(800)
  if ((await page.locator('.vf').count()) === 0) throw new Error(`${label}: the viewfinder did not open from the menu`)
  await page.getByRole('button', { name: /Open the camera/ }).tap()
  await wait(600)
  const aim = aimAtSun(SUN_UP)
  await ev(`window.dispatchEvent(Object.assign(new Event('deviceorientation'), { alpha: 0, beta: ${aim.beta}, gamma: 0, webkitCompassHeading: ${aim.heading} }))`)
  await wait(400)
  return { ctx, page, wait, ev }
}

const LOOK = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height, w: b.width } }
  const v = document.querySelector('.vf__video')
  const notes = [...document.querySelectorAll('.vf__note')].map((n) => n.textContent.trim())
  const acts = [...document.querySelectorAll('.vf__act')].map((a) => ({ tag: a.tagName.toLowerCase(), text: a.textContent.trim(), off: a.classList.contains('vf--off') || a.classList.contains('vf__act--off') }))
  return {
    playing: !!v && v.videoWidth > 0 && !v.paused,
    videoWidth: v ? v.videoWidth : null,
    notes,
    acts,
    bar: r(document.querySelector('.vf__bar')),
    close: r(document.querySelector('button[aria-label="Close the viewfinder"]')),
    info: r(document.querySelector('button[aria-label="What the viewfinder assumes"]')),
    frame: r(document.querySelector('.vf__frame')),
    sun: r(document.querySelector('.vf__sun')),
    text: document.querySelector('.vf')?.innerText ?? '',
    asked: window.__asked,
  }
})()`

try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)

    /* picture, frame, controls, wider */
    let s = await session(label, insets, SUN_UP, 'good')
    await s.wait(1500)
    let look = await s.ev(LOOK)
    if (look.bar === null) throw new Error(`${label}: the viewfinder never went live: "${(look.text || '').replace(/\s+/g, ' ').slice(0, 200)}"`)
    looked += 1
    console.log(`  live: playing ${look.playing} (${look.videoWidth} px), bar ${Math.round(look.bar?.h ?? -1)} px, notes ${JSON.stringify(look.notes)}`)
    if (!look.playing) fail(`${label}: the video is not playing a picture`)
    if (look.bar === null || look.bar.h > 844 / 4) fail(`${label}: the controls take ${look.bar?.h} px, more than a quarter of 844`)
    for (const [name, box] of [['X', look.close], ['i', look.info]]) {
      if (box === null) fail(`${label}: no ${name} button`)
      else {
        if (box.top < insets.top) fail(`${label}: ${name} at ${box.top} is under the status bar`)
        if (box.right < 390 - 110 || box.top > insets.top + 60) fail(`${label}: ${name} is not top right (${JSON.stringify(box)})`)
        if (box.h < 44 || box.w < 44) fail(`${label}: ${name} is ${box.w}x${box.h}, under 44 px`)
      }
    }
    if (/Compass offset|Assumes the phone camera/.test(look.text)) fail(`${label}: the FOV assumption or compass offset is on screen outside the "i"`)
    if (look.frame === null || look.frame.w < 20) fail(`${label}: no frame rectangle at 28 mm`)
    if (look.notes.some((n) => /Wider/.test(n))) fail(`${label}: "wider" at 28 mm, which a 69° phone camera covers`)
    if (look.sun === null) fail(`${label}: the sun marker is not on the picture, so the aim did not land`)
    if (!look.acts.some((a) => a.tag === 'button' && a.text === 'Calibrate on sun')) fail(`${label}: sun up, but no "Calibrate on sun" button: ${JSON.stringify(look.acts)}`)
    await s.page.screenshot({ path: join(OUT, `live-${label}.png`) })

    await s.page.locator('button[aria-label="What the viewfinder assumes"]').tap()
    await s.wait(300)
    look = await s.ev(LOOK)
    if (!/Assumes the phone camera sees about 69°/.test(look.text) || !/Compass offset/.test(look.text)) fail(`${label}: the "i" does not say the FOV assumption and the compass offset`)
    if (!/Back Ultra Wide Camera/.test(look.text)) fail(`${label}: the "i" does not list the cameras`)
    await s.page.screenshot({ path: join(OUT, `info-${label}.png`) })
    await s.page.locator('button[aria-label="What the viewfinder assumes"]').tap()

    await s.page.locator('select[aria-label="Lens"]').selectOption('sony-10-18')
    await s.wait(400)
    look = await s.ev(LOOK)
    const wider = look.notes.filter((n) => /Wider than your phone's camera/.test(n))
    console.log(`  10 mm: ${JSON.stringify(look.notes)}`)
    if (wider.length !== 1) fail(`${label}: ${wider.length} "wider" lines with two bodies in the bag, not one`)
    if ((await s.page.getByText(/sees wider than this phone's camera/).count()) > 0) fail(`${label}: the old per-body "sees wider" line is still drawn`)
    if (look.bar.h > 844 / 4) fail(`${label}: with the wider line the controls take ${look.bar.h} px`)
    await s.page.screenshot({ path: join(OUT, `wider-${label}.png`) })
    const sw = s.page.getByRole('button', { name: 'Switch to 0.5×' })
    if ((await sw.count()) !== 1) fail(`${label}: no "Switch to 0.5×" with an ultra-wide listed`)
    else {
      await sw.tap()
      await s.wait(800)
      look = await s.ev(LOOK)
      if (!look.asked.some((a) => a.includes(ULTRA_ID))) fail(`${label}: the switch did not ask for the ultra-wide by id: ${JSON.stringify(look.asked)}`)
      if (!look.playing) fail(`${label}: no picture after switching to the ultra-wide`)
    }
    await s.page.locator('button[aria-label="Close the viewfinder"]').tap()
    await s.wait(400)
    if ((await s.page.locator('.vf').count()) !== 0) fail(`${label}: X did not close the viewfinder`)
    await s.ctx.close()
    watchdog.note(`${label} live`)

    /* no frames: never black without a word */
    s = await session(label, insets, SUN_UP, 'blank')
    await s.wait(5000)
    look = await s.ev(LOOK)
    console.log(`  no frames: ${JSON.stringify(look.notes)}`)
    if (look.playing) fail(`${label}: the blank stream reads as playing, so this step measured nothing`)
    if (!look.notes.some((n) => /no picture arrived/.test(n) && /Retry/.test(n))) fail(`${label}: a stream with no picture is black with no line and Retry`)
    await s.page.screenshot({ path: join(OUT, `nopicture-${label}.png`) })
    await s.ctx.close()

    /* refusal */
    s = await session(label, insets, SUN_UP, 'refuse')
    look = await s.ev(`document.querySelector('.vf')?.innerText ?? ''`)
    if (!/Camera access was not allowed/.test(look) || (await s.page.getByRole('button', { name: 'Retry' }).count()) !== 1) fail(`${label}: a refusal is not one line with Retry`)
    await s.ctx.close()

    /* calibrate on the moon; both down */
    for (const [when, want] of [[MOON_ONLY, 'moon'], [BOTH_DOWN, 'none']]) {
      s = await session(label, insets, when, 'good')
      look = await s.ev(LOOK)
      const cal = look.acts.find((a) => /Calibrate|down/.test(a.text))
      console.log(`  ${when}: ${JSON.stringify(cal)}`)
      if (want === 'moon' && !(cal?.tag === 'button' && cal.text === 'Calibrate on moon')) fail(`${label}: sun down, moon up, but ${JSON.stringify(cal)}`)
      if (want === 'none' && !(cal?.tag !== 'button' && cal?.off === true)) fail(`${label}: both down, but the calibrate control is ${JSON.stringify(cal)}`)
      if (want === 'none') await s.page.screenshot({ path: join(OUT, `bothdown-${label}.png`) })
      await s.ctx.close()
    }
    watchdog.note(`${label} done`)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== VIEWFINDER AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== VIEWFINDER PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
