/*
 * THE WIND PAGE, IN WEBKIT, AS A TAB AND STANDALONE.
 *
 * Usage:  node scripts/audit-wind.mjs [screenshot-dir]
 *
 * The Virginia Beach pier with the Air 3S in the bag (rated 12 m/s, 27 mph).
 * Open-Meteo answers five models with the wind FROM the north (0°) at
 * 10-15 m/s at the ground and stronger aloft; KNTU's METAR says 02007KT; the
 * buoy says 6 m/s from 350°. The WIND chip, then "Five models": the words say
 * "from the N", over the rating and in amber, with no "safe" anywhere; every
 * arrow points south (TO = FROM + 180); the rated line is drawn; the 80 m and
 * 120 m tabs read higher; the station and the buoy are listed. Nothing past
 * 390 px.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { WIND_MODELS } from '../src/lib/windModelsData.ts'

guardAudit('wind')
const watchdog = startWatchdog('wind', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'wind')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-30', startTime: '09:00', endTime: '11:00' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'wind', name: 'Wind check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] }))

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const asked = { models: 0, nws: 0, buoy: 0 }

function models(u) {
  const days = Number(u.searchParams.get('forecast_days') ?? 3)
  const time = Array.from({ length: days * 24 }, (_, i) => new Date(Date.UTC(2026, 9, 30) + i * 3_600_000).toISOString().slice(0, 16))
  const hourly = { time }
  WIND_MODELS.forEach((m, k) => {
    hourly[`wind_speed_10m_${m}`] = time.map(() => 11 + k)
    hourly[`wind_direction_10m_${m}`] = time.map(() => [350, 355, 0, 5, 10][k])
    hourly[`wind_gusts_10m_${m}`] = time.map(() => 16 + k)
    hourly[`wind_speed_80m_${m}`] = time.map(() => 14 + k)
    hourly[`wind_direction_80m_${m}`] = time.map(() => 0)
    hourly[`wind_speed_120m_${m}`] = time.map(() => 16 + k)
    hourly[`wind_direction_120m_${m}`] = time.map(() => 0)
  })
  return { hourly }
}

const browser = await webkit.launch()
try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    /* Registered first, so the routes after it (which Playwright tries first) answer before it. Outside hosts only: a bare word would match the dev server's own modules (/src/lib/overpass.ts). */
    await ctx.route(/^https:\/\/[^/]*(open-meteo|tidesandcurrents|arcgisonline|openfreemap|amazonaws|nominatim|overpass)/, (r) => r.fulfill({ status: 503, body: 'not in this audit' }))
    await ctx.route(/api\.open-meteo\.com\/v1\/forecast/, (r) => {
      const u = new URL(r.request().url())
      if ((u.searchParams.get('hourly') ?? '').includes('wind_speed_120m') && u.searchParams.has('models')) {
        asked.models += 1
        return r.fulfill({ json: models(u) })
      }
      return r.fulfill({ status: 503, body: 'not in this audit' })
    })
    await ctx.route(/api\.weather\.gov/, (r) => {
      asked.nws += 1
      const u = new URL(r.request().url())
      if (u.pathname.startsWith('/points/')) return r.fulfill({ json: { properties: { observationStations: 'https://api.weather.gov/gridpoints/AKQ/102,53/stations' } } })
      if (u.pathname.endsWith('/stations')) return r.fulfill({ json: { features: [{ properties: { stationIdentifier: 'KNTU' } }] } })
      return r.fulfill({ json: { properties: { rawMessage: 'METAR KNTU 301256Z 02007KT 10SM BKN030 17/15 A3026', timestamp: '2026-10-30T12:56:00+00:00' } } })
    })
    await ctx.route(/\/api\/buoy/, (r) => {
      asked.buoy += 1
      return r.fulfill({ json: { status: 'ok', station: '44099', at: '2026-10-30T12:40:00Z', waveM: 1, periodS: 8, fromDeg: 80, wind: { at: '2026-10-30T12:40:00Z', mps: 6, fromDeg: 350, gustMps: 8 } } })
    })
    await ctx.addInitScript(([top, bottom]) => {
      /* Past the cover: on a cold dev server it took the taps meant for the map. */
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
    await page.clock.setFixedTime(new Date('2026-10-30T13:30:00Z'))
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(url.href)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await goToStage(ev, wait, 'plan')
    await wait(2500)
    /* The Wind chip opens the Wind page itself since 30 Oct (docs/navigation.md). */
    await page.locator('.chip2', { hasText: 'WIND' }).first().tap()
    let w = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      w = await ev(`(() => {
        const p = document.querySelector('.windp')
        if (!p || !p.querySelector('.windp__verdict')) return null
        return {
          verdict: p.querySelector('.windp__verdict').textContent,
          over: p.querySelector('.windp__verdict').classList.contains('windp__verdict--over'),
          note: p.querySelector('.windp__note')?.textContent ?? '',
          arrows: [...p.querySelectorAll('.windp__arrow')].map((a) => a.getAttribute('transform')),
          rated: !!p.querySelector('.windp__rated'),
          measured: [...p.querySelectorAll('.windp__measured li')].map((l) => l.textContent),
          text: p.textContent,
          /* A time split from its AM or PM across lines: "8:40 / AM" (ux-rules 4). */
          split: [...p.querySelectorAll('.windp__t')].some((t) => t.getClientRects().length > 1),
          wide: document.documentElement.scrollWidth > innerWidth + 1 || [...p.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > innerWidth + 1),
        }
      })()`)
      if (w !== null) break
    }
    looked += 1
    console.log(`  ground: ${w?.verdict} | ${w?.note}`)
    console.log(`  measured: ${JSON.stringify(w?.measured)}`)
    if (w === null) fail(`${label}: the Wind page did not open with a reading`)
    else {
      if (!/from the N\b/.test(w.verdict)) fail(`${label}: a north wind reads "${w.verdict}"`)
      if (!w.over) fail(`${label}: a 13 m/s median over the Air 3S's 12 m/s rating is not marked`)
      if (!/5 models/.test(w.note) || !/Over the Air 3S’s rated/.test(w.note)) fail(`${label}: the line under the words reads "${w.note}"`)
      if (w.arrows.length < 20 || !w.arrows.every((t) => /rotate\((17[5-9]|18[0-5])(\.\d+)?\)/.test(t ?? ''))) fail(`${label}: the arrows do not all point south for a north wind: ${JSON.stringify(w.arrows.slice(0, 3))}`)
      if (!w.rated) fail(`${label}: no rated-wind line on the strip`)
      if (!w.measured.some((m) => /^KNTU: .* from the NNE/.test(m))) fail(`${label}: the station's 02007KT is not listed as from the NNE: ${JSON.stringify(w.measured)}`)
      if (!w.measured.some((m) => /^buoy 44099: .* from the N/.test(m))) fail(`${label}: the buoy is not listed`)
      if (/\bsafe\b/i.test(w.text.replace(/not a promise/g, ''))) fail(`${label}: the page says safe`)
      if (w.wide) fail(`${label}: something runs past 390 px`)
      if (w.split) fail(`${label}: a measured time is split from its AM or PM`)
    }
    await page.screenshot({ path: join(OUT, `wind-${label}.png`) })
    await page.getByRole('button', { name: '120 m', exact: true }).tap().catch(() => {})
    await wait(500)
    const high = await ev(`document.querySelector('.windp__verdict')?.textContent ?? ''`)
    console.log(`  120 m: ${high}`)
    if (high === w?.verdict) fail(`${label}: the 120 m tab reads the same as the ground`)
    await page.screenshot({ path: join(OUT, `wind-120-${label}.png`) })
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (asked.models === 0 || asked.nws === 0 || asked.buoy === 0) fail(`the app never asked for ${JSON.stringify(asked)}`)
if (looked === 0) {
  console.log('=== WIND AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== WIND PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
