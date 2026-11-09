/*
 * THE MENU, IN WEBKIT, AS A TAB AND STANDALONE (Batch H, Section 3).
 *
 * Usage:  node scripts/audit-menu.mjs [screenshot-dir]
 *
 * The Virginia Beach pier at 6:11 AM EST on 2 Nov, a drone in the kit, every
 * weather host answered by the gate's fixtures.
 *
 *   fits       390 x 844, nothing scrolled, nothing below or off the side
 *   cards      Today, Sky, Water, Drone (a drone is in the kit), each about
 *              88 px, a value and a line; rows Plan, Kit, Saved, Settings
 *   doors      Today opens the briefing; Sky opens the Sky card
 *   colour     never the hazard red
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('menu')
const watchdog = startWatchdog('menu', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'menu')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '06:00', endTime: '08:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'menu', name: 'Menu check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const browser = await webkit.launch()
try {
  for (const [label, insets, height] of [['browser', { top: 0, bottom: 0 }, 844], ['standalone', { top: 47, bottom: 34 }, 844], ['short tab', { top: 0, bottom: 0 }, 664]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height } })
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
    await wait(1500)
    await page.locator('button[aria-label="Menu"]').first().click()
    await wait(6000)
    const m = JSON.parse(await ev(`JSON.stringify((() => {
      const nav = document.querySelector('nav[aria-label="Stage"]')
      if (!nav) return { missing: true }
      const out = [...nav.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.bottom > innerHeight + 1 || b.right > innerWidth + 1 || b.left < -1) }).map((e) => (e.getAttribute('class') ?? e.tagName) + ' ' + Math.round(e.getBoundingClientRect().bottom)).slice(0, 4)
      const cards = [...nav.querySelectorAll('.mcard')].map((c) => ({ name: c.querySelector('.sidemenu__label')?.textContent, h: Math.round(c.getBoundingClientRect().height), value: c.querySelector('.mcard__value')?.textContent, bg: getComputedStyle(c).backgroundImage }))
      const rows = [...nav.querySelectorAll('.mrow')].map((r) => ({ name: r.querySelector('.sidemenu__label')?.textContent, value: r.querySelector('.mrow__value')?.textContent, h: Math.round(r.getBoundingClientRect().height) }))
      return { out, scrolls: nav.scrollHeight > nav.clientHeight + 1, cards, rows, where: document.querySelector('.menu__where')?.textContent }
    })())`))
    if (m.missing) {
      fail(`${label}: the menu opened no Stage nav`)
      await ctx.close()
      continue
    }
    looked += 1
    console.log(`  ${JSON.stringify({ where: m.where, cards: m.cards.map((c) => `${c.name} ${c.value} ${c.h}px`), rows: m.rows.map((r) => `${r.name}: ${r.value}`) })}`)
    if (m.scrolls) fail(`${label}: the menu scrolls`)
    for (const o of m.out) fail(`${label}: ${o} runs off the screen`)
    const names = m.cards.map((c) => c.name)
    if (JSON.stringify(names) !== JSON.stringify(['Today', 'Sky', 'Water', 'Drone'])) fail(`${label}: the cards are ${JSON.stringify(names)}`)
    for (const c of m.cards) {
      if (c.h < 76 || c.h > 112) fail(`${label}: the ${c.name} card is ${c.h} px, not about 88`)
      if (!c.value) fail(`${label}: the ${c.name} card has no value`)
      if (/255,\s*59,\s*48/.test(c.bg)) fail(`${label}: the ${c.name} card is the hazard red`)
    }
    if (JSON.stringify(m.rows.map((r) => r.name)) !== JSON.stringify(['Viewfinder', 'Plan', 'Kit', 'Saved', 'Settings'])) fail(`${label}: the rows are ${JSON.stringify(m.rows.map((r) => r.name))}`)
    for (const r of m.rows) if (r.h < 44) fail(`${label}: the ${r.name} row is ${r.h} px, under a 44 px target`)
    await page.screenshot({ path: join(OUT, `menu-${label}.png`) })

    await page.locator('.mcard--today').click()
    await wait(1500)
    if (!(await ev(`!!document.querySelector('.brief')`))) fail(`${label}: the Today card opened no briefing`)
    await ev(`document.querySelector('.brief__x')?.click()`)
    await wait(500)
    await page.locator('button[aria-label="Menu"]').first().click()
    await wait(800)
    await page.locator('.mcard--sky').click()
    await wait(1500)
    const tab = await ev(`[...document.querySelectorAll('[role="tab"][aria-selected="true"]')].map((t) => t.textContent.trim()).join(',')`)
    console.log(`  Sky card opened on: ${tab}`)
    if (!/sky color|fire|now/i.test(tab)) fail(`${label}: the Sky card opened no Sky tab (${JSON.stringify(tab)})`)
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== MENU AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== MENU PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
