/*
 * THE MAP AT Z4 AND Z2, WIND MODE, LIVE TILES (Batch FIX, Section 2.7: the
 * DRONE walk's keyboard zoom stopped at a 30 mi scale bar).
 *
 * Usage:  node scripts/walk-zoom.mjs [url] > walk.log
 *
 * Not part of the gate (the gate never reaches a live host): run by hand
 * against the DEPLOYED app, its lines written to docs/batches/core-walk.md.
 * WebKit at 390 x 844 as a desktop window, because mobile WebKit takes no
 * mouse wheel and the page does not expose the map's zoom: the wheel zooms
 * out until the scale bar reads the distance of z4 and of z2 at this
 * latitude (a 100 px bar is about 300 mi at z4, about 1,200 mi at z2), and
 * the bar is read back, not assumed. At each stop: a screenshot, the scale
 * bar, the wind layer's canvas drawn (non-blank pixels), "didn't load",
 * NaN, and console errors. The spot is a public landmark, the Virginia
 * Beach Fishing Pier.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { webkit } from 'playwright'
import { goToStage } from './preflight.mjs'

const URL_ = process.argv[2] ?? 'https://scoutngo.vercel.app'
const OUT = process.env.OUT ?? `${process.env.TMPDIR ?? '/tmp'}/scoutngo-walk-zoom`
mkdirSync(OUT, { recursive: true })
const SPOT = { at: { lat: 36.8435575, lon: -75.9713104 }, name: { key: 'pier', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }

const browser = await webkit.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await ctx.addInitScript((spot) => {
  try {
    localStorage.setItem('scoutngo.landing.v1', 'true')
    localStorage.setItem('scoutngo.nearMe.v1', 'off')
    if (!localStorage.getItem('scoutngo.lastSetup.v1')) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify(spot))
  } catch {
    /* about:blank */
  }
}, SPOT)
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 160))
})
const wait = (ms) => page.waitForTimeout(ms)
const tap = (sel, ms = 1500) => page.locator(sel).first().click({ timeout: 6000 }).then(async () => { await wait(ms); return true }, () => false)

await page.goto(URL_)
await wait(9000)
await page.getByRole('button', { name: /^open$/i }).click({ timeout: 3000 }).catch(() => {})
await goToStage((x) => page.evaluate(x), wait, 'plan')
await wait(4000)
await tap('.rail2__btn[aria-label="Features"]', 900)
await tap('[data-weather="wind"]', 1000)
await page.locator('.card2[aria-label="Map"] .card2__x').first().click({ timeout: 2000 }).catch(() => {})
await wait(6000)

/* The scale bar in miles (or km read as miles), or null. */
const scaleMi = async () => {
  const t = await page.evaluate(() => document.querySelector('.maplibregl-ctrl-scale')?.textContent ?? null)
  if (t === null) return { t, mi: null }
  const n = Number((t.match(/[\d.,]+/) ?? ['NaN'])[0].replace(/,/g, ''))
  const mi = /km/.test(t) ? n * 0.621 : /ft/.test(t) ? n / 5280 : n
  return { t, mi }
}
const state = () =>
  page.evaluate(() => {
    const text = document.body.innerText
    const c = document.querySelector('canvas.windv3__field')
    let drawn = null
    if (c instanceof HTMLCanvasElement) {
      try {
        const g = c.getContext('2d')
        if (g) {
          const d = g.getImageData(0, 0, c.width, c.height).data
          let n = 0
          for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n += 1
          drawn = n
        }
      } catch {
        drawn = 'unreadable'
      }
    }
    return { nan: /NaN/.test(text), failed: /didn['’]t load/.test(text), windCanvas: c === null ? null : c.className || c.tagName, drawn, readout: (document.querySelector('[data-marker-readout]')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 100) }
  })

const box = await page.locator('.maplibregl-canvas').first().boundingBox()
const cx = box === null ? 195 : box.x + box.width / 2
const cy = box === null ? 300 : box.y + box.height / 3
for (const [label, wantMi] of [['as opened', 0], ['z4', 250], ['z2', 1000]]) {
  for (let i = 0; i < 40 && wantMi > 0; i += 1) {
    const s = await scaleMi()
    if (s.mi !== null && s.mi >= wantMi) break
    await page.mouse.move(cx, cy)
    await page.mouse.wheel(0, 300)
    await wait(350)
  }
  await wait(5000)
  const s = await scaleMi()
  const st = await state()
  await page.screenshot({ path: join(OUT, `zoom-${label}.png`) })
  console.log(`${label}: scale bar "${s.t}" · wind canvas ${st.windCanvas ?? 'none'} (${st.drawn} sampled pixels drawn) · NaN ${st.nan} · didn't load ${st.failed} · readout "${st.readout}"`)
}
console.log(`console errors: ${errors.length}${errors.length === 0 ? '' : ` · ${[...new Set(errors)].slice(0, 5).join(' | ')}`}`)
console.log(`screenshots: ${OUT}`)
await browser.close()
