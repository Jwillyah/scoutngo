/*
 * THE MAP BANNER NEVER COVERS A CONTROL (Batch SIMPLE-3, Section 6.2).
 *
 * Usage:  node scripts/audit-near-banner.mjs [screenshot-dir]
 *
 * 21 Nov, 5:08 PM: "God rays likely 7:00-9:00 AM · Sandbridge" sat over the
 * map and covered the layers button. The words, the 12-hour reach and the
 * day label are unit-tested (tests/nearMe.test.ts); this is the picture: the
 * card's own markup and class, up over the plain map (it is fixed, so where
 * it sits does not depend on what is under it), at 390 x 844, 390 x 664,
 * 412 x 915 and standalone (insets 47 / 34, as audit-standalone.mjs), with a
 * long line and a short one. Every visible control on the map, the card's own
 * two buttons apart, must be clear of it.
 *
 * AND IT CAN FAIL: the card is put back at the old place (top: safe-top + 150px,
 * full width) and the controls it covers must be reported, or the audit looked
 * at nothing.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'

guardAudit('near banner')
const watchdog = startWatchdog('near banner', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'near-banner')
mkdirSync(OUT, { recursive: true })
await ensureApp()

let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const SIZES = [
  { label: '390x844', w: 390, h: 844, top: 0, bottom: 0 },
  { label: '390x664', w: 390, h: 664, top: 0, bottom: 0 },
  { label: '412x915', w: 412, h: 915, top: 0, bottom: 0 },
  { label: 'standalone-390x844', w: 390, h: 844, top: 47, bottom: 34 },
]
const LINES = ['God rays likely tomorrow 7:00 AM–9:00 AM · Sandbridge', 'Fog possible 6:00 AM–8:00 AM · Atlantic Park Surf']

const INJECT = `(line) => {
  document.querySelector('.nearyou')?.remove()
  const s = document.createElement('section')
  s.className = 'nearyou'
  s.setAttribute('aria-label', 'Near you in the next 12 hours')
  s.innerHTML = '<p class="nearyou__line"></p><button type="button" class="nearyou__go">Show me</button><button type="button" class="nearyou__not">Not now</button>'
  s.querySelector('p').textContent = line
  document.body.appendChild(s)
}`

/* What the card sits over: every visible control outside it, with its box. */
const MEASURE = `(() => {
  const card = document.querySelector('.nearyou')
  const c = card.getBoundingClientRect()
  const sees = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' && r.bottom > 0 && r.top < innerHeight }
  const name = (el) => (el.getAttribute('aria-label') || el.textContent || el.className || el.tagName).toString().trim().slice(0, 40)
  const els = [...document.querySelectorAll('button, a[href], [role="button"], input, select, [role="tab"]')].filter((el) => !card.contains(el) && sees(el))
  const hit = (el) => { const r = el.getBoundingClientRect(); return !(r.right <= c.left || r.left >= c.right || r.bottom <= c.top || r.top >= c.bottom) }
  return JSON.stringify({ card: { l: c.left, t: c.top, r: c.right, b: c.bottom }, controls: els.length, covered: els.filter(hit).map(name), buttons: [...card.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height } }), overflowX: document.documentElement.scrollWidth > innerWidth })
})()`

const browser = await webkit.launch()
try {
  for (const sz of SIZES) {
    console.log(`\n### ${sz.label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: sz.w, height: sz.h } })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
        localStorage.setItem('scoutngo.nearMe.v1', 'off')
        localStorage.setItem('scoutngo.activities.v1', JSON.stringify(['shoot', 'drone', 'surf']))
        if (localStorage.getItem('scoutngo.lastSetup.v1') === null) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify({ at: { lat: 36.8435575, lon: -75.9713104 }, name: { key: 'x', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }))
      } catch {
        /* about:blank */
      }
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    })
    const page = await ctx.newPage()
    await page.clock.install({ time: new Date('2026-11-21T22:08:00Z') })
    await page.clock.resume()
    await page.goto(`${APP_ORIGIN}/`)
    for (let i = 0; i < 20 && !(await page.evaluate(`!!document.querySelector('.home')`)); i += 1) await page.waitForTimeout(500)
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: /^open the map$/i }).first().click({ timeout: 5000 }).catch(() => fail(`${sz.label}: could not tap the Map button`))
    for (let i = 0; i < 30 && !(await page.evaluate(`!!document.querySelector('.shell--plan')`)); i += 1) await page.waitForTimeout(500)
    await page.waitForTimeout(1500)
    if (sz.top > 0) await page.addStyleTag({ content: `:root{--safe-top:${sz.top}px!important;--safe-bottom:${sz.bottom}px!important}` })
    if (!(await page.evaluate(`!!document.querySelector('.shell--plan')`))) fail(`${sz.label}: the map did not open`)
    for (const line of LINES) {
      await page.evaluate(`(${INJECT})(${JSON.stringify(line)})`)
      await page.waitForTimeout(300)
      const m = JSON.parse(await page.evaluate(MEASURE))
      console.log(`  ${line.slice(0, 30)}…: card ${JSON.stringify(m.card)}, ${m.controls} controls looked at, covered: ${JSON.stringify(m.covered)}`)
      await page.screenshot({ path: join(OUT, `${sz.label}-${line.startsWith('God') ? 'long' : 'short'}.png`) })
      if (m.controls < 3) fail(`${sz.label}: only ${m.controls} controls found on the map, so nothing was checked`)
      if (m.covered.length > 0) fail(`${sz.label}: the banner covers ${m.covered.join(', ')}`)
      if (m.card.l < 0 || m.card.r > sz.w) fail(`${sz.label}: the banner runs off the screen`)
      if (m.card.t < sz.top) fail(`${sz.label}: the banner is under the status bar`)
      if (m.card.b > sz.h - sz.bottom) fail(`${sz.label}: the banner is under the home bar`)
      for (const b of m.buttons) if (b.h < 44 || b.w < 44) fail(`${sz.label}: a banner button is ${Math.round(b.w)} x ${Math.round(b.h)}, under 44`)
      if (m.overflowX) fail(`${sz.label}: the page scrolls sideways`)
    }
    if (sz.label === '390x844') {
      /* Can it fail: the old place, full width at safe-top + 150 px. */
      await page.addStyleTag({ content: `.nearyou{top:calc(var(--safe-top) + 150px)!important;left:8px!important;right:8px!important;bottom:auto!important}` })
      await page.evaluate(`(${INJECT})(${JSON.stringify(LINES[0])})`)
      await page.addStyleTag({ content: `.nearyou{top:calc(var(--safe-top) + 150px)!important;left:8px!important;right:8px!important;bottom:auto!important;width:auto!important;max-width:none!important}` })
      const old = JSON.parse(await page.evaluate(MEASURE))
      console.log(`  (the old place: covers ${JSON.stringify(old.covered)})`)
      if (old.covered.length === 0) fail('the old place covered nothing, so this audit could not have seen the 21 Nov bug')
    }
    await ctx.close()
  }
} finally {
  await browser.close()
  watchdog.stop()
}
console.log(`\nNEAR BANNER PROBLEMS: ${problems}`)
process.exit(problems === 0 ? 0 : 1)
