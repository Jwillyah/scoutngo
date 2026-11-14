/*
 * THE MENU, IN WEBKIT, AS A TAB AND STANDALONE (Batch H, Section 3).
 *
 * Usage:  node scripts/audit-menu.mjs [screenshot-dir]
 *
 * The Virginia Beach pier at 6:11 AM EST on 2 Nov, a drone in the kit, every
 * weather host answered by the gate's fixtures.
 *
 *   fits       390 x 844, nothing scrolled, nothing below or off the side
 *   header     the spot once, then temperature · condition · wind (Batch
 *              Flow, Section 8; board D_Menu); a tap is the home
 *   cards      Weather, then the home's cards in its order, Sky always
 *              (nothing picked, a drone in the kit: Weather, Surf, Wind,
 *              Tide, Sky, Drone), each a value; rows Plan a shoot (only with
 *              Shoot picked), Calendar, Kit, Saved, Settings
 *   surf only  a fourth pass with Surf alone picked (the drone still in
 *              the kit): the home's three, Surf, Drone, Wind, after Weather
 *              and Sky, and no Plan a shoot
 *   doors      the header opens the home; Sky opens the Sky page
 *   colour     never the hazard red
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
  for (const [label, insets, height, picked] of [['browser', { top: 0, bottom: 0 }, 844, null], ['standalone', { top: 47, bottom: 34 }, 844, null], ['short tab', { top: 0, bottom: 0 }, 664, null], ['surf only', { top: 0, bottom: 0 }, 844, ['surf']]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height } })
    await ctx.addInitScript(([top, bottom, picked]) => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
        if (picked !== null) localStorage.setItem('scoutngo.activities.v1', JSON.stringify(picked))
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
      /* Batch LIVE, Section 4.1 (Menu A): each card's art, at most 60% opacity and never under the value. */
      const overlap = (a, b) => a !== null && b !== null && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const cards = [...nav.querySelectorAll('.mcard:not(.menu__spot)')].map((c) => {
        const art = c.querySelector('.mart')
        const v = c.querySelector('.mcard__value')
        const ar = art === null ? null : art.getBoundingClientRect()
        const vr = v === null ? null : v.getBoundingClientRect()
        /* The value's own text, not its box's full width. */
        const range = v === null ? null : document.createRange()
        if (range !== null && v !== null) range.selectNodeContents(v)
        const tr = range === null ? null : range.getBoundingClientRect()
        return { name: c.querySelector('.sidemenu__label')?.textContent, h: Math.round(c.getBoundingClientRect().height), value: v?.textContent, bg: getComputedStyle(c).backgroundImage, art: art !== null, artOpacity: art === null ? null : Number(getComputedStyle(art).opacity), artUnderValue: ar !== null && ar.height > 0 && overlap(ar, tr ?? vr) }
      })
      const rows = [...nav.querySelectorAll('.mrow')].map((r) => ({ name: r.querySelector('.sidemenu__label')?.textContent, value: r.querySelector('.mrow__value')?.textContent, h: Math.round(r.getBoundingClientRect().height) }))
      return { out, scrolls: nav.scrollHeight > nav.clientHeight + 1, cards, rows, where: document.querySelector('.menu__where')?.textContent, spot: document.querySelector('.menu__spot .menu__title')?.textContent ?? '', chip: nav.querySelector('.mcard__beach')?.textContent ?? null, text: nav.innerText }
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
    /* Batch Flow, Section 8: Weather, then the home's order (nothing picked, a drone in the kit: Surf, Wind, Tide, Sky, Moon, Drone; no Moon here); Sky always. */
    /* Surf picked, the Air 3S in the kit: the home shows Surf, Wind, Tide (a kit drone is not Drone picked: Batch QA, Section 0B), so the menu does, with Weather and Sky, and the Drone card last (drone tools on: the kit's drone). */
    const wantCards = picked === null ? ['Weather', 'Surf', 'Wind', 'Tide', 'Sky', 'Drone'] : ['Weather', 'Sky', 'Surf', 'Wind', 'Tide', 'Drone']
    if (JSON.stringify(names) !== JSON.stringify(wantCards)) fail(`${label}: the cards are ${JSON.stringify(names)}, not ${JSON.stringify(wantCards)}`)
    /* The header: the spot, then temperature · condition · wind. */
    console.log(`  header: ${JSON.stringify(m.spot)} / ${JSON.stringify(m.where)}`)
    if (!m.spot) fail(`${label}: the header has no spot`)
    /* Batch Polish, Section 4: the header is the spot; the weather is the Weather card's, not said twice. */
    if (m.where !== undefined && m.where !== null) fail(`${label}: the header repeats the weather (${JSON.stringify(m.where)})`)
    /* The spot once (9 Nov: "Virginia Beach" in the header and on the Water card's chip): the beach chip only when it is another place. */
    const spot = (m.spot ?? '').trim()
    if (m.chip !== null && spot !== '' && m.chip.trim() === spot) fail(`${label}: the Water card's chip repeats the spot (${JSON.stringify(m.chip)})`)
    const times = spot === '' ? 0 : m.text.split(spot).length - 1
    console.log(`  the spot ${JSON.stringify(spot)} said ${times} times; chip ${JSON.stringify(m.chip)}`)
    if (times > 1) fail(`${label}: the menu says ${JSON.stringify(spot)} ${times} times`)
    for (const c of m.cards) {
      if (c.h < 44) fail(`${label}: the ${c.name} card is ${c.h} px, under a 44 px target`)
      if (!c.value) fail(`${label}: the ${c.name} card has no value`)
      if (!c.art) fail(`${label}: the ${c.name} card has no art (Menu A)`)
      if (c.artOpacity !== null && c.artOpacity > 0.6) fail(`${label}: the ${c.name} card's art is at ${c.artOpacity} opacity, over 60%`)
      if (c.artUnderValue) fail(`${label}: the ${c.name} card's art is under its value`)
      if (/255,\s*59,\s*48/.test(c.bg)) fail(`${label}: the ${c.name} card is the hazard red`)
    }
    /* Batch TRUTH, Section 4: Cams moved here from the home's Next row. */
    const wantRows = picked === null ? ['Plan a shoot', 'Calendar', 'Cams', 'Kit', 'Saved', 'Settings'] : ['Calendar', 'Cams', 'Kit', 'Saved', 'Settings']
    if (JSON.stringify(m.rows.map((r) => r.name)) !== JSON.stringify(wantRows)) fail(`${label}: the rows are ${JSON.stringify(m.rows.map((r) => r.name))}`)
    for (const r of m.rows) if (r.h < 44) fail(`${label}: the ${r.name} row is ${r.h} px, under a 44 px target`)
    await page.screenshot({ path: join(OUT, `menu-${label}.png`) })

    await page.locator('.menu__spot').click()
    await wait(1500)
    if (!(await ev(`!!document.querySelector('.home')`))) fail(`${label}: the header opened no home`)
    /* Batch M: the home has no ×; its round Map button goes to the map. */
    await ev(`document.querySelector('.home .hbtn--round[aria-label="Open the map"]')?.click()`)
    await wait(500)
    await menuOn(page)
    await wait(800)
    await page.locator('.mcard--sky').click()
    await wait(1500)
    /* Batch Pages, Section 3: the Sky card opens the Sky page, as the home's Sky card does. */
    const sky = await ev(`document.querySelector('.spage .ppage__title')?.textContent ?? null`)
    console.log(`  Sky card opened: ${sky}`)
    if (sky !== 'Sky') fail(`${label}: the Sky card opened no Sky page (${JSON.stringify(sky)})`)
    /* Batch QA, Section 0: the Weather card opens the Weather page. */
    await ev(`document.querySelector('.spage .ppage__back')?.click()`)
    await wait(800)
    await menuOn(page)
    await wait(800)
    await page.locator('.mcard--weather').click()
    await wait(1500)
    const wx = await ev(`!!document.querySelector('.wpage')`)
    console.log(`  Weather card opened: ${wx ? 'the Weather page' : 'nothing'}`)
    if (!wx) fail(`${label}: the Weather card opened no Weather page`)
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
