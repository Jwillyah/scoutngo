/*
 * 3D FRAME TIMES WHILE FLYING (Batch D, Section 7), in emulation.
 *
 * Usage:  bash scripts/gate/browser-gate.sh is not needed; run with the gate's
 *         server up:  SCOUTNGO_APP=http://127.0.0.1:5180 SCOUTNGO_PROXY=http://127.0.0.1:5181 node scripts/measure-3d-frames.mjs
 *
 * WebKit at 390 x 844 (an iPhone 13's screen; Playwright's WebKit on this
 * Mac, not the phone's GPU), the pier from the fixture tiles, the
 * forecast's cloud (40·20·10). The camera flies 10 s along the beach at
 * 120 m, posed every frame by the page; the scene's own draw times
 * (renderer.render and what it waits on) are read back. Clouds High, then
 * Battery. Writes measurements/<date>-3d-frames.md.
 */
import { writeFileSync } from 'node:fs'
import { webkit, devices } from './gate/playwright.mjs'
import { APP_ORIGIN, goToStage } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('scoutngo.landing.v1', 'true')
  } catch {
    /* about:blank */
  }
})
const page = await ctx.newPage()
const wait = (ms) => page.waitForTimeout(ms)
const ev = (x) => page.evaluate(x)
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-01', startTime: '07:00', endTime: '10:00' }
await page.goto(await shareLink(`${APP_ORIGIN}/`, { id: 'f', name: 'Frames', savedAt: '2026-10-31T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
await wait(3000)
await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
await page.getByText('Open the map', { exact: true }).click({ timeout: 3000 }).catch(() => {})
await goToStage(ev, wait, 'plan')
await wait(1500)
await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
for (let i = 0; i < 40 && !(await ev('!!window.__clay')); i += 1) await wait(1000)
await ev(`window.__clay.setSea({ sea: { heightM: 0.6, periodS: 8, fromDeg: 95, windMps: 4, windFromDeg: 200 }, waterLevelM: 0, cover: { low: 40, mid: 20, high: 10 }, visibilityKm: 20, seaMask: null, seed: 1 })`)
for (let i = 0; i < 30 && !(await ev('window.__clay.loaded()')); i += 1) await wait(1000)
const fly = async (quality) => {
  await ev(`window.__clay.setQuality('${quality}')`)
  await wait(1500)
  return ev(`new Promise((resolve) => {
    const c = window.__clay
    c.frameTimes()
    const t0 = performance.now()
    const drawn0 = c.renderer.info.render.frame
    const gaps = []
    let last = t0
    const step = () => {
      const now = performance.now()
      gaps.push(now - last)
      last = now
      const t = (now - t0) / 1000
      c.droneView({ lat: ${PIER.lat} + t * 0.00012, lon: ${PIER.lon} + 0.0004 }, 120, 10, -12, 24)
      if (t < 10) requestAnimationFrame(step)
      else {
        const all = c.frameTimes()
        resolve({ frames: all.length, ms: all.slice(-Math.min(all.length, 600)), seconds: t, drawn: c.renderer.info.render.frame - drawn0, gaps })
      }
    }
    requestAnimationFrame(step)
  })`)
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]
}
const rows = []
for (const q of ['high', 'battery']) {
  const r = await fly(q)
  rows.push({ q, n: r.ms.length, p50: pct(r.ms, 0.5), p95: pct(r.ms, 0.95), fps: r.drawn / r.seconds, g50: pct(r.gaps, 0.5), g95: pct(r.gaps, 0.95) })
  console.log(`${q}: ${(r.drawn / r.seconds).toFixed(1)} frames a second drawn; frame interval p50 ${pct(r.gaps, 0.5).toFixed(1)} ms, p95 ${pct(r.gaps, 0.95).toFixed(1)} ms; draw p50 ${pct(r.ms, 0.5).toFixed(1)} ms, p95 ${pct(r.ms, 0.95).toFixed(1)} ms`)
}
await browser.close()
const day = new Date().toISOString().slice(0, 10)
writeFileSync(`measurements/${day}-3d-frames.md`, `# 3D frame times while flying (emulation)

Run: ${new Date().toISOString()} · node scripts/measure-3d-frames.mjs · Playwright WebKit on the development Mac at 390 x 844 (an iPhone 13's screen size; not the phone's GPU) · the Virginia Beach pier from the gate's fixture tiles, cloud 40·20·10 · the camera flown 10 s along the beach at 120 m, posed every frame · the scene's own draw time per frame (src/three/world/scene.ts frameTimes), the last frames kept (at most 240).

| clouds | frames a second drawn | frame interval p50 (ms) | frame interval p95 (ms) | draw p50 (ms) | draw p95 (ms) |
|---|---|---|---|---|---|
${rows.map((r) => `| ${r.q} | ${r.fps.toFixed(1)} | ${r.g50.toFixed(1)} | ${r.g95.toFixed(1)} | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} |`).join('\n')}

The frame interval is the time between frames the page got (requestAnimationFrame), which includes the GPU's work as this browser schedules it. The draw time is the CPU's side of a frame (three.js preparing and submitting it), what the scene's adaptive resolution steers by; it is not the GPU's time on a phone, which only a real iPhone 13 can give.
`)
console.log(`wrote measurements/${day}-3d-frames.md`)
