/*
 * THE TODAY BRIEFING, IN WEBKIT, AS A TAB AND STANDALONE (Batch H, Section 2).
 *
 * Usage:  node scripts/audit-briefing.mjs [screenshot-dir]
 *
 * The Virginia Beach pier at 6:11 AM EST on 2 Nov, a drone in the kit, every
 * weather host answered by the gate's fixtures. Opened from the menu's Today card.
 *
 *   each page  Today, Tomorrow, This week: fits 390 x 844 with nothing
 *              scrolled, nothing below the screen, nothing off its side
 *   Today      a call word (Go, Maybe, Skip, or a dash), the six steps of
 *              the light, Surf, Wind and Tide on one axis, the drone line
 *              (a drone is in the kit), a Now line
 *   This week  seven days, the dashed line before the third
 *   words      never "safe", never "clear to", never a red ground
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('briefing')
const watchdog = startWatchdog('briefing', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'briefing')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '06:00', endTime: '08:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'brief', name: 'Briefing check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const FIT = (i) => `JSON.stringify((() => {
  const pg = document.querySelectorAll('.brief__page')[${i}]
  if (!pg) return { missing: true }
  const r = pg.getBoundingClientRect()
  const out = [...pg.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.bottom > innerHeight + 1 || b.right > r.right + 1 || b.left < r.left - 1) }).map((e) => (e.getAttribute('class') ?? e.tagName) + ' ' + Math.round(e.getBoundingClientRect().bottom)).slice(0, 4)
  const scrolls = pg.scrollHeight > pg.clientHeight + 1
  return { out, scrolls, text: pg.innerText }
})())`

const browser = await webkit.launch()
try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(([top, bottom]) => {
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
    await page.clock.install({ time: new Date('2026-11-02T11:11:00Z') })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await goToStage(ev, wait, 'plan')
    await wait(2500)
    const auto = await ev(`!!document.querySelector('.brief')`)
    if (auto) fail(`${label}: the briefing opened by itself on a shared plan's link`)
    await page.locator('button[aria-label="Menu"]').first().click()
    await wait(700)
    await page.locator('.mcard--today').first().click()
    await wait(6000)
    if (!(await ev(`!!document.querySelector('.brief')`))) {
      fail(`${label}: Menu › Today opened no briefing`)
      await ctx.close()
      continue
    }
    looked += 1
    for (const [i, name] of ['Today', 'Tomorrow', 'This week'].entries()) {
      await page.getByRole('tab', { name }).click()
      await wait(1200)
      const t = JSON.parse(await ev(FIT(i)))
      if (t.missing) {
        fail(`${label}: no ${name} page`)
        continue
      }
      console.log(`  ${name}: ${t.out.length === 0 && !t.scrolls ? 'fits' : `DOES NOT FIT ${JSON.stringify(t.out)}`}`)
      if (t.scrolls) fail(`${label}, ${name}: the page scrolls`)
      for (const o of t.out) fail(`${label}, ${name}: ${o} runs off the screen`)
      if (/\bsafe\b|clear to fly|all clear/i.test(t.text)) fail(`${label}, ${name}: says safe or clear: ${JSON.stringify(t.text.slice(0, 120))}`)
      await page.screenshot({ path: join(OUT, `briefing-${name.replace(/\s/g, '-').toLowerCase()}-${label}.png`) })
      if (i === 0) {
        const today = await ev(`JSON.stringify({ word: document.querySelector('.bcall__word')?.textContent, steps: document.querySelectorAll('.brief__page .bstep').length, rows: [...document.querySelectorAll('.brief__page')[0].querySelectorAll('.brow__name')].map((e) => e.textContent), now: !!document.querySelectorAll('.brief__page')[0].querySelector('.bnow') })`)
        console.log(`  today: ${today}`)
        const d = JSON.parse(today)
        if (!/^(Go|Maybe|Skip|—)$/.test(d.word ?? '')) fail(`${label}: the call reads ${JSON.stringify(d.word)}`)
        if (d.steps < 6) fail(`${label}: ${d.steps} steps of the light, not 6`)
        for (const row of ['Surf', 'Wind', 'Tide', 'Drone']) if (!d.rows.includes(row)) fail(`${label}: no ${row} row`)
        if (!d.now) fail(`${label}: no Now line on Today`)
      }
      if (i === 2) {
        const wk = await ev(`JSON.stringify({ days: document.querySelectorAll('.bwk__day').length, cut: document.querySelectorAll('.bwk__day--cut').length })`)
        console.log(`  week: ${wk}`)
        const w = JSON.parse(wk)
        if (w.days !== 7) fail(`${label}: ${w.days} days in the week`)
        if (w.cut !== 1) fail(`${label}: no dashed line before the third day`)
      }
    }
    const ground = await ev(`getComputedStyle(document.querySelector('.brief')).backgroundImage`)
    if (/255,\s*59,\s*48|#ff3b30/i.test(ground)) fail(`${label}: the ground is the hazard red`)
    await page.locator('.brief__x').click()
    await wait(500)
    if (await ev(`!!document.querySelector('.brief')`)) fail(`${label}: × did not close the briefing`)
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== BRIEFING AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== BRIEFING PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
