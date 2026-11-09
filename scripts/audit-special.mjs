/*
 * SPECIAL LIGHT THIS WEEK, IN WEBKIT, AS A TAB AND STANDALONE.
 *
 * Usage:  node scripts/audit-special.mjs [screenshot-dir]
 *
 * The Virginia Beach pier, the clock at 7:30 AM EDT on 30 Oct (in the light:
 * Batch G says fog only where it forms or lifts in the light), with
 * Open-Meteo answered by a week built for the check: all five models with
 * the dew point at the air and 2 kt from 5 to 9 AM that day over a sea
 * colder than the air (fog), broken low cloud on the 31st from 8 to 10 AM
 * (god rays), and showers round the venue on 1 Nov at 2-4 PM EST (a rainbow).
 *
 *   the map    the one status line reads "Fog likely now · 5 of 5 models"
 *              and a tap on it opens the Sky page (Batch Pages, Section 3)
 *   the week   RARE LIGHT THIS WEEK: Fog Today, Light rays tomorrow, a
 *              Rainbow chance Sunday, each a row with its day and time and
 *              one line from the numbers that found it; the icon-only week
 *              grid, and with it "Show the bow on the map", are gone
 *   no sideways scroll; never "safe", "clear", "certain"
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('special light')
const watchdog = startWatchdog('special light', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'special')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-30', startTime: '06:00', endTime: '09:00' }
const url = new URL(await shareLink(`${APP_ORIGIN}/`, { id: 'special', name: 'Special check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))
url.search = '?probe=1'

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const asked = { week: 0, sea: 0 }

const START = Date.UTC(2026, 9, 30)
const hoursOf = (days) => Array.from({ length: days * 24 }, (_, i) => new Date(START + i * 3_600_000))
const inUtc = (t, day, from, to) => t.getTime() >= START + day * 86_400_000 + from * 3_600_000 && t.getTime() < START + day * 86_400_000 + to * 3_600_000
function week(u) {
  const models = (u.searchParams.get('models') ?? '').split(',')
  const points = (u.searchParams.get('latitude') ?? '').split(',').length
  const hs = hoursOf(7)
  const time = hs.map((t) => t.toISOString().slice(0, 16))
  const one = (p) => {
    const series = {}
    for (const m of models) {
      /* Fog: 30 Oct 09-13 UTC (5-9 AM EDT). */
      series[`temperature_2m_${m}`] = hs.map(() => 60)
      series[`dew_point_2m_${m}`] = hs.map((t) => (inUtc(t, 0, 9, 13) ? 59.5 : 48))
      series[`wind_speed_10m_${m}`] = hs.map((t) => (inUtc(t, 0, 9, 13) ? 2 : 12))
      /* God rays: 31 Oct 12-14 UTC (8-10 AM EDT), broken low cloud with the sun 10-25° up. */
      /* And a long shot: 2 Nov 12-14 UTC, one model only (Batch E: greyed, never on the map). */
      series[`cloud_cover_low_${m}`] = hs.map((t) => (inUtc(t, 1, 12, 14) || (m === models[0] && inUtc(t, 3, 12, 14)) ? 50 : 0))
      /* Showers round the venue (not at it): 1 Nov 19-21 UTC, 2-4 PM EST (the clocks went back that morning). */
      series[`showers_${m}`] = hs.map((t) => (p > 0 && inUtc(t, 2, 19, 21) ? 1.2 : 0))
    }
    return { latitude: PIER.lat, longitude: PIER.lon, hourly: { time, ...series } }
  }
  return points > 1 ? Array.from({ length: points }, (_, p) => one(p)) : one(0)
}

async function routes(ctx) {
  await ctx.route(/api\.open-meteo\.com\/v1\/forecast/, async (route) => {
    const u = new URL(route.request().url())
    if ((u.searchParams.get('hourly') ?? '').includes('showers')) {
      asked.week += 1
      return route.fulfill({ json: week(u) })
    }
    return route.fulfill({ status: 503, body: 'not in this audit' })
  })
  await ctx.route(/marine-api\.open-meteo\.com/, async (route) => {
    asked.sea += 1
    const time = hoursOf(7).map((t) => t.toISOString().slice(0, 16))
    return route.fulfill({ json: { hourly: { time, wave_height: time.map(() => 0.5), sea_surface_temperature: time.map(() => 14) } } })
  })
  await ctx.route(/tidesandcurrents|api\.weather\.gov|air-quality/, (route) => route.fulfill({ status: 503, body: 'not in this audit' }))
}

