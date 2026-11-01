/*
 * 3D BUILDINGS: NOT BRIGHTER THAN THE SKY, AND ROOFED WITH THE PHOTO (Batch D, Section 4).
 *
 * Usage:  node scripts/audit-buildings-3d.mjs [screenshot-dir]
 * Exits:  0 clean; 1 a problem; 2 could not look.
 *
 * 1 Nov: glowing cream boxes with no roof detail. At the Virginia Beach pier
 * at 8:07 AM, from 400 ft looking along the hotels, the 3D canvas is drawn
 * three times: as it is, without the buildings, and without their roofs.
 * Pixels that change between the first two are building; between the first
 * and the third, roof.
 *
 *   BRIGHTNESS  the 99th percentile of the walls' luminance (building pixels
 *               that are not roof: a roof is the photo and may be as bright as
 *               the photo is) is below the mean luminance of the sky at the top
 *   ROOFS       the roofs' luminance varies like a photo (standard deviation
 *               at least ROOF_STD on the fixture imagery's speckle), not one
 *               flat clay
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { webkit, devices } from './gate/playwright.mjs'
import { APP_ORIGIN, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { decodePng } from '../src/lib/png.ts'
import { shareLink } from '../src/lib/planShare.ts'
import { placeKey } from '../src/core/venueName.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

guardAudit('3d buildings')
const watchdog = startWatchdog('3d buildings', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'buildings-3d')
mkdirSync(OUT, { recursive: true })
export const ROOF_STD = 8
let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const PIER = { lat: 36.8435575, lon: -75.9713104 }
const AT = '2026-11-01T13:07:00Z'

const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank */
    }
  })
  const page = await ctx.newPage()
  await page.clock.install({ time: new Date(AT) })
  await page.clock.resume()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-01', startTime: '07:00', endTime: '10:00' }
  await page.goto(await shareLink(`${APP_ORIGIN}/`, { id: 'b3', name: 'B3', savedAt: '2026-10-31T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
  await wait(3000)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
  await page.getByText('Open the map', { exact: true }).click({ timeout: 3000 }).catch(() => {})
  await goToStage(ev, wait, 'plan')
  await wait(1500)
  await ev(`document.querySelector('button[aria-label="Open the 3D clay model"]')?.click()`)
  for (let i = 0; i < 40 && !(await ev('!!window.__clay')); i += 1) await wait(1000)
  if (!(await ev('!!window.__clay'))) {
    console.log('=== 3D BUILDINGS AUDIT ABORTED: the 3D view never came up ===')
    process.exit(2)
  }
  await ev(`window.__clay.setSkyShown(false)`)
  /* Wait for the buildings to be in the scene: the place loads them after the scene is up. */
  for (let i = 0; i < 40; i += 1) {
    await wait(1000)
    await ev(`(() => { const c = window.__clay; c.setTime(new Date('${AT}')); c.droneView(${JSON.stringify(PIER)}, 122, 330, -15, 24) })()`)
    const ready = await ev(`window.__clay.loaded() && window.__clay.buildings().length > 0`)
    if (ready && i > 4) break
  }
  await wait(3000)
  const grab = async (hide) => {
    await ev(`window.__clay.setHidden(${hide === null ? 'null' : `'${hide}'`})`)
    await wait(600)
    const b64 = await ev(`(async () => (await window.__clay.snapshot()).toDataURL('image/png').split(',')[1])()`)
    const buf = Buffer.from(b64, 'base64')
    writeFileSync(join(OUT, `b3-${hide ?? 'all'}.png`), buf)
    return decodePng(buf)
  }
  const all = await grab(null)
  const noB = await grab('buildings')
  const noR = await grab('roofs')
  await ev('window.__clay.setHidden(null)')
  const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  const diff = (a, b, i) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24
  const bLum = []
  const rLum = []
  for (let i = 0; i < all.data.length; i += 4) {
    const roof = diff(all.data, noR.data, i)
    if (roof) rLum.push(lum(all.data, i))
    /* The walls: building, not roof. A roof is the photo and may be as bright as the photo is. */
    else if (diff(all.data, noB.data, i)) bLum.push(lum(all.data, i))
  }
  let sky = 0
  let skyN = 0
  for (let y = 0; y < Math.floor(all.height * 0.12); y += 1) for (let x = 0; x < all.width; x += 4) { sky += lum(all.data, (y * all.width + x) * 4); skyN += 1 }
  sky /= Math.max(1, skyN)
  bLum.sort((a, b) => a - b)
  const p99 = bLum.length === 0 ? null : bLum[Math.floor(bLum.length * 0.99)]
  const mean = rLum.reduce((s, v) => s + v, 0) / Math.max(1, rLum.length)
  const std = Math.sqrt(rLum.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, rLum.length))
  console.log(`  walls: ${bLum.length} pixels, 99th percentile luminance ${p99?.toFixed(0)}; sky ${sky.toFixed(0)}`)
  console.log(`  roofs: ${rLum.length} pixels, luminance standard deviation ${std.toFixed(1)}`)
  if (bLum.length < 500) fail(`only ${bLum.length} wall pixels in view: nothing was looked at`)
  else if (p99 >= sky) fail(`the walls are brighter than the sky at 8 AM (${p99.toFixed(0)} against ${sky.toFixed(0)})`)
  if (rLum.length < 200) fail(`only ${rLum.length} roof pixels in view`)
  else if (std < ROOF_STD) fail(`the roofs are flat (standard deviation ${std.toFixed(1)}, at least ${ROOF_STD}): no photo on them`)
  await ctx.close()
} finally {
  await browser.close()
  watchdog.stop()
}
console.log(`\n=== 3D BUILDINGS PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
