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
 *              and a tap on it opens Sky › Special
 *   the week   seven rows, a 24 h track each (Batch G): fog Today, god rays
 *              Tomorrow, a rainbow Sunday, each an icon of 44 px on its hours,
 *              no window over two hours, a 1-of-5 window greyed; a tap gives
 *              one line with its models and why, and Go there
 *   the bow    "Show the bow on the map" puts an arc on the map's guide
 *              layer, opposite the sun
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
    let list = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      list = await ev(`(() => {
        const s = document.querySelector('.spec')
        if (!s || s.querySelectorAll('.wk__icon').length === 0) return null
        return {
          days: [...s.querySelectorAll('.wk__day')].map((d) => ({
            name: d.querySelector('.wk__name')?.textContent ?? '',
            icons: [...d.querySelectorAll('.wk__icon')].map((b) => { const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label') ?? '', long: b.classList.contains('wk__icon--long'), w: r.width, h: r.height, kind: [...b.classList].find((c) => c.startsWith('wk__icon--') && !/--(long|on)$/.test(c))?.slice(10) ?? '' } }),
            night: d.querySelectorAll('.wk__night').length,
            sun: d.querySelectorAll('.wk__sun').length,
          })),
          wide: [...s.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > innerWidth + 1),
          text: s.textContent,
        }
      })()`)
      if (list !== null) break
    }
    looked += 1
    console.log(`  week: ${JSON.stringify(list?.days.map((d) => `${d.name}: ${d.icons.map((i) => i.label).join(' / ')}`))}`)
    if (list === null) fail(`${label}: tapping the status line did not open Sky › Special with the week`)
    else {
      /*
       * THE WEEK AS A PICTURE (Batch G, Section 5): seven rows, each a 24 h
       * track with the night and sunrise and sunset marked, an icon (44 px)
       * on the hours of each thing; at most two hours a window; a 1-of-5
       * window greyed.
       */
      const day = (name) => list.days.find((d) => d.name === name)
      const icons = list.days.flatMap((d) => d.icons)
      if (list.days.length !== 7) fail(`${label}: ${list.days.length} day rows, not 7`)
      if (list.days.some((d) => d.night !== 2 || d.sun !== 2)) fail(`${label}: a day without its night shaded and sunrise and sunset marked`)
      if (day('Today')?.icons.find((i) => /^Fog (likely|possible), Today/.test(i.label)) === undefined) fail(`${label}: no fog on Today (Friday morning)`)
      if (day('Tmrw')?.icons.find((i) => /^God rays (likely|possible), Tmrw/.test(i.label)) === undefined) fail(`${label}: no god rays on Tomorrow`)
      if (day('Sun')?.icons.find((i) => /^Rainbow (likely|possible), Sun/.test(i.label)) === undefined) fail(`${label}: no rainbow on Sunday`)
      if (!icons.some((i) => i.long && /^God rays possible.* 1 of 5 models$/.test(i.label))) fail(`${label}: the 1-of-5 god rays are not greyed`)
      if (icons.some((i) => !i.long && / 1 of 5 models$/.test(i.label))) fail(`${label}: a 1-of-5 window is drawn as a strong one`)
      if (!icons.every((i) => /\d of \d models$/.test(i.label))) fail(`${label}: an icon does not say how many models agree`)
      if (icons.some((i) => i.w < 44 || i.h < 44)) fail(`${label}: an icon is under 44 px to tap`)
      /* At most two hours a window: the span in each icon's label. */
      const mins = (t) => { const m = /(\d+):(\d+) (AM|PM)/.exec(t); return m === null ? null : ((Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]) }
      for (const i of icons) {
        const m = /(\d+:\d+ [AP]M)–(\d+:\d+ [AP]M)/.exec(i.label)
        const len = m === null ? null : (mins(m[2]) - mins(m[1]) + 1440) % 1440
        if (len === null || len > 120) fail(`${label}: "${i.label}" is not a window of two hours or less`)
      }
      if (list.wide) fail(`${label}: something in the week runs past 390 px`)
      if (/\bsafe\b|\bcertain\b|\bclear of\b|\bwill\b/i.test(list.text)) fail(`${label}: the week promises something`)
      /* A tap: one line, what, when, how sure, why, and Go there. */
      await page.locator('.wk__icon--fog').first().tap().catch(() => {})
      await wait(400)
      const line = await ev(`document.querySelector('.wk__detail')?.textContent ?? null`)
      console.log(`  fog tapped: ${line}`)
      if (line === null || !/^Fog (likely|possible)/.test(line) || !/5 of 5 models/.test(line) || !/Dew point 60°F against air 60°F, wind 2 kt, sea 57°F under the air/.test(line) || !/Go there/.test(line)) fail(`${label}: the fog's line reads ${JSON.stringify(line)}`)
    }
    await ev(`document.querySelector('.spec')?.scrollIntoView({ block: 'start' })`)
    await wait(300)
    await page.screenshot({ path: join(OUT, `special-list-${label}.png`) })

    /* The bow on the map. */
    await page.locator('.wk__icon--rainbow').first().tap().catch(() => {})
    await wait(400)
    await page.getByRole('button', { name: 'Show the bow' }).first().tap().catch(() => {})
    await wait(1200)
    const guide = await ev(`(() => { const s = window.__probe?.map?.getSource('guide'); const d = s?.serialize?.().data; return d?.features?.[0]?.geometry?.coordinates?.length ?? null })()`)
    console.log(`  bow on the map: ${guide} points`)
    if (!(guide > 5)) fail(`${label}: "Show the bow on the map" drew no arc (${guide})`)
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