const browser = await webkit.launch()
try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    await routes(ctx)
    await ctx.addInitScript(([top, bottom]) => {
      const add = () => {
        const s = document.createElement('style')
        s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
        document.head.appendChild(s)
      }
      if (document.head) add()
      else document.addEventListener('DOMContentLoaded', add)
    }, [insets.top, insets.bottom])
    const page = await ctx.newPage()
    await page.clock.setFixedTime(new Date('2026-10-30T11:30:00Z'))
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url.href)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await goToStage(ev, wait, 'plan')
    await wait(5000)

    /* The status line: fog on now, and a tap on it opens the list. */
    let status = null
    for (let i = 0; i < 16 && status === null; i += 1) {
      status = await ev(`document.querySelector('.offline-line--btn')?.textContent ?? null`)
      if (status === null) await wait(500)
    }
    console.log(`  status line: ${status}`)
    if (status === null || !/^Fog (likely|possible) now · 5 of 5 models$/.test(status)) fail(`${label}: the status line over the map reads ${JSON.stringify(status)}`)
    const box = await ev(`(() => { const e = document.querySelector('.offline-line--btn'); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, h: r.height, cut: e.scrollWidth > e.clientWidth + 1 } })()`)
    if (box !== null && (box.top < insets.top || box.cut || box.h < 24)) fail(`${label}: the status line is under the status bar, cut or too small to tap ${JSON.stringify(box)}`)
    await page.screenshot({ path: join(OUT, `special-map-${label}.png`) })
    await page.locator('.offline-line--btn').first().tap().catch(() => {})
    /*
     * RARE LIGHT THIS WEEK (Batch Pages, Section 3): the status line opens the
     * Sky page, where the week is rows in words: when, what, one line why from
     * the numbers that found it. The icon-only week grid is gone.
     */
    let list = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      list = await ev(`(() => {
        const s = document.querySelector('.spage__rare')
        if (!s || s.querySelectorAll('.spage__row').length === 0) return null
        return {
          rows: [...s.querySelectorAll('.spage__row')].map((r) => ({ when: r.querySelector('.spage__when')?.textContent ?? '', what: r.querySelector('.spage__what b')?.textContent ?? '', why: r.querySelector('.spage__what span')?.textContent ?? '' })),
          grid: !!document.querySelector('.spec, .wk__icon'),
          wide: [...s.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > innerWidth + 1),
          text: s.textContent,
        }
      })()`)
      if (list !== null) break
    }
    looked += 1
    console.log(`  rare light: ${JSON.stringify(list?.rows)}`)
    if (list === null) fail(`${label}: tapping the status line did not open the Sky page with the week's rare light`)
    else {
      const row = (what, day) => list.rows.find((r) => r.what === what && r.when.startsWith(day))
      const fog = row('Fog', 'Today')
      if (fog === undefined) fail(`${label}: no Fog row on Today (Friday morning)`)
      else if (!/^dew point 60°F, air 60°F, wind 2 kt, sea 57°F$/.test(fog.why)) fail(`${label}: the fog's line reads ${JSON.stringify(fog.why)}`)
      const rays = row('Light rays', 'Sat')
      if (rays === undefined) fail(`${label}: no Light rays on Saturday (tomorrow)`)
      else if (!/^(scattered|broken) low cloud, sun \d+° up$/.test(rays.why)) fail(`${label}: the rays' line reads ${JSON.stringify(rays.why)}`)
      const bow = row('Rainbow chance', 'Sun')
      if (bow === undefined) fail(`${label}: no Rainbow chance on Sunday`)
      else if (!/^showers to the [a-z-]+, sun \d+° up in the [a-z-]+$/.test(bow.why)) fail(`${label}: the rainbow's line reads ${JSON.stringify(bow.why)}`)
      if (list.rows.some((r) => !/^(Today|Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2}:\d\d [AP]M$/.test(r.when))) fail(`${label}: a row's day and time read ${JSON.stringify(list.rows.map((r) => r.when))}`)
      if (list.rows.some((r) => r.why.trim() === '')) fail(`${label}: a row without its one line`)
      if (list.grid) fail(`${label}: the icon-only week grid is still there`)
      if (list.wide) fail(`${label}: something in the rare light runs past the screen`)
      if (/\bsafe\b|\bcertain\b|\bclear of\b|\bwill\b/i.test(list.text)) fail(`${label}: the rare light promises something`)
    }
    await page.screenshot({ path: join(OUT, `special-list-${label}.png`) })
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (asked.week === 0 || asked.sea === 0) fail(`the app never asked for ${JSON.stringify(asked)}: the routes answered nothing`)
if (looked === 0) {
  console.log('=== SPECIAL LIGHT AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== SPECIAL LIGHT PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
