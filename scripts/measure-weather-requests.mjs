/*
 * HOW MUCH THE APP ASKS OPEN-METEO FOR, on a page load and over five minutes
 * of ordinary use, counted in WebKit at 390 x 844.
 *
 * Usage:  node scripts/measure-weather-requests.mjs [label] [minutes]
 * Writes: measurements/<today>-weather-requests[-label].md
 *
 * The Virginia Beach pier at 7:30 AM EDT on 30 Oct (the field test's time
 * and place). Every Open-Meteo request is answered by
 * scripts/openMeteoFake.mjs, so nothing reaches the service and the
 * numbers do not depend on it. Map tiles come from the network as usual.
 *
 * "Ordinary use" is: four pans of the map, the time bar moved through four
 * hours a quarter at a time, the Sky card's Fire, Preview and Special tabs,
 * the Wind chip and its Five models page, then the map left alone until the
 * minutes are up. Each request is counted, and weighed the way Open-Meteo
 * bills it (requestShape in the fixture).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { OPEN_METEO, fakeAnswer, requestShape } from './openMeteoFake.mjs'

const label = process.argv[2] ?? ''
const minutes = Number(process.argv[3] ?? 5)
const NOW = new Date('2026-10-30T11:30:00Z')
const PIER = { lat: 36.8435575, lon: -75.9713104 }

await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-30', startTime: '07:00', endTime: '08:00' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'req', name: 'Request count', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] }))

/** What the request is for, by its shape. */
function kind(s, href) {
  const h = s.vars.join(',')
  if (s.host.startsWith('marine')) return 'marine'
  if (s.host.startsWith('air-quality')) return 'aerosol'
  if (s.points === 25) return 'cloud grid (map layer)'
  if (s.models.length > 0 && s.points === 9) return 'special light, 9 points'
  if (s.models.length > 0 && s.points === 8) return 'sky fire path, 8 points'
  if (s.models.length > 0 && /wind_speed_120m/.test(h)) return 'wind models'
  if (s.models.length > 0 && h === 'cloud_cover_low') return 'chip: models split'
  if (s.points > 1) return `sightline cloud, ${s.points} points`
  if (/wind_gusts_10m/.test(h) && /cloud_cover/.test(h)) return 'venue day (wind and cloud chips)'
  if (h === 'wind_speed_10m,wind_direction_10m') return 'wind, 16 days'
  if (/visibility/.test(h)) return 'sky hours, 16 days'
  if (h === 'cloud_cover') return 'night cloud'
  return `other: ${href.slice(0, 120)}`
}

const log = []
let phase = 'load'
const browser = await webkit.launch()
const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
await ctx.route(/^https:\/\/api\.weather\.gov|\/api\/(buoy|metar)/, (r) => r.fulfill({ status: 503, body: 'not in this count' }))
await ctx.route(OPEN_METEO, (r) => {
  const href = r.request().url()
  const s = requestShape(href)
  log.push({ phase, t: Date.now(), kind: kind(s, href), weight: s.weight })
  return r.fulfill({ json: fakeAnswer(href, NOW) })
})
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('scoutngo.landing.v1', 'true')
  } catch {
    /* about:blank */
  }
})
const page = await ctx.newPage()
await page.clock.install({ time: NOW })
await page.clock.resume()
const wait = (ms) => page.waitForTimeout(ms)
const ev = (x) => page.evaluate(x)
const started = Date.now()
await page.goto(url.href)
await wait(3500)
await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
await goToStage(ev, wait, 'plan')
/* Loaded: until nothing new has been asked for 10 s. */
for (let quiet = 0; quiet < 10; ) {
  const n = log.length
  await wait(1000)
  quiet = log.length === n ? quiet + 1 : 0
}

phase = 'use'
const steps = []
const step = async (name, fn) => {
  const n = log.length
  await fn().catch((e) => steps.push(`${name}: could not (${String(e).split('\n')[0]})`))
  await wait(2500)
  steps.push(`${name}: ${log.length - n} requests`)
}
for (const [dx, dy] of [[120, 0], [-60, 90], [0, -150], [80, 40]]) {
  await step(`pan ${dx},${dy}`, () => ev(`window.__probe?.map?.panBy([${dx}, ${dy}], { duration: 0 })`))
}
await step('time bar +4 h, a quarter at a time', async () => {
  const bar = page.getByRole('slider', { name: /Time of day/ })
  await bar.focus()
  for (let i = 0; i < 16; i += 1) {
    await page.keyboard.press('ArrowRight')
    await wait(250)
  }
})
await step('time bar back 2 h', async () => {
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('ArrowLeft')
    await wait(250)
  }
})
for (const tab of ['Fire', 'Preview', 'Special']) {
  await step(`Sky › ${tab}`, async () => {
    if ((await page.getByRole('tab', { name: tab }).count()) === 0) {
      await page.locator('button[aria-label="Menu"]').first().tap()
      await wait(500)
      await page.getByText('Sky', { exact: true }).first().tap()
      await wait(800)
    }
    await page.getByRole('tab', { name: tab }).tap({ timeout: 4000 })
  })
}
await step('Wind chip › Five models', async () => {
  await page.keyboard.press('Escape')
  await goToStage(ev, wait, 'plan')
  await ev(`[...document.querySelectorAll('.chip2')].find((b) => /WIND/.test(b.textContent))?.click()`)
  await wait(1200)
  await page.locator('.windc__models').first().tap({ timeout: 4000 })
})
const useMs = minutes * 60_000
while (Date.now() - started < useMs) await wait(5000)

await browser.close()

const sum = (rows) => ({ n: rows.length, w: rows.reduce((a, r) => a + r.weight, 0) })
const table = (rows) => {
  const by = new Map()
  for (const r of rows) {
    const e = by.get(r.kind) ?? { n: 0, w: 0 }
    e.n += 1
    e.w += r.weight
    by.set(r.kind, e)
  }
  return [...by].sort((a, b) => b[1].w - a[1].w).map(([k, e]) => `| ${k} | ${e.n} | ${e.w.toFixed(1)} |`).join('\n')
}
const load = log.filter((r) => r.phase === 'load')
const all = log
const lines = [
  `# Open-Meteo requests${label ? ` (${label})` : ''}`,
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-weather-requests.mjs ${label} ${minutes} · WebKit 390 x 844 · Virginia Beach Fishing Pier, page clock ${NOW.toISOString()} · ${process.env.SCOUTNGO_COMMIT ?? 'working tree'}`,
  '',
  'Weight is what Open-Meteo bills: each point is a call, times (variables x models) / 10 when over 10, times days / 14 when over 14. Free tier: 600 a minute, 5,000 an hour, 10,000 a day, per IP.',
  '',
  `## Page load: ${sum(load).n} requests, weight ${sum(load).w.toFixed(1)}`,
  '',
  '| for | requests | weight |',
  '|---|---|---|',
  table(load),
  '',
  `## Load and ${minutes} minutes of use: ${sum(all).n} requests, weight ${sum(all).w.toFixed(1)}`,
  '',
  '| for | requests | weight |',
  '|---|---|---|',
  table(all),
  '',
  '## Steps',
  '',
  ...steps.map((s) => `- ${s}`),
  '',
]
const file = `measurements/${new Date().toISOString().slice(0, 10)}-weather-requests${label ? '-' + label : ''}.md`
mkdirSync('measurements', { recursive: true })
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`wrote ${file}`)
