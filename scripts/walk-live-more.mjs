/*
 * THE LIVE PHONE PASS, THE REST (Batch DRONE, Section 6.3): the screens
 * scripts/walk-live.mjs did not reach on 16 Nov (Calendar, Sun · Moon ·
 * Night, the map's layers and zooms, the field report), read the same way.
 * Its lines go to docs/batches/core-walk.md.
 *
 * Usage:  node scripts/walk-live-more.mjs [url] > walk.log
 *
 * From the first pass (Batch CORE, Section 7.1): a WebKit iPhone at 390 x 844
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


const openMap = async () => {
  await home()
  return tap('button[aria-label="Open the map"]', 8000)
}
/* A layer from the bar's chip when one is on, else from Features (Batch DRONE, Section 3). */
const layer = async (id) => {
  if (await page.locator('[data-layer-chip]').count()) {
    await tap('[data-layer-chip]', 800)
    return tap(`[data-layer-pick="${id}"]`, 6000)
  }
  await tap('.rail2__btn[aria-label="Features"]', 900)
  const ok = await tap(`[data-weather="${id}"]`, 1000)
  await page.locator('.card2[aria-label="Map"] .card2__x').first().click({ timeout: 2000 }).catch(() => {})
  await wait(6000)
  return ok
}
/* Zoom out with the map's keyboard "-" (MapLibre: one zoom level a press; mobile WebKit takes no wheel). The page does not expose the map's zoom, so z7, z4 and z2 are counted in presses from where the map opened, not read back. */
const zoomOut = async (levels) => {
  await page.locator('.maplibregl-canvas').first().focus().catch(() => {})
  for (let i = 0; i < levels; i += 1) {
    await page.keyboard.press('Minus')
    await wait(700)
  }
  await wait(3000)
}

await look('calendar', async () => {
  await home()
  await tap('.hcard--sky', 4000)
  return tap('.spage__btn:has-text("Calendar")', 5000)
})
for (const [i, tab] of ['sun', 'moon', 'night'].entries())
  await look(`sun moon night: ${tab}`, async () => {
    if (i === 0) {
      await home()
      await tap('.hcard--sky', 4000)
      await tap('text=Sun, moon, night ›', 4000)
    }
    return page.locator('.smn__seg .ui-seg__opt').nth(i).click({ timeout: 6000 }).then(async () => { await wait(2500); return true }, () => false)
  })
await look('map: radar', async () => {
  await openMap()
  return layer('radar')
})
await look('map: wind', async () => layer('wind'))
await look('map: clouds', async () => layer('clouds'))
await look('map: tide', async () => layer('tide'))
await look('map: playback', async () => {
  await layer('wind')
  const ok = await tap('[data-layer-timeline] button[aria-label*="lay" i]', 4000)
  return ok
})
for (const [z, notches] of [['as opened', 0], ['out 5', 5], ['out 3 more', 3], ['out 2 more', 2]])
  await look(`map, ${z}`, async () => {
    if (notches === 0) {
      await openMap()
      return true
    }
    await zoomOut(notches)
    return true
  })
await look('field report', async () => {
  await home()
  await tap('.hcard--surf', 5000)
  return tap('text=What did you see?', 4000)
})
await browser.close()
process.exit(0)
