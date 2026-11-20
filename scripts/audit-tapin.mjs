/*
 * THE TAP-IN PAGE SKELETON, ON THE TIDE PAGE (Batch SIMPLE-2, Section 1;
 * board docs/mockups/simple2/Page_Tide.png), IN WEBKIT.
 *
 * Usage:  node scripts/audit-tapin.mjs [screenshot-dir]
 *
 * At 390 x 844, 390 x 664 (a Safari tab), 412 x 915 and 390 x 844 standalone
 * (the iPhone's insets, 47 px and 34 px, set where the app reads them):
 *   - the page is there, with its eyebrow (Rising / Falling / Turning), a
 *     next-turn value ("Low 5:48p"), a line under it, the tide curve with a
 *     now line, and rows ending in "More details"
 *   - nothing is covered: the header, the first row and the foot are each
 *     on top at their own centre; the foot is inside the window; in
 *     standalone nothing sits under the status bar or the home bar
 *   - every button on it is at least 44 px
 *   - the foot is "How we got this ›" left and the safety line right
 *   - "More details ›" opens the existing detail page, and Back returns
 *
 * AND IT CAN FAIL: it counts what it looked at, and fails when it found no
 * page, no curve, or no rows (docs/failure-modes.md, B).
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN, setSheet } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { OPEN_METEO, fakeAnswer } from './openMeteoFake.mjs'

guardAudit('tap in')
const watchdog = startWatchdog('tap in', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'tapin')
mkdirSync(OUT, { recursive: true })
await ensureApp()
const NOW = new Date('2026-10-30T11:30:00Z')
const venue = { ...CALIBRATION_VENUE, latitude: '36.8435575', longitude: '-75.9713104', date: '2026-10-30', startTime: '07:00', endTime: '08:00' }
const url = new URL(await shareLink(`${APP_ORIGIN}/`, { id: 'tapin', name: 'Tap in check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))

const TOP = 47
const BOTTOM = 34
const LOOKS = [
  { key: '390x844', w: 390, h: 844, top: 0, bottom: 0 },
  { key: '390x664', w: 390, h: 664, top: 0, bottom: 0 },
  { key: '412x915', w: 412, h: 915, top: 0, bottom: 0 },
  { key: 'standalone', w: 390, h: 844, top: TOP, bottom: BOTTOM },
]

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/* In the page: what the Tide page shows, and whether each part is on top at its own centre. */
const LOOK = `(() => {
  const root = document.querySelector('.tipage--tide')
  if (!root) return null
  const onTop = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return false
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
    const y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
    const t = document.elementFromPoint(x, y)
    return t !== null && (el.contains(t) || t.contains(el))
  }
  const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } : null }
  const body = root.querySelector('.ppage__body')
  const foot = root.querySelector('.dpage__foot')
  const small = [...root.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); return r.height > 0 && r.height < 43.5 }).map((b) => (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30) + ' ' + Math.round(b.getBoundingClientRect().height))
  const rows = [...root.querySelectorAll('.tipage__row')]
  return {
    title: root.querySelector('.ppage__title')?.textContent ?? null,
    sub: root.querySelector('.ppage__sub')?.textContent ?? null,
    eyebrow: root.querySelector('.tipage__eyebrow')?.textContent ?? null,
    value: root.querySelector('.tipage__value')?.textContent ?? null,
    line: root.querySelector('.tipage__sub')?.textContent ?? null,
    curve: !!root.querySelector('.tcurve--page .tcurve__line'),
    nowLine: !!root.querySelector('.tcurve--page [data-now] line'),
    rows: rows.length,
    labels: rows.map((r) => r.querySelector('.tipage__label')?.textContent ?? r.querySelector('.tipage__morelabel')?.textContent),
    more: !!root.querySelector('.tipage__more'),
    how: foot?.querySelector('.dpage__link')?.textContent ?? null,
    safety: foot?.querySelector('.dpage__safety')?.textContent ?? null,
    top: { back: onTop(root.querySelector('.ppage__back')), title: onTop(root.querySelector('.ppage__title')), foot: onTop(foot?.querySelector('.dpage__link')) },
    boxes: { back: box(root.querySelector('.ppage__back')), title: box(root.querySelector('.ppage__title')), body: box(body), foot: box(foot), how: box(foot?.querySelector('.dpage__link')) },
    scrolls: body ? body.scrollHeight > body.clientHeight + 1 : null,
    small,
    vw: innerWidth,
    vh: innerHeight,
    docScrolls: document.documentElement.scrollWidth > innerWidth + 1,
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
    await wait(2000)
    await setSheet(ev, wait, 'peek')
    await page.locator('.chip2[data-chip="tide"]').first().tap()
    let l = null
    for (let i = 0; i < 40; i += 1) {
      await wait(500)
      l = await ev(LOOK)
      if (l !== null && l.value !== null && l.value !== '—' && l.curve) break
    }
    if (l === null) {
      fail(`${look.key}: the Tide page (.tipage--tide) is not on screen, so nothing was looked at`)
      await ctx.close()
      continue
    }
    looked += 1
    console.log(`  ${JSON.stringify({ title: l.title, sub: l.sub, eyebrow: l.eyebrow, value: l.value, line: l.line, rows: l.labels })}`)
    await page.screenshot({ path: join(OUT, `tide-${look.key}.png`) })
    if (l.title !== 'Tide') fail(`${look.key}: the title reads ${JSON.stringify(l.title)}`)
    if (!/ · now$/.test(l.sub ?? '')) fail(`${look.key}: the line under the title reads ${JSON.stringify(l.sub)}, not "<spot> · now"`)
    if (!/^(Rising|Falling|Turning)$/.test(l.eyebrow ?? '')) fail(`${look.key}: the eyebrow reads ${JSON.stringify(l.eyebrow)}`)
    if (!/^(High|Low) \d{1,2}:\d{2}[ap]$/.test(l.value ?? '')) fail(`${look.key}: the big value reads ${JSON.stringify(l.value)}, not "Low 5:48p"`)
    if (!l.curve) fail(`${look.key}: no tide curve`)
    if (!l.nowLine) fail(`${look.key}: the curve has no now line`)
    if (l.rows < 2 || l.rows > 6) fail(`${look.key}: ${l.rows} rows (at most five and More details)`)
    if (!l.more || l.labels[l.labels.length - 1] !== 'More details') fail(`${look.key}: "More details" is not the last row: ${JSON.stringify(l.labels)}`)
    if (l.how !== 'How we got this ›') fail(`${look.key}: the foot's left reads ${JSON.stringify(l.how)}`)
    if (l.safety !== 'Forecasts can be wrong · look first') fail(`${look.key}: the foot's right reads ${JSON.stringify(l.safety)}`)
    for (const [k, v] of Object.entries(l.top)) if (!v) fail(`${look.key}: the ${k} is covered`)
    for (const s of l.small) fail(`${look.key}: a button under 44 px: ${s}`)
    if (l.docScrolls) fail(`${look.key}: the page scrolls sideways`)
    const b = l.boxes
    if (b.foot !== null && b.foot.bottom > l.vh - look.bottom + 1) fail(`${look.key}: the foot ends at ${b.foot.bottom}, under the home bar (${l.vh - look.bottom})`)
    if (b.back !== null && b.back.top < look.top) fail(`${look.key}: the back button starts at ${b.back.top}, under the status bar (${look.top})`)
    if (b.body !== null && b.foot !== null && b.body.bottom > b.foot.top + 1) fail(`${look.key}: the body (to ${b.body.bottom}) runs under the foot (from ${b.foot.top})`)
    /* The last row of a page that scrolls is reachable: bring it up and it must be on top. */
    const more = await ev(`(() => { const m = document.querySelector('.tipage--tide .tipage__more'); if (!m) return null; m.scrollIntoView({ block: 'nearest' }); const r = m.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { on: t !== null && m.contains(t), bottom: Math.round(r.bottom), foot: Math.round(document.querySelector('.tipage--tide .dpage__foot').getBoundingClientRect().top) } })()`)
    if (more === null || !more.on) fail(`${look.key}: "More details" cannot be brought onto the glass`)
    else if (more.bottom > more.foot + 1) fail(`${look.key}: "More details" ends at ${more.bottom}, under the foot (${more.foot})`)
    if (look.key === '390x844') {
      /* More details: the existing detail page, unchanged; Back: the skeleton again. */
      await page.locator('.tipage--tide .tipage__more').tap()
      await wait(1200)
      const old = await ev(`({ detail: !!document.querySelector('.dpage--tide .dtide__curvecard'), tipage: !!document.querySelector('.tipage--tide') })`)
      if (!old.detail || old.tipage) fail(`More details did not open the existing Tide page: ${JSON.stringify(old)}`)
      await page.screenshot({ path: join(OUT, 'tide-more.png') })
      await page.locator('.dpage--tide .dpage__back').first().tap()
      await wait(800)
      if (!(await ev(`!!document.querySelector('.tipage--tide')`))) fail('Back from the detail page did not return to the Tide page')
      /* A sideways drag along the curve is the time, not a page change, and the page stays. */
      const box = await page.locator('.tipage--tide .tcurve--page').boundingBox()
      if (box === null) fail('no curve to drag along')
      else {
        const y = box.y + box.height / 2
        await page.mouse.move(box.x + box.width * 0.3, y)
        await page.mouse.down()
        for (let i = 1; i <= 8; i += 1) await page.mouse.move(box.x + box.width * (0.3 + i * 0.05), y)
        const during = await ev(`({ line: document.querySelector('.tipage--tide [data-scrub]')?.getAttribute('x1') ?? null, head: document.querySelector('.tipage--tide .tipage__sub')?.textContent ?? null })`)
        await page.mouse.up()
        if (during.line === null) fail('a drag along the curve drew no line where the finger is')
        if (!/ at \d{1,2}:\d{2} [AP]M$/.test(during.head ?? '')) fail(`the line under the value did not follow the finger: ${JSON.stringify(during.head)}`)
      }
    }
    await ctx.close()
    watchdog.note(look.key)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== TAP IN AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  looked at ${looked} of ${LOOKS.length} screens; screenshots: ${OUT}`)
console.log(`\n=== TAP IN PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
