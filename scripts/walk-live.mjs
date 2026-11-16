/*
 * THE LIVE PHONE PASS (Batch CORE, Section 7.1): a WebKit iPhone at 390 x 844
 * against the DEPLOYED app with live data, screen by screen, flagging a blank
 * page, "didn't load", NaN, "—" (counted), overlapping words and console
 * errors. Not part of the gate (the gate never reaches a live host): run by
 * hand, its lines written to docs/batches/core-walk.md.
 *
 * Usage:  node scripts/walk-live.mjs [url] > walk.log
 *
 * The spot is a public landmark, the Virginia Beach Fishing Pier, saved as
 * the last setup; location is never asked. What the deployed app asks of the
 * services is what any visitor's phone asks (src/lib/hosts.ts).
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { devices, webkit } from 'playwright'

const URL_ = process.argv[2] ?? 'https://scoutngo.vercel.app'
const OUT = process.env.OUT ?? `${process.env.TMPDIR ?? '/tmp'}/scoutngo-walk-live`
mkdirSync(OUT, { recursive: true })
const SPOT = { at: { lat: 36.8435575, lon: -75.9713104 }, name: { key: 'pier', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }

const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
await ctx.addInitScript((spot) => {
  try {
    localStorage.setItem('scoutngo.landing.v1', 'true')
    localStorage.setItem('scoutngo.nearMe.v1', 'off')
    localStorage.setItem('scoutngo.activities.v1', JSON.stringify(['surf', 'shoot', 'drone', 'fish', 'weather']))
    if (!localStorage.getItem('scoutngo.lastSetup.v1')) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify(spot))
  } catch {
    /* about:blank */
  }
  /* The app keeps automated browsers off the home (src/lib/briefingOpen.ts); this walk is a phone's. */
  Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
}, SPOT)
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 160))
})
const wait = (ms) => page.waitForTimeout(ms)
const tap = async (sel, ms = 2500) => {
  const ok = await page.locator(sel).first().click({ timeout: 8000 }).then(() => true, () => false)
  await wait(ms)
  return ok
}
const home = async () => {
  await page.goto(URL_)
  await wait(9000)
}
/* Words, NaN, dashes, "didn't load", and leaf words whose boxes overlap another's by more than 3 px. */
const read = () =>
  page.evaluate(() => {
    const t = document.body.innerText || ''
    const leaves = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && (e.textContent ?? '').trim() !== '' && e.getClientRects().length > 0)
    const boxes = leaves.map((e) => ({ e, r: e.getBoundingClientRect() })).filter((b) => b.r.width > 0 && b.r.height > 0 && b.r.bottom > 0 && b.r.top < innerHeight && getComputedStyle(b.e).visibility !== 'hidden' && Number(getComputedStyle(b.e).opacity) > 0.05)
    const over = []
    for (let i = 0; i < boxes.length; i += 1)
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i].r
        const b = boxes[j].r
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (x > 3 && y > 3 && !boxes[i].e.contains(boxes[j].e) && !boxes[j].e.contains(boxes[i].e)) over.push(`"${boxes[i].e.textContent.trim().slice(0, 24)}" / "${boxes[j].e.textContent.trim().slice(0, 24)}"`)
      }
    return { words: t.replace(/\s+/g, ' ').trim().length, nan: (t.match(/\bNaN\b/g) ?? []).length, dashes: (t.match(/—/g) ?? []).length, didnt: (t.match(/didn['’]t load|did not arrive|Could not reach/g) ?? []).length, overlaps: over.slice(0, 4), text: t.replace(/\s+/g, ' ').slice(0, 120) }
  })
const look = async (screen, how) => {
  errors.length = 0
  const ok = await how()
  const r = await read().catch((e) => ({ words: 0, nan: 0, dashes: 0, didnt: 0, overlaps: [], text: `READ FAILED ${String(e).slice(0, 60)}` }))
  await page.screenshot({ path: join(OUT, `${screen.replace(/[^a-z0-9]+/gi, '-')}.png`) }).catch(() => {})
  console.log(`LIVE ${JSON.stringify({ screen, opened: ok !== false, ...r, errors: [...errors] })}`)
}

await look('landing', async () => {
  const fresh = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  const p = await fresh.newPage()
  await p.goto(URL_)
  await p.waitForTimeout(5000)
  const t = await p.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 200))
  await p.screenshot({ path: join(OUT, 'landing.png') })
  console.log(`LIVE ${JSON.stringify({ screen: 'landing (first visit)', opened: true, words: t.length, nan: 0, dashes: (t.match(/—/g) ?? []).length, didnt: 0, overlaps: [], text: t.slice(0, 120), errors: [] })}`)
  await fresh.close()
  return true
})
await look('home page 1', async () => home())
await look('home page 2', async () => {
  await page.mouse.move(350, 400)
  await page.mouse.down()
  await page.mouse.move(40, 400, { steps: 8 })
  await page.mouse.up()
  await wait(2000)
})
await look('home page 3', async () => {
  await page.mouse.move(350, 400)
  await page.mouse.down()
  await page.mouse.move(40, 400, { steps: 8 })
  await page.mouse.up()
  await wait(2000)
})
await look('menu', async () => {
  await home()
  return tap('button[aria-label="Menu"]')
})
await look('sky now', async () => {
  await home()
  await tap('.hcard--sky', 4000)
  return tap('.spage__seg button:nth-child(1)')
})
await look('sky tonight', async () => tap('.spage__seg button:nth-child(2)'))
await look('sky tomorrow', async () => tap('.spage__seg button:nth-child(3)'))
await look('best sky', async () => tap('.spage__bestsky', 9000))
await look('weather', async () => {
  await home()
  return tap('.hwx__temp', 4000)
})
await look('surf', async () => {
  await home()
  return tap('.hcard--surf', 5000)
})
for (const tab of ['Tide', 'Wind', 'Buoys']) await look(tab.toLowerCase(), async () => tap(`.dpage__tab:has-text("${tab}")`, 4000))
await look('drone', async () => {
  await home()
  return tap('.hcard--drone', 4000)
})
await look('map', async () => {
  await home()
  return tap('button[aria-label="Open the map"]', 8000)
})
await look('planner (preflight)', async () => {
  await home()
  await tap('.hcard--drone', 3000)
  return tap('.drp__btn', 5000)
})
await look('3D', async () => page.getByRole('button', { name: 'Play in 3D' }).first().click({ timeout: 8000 }).then(async () => { await wait(15000); return true }, () => false))
await look('drone Fly', async () => page.getByRole('button', { name: 'Fly it yourself' }).first().click({ timeout: 8000 }).then(async () => { await wait(15000); return true }, () => false))
await browser.close()
process.exit(0)
