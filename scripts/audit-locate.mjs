/*
 * "USE MY LOCATION", IN WEBKIT: refused, it says why with Retry; allowed, the
 * map goes there.
 *
 * Usage:  node scripts/audit-locate.mjs [screenshot-dir]
 *
 * From the field test of 30 Oct: the button did nothing. In Plan the
 * failure was dropped (src/components/PlanMode.tsx sent the top bar a null
 * note and returned). Here, with location not allowed for the page, the
 * arrow in Plan's top bar and Setup's "Use my location" must each put a
 * reason on screen in words, with Retry, and Retry must ask again. With it
 * allowed (Wrightsville Beach, 34.21, -77.80), the map must centre there.
 * Both as a Safari tab with its toolbars (390 x 664) and as the home-screen
 * app (390 x 844, insets 47/34).
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'

guardAudit('locate')
const watchdog = startWatchdog('locate', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'locate')
mkdirSync(OUT, { recursive: true })
await ensureApp()
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'loc', name: 'Locate check', savedAt: '2026-10-29T00:00:00Z', venue: { ...CALIBRATION_VENUE }, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
/* ?probe=1 puts the map on window.__probe, to read where it went. */
url.searchParams.set('probe', '1')
const HERE = { latitude: 34.2104, longitude: -77.7964 }

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

const browser = await webkit.launch()
try {
  for (const [label, viewport, insets] of [['tab', { width: 390, height: 664 }, { top: 0, bottom: 0 }], ['standalone', { width: 390, height: 844 }, { top: 47, bottom: 34 }]]) {
    for (const allowed of [false, true]) {
      console.log(`\n### ${label}, location ${allowed ? 'allowed' : 'not allowed'}`)
      const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport, serviceWorkers: 'block', ...(allowed ? { geolocation: HERE, permissions: ['geolocation'] } : {}) })
      await ctx.route(/^https:\/\/[^/]*(open-meteo|weather\.gov|tidesandcurrents)/, (r) => r.fulfill({ status: 503, body: 'not in this audit' }))
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
      const wait = (ms) => page.waitForTimeout(ms)
      const ev = (x) => page.evaluate(x)
      await page.goto(url.href)
      await wait(3000)
      await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
      await page.getByText('Open the map', { exact: true }).click({ timeout: 3000 }).catch(() => {})
      await goToStage(ev, wait, 'plan')
      await wait(2000)
      const arrow = page.getByRole('button', { name: 'Go to where I am' })
      if ((await arrow.count()) === 0) {
        fail(`${label}: no locate arrow in Plan's top bar`)
        await ctx.close()
        continue
      }
      await arrow.first().tap()
      await wait(2500)
      const plan = await ev(`(() => {
        const line = document.querySelector('.offline-line')
        const btn = line?.querySelector('button')
        const r = line?.getBoundingClientRect()
        const c = window.__probe?.map?.getCenter?.()
        return { line: line?.textContent ?? null, retry: btn?.textContent ?? null, inView: r ? r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth + 1 : null, cut: line ? line.scrollWidth > line.clientWidth + 1 : null, centre: c ? [c.lat, c.lng] : null }
      })()`)
      looked += 1
      console.log(`  plan: ${JSON.stringify(plan)}`)
      if (allowed) {
        if (plan.centre === null) fail(`${label}: no map centre to read`)
        else if (Math.abs(plan.centre[0] - HERE.latitude) > 0.01 || Math.abs(plan.centre[1] - HERE.longitude) > 0.01) fail(`${label}: allowed, the map did not go to the position (${plan.centre})`)
        if (plan.retry !== null) fail(`${label}: allowed, a Retry is still on screen`)
      } else {
        if (plan.line === null || !/Settings ›|Retry|search/.test(plan.line)) fail(`${label}: refused, Plan says nothing about why (${JSON.stringify(plan.line)})`)
        if (plan.retry !== 'Retry') fail(`${label}: refused, no Retry beside the reason`)
        if (plan.inView === false || plan.cut === true) fail(`${label}: the reason is off screen or cut off`)
        await page.screenshot({ path: join(OUT, `locate-plan-${label}.png`) })
        /* Retry asks again: the debug log has a second "locate: asked". */
        await page.locator('.offline-line button').first().tap()
        await wait(1500)
        const asked = await ev(`(async () => { const m = await import('/src/lib/touchDebug.ts'); return m.touchLogLines().filter((l) => /locate: asked/.test(l)).length })()`)
        console.log(`  asked ${asked} times after Retry`)
        if (asked < 2) fail(`${label}: Retry did not ask again (${asked} asks in the log)`)
      }
      /* Setup: step 1's "Use my location". */
      await goToStage(ev, wait, 'setup')
      await wait(1200)
      const use = page.getByRole('button', { name: 'Use my location' })
      if ((await use.count()) === 0) fail(`${label}: no "Use my location" in Setup`)
      else {
        await use.first().tap()
        await wait(2500)
        const setup = await ev(`(() => {
          const note = document.querySelector('.wiz .wiz__small')
          const btn = [...document.querySelectorAll('.wiz button')].find((b) => /Retry|Use my location|Finding/.test(b.textContent))
          return { note: note?.textContent ?? null, button: btn?.textContent ?? null, twice: document.querySelector('.topbar__note') !== null && note !== null }
        })()`)
        console.log(`  setup: ${JSON.stringify(setup)}`)
        if (!allowed) {
          if (setup.note === null || !/Settings ›|search/.test(setup.note)) fail(`${label}: refused, Setup says nothing about why (${JSON.stringify(setup.note)})`)
          if (setup.button !== 'Retry') fail(`${label}: refused, Setup's button does not offer Retry ("${setup.button}")`)
          if (setup.twice) fail(`${label}: Setup says why twice, in the top bar and under the button (ux-rules 2)`)
          await page.screenshot({ path: join(OUT, `locate-setup-${label}.png`) })
        }
      }
      await ctx.close()
      watchdog.note(`${label} ${allowed}`)
    }
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== LOCATE AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== LOCATE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
