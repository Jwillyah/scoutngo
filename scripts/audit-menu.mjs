/*
 * THE ☰ MENU, IN WEBKIT, AS A TAB AND STANDALONE (Batch SIMPLE-2, Section 3;
 * board Home_Menu).
 *
 * Usage:  node scripts/audit-menu.mjs [screenshot-dir]
 *
 * The Virginia Beach pier at 6:11 AM EST on 2 Nov, a drone in the kit, every
 * weather host answered by the gate's fixtures.
 *
 *   fits     390 x 844 tab and home screen, 390 x 664: nothing scrolled,
 *            nothing below or off the side
 *   rows     "Menu", then exactly Plan a shoot · Best sky near me ·
 *            Viewfinder · Calendar · Saved spots · Field report · Settings ·
 *            About, each 44 px or more with its line; the foot line; no
 *            card (each page the home's tiles open has one way in), and the
 *            same eight whatever is picked (a Surf persona too)
 *   doors    every row opens its place: Plan a shoot the planner, Best sky
 *            its page, the Viewfinder, the Calendar, Saved spots the Saved
 *            drawer, Field report its page, Settings, About
 *   colour   never the hazard red
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN, openMenu } from './preflight.mjs'

/* Batch Polish, Section 2: the menu is the home's (and setup's and field's); on the map its Back goes home first (scripts/preflight.mjs openMenu). */
const menuOn = (pg) => openMenu((x) => pg.evaluate(x), (ms) => pg.waitForTimeout(ms))
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
  for (const [label, insets, height, picked] of [['browser', { top: 0, bottom: 0 }, 844, null], ['standalone', { top: 47, bottom: 34 }, 844, null], ['short tab', { top: 0, bottom: 0 }, 664, null], ['surf only', { top: 0, bottom: 0 }, 844, 'surf']]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height } })
    await ctx.addInitScript(([top, bottom, picked]) => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
        if (picked !== null) localStorage.setItem('scoutngo.persona.v1', picked)
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
    }, [insets.top, insets.bottom, picked])
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
    await menuOn(page)
    await wait(6000)
    const m = JSON.parse(await ev(`JSON.stringify((() => {
      const nav = document.querySelector('nav[aria-label="Stage"]')
      if (!nav) return { missing: true }
      const out = [...nav.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (b.bottom > innerHeight + 1 || b.right > innerWidth + 1 || b.left < -1) }).map((e) => (e.getAttribute('class') ?? e.tagName) + ' ' + Math.round(e.getBoundingClientRect().bottom)).slice(0, 4)
      const rows = [...nav.querySelectorAll('.mrow')].map((r) => ({ name: r.querySelector('.sidemenu__label')?.textContent, sub: r.querySelector('.mlist__sub')?.textContent ?? '', h: Math.round(r.getBoundingClientRect().height), bg: getComputedStyle(r).backgroundColor }))
      return { out, scrolls: nav.scrollHeight > nav.clientHeight + 1, title: nav.querySelector('.mlist__title')?.textContent ?? null, foot: nav.querySelector('.mlist__foot')?.textContent ?? null, cards: nav.querySelectorAll('.mcard').length, rows, text: nav.innerText }
    })())`))
    if (m.missing) {
      fail(`${label}: the menu opened no Stage nav`)
      await ctx.close()
      continue
    }
    looked += 1
    console.log(`  ${JSON.stringify({ title: m.title, rows: m.rows.map((r) => `${r.name} (${r.h}px): ${r.sub}`), foot: m.foot })}`)
    if (m.scrolls) fail(`${label}: the menu scrolls`)
    for (const o of m.out) fail(`${label}: ${o} runs off the screen`)
    if (m.title !== 'Menu') fail(`${label}: the menu's title is ${JSON.stringify(m.title)}`)
    const want = ['Plan a shoot', 'Best sky near me', 'Viewfinder', 'Calendar', 'Saved spots', 'Field report', 'Settings', 'About']
    if (JSON.stringify(m.rows.map((r) => r.name)) !== JSON.stringify(want)) fail(`${label}: the rows are ${JSON.stringify(m.rows.map((r) => r.name))}, not ${JSON.stringify(want)}`)
    for (const r of m.rows) {
      if (r.h < 44) fail(`${label}: the ${r.name} row is ${r.h} px, under a 44 px target`)
      if (r.sub.trim() === '') fail(`${label}: the ${r.name} row has no line under it`)
      if (/255,\s*59,\s*48/.test(r.bg)) fail(`${label}: the ${r.name} row is the hazard red`)
    }
    if (m.cards !== 0) fail(`${label}: ${m.cards} cards in the menu; the home's tiles are the one way to their pages`)
    if (!/Home answers/.test(m.foot ?? '')) fail(`${label}: no foot line`)
    await page.screenshot({ path: join(OUT, `menu-${label}.png`) })

    /* Every door, in the tab look: open the menu from the home, tap the row, see its place. */
    if (label === 'browser') {
      const DOORS = [
        ['Best sky near me', `!!document.querySelector('.bsky__dots, [class*="bsky"]')`],
        ['Viewfinder', `!!document.querySelector('.vf[aria-label="Viewfinder"]')`],
        ['Calendar', `!!document.querySelector('.cal2[aria-label="Calendar"]')`],
        ['Saved spots', `[...document.querySelectorAll('.drawer__title')].some((e) => e.textContent === 'Saved')`],
        ['Field report', `!!document.querySelector('.reportpage')`],
        ['Settings', `!!document.querySelector('.set2')`],
        ['About', `!!document.querySelector('.astory')`],
        ['Plan a shoot', `document.querySelector('.shell')?.className.includes('shell--setup') ?? false`],
      ]
      for (const [row, opened] of DOORS) {
        await page.goto('about:blank')
        await page.goto(url)
        await wait(3000)
        await goToStage(ev, wait, 'plan')
        await wait(800)
        await menuOn(page)
        await wait(600)
        const tapped = await ev(`(() => { const r = [...document.querySelectorAll('nav[aria-label="Stage"] .mrow')].find((b) => b.querySelector('.sidemenu__label')?.textContent === ${JSON.stringify(row)}); if (!r) return false; r.click(); return true })()`)
        let ok = false
        for (let i = 0; tapped && i < 20 && !ok; i += 1) {
          await wait(250)
          ok = await ev(opened)
        }
        console.log(`  ${row}: ${tapped ? (ok ? 'opened' : 'OPENED NOTHING') : 'NO ROW'}`)
        if (!tapped) fail(`${label}: no ${row} row to tap`)
        else if (!ok) fail(`${label}: ${row} opened nothing`)
        if (ok) await page.screenshot({ path: join(OUT, `menu-door-${row.replace(/\s+/g, '-').toLowerCase()}.png`) })
      }
    }
    await ctx.close()
    watchdog.note(label)
  }
  /*
   * Batch 3D, Section 0 (Jwilly's iPhone, 17 Nov): 3D and Fly behind Settings ›
   * Labs; Batch SIMPLE-1, Section 4 (18 Nov): on by default on an iPhone too,
   * while they are tested; Debug a plain row under About, Last
   * errors a row that opens it, the version's long press Debug and not About;
   * Last errors opening to the stack, and Copy all.
   */
  {
    const label = 'labs and debug'
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
        /* The default, not the gate's switch (scripts/gate/playwright.mjs): nothing chosen on this phone. */
        localStorage.removeItem('scoutngo.labs3d.v1')
        if (localStorage.getItem('scoutngo.errors.v1') === null) localStorage.setItem('scoutngo.errors.v1', JSON.stringify([{ at: '2026-11-17T17:27:00Z', where: '3D', message: 'Error: seeded for the audit', build: 'audit', stack: 'Error: seeded for the audit\n    at seededFrame (audit.js:1:1)' }]))
      } catch {
        /* about:blank */
      }
    })
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
    looked += 1
    if (!(await ev(`!!document.querySelector('button[aria-label="Open the 3D clay model"]')`))) fail(`${label}: no 3D button on an iPhone with Labs left alone (on by default, Batch SIMPLE-1, Section 4)`)
    await menuOn(page)
    await wait(800)
    await page.locator('.mrow', { hasText: 'Settings' }).first().click()
    await wait(1200)
    const s = JSON.parse(await ev(`JSON.stringify((() => {
      const rows = [...document.querySelectorAll('.set2 .set2__row')].map((r) => r.querySelector('.set2__label')?.textContent ?? '')
      const sw = document.querySelector('[role="switch"][aria-label="3D and Fly (testing)"]')
      const debug = [...document.querySelectorAll('.set2 button.set2__row')].find((b) => b.querySelector('.set2__label')?.textContent === 'Debug')
      return { rows, labs: sw === null ? null : sw.getAttribute('aria-checked'), debugH: debug === undefined ? 0 : Math.round(debug.getBoundingClientRect().height) }
    })())`))
    console.log(`  settings rows: ${JSON.stringify(s.rows.slice(-6))}; labs ${s.labs}; Debug row ${s.debugH}px`)
    if (s.labs !== 'true') fail(`${label}: Labs › 3D and Fly is ${s.labs}, not on by default on an iPhone`)
    const at = s.rows.indexOf('About')
    if (at < 0 || s.rows[at + 1] !== 'Debug') fail(`${label}: no plain Debug row right under About (${JSON.stringify(s.rows.slice(at, at + 3))})`)
    if (s.debugH < 44) fail(`${label}: the Debug row is ${s.debugH}px, under a 44 px target`)
    const onDebug = () => ev(`document.querySelector('.page[aria-label="Debug"]') !== null && !!document.querySelector('.set2__errors')`)
    const back = async () => {
      await ev(`document.querySelector('.page[aria-label="Debug"] .page__back')?.click()`)
      await wait(600)
    }
    await page.locator('button.set2__row', { hasText: 'Debug' }).first().tap()
    await wait(800)
    if (!(await onDebug())) fail(`${label}: tapping Debug opened no Debug page`)
    await back()
    await page.locator('button.set2__row', { hasText: 'Last errors' }).first().tap()
    await wait(800)
    if (!(await onDebug())) fail(`${label}: tapping Last errors opened no Debug page`)
    else {
      await page.locator('.set2__err summary').first().tap()
      await wait(400)
      const stack = await ev(`document.querySelector('.set2__err[open] .set2__errstack')?.textContent ?? ''`)
      if (!stack.includes('seededFrame')) fail(`${label}: an opened error row shows no stack`)
      await page.getByRole('button', { name: 'Copy all' }).tap()
      await wait(800)
      const said = await ev(`document.querySelector('.set2__errors [role="status"]')?.textContent ?? ''`)
      console.log(`  Copy all said: ${JSON.stringify(said)}`)
      if (said === '') fail(`${label}: Copy all said nothing`)
      await page.screenshot({ path: join(OUT, 'menu-debug.png') })
    }
    await back()
    /* The long press: a finger held 900 ms on the version line, then lifted. */
    await page.locator('.set2__version').scrollIntoViewIfNeeded()
    await wait(300)
    const v = await page.locator('.set2__version').boundingBox()
    if (v === null) fail(`${label}: no version line`)
    else {
      await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2)
      await page.mouse.down()
      await wait(900)
      await page.mouse.up()
      await wait(800)
      const about = await ev(`!!document.querySelector('.astory')`)
      if (!(await onDebug())) fail(`${label}: a long press on the version opened no Debug page`)
      if (about) fail(`${label}: a long press on the version opened About too`)
    }
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
