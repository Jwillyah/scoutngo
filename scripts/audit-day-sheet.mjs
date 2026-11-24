/*
 * THE DAY SHEET, IN WEBKIT (Batch SIMPLE-3, Section 4; board
 * docs/mockups/simple3/Day_Sheet.png).
 *
 * Usage:  node scripts/audit-day-sheet.mjs [screenshot-dir]
 *
 * Sat 21 Nov 2026, 9:20 AM at Atlantic Park Surf (36.851, -75.980), the
 * clock held there. At 390 x 844, 390 x 664 (a Safari tab), 412 x 915 and
 * 390 x 844 standalone (the iPhone's insets, 47 px and 34 px):
 *   - ☰ › Plan a shoot reaches the Day sheet in ONE tap (and not the planner)
 *   - the strip is there with a now line and rise / noon / set labels
 *   - the hour rows run 6a to 5p in order, each with a sun height, a light
 *     word, and cloud, wind and rain either as numbers or as a dash
 *   - the current hour (9a) is the one highlighted
 *   - nothing overflows: no sideways scroll, no row wider than the card, no
 *     cell clipped; the header, the foot and the buttons are on top; in
 *     standalone nothing sits under the status bar or the home bar
 *   - Share as image is a target of 44 px or more and draws a picture (the
 *     share sheet is the phone's, so the fallback, the picture to long-press,
 *     is what WebKit here shows)
 *   - "Add positions ›" opens the planner, the existing one, on a tap
 *
 * AND IT CAN FAIL: it counts what it looked at and fails when it found no
 * sheet, no rows, or no strip (docs/failure-modes.md, B).
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, openMenu, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { OPEN_METEO, fakeAnswer } from './openMeteoFake.mjs'

guardAudit('day sheet')
const watchdog = startWatchdog('day sheet', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'day-sheet')
mkdirSync(OUT, { recursive: true })
await ensureApp()
const NOW = new Date('2026-11-21T14:20:00Z')
const venue = { ...CALIBRATION_VENUE, latitude: '36.851', longitude: '-75.980', date: '2026-11-21', startTime: '07:00', endTime: '08:00' }
const url = new URL(await shareLink(`${APP_ORIGIN}/`, { id: 'daysheet', name: 'Atlantic Park Surf', savedAt: '2026-11-20T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))

const TOP = 47
const BOTTOM = 34
const LOOKS = [
  { key: '390x844', w: 390, h: 844, top: 0, bottom: 0 },
  { key: '390x664', w: 390, h: 664, top: 0, bottom: 0 },
  { key: '412x915', w: 412, h: 915, top: 0, bottom: 0 },
  { key: 'standalone', w: 390, h: 844, top: TOP, bottom: BOTTOM },
]
const WANT_HOURS = ['6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p']

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const LOOK = `(() => {
  const root = document.querySelector('.dsheet')
  if (!root) return null
  const page = root.closest('.dpage')
  const onTop = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const t = document.elementFromPoint(x, y)
    return t !== null && (el.contains(t) || t.contains(el))
  }
  const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height) } : null }
  const body = page.querySelector('.ppage__body')
  const foot = page.querySelector('.dpage__foot')
  const rows = [...root.querySelectorAll('.dsheet__row[data-hour]')]
  const card = root.querySelector('.dsheet__table')
  const cardBox = card?.getBoundingClientRect()
  const clipped = []
  for (const el of root.querySelectorAll('.dsheet__row > *, .dsheet__light > span')) {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) clipped.push((el.textContent || '').trim().slice(0, 24))
  }
  const wide = rows.filter((r) => cardBox && r.getBoundingClientRect().right > cardBox.right + 1).length
  const share = root.querySelector('[data-share]')
  const add = root.querySelector('[data-add-positions]')
  return {
    title: page.querySelector('.ppage__title')?.textContent ?? null,
    sub: page.querySelector('.ppage__sub')?.textContent ?? null,
    hours: rows.map((r) => r.getAttribute('data-hour')),
    light: rows.map((r) => r.querySelector('[data-light]')?.textContent ?? ''),
    sunCells: rows.map((r) => r.querySelector('.dsheet__sun')?.textContent ?? ''),
    cells: rows.map((r) => [...r.children].slice(3).map((c) => (c.textContent || '').trim())),
    current: rows.filter((r) => r.getAttribute('aria-current') === 'time').map((r) => r.getAttribute('data-hour')),
    strip: !!root.querySelector('[data-strip] .dsheet__curve'),
    nowLine: !!root.querySelector('[data-strip] [data-now] line'),
    ticks: [...root.querySelectorAll('[data-strip] .dsheet__tick')].map((t) => t.textContent),
    age: root.querySelector('[data-age]')?.textContent ?? null,
    warnings: root.querySelector('[data-warnings]')?.textContent ?? null,
    shareBox: box(share),
    addBox: box(add),
    shareLabel: share?.textContent ?? null,
    addLabel: add?.textContent ?? null,
    top: { back: onTop(page.querySelector('.ppage__back')), title: onTop(page.querySelector('.ppage__title')), foot: onTop(foot?.querySelector('.dpage__link')), rows: onTop(rows[0]) },
    boxes: { back: box(page.querySelector('.ppage__back')), body: box(body), foot: box(foot) },
    clipped, wide,
    tableScrolls: card ? card.scrollWidth > card.clientWidth + 1 : null,
    vw: innerWidth, vh: innerHeight,
    docScrolls: document.documentElement.scrollWidth > innerWidth + 1,
    plannerOnScreen: !!document.querySelector('.mode-setup, .shell--setup'),
  }
})()`

const browser = await webkit.launch()
try {
  for (const look of LOOKS) {
    console.log(`### ${look.key}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: look.w, height: look.h }, serviceWorkers: 'block' })
    await ctx.route(/^https:\/\/api\.weather\.gov|\/api\/(buoy|metar)/, (r) => r.fulfill({ status: 503, body: 'not in this audit' }))
    await ctx.route(OPEN_METEO, (r) => r.fulfill({ json: fakeAnswer(r.request().url(), NOW) }))
    await ctx.addInitScript(
      ([top, bottom]) => {
        try {
          localStorage.setItem('scoutngo.landing.v1', 'true')
          localStorage.setItem('scoutngo.activities.v1', JSON.stringify(['surf', 'fish', 'shoot']))
        } catch {
          /* about:blank */
        }
        if (top > 0) {
          const add = () => {
            const s = document.createElement('style')
            s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
            document.head.appendChild(s)
          }
          if (document.head) add()
          else document.addEventListener('DOMContentLoaded', add)
        }
      },
      [look.top, look.bottom],
    )
    const page = await ctx.newPage()
    await page.clock.install({ time: NOW })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url.href)
    await wait(3000)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
    await page.getByText(/^(Open the map|Open ScoutNGo)$/).click({ timeout: 3000 }).catch(() => {})
    await goToStage(ev, wait, 'plan')
    await wait(1500)
    /* The menu, then ONE tap on Plan a shoot. */
    const opened = await openMenu(ev, wait)
    if (opened !== 'menu') {
      fail(`${look.key}: could not open the menu: ${opened}`)
      await ctx.close()
      continue
    }
    const row = page.locator('.mrow', { hasText: 'Plan a shoot' })
    if ((await row.count()) === 0) {
      fail(`${look.key}: no Plan a shoot row in the menu`)
      await ctx.close()
      continue
    }
    await row.first().tap()
    let l = null
    for (let i = 0; i < 40; i += 1) {
      await wait(400)
      l = await ev(LOOK)
      if (l !== null && l.hours.length > 0) break
    }
    if (l === null || l.hours.length === 0) {
      fail(`${look.key}: one tap on Menu › Plan a shoot did not show the Day sheet (.dsheet with hour rows)`)
      await page.screenshot({ path: join(OUT, `missing-${look.key}.png`) })
      await ctx.close()
      continue
    }
    looked += 1
    console.log(`  ${JSON.stringify({ title: l.title, sub: l.sub, hours: l.hours.join(' '), light: l.light, age: l.age, warnings: l.warnings, ticks: l.ticks })}`)
    await page.screenshot({ path: join(OUT, `day-${look.key}.png`) })
    if (l.title !== 'Day sheet') fail(`${look.key}: the title reads ${JSON.stringify(l.title)}`)
    if (!/^.+ · Sat, Nov 21$/.test(l.sub ?? '')) fail(`${look.key}: the line under the title reads ${JSON.stringify(l.sub)}, not "<spot> · Sat, Nov 21"`)
    if (l.plannerOnScreen) fail(`${look.key}: the planner opened instead of the Day sheet`)
    if (l.hours.join(' ') !== WANT_HOURS.join(' ')) fail(`${look.key}: rows ${l.hours.join(' ')}, wanted first light to last light ${WANT_HOURS.join(' ')}`)
    for (let i = 0; i < l.light.length; i += 1) {
      if (!/^(Blue|Color|Golden|Warm side|Side|Top|Flat)/.test(l.light[i])) fail(`${look.key}: the ${l.hours[i]} row's light word is ${JSON.stringify(l.light[i])}`)
      if (!/^[−]?\d+°$/.test(l.sunCells[i].trim())) fail(`${look.key}: the ${l.hours[i]} row's sun height is ${JSON.stringify(l.sunCells[i])}`)
      for (const c of l.cells[i]) if (!/^(—|\d+%|\d+( [NESW]{1,3})?)$/.test(c)) fail(`${look.key}: the ${l.hours[i]} row has a cell reading ${JSON.stringify(c)} (a number or a dash)`)
    }
    if (l.current.join() !== '9a') fail(`${look.key}: the highlighted hour is ${JSON.stringify(l.current)}, wanted 9a`)
    if (!l.strip) fail(`${look.key}: no sun strip`)
    if (!l.nowLine) fail(`${look.key}: the strip has no now line`)
    if (!l.ticks.some((t) => /^rise /.test(t)) || !l.ticks.some((t) => /^noon \d+°$/.test(t)) || !l.ticks.some((t) => /^set /.test(t))) fail(`${look.key}: strip labels ${JSON.stringify(l.ticks)}`)
    if (l.shareLabel !== 'Share as image') fail(`${look.key}: the share button reads ${JSON.stringify(l.shareLabel)}`)
    if (l.addLabel !== 'Add positions ›') fail(`${look.key}: the other button reads ${JSON.stringify(l.addLabel)}`)
    /* The buttons are at the end of the page: bring them on, then they must be on top and 44 px. */
    await ev(`document.querySelector('.dsheet [data-share]').scrollIntoView({ block: 'nearest' })`)
    await wait(200)
    l = await ev(LOOK)
    for (const [name, b] of [['Share as image', l.shareBox], ['Add positions', l.addBox]]) {
      if (b === null) fail(`${look.key}: no ${name} button`)
      else if (b.h < 44) fail(`${look.key}: ${name} is ${b.h} px tall, under 44`)
    }
    const onTopButtons = await ev(`(() => { const out = []; for (const sel of ['[data-share]', '[data-add-positions]']) { const e = document.querySelector('.dsheet ' + sel); const r = e.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); out.push(t !== null && e.contains(t)) } return out })()`)
    if (!onTopButtons.every(Boolean)) fail(`${look.key}: a button is covered: ${JSON.stringify(onTopButtons)}`)
    for (const [k, v] of Object.entries(l.top)) if (k !== 'rows' && !v) fail(`${look.key}: the ${k} is covered`)
    if (l.docScrolls) fail(`${look.key}: the page scrolls sideways`)
    if (l.tableScrolls) fail(`${look.key}: the table is wider than its card`)
    if (l.wide > 0) fail(`${look.key}: ${l.wide} rows run past the card`)
    if (l.clipped.length > 0) fail(`${look.key}: clipped text: ${JSON.stringify(l.clipped)}`)
    const b = l.boxes
    if (b.foot !== null && b.foot.bottom > l.vh - look.bottom + 1) fail(`${look.key}: the foot ends at ${b.foot.bottom}, under the home bar (${l.vh - look.bottom})`)
    if (b.back !== null && b.back.top < look.top) fail(`${look.key}: the back button starts at ${b.back.top}, under the status bar (${look.top})`)
    if (b.body !== null && b.foot !== null && b.body.bottom > b.foot.top + 1) fail(`${look.key}: the body (to ${b.body.bottom}) runs under the foot (from ${b.foot.top})`)
    await ev(`document.querySelector('.dsheet .ppage__body, .dpage .ppage__body')?.scrollTo(0, 0)`)

    if (look.key === '390x844') {
      /* Share as image, where the phone cannot share files: the picture to long-press. */
      await ev(`(() => { navigator.canShare = () => false })()`)
      await page.locator('.dsheet [data-share]').tap()
      let shown = false
      for (let i = 0; i < 20 && !shown; i += 1) {
        await wait(300)
        shown = await ev(`!!document.querySelector('[data-picture] img.dsheet__img') && document.querySelector('[data-picture] img').naturalWidth > 0`)
      }
      if (!shown) fail('Share as image drew no picture to show')
      else {
        await page.screenshot({ path: join(OUT, 'day-share.png') })
        await page.locator('[data-picture] button').tap()
        await wait(300)
      }
      /* And where it can: the picture goes to the share sheet as a PNG file, and nothing else is shown. */
      await ev(`(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async (d) => { window.__shared = { n: d.files?.length ?? 0, type: d.files?.[0]?.type ?? null, size: d.files?.[0]?.size ?? 0, name: d.files?.[0]?.name ?? null } } })()`)
      await page.locator('.dsheet [data-share]').tap()
      let sent = null
      for (let i = 0; i < 20 && sent === null; i += 1) {
        await wait(300)
        sent = await ev('window.__shared')
      }
      if (sent === null) fail('Share as image did not hand a file to the share sheet')
      else if (sent.n !== 1 || sent.type !== 'image/png' || sent.size < 5000 || !/^day-sheet-2026-11-21\.png$/.test(sent.name ?? '')) fail(`the shared file is ${JSON.stringify(sent)}`)
      if (await ev(`!!document.querySelector('[data-picture]')`)) fail('the picture was shown as well as shared')
      /* Add positions ›: the existing planner, on this tap. */
      await ev(`document.querySelector('.dsheet [data-add-positions]').scrollIntoView({ block: 'nearest' })`)
      await page.locator('.dsheet [data-add-positions]').tap()
      let planner = false
      for (let i = 0; i < 25 && !planner; i += 1) {
        await wait(300)
        planner = await ev(`!!document.querySelector('.mode-setup, .shell--setup') && !document.querySelector('.dsheet')`)
      }
      if (!planner) fail('"Add positions ›" did not open the planner (and close the Day sheet)')
      else await page.screenshot({ path: join(OUT, 'day-planner.png') })
    }
    await ctx.close()
    watchdog.note(look.key)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== DAY SHEET AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  looked at ${looked} sheets in ${LOOKS.length} sizes; screenshots: ${OUT}`)
console.log(`\n=== DAY SHEET PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
