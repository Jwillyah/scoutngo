/*
 * THE WIND PAGE, IN WEBKIT, AS A TAB AND STANDALONE.
 *
 * Usage:  node scripts/audit-wind.mjs [screenshot-dir]
 *
 * The Virginia Beach pier with the Air 3S in the bag (rated 12 m/s, 27 mph).
 * Open-Meteo answers five models with the wind FROM the north (0°) at
 * 10-15 m/s at the ground and stronger aloft; KNTU's METAR says 02007KT; the
 * buoy says 6 m/s from 350°. The WIND chip opens the Wind page v2 (Batch N,
 * Section 3): the words say "from the N", with no "safe" anywhere; the dial's
 * arrow and every arrow of the next 12 hours point south (TO = FROM + 180);
 * the 400 ft tile is over the Air 3S's rating; the station tile is KNTU from
 * the NNE; a models tile. Nothing past 390 px, nothing scrolls.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { answer } from './gate/fixtures.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'
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
const url = new URL(await shareLink(`${APP_ORIGIN}/`, { id: 'wind', name: 'Wind check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] }))

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
    await ctx.route(/^https:\/\/[^/]*(open-meteo|tidesandcurrents|arcgisonline|openfreemap|amazonaws|nominatim|overpass)|\/api\/forecast\?/, (r) => r.fulfill({ status: 503, body: 'not in this audit' }))
    /* Batch Flow, Section 6: the dial's picture. The tab is answered (the gate's flat imagery fixture) and must show it; standalone is refused and must draw nothing, never a broken-image mark. */
    if (label === 'browser') await ctx.route(/World_Imagery\/MapServer\/export/, async (r) => {
      const f = await answer(r.request().url())
      return r.fulfill({ status: f.status, contentType: f.type, body: f.body })
    })
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
    await page.locator('.chip2[data-chip="wind"]').first().tap()
    let w = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      w = await ev(`(() => {
        /* Batch N, Section 3: the Wind page v2 (src/components/WindPageV2.tsx). */
        const p = document.querySelector('.dpage--wind')
        const head = p?.querySelector('[data-wind-headline]')
        if (!p || !head) return null
        const tiles = [...p.querySelectorAll('.dwind__tile')].map((t) => t.textContent)
        return {
          verdict: head.textContent,
          big: p.querySelector('.dhead__big')?.textContent ?? '',
          dial: p.querySelector('.dwind__arrow')?.getAttribute('data-to') ?? null,
          arrows: [...p.querySelectorAll('.dwind__ha path')].map((a) => a.getAttribute('transform')),
          tiles,
          text: p.textContent,
          scrolls: [...p.querySelectorAll('*')].some((e) => { const st = getComputedStyle(e); return /(auto|scroll)/.test(st.overflowY) && e.scrollHeight > e.clientHeight + 1 }),
          wide: document.documentElement.scrollWidth > innerWidth + 1 || [...p.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > innerWidth + 1),
        }
      })()`)
      if (w !== null) break
    }
    looked += 1
    console.log(`  headline: ${w?.big} | ${w?.verdict}`)
    console.log(`  tiles: ${JSON.stringify(w?.tiles)}`)
    if (w === null) fail(`${label}: the Wind page did not open with a reading`)
    else {
      if (!/from the N\b/.test(w.verdict)) fail(`${label}: a north wind reads "${w.verdict}"`)
      if (w.dial === null || Math.abs(Number(w.dial) - 180) > 5) fail(`${label}: the dial's arrow does not point south for a north wind (to ${w.dial})`)
      if (w.arrows.length < 6 || !w.arrows.every((t) => /rotate\((17[5-9]|18[0-5])(\.\d+)?\)/.test(t ?? ''))) fail(`${label}: the 12 hours' arrows do not all point south: ${JSON.stringify(w.arrows.slice(0, 3))}`)
      if (!w.tiles.some((t) => /At 400 ft.*over rated/.test(t))) fail(`${label}: the 400 ft tile does not say it is over the Air 3S's rating: ${JSON.stringify(w.tiles)}`)
      if (!w.tiles.some((t) => /Station KNTU.*NNE/.test(t))) fail(`${label}: the station's 02007KT is not shown as KNTU from the NNE: ${JSON.stringify(w.tiles)}`)
      if (!w.tiles.some((t) => /Models/.test(t))) fail(`${label}: no models tile`)
      if (/\bsafe\b/i.test(w.text)) fail(`${label}: the page says safe`)
      if (w.wide) fail(`${label}: something runs past 390 px`)
      if (w.scrolls) fail(`${label}: the page scrolls at 390 x 844`)
    }
    await page.screenshot({ path: join(OUT, `wind-${label}.png`) })
    /*
     * Batch Flow, Section 6 (boards D_Wind, D_WindMap): Data | Map at the top,
     * Data on; the spot from above, faded, inside the dial; Map closes the
     * page onto the map with its moving wind layer on, no Sky page over it.
     */
    const mode = await ev(`(() => {
      const p = document.querySelector('.dpage--wind')
      const tabs = [...(p?.querySelectorAll('.dwind__mode [role="tab"]') ?? [])].map((t) => ({ text: t.textContent.trim(), on: t.getAttribute('aria-selected') === 'true' }))
      const img = p?.querySelector('.dwind__dial image.dwind__photo')
      return { tabs, photo: img?.getAttribute('href') ?? null, clipped: !!img?.getAttribute('clip-path'), shown: !!img && img.classList.contains('dwind__photo--on') && getComputedStyle(img).opacity !== '0' }
    })()`)
    console.log(`  data | map: ${JSON.stringify(mode.tabs)}; dial photo ${mode.photo === null ? 'not drawn' : mode.shown ? 'shown' : 'drawn but not shown'}${mode.clipped ? ', clipped to the ring' : ''}`)
    if (mode.tabs.map((t) => t.text).join('|') !== 'Data|Map' || !mode.tabs[0].on || mode.tabs[1].on) fail(`${label}: the Wind page has no Data | Map toggle with Data on: ${JSON.stringify(mode.tabs)}`)
    if (label === 'browser' && (mode.photo === null || !/World_Imagery\/MapServer\/export/.test(mode.photo) || !mode.clipped || !mode.shown)) fail(`${label}: the dial shows no satellite picture clipped to its ring (${JSON.stringify(mode)})`)
    if (label !== 'browser' && mode.photo !== null) fail(`${label}: the picture did not load and is still drawn in the dial (${mode.photo})`)
    await page.locator('.dwind__mode [role="tab"]', { hasText: 'Map' }).tap().catch(() => {})
    let onMap = null
    for (let i = 0; i < 10; i += 1) {
      await wait(400)
      onMap = await ev(`({ page: !!document.querySelector('.dpage--wind'), sky: !!document.querySelector('.mpage'), layer: document.querySelector('.mode-plan')?.getAttribute('data-weather-layer') ?? null })`)
      if (!onMap.page && onMap.layer === 'wind') break
    }
    console.log(`  after Map: wind page ${onMap.page ? 'still open' : 'closed'}, the map's layer ${onMap.layer}, sky page ${onMap.sky ? 'open' : 'not open'}`)
    if (onMap.page || onMap.layer !== 'wind' || onMap.sky) fail(`${label}: Map did not land on the map's moving wind: ${JSON.stringify(onMap)}`)
    await page.screenshot({ path: join(OUT, `wind-map-${label}.png`) })
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (asked.models === 0 || asked.nws === 0) fail(`the app never asked for ${JSON.stringify(asked)}`)
if (looked === 0) {
  console.log('=== WIND AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== WIND PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
