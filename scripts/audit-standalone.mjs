/*
 * THE HOME-SCREEN APP, IN WEBKIT: Layers at every detent.
 *
 * Usage:  node scripts/audit-standalone.mjs [screenshot-dir]
 *
 * WHY THIS EXISTS. Launched from the home-screen icon (standalone, 29 Oct),
 * Layers dragged to half had its grid cut off by a solid band over the home
 * indicator, and dragged to the bottom showed a grab handle over empty black:
 * the header was below the visible part and the peek had nothing in it. In a
 * browser tab both insets are zero, so every other audit, Chromium and a 0 px
 * inset, saw a sheet that was fine.
 *
 * STANDALONE, EMULATED. Playwright's WebKit has no home-screen mode and no
 * env(safe-area-inset-*), so the two insets of an iPhone 13 in standalone are
 * set where the app reads them, --safe-top and --safe-bottom in
 * src/styles/tokens.css: 47 px and 34 px. What it cannot emulate is said in
 * the report: iOS's own compositing, and the status bar itself.
 *
 * AT EACH DETENT (full, half, peek, reached by dragging the grab handle):
 *   - the header, or at peek the one-line summary, is inside the visible part
 *     of the sheet and on top at its own centre
 *   - nothing over the sheet: along the bottom 34 px, what is on top is the sheet
 *   - the body runs to the screen's edge (the band was the sheet's own padding)
 *   - the header sits right under the grab handle
 * And: no map label above the status bar's foot, with the pin panned to the top.
 *
 * AND IT CAN FAIL: the old rule, padding-bottom on .sheet, is put back and
 * the band must be reported.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('standalone')
const watchdog = startWatchdog('standalone', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'standalone')
mkdirSync(OUT, { recursive: true })

const TOP = 47
const BOTTOM = 34
const PIER = { lat: 36.8435575, lon: -75.9713104 }

await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-29', startTime: '07:00', endTime: '08:30' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'vb', name: 'Standalone check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
url.searchParams.set('probe', '1')

let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(([top, bottom]) => {
    const add = () => {
      const s = document.createElement('style')
      s.id = 'standalone-insets'
      s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
      document.head.appendChild(s)
    }
    if (document.head) add()
    else document.addEventListener('DOMContentLoaded', add)
  }, [TOP, BOTTOM])
  const page = await ctx.newPage()
  const ev = (x) => page.evaluate(x)
  const wait = (ms) => page.waitForTimeout(ms)

  await page.goto(url.href)
  await wait(4000)
  await page.getByRole('button', { name: /^open$/i }).click({ timeout: 5000 }).catch(() => {})
  await wait(2000)
  await page.getByText('Open the map', { exact: true }).click({ timeout: 5000 }).catch(() => {})
  await wait(2000)
  await goToStage(ev, wait, 'plan')
  await wait(4000)
  watchdog.note('in Plan')
  const insets = await ev(`(() => { const p = document.createElement('div'); p.style.cssText = 'position:fixed;top:0;height:var(--safe-top);'; document.body.appendChild(p); const h = p.getBoundingClientRect().height; p.remove(); return h })()`)
  if (insets !== TOP) throw new Error(`the emulated status bar is ${insets} px, not ${TOP}: the insets did not apply`)

  await page.locator('button[aria-label="Map and layers"]').tap()
  await wait(1500)

  const LOOK = `(() => {
    const vh = innerHeight, s = document.querySelector('.sheet')
    if (!s) return { error: 'no sheet' }
    const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return r.height > 0 ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null }
    const sheet = rect(s), grab = rect(s.querySelector('.sheet__grab')), body = rect(s.querySelector('.sheet__body'))
    const headEl = s.querySelector('.card2__head'), summaryEl = s.querySelector('.peek__line--layers')
    const shown = (el) => {
      const r = rect(el)
      if (!r) return false
      const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2
      const top = document.elementFromPoint(x, y)
      return r.top >= sheet.top && r.bottom <= vh - ${BOTTOM} && !!top && el.contains(top)
    }
    const covers = []
    for (let x = 10; x < innerWidth; x += 40) for (const y of [vh - 2, vh - ${BOTTOM / 2}, vh - ${BOTTOM - 2}]) {
      const top = document.elementFromPoint(x, y)
      if (!top || !s.contains(top)) covers.push((top ? top.tagName.toLowerCase() + '.' + String(top.className).split(' ')[0] : 'nothing') + ' at ' + x + ',' + Math.round(y))
    }
    return { detent: s.dataset.detent, vh, sheet, grab, body, head: rect(headEl), headShown: shown(headEl), summary: summaryEl ? summaryEl.textContent.trim() : null, summaryShown: shown(summaryEl), covers }
  })()`

  const check = async (name, want) => {
    const l = await ev(LOOK)
    if (l.error) return fail(`${name}: ${l.error}`)
    console.log(`  ${name.padEnd(5)} sheet ${Math.round(l.sheet.top)}-${Math.round(l.sheet.bottom)}, body to ${l.body ? Math.round(l.body.bottom) : 'hidden'}, header ${l.head ? Math.round(l.head.top - l.grab.bottom) + ' px under the grab' : 'none'}${l.summary ? `, summary "${l.summary}"` : ''}`)
    if (l.detent !== want) fail(`${name}: dragged to ${want}, the sheet is at ${l.detent}`)
    if (l.sheet.bottom < l.vh - 1) fail(`${name}: the sheet ends at ${l.sheet.bottom}, above the screen's foot (${l.vh})`)
    for (const c of l.covers.slice(0, 3)) fail(`${name}: over the sheet in the home-indicator band: ${c}`)
    if (want === 'peek') {
      if (!l.summaryShown) fail(`peek: no one-line summary in the visible sheet (got ${JSON.stringify(l.summary)})`)
    } else {
      if (!l.headShown) fail(`${name}: the "Map & layers" header is not in the visible part of the sheet`)
      if (l.head && l.head.top - l.grab.bottom > 8) fail(`${name}: the header is ${Math.round(l.head.top - l.grab.bottom)} px under the grab handle, not right under it`)
      if (l.body && l.body.bottom < l.vh - 1) fail(`${name}: the body stops at ${Math.round(l.body.bottom)}, a ${Math.round(l.vh - l.body.bottom)} px band of sheet below it`)
    }
    await page.screenshot({ path: join(OUT, `layers-${want}.png`) })
  }

  const drag = async (dy) => {
    const g = await page.locator('.sheet__grab').boundingBox()
    const x = g.x + g.width / 2
    const y = g.y + g.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i += 1) {
      await page.mouse.move(x, y + (dy * i) / 10)
      await wait(30)
    }
    await page.mouse.up()
    await wait(1200)
  }

  console.log(`\n### Layers at every detent, standalone insets ${TOP} top / ${BOTTOM} bottom`)
  await check('full', 'full')
  await drag(250)
  await check('half', 'half')
  watchdog.note('half')

  /* THE PROOF IT CAN FAIL: the old rule back, and the band must be seen. */
  console.log('\n### and the band check is proven to fail')
  await ev(`(() => { const s = document.createElement('style'); s.id = 'old-rule'; s.textContent = '.sheet{padding-bottom:${BOTTOM}px!important}.sheet__content{padding-bottom:0!important}'; document.head.appendChild(s); return 1 })()`)
  await wait(500)
  const old = await ev(LOOK)
  const band = old.body ? Math.round(old.vh - old.body.bottom) : 0
  if (band >= BOTTOM - 1) console.log(`  with padding-bottom on .sheet: a ${band} px band, caught`)
  else fail(`the old rule went back and no band was seen (${band} px): the check cannot fail`)
  await ev(`document.getElementById('old-rule')?.remove()`)
  await wait(500)

  await drag(250)
  await check('peek', 'peek')
  watchdog.note('peek')

  /*
   * NO LABEL UNDER THE STATUS BAR. The top bar spans the width just below
   * the status bar, so the only way a label lands in the band is along a ray
   * that runs flat inside it. So the map is turned until the sun ray is level
   * on screen and panned until it starts in the band, left of centre: the
   * stretch a label slides along is then the status bar itself. Every label
   * placed must start below the status bar's foot. (Without the clamp in
   * src/lib/safeArea.ts this setup puts SUN in the band; see the commit.)
   */
  console.log('\n### map labels stay below the status bar')
  for (let i = 0; i < 3; i += 1) {
    await ev(`(() => {
      const map = window.__probe.map
      const ray = map.getSource('sun-rays')?.serialize?.().data?.features?.find((f) => f.properties?.kind === 'sun' && f.geometry?.type === 'LineString')
      if (!ray) return 0
      const c = ray.geometry.coordinates, a = map.project(c[0]), b = map.project(c[c.length - 1])
      map.setBearing(map.getBearing() + Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI, { duration: 0 })
      const pin = map.project([${PIER.lon}, ${PIER.lat}])
      map.panBy([pin.x - map.getCanvas().clientWidth * 0.2, pin.y - ${TOP} / 2], { duration: 0 })
      return 1
    })()`)
    await wait(600)
  }
  const flat = await ev(`(() => {
    const map = window.__probe.map
    const ray = map.getSource('sun-rays')?.serialize?.().data?.features?.find((f) => f.properties?.kind === 'sun' && f.geometry?.type === 'LineString')
    if (!ray) return null
    const c = ray.geometry.coordinates, a = map.project(c[0]), b = map.project(c[c.length - 1]), pin = map.project([${PIER.lon}, ${PIER.lat}])
    return { y: Math.round(pin.y), turn: Math.round(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) }
  })()`)
  console.log(`  the pin is at y ${flat?.y}, the sun ray runs at ${flat?.turn} deg to the screen's horizontal`)
  if (flat === null || flat.y >= TOP || Math.abs(flat.turn) > 2) fail(`could not lay the sun ray along the status bar (${JSON.stringify(flat)}): the label check would see nothing`)
  await wait(1500)
  const labels = await ev(`[...document.querySelectorAll('.ray-label')].map((e) => { const r = e.getBoundingClientRect(); return { text: e.textContent.trim(), top: Math.round(r.top) } })`)
  await page.screenshot({ path: join(OUT, 'labels.png') })
  console.log(`  labels placed: ${labels.map((l) => `${l.text} at ${l.top}`).join(', ') || 'none'}`)
  for (const l of labels) if (l.top < TOP) fail(`the "${l.text}" label starts at ${l.top} px, under the ${TOP} px status bar`)
} finally {
  await browser.close()
}

console.log(`\n  screenshots: ${OUT}`)
watchdog.stop()
console.log(`\n=== STANDALONE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
