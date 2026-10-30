/*
 * LINE IT UP, IN WEBKIT, AS A TAB AND STANDALONE.
 *
 * Usage:  node scripts/audit-lineup.mjs [screenshot-dir]
 *
 * At the Virginia Beach pier, Sky › Sun: "Pick it on the map", a tap on the
 * pier's end, its name typed. The card must give the end's bearing from the
 * spot, list sun and moon rises and sets within half a degree of it in
 * words ("Full moon rises over the pier end · Tue, Sep 14 6:34 PM · 99% lit"),
 * and a tap on a row must move the app's time to it. The list is checked
 * against src/core/lineup.ts run here on the same inputs, so what is drawn is
 * the arithmetic, not a stale or a different list.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { findLineups } from '../src/core/lineup.ts'

guardAudit('line up')
const watchdog = startWatchdog('line up', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'lineup')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const END = { lat: 36.8432, lon: -75.9676 }
const NOW = new Date('2026-10-30T14:00:00Z')
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-30', startTime: '09:00', endTime: '11:00' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'lineup', name: 'Line up check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
url.search = '?probe=1'

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const browser = await webkit.launch()
try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    /* Nothing outside: the finder is arithmetic, and the map's buildings are not needed for a pier. */
    await ctx.route((u) => !u.href.startsWith('http://127.0.0.1:5173'), (r) => r.abort())
    await ctx.addInitScript(([top, bottom]) => {
      /* Past the cover: this is about the Sky card, and the cover over it took the taps on a cold dev server. */
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
      const add = () => {
        const s = document.createElement('style')
        s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    }, [insets.top, insets.bottom])
    const page = await ctx.newPage()
    await page.clock.setFixedTime(NOW)
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url.href)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await goToStage(ev, wait, 'plan')
    await wait(3000)

    await page.locator('button[aria-label="Menu"]').first().tap()
    await wait(700)
    await page.getByText('Sky', { exact: true }).first().tap()
    await wait(1200)
    await page.getByRole('tab', { name: 'Now' }).tap()
    await wait(800)
    const pick = page.getByRole('button', { name: /Pick it on the map/ })
    if ((await pick.count()) === 0) {
      fail(`${label}: no "Pick it on the map" on Sky › Sun`)
      await page.screenshot({ path: join(OUT, `lineup-missing-${label}.png`) })
      await ctx.close()
      continue
    }
    await pick.first().tap()
    await wait(800)
    /* The pier's end, through the map's own click handler. */
    await ev(`(() => {
      const m = window.__probe.map
      const p = m.project([${END.lon}, ${END.lat}])
      m.fire('click', { lngLat: { lng: ${END.lon}, lat: ${END.lat} }, point: p, originalEvent: { target: m.getCanvas() } })
    })()`)
    await wait(1500)
    /* Back to the card if the pick closed it. */
    if ((await page.locator('.lineup').count()) === 0) {
      await page.locator('button[aria-label="Menu"]').first().tap()
      await wait(700)
      await page.getByText('Sky', { exact: true }).first().tap()
      await wait(1200)
      await page.getByRole('tab', { name: 'Now' }).tap()
      await wait(800)
    }
    await page.locator('.lineup input').first().fill('the pier end')
    await page.locator('.lineup input').nth(1).fill('4')
    let card = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      card = await ev(`(() => {
        const c = document.querySelector('.lineup')
        if (!c) return null
        return {
          sight: c.querySelector('.lineup__sight')?.textContent ?? null,
          rows: [...c.querySelectorAll('.lineup__row')].map((r) => r.firstElementChild?.textContent ?? ''),
          offs: [...c.querySelectorAll('.lineup__row .skyc__why')].map((r) => r.textContent),
          wide: [...c.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > innerWidth + 1),
        }
      })()`)
      if ((card?.rows.length ?? 0) > 0) break
    }
    looked += 1
    console.log(`  sight: ${card?.sight}`)
    console.log(`  rows: ${JSON.stringify(card?.rows.slice(0, 4))}`)
    if (card === null || card.sight === null) fail(`${label}: no bearing and height for the picked thing`)
    else if (!/^9[5-9]° E · 3\d\d m · 4 m tall/.test(card.sight)) fail(`${label}: the pier end reads "${card.sight}"`)
    const want = findLineups({ observer: PIER, target: END, targetHeightM: 4, horizonDeg: 0, from: NOW })
    if (card !== null) {
      if (card.rows.length !== want.length) fail(`${label}: ${card.rows.length} rows on screen, ${want.length} from src/core/lineup.ts on the same inputs`)
      if (!card.rows.every((r) => /^(Sun|Moon|Full moon) (rises|sets) (off|over|behind) the pier end · \w{3}, \w{3} \d{1,2} \d{1,2}:\d{2} [AP]M( · \d{1,3}% lit)?$/.test(r))) fail(`${label}: a row is not in words: ${JSON.stringify(card.rows.find((r) => !/^(Sun|Moon|Full moon)/.test(r)))}`)
      if (!card.offs.every((o) => Math.abs(parseFloat(o)) <= 0.5)) fail(`${label}: a row is more than half a degree off: ${JSON.stringify(card.offs)}`)
      if (!card.rows.some((r) => /^Full moon rises over the pier end · Tue, Sep 14 /.test(r))) fail(`${label}: the full moon of 14 Sep 2027 off the pier end is not listed`)
      if (card.wide) fail(`${label}: something in the card runs past 390 px`)
    }
    await ev(`document.querySelector('.lineup')?.scrollIntoView({ block: 'start' })`)
    await wait(300)
    await page.screenshot({ path: join(OUT, `lineup-${label}.png`) })

    /* A tap on the first row jumps the app there. */
    const before = await ev(`document.querySelector('.tbar__when')?.textContent ?? null`)
    await page.locator('.lineup__row').first().tap().catch(() => {})
    await wait(1500)
    const after = await ev(`document.querySelector('.tbar__when')?.textContent ?? null`)
    console.log(`  time bar: ${before} → ${after}`)
    if (after === null || after === before) fail(`${label}: tapping a row did not move the app's time (${before} → ${after})`)
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== LINE UP AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== LINE UP PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
