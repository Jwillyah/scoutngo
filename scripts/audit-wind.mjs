/*
 * WIND = THE MAP, IN WEBKIT, AS A TAB AND STANDALONE (Batch SIMPLE-2,
 * Section 5; boards docs/mockups/simple2/Wind_Map.png, Wind_Charts.png).
 *
 * Usage:  node scripts/audit-wind.mjs [screenshot-dir]
 *
 * The Virginia Beach pier with the Air 3S in the bag (rated 12 m/s, 27 mph).
 * Open-Meteo answers five models with the wind FROM the north (0°) at
 * 10-15 m/s at the ground and stronger aloft; KNTU's METAR says 02007KT; the
 * buoy says 6 m/s from 350°.
 *
 *   the map   the Wind chip opens the map on the wind layer at now, with the
 *             marker on the spot, Map | Charts in the top bar (Map on), the
 *             bar's chips Wind · Radar · Clouds with Wind on, no planner; the
 *             marker's readout beside the marker, on the glass, below the top
 *             bar and above the sheet, also with the spot 30 px from the
 *             right edge (flipped to its left)
 *   Charts    the tap-in page: "from the N" words ("kt N"), the 24 h bars with
 *             their arrows pointing south (TO = FROM + 180), the by-height
 *             grid, the Station row (KNTU) and the Models row, no "safe",
 *             nothing past 390 px, and no planner
 *   More      "More details ›" is the Wind page v2, unchanged: the dial and
 *             the 12 hours point south, 400 ft over the Air 3S's rating, the
 *             station tile KNTU from the NNE; Back is Charts again
 *   Map       Charts › Map is the map's wind again; Back is the home, the
 *             layers off
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
/* ?probe=1: the map reachable, to put the spot near the right edge. */
url.searchParams.set('probe', '1')

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
    await page.getByText(/^(Open the map|Open ScoutNGo)$/).click({ timeout: 4000 }).catch(() => {})
    await wait(1500)
    await goToStage(ev, wait, 'plan')
    await wait(2500)
    /* Batch SIMPLE-2, Section 5: the Wind chip (as the home's Wind tile) opens the map on the wind layer, not a page. */
    await page.locator('.chip2[data-chip="wind"]').first().tap()
    const MAPSTATE = `(() => {
      const box = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 ? { l: Math.round(q.left), t: Math.round(q.top), r: Math.round(q.right), b: Math.round(q.bottom) } : null }
      const tabs = [...document.querySelectorAll('.topbar [data-wind-tab]')].map((t) => ({ text: t.textContent.trim(), on: t.getAttribute('aria-selected') === 'true' }))
      const chips = [...document.querySelectorAll('[data-wind-timebar] .ltl__seg [data-layer-pick]')].map((b) => (b.getAttribute('aria-checked') === 'true' ? '*' : '') + b.textContent.trim())
      const ring = document.querySelector('[data-layer-marker="wind"] .lmark__ring')
      const sheet = document.querySelector('.sheet')
      return {
        layer: document.querySelector('.mode-plan')?.getAttribute('data-weather-layer') ?? null,
        view: document.querySelector('[data-wind-view]')?.getAttribute('data-wind-view') ?? null,
        tabs,
        chips,
        atNow: !!document.querySelector('[data-wind-timebar] .ltl__now') && !document.querySelector('[data-wind-timebar] .ltl__when--go'),
        atSpot: document.querySelector('[data-layer-marker="wind"]')?.getAttribute('data-at-spot') ?? null,
        ring: box(ring),
        card: box(document.querySelector('[data-marker-readout="wind"]')),
        side: document.querySelector('[data-marker-readout="wind"]')?.dataset.side ?? null,
        topbar: box(document.querySelector('.topbar')),
        sheetTop: sheet ? Math.round(sheet.getBoundingClientRect().top) : null,
        home: !!document.querySelector('.home'),
        planner: [...document.querySelectorAll('.mode-setup, .shootc')].some((e) => e.getBoundingClientRect().height > 0) || [...document.querySelectorAll('button')].some((b) => b.getBoundingClientRect().height > 0 && /^Suggest$/.test((b.textContent ?? '').trim())),
        page: !!document.querySelector('.wcharts, .dpage--wind'),
      }
    })()`
    let m = null
    for (let i = 0; i < 24; i += 1) {
      await wait(500)
      m = await ev(MAPSTATE)
      if (m.view === 'map' && m.layer === 'wind' && m.card !== null && m.ring !== null) break
    }
    looked += 1
    console.log(`  the map: ${JSON.stringify(m)}`)
    /* The readout on the glass: beside the ring (no pixel shared), inside the screen, below the top bar, above the sheet. */
    const readoutOk = (s, where) => {
      if (s.card === null || s.ring === null) return fail(`${label}, ${where}: no marker or no readout beside it (${JSON.stringify({ ring: s.ring, card: s.card })})`)
      const apart = s.card.l >= s.ring.r || s.card.r <= s.ring.l
      if (!apart) fail(`${label}, ${where}: the readout sits on the marker: ${JSON.stringify({ ring: s.ring, card: s.card })}`)
      if (s.card.l < 0 || s.card.r > 390) fail(`${label}, ${where}: the readout runs off the screen sideways: ${JSON.stringify(s.card)}`)
      if (s.topbar !== null && s.card.t < s.topbar.b) fail(`${label}, ${where}: the readout is up under the top bar: ${JSON.stringify({ card: s.card, topbar: s.topbar })}`)
      if (s.sheetTop !== null && s.card.b > s.sheetTop) fail(`${label}, ${where}: the readout runs under the sheet: ${JSON.stringify({ card: s.card, sheetTop: s.sheetTop })}`)
    }
    if (m.layer !== 'wind' || m.view !== 'map') fail(`${label}: the Wind chip did not open the map's wind view (layer ${m.layer}, view ${m.view})`)
    else {
      if (m.tabs.map((t) => t.text).join('|') !== 'Map|Charts' || !m.tabs[0].on || m.tabs[1].on) fail(`${label}: no Map | Charts at the top with Map on: ${JSON.stringify(m.tabs)}`)
      if (m.chips.join(' · ') !== '*Wind · Radar · Clouds') fail(`${label}: the bar's chips read ${JSON.stringify(m.chips)}, not Wind (on) · Radar · Clouds`)
      if (!m.atNow) fail(`${label}: the wind view did not open at now`)
      if (m.atSpot !== '1') fail(`${label}: the marker is not on the spot (${m.atSpot})`)
      if (m.page) fail(`${label}: a page is over the map's wind`)
      if (m.planner) fail(`${label}: the planner is on the map's wind`)
      readoutOk(m, 'the spot in the middle')
    }
    await page.screenshot({ path: join(OUT, `wind-map-${label}.png`) })
    /* The spot 30 px from the right edge: the readout flips to its left and stays on the glass. */
    await ev(`(() => { const mp = window.__probe?.map; if (!mp) return; const w = mp.getContainer().getBoundingClientRect().width; mp.panBy([-(w / 2 - 30), 0], { animate: false }) })()`)
    await wait(1200)
    const edge = await ev(MAPSTATE)
    console.log(`  the spot at the right edge: readout ${edge.side} ${JSON.stringify(edge.card)} beside ${JSON.stringify(edge.ring)}`)
    if (edge.side !== 'left') fail(`${label}: near the right edge the readout is on the ${edge.side}, not flipped to the left`)
    readoutOk(edge, 'the spot near the right edge')
    await page.screenshot({ path: join(OUT, `wind-map-edge-${label}.png`) })
    await ev(`(() => { const mp = window.__probe?.map; if (!mp) return; const w = mp.getContainer().getBoundingClientRect().width; mp.panBy([w / 2 - 30, 0], { animate: false }) })()`)

    /* CHARTS. */
    await page.locator('[data-wind-tab="charts"]').first().tap().catch(() => fail(`${label}: no Charts at the top of the map's wind`))
    let w = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      w = await ev(`(() => {
        const p = document.querySelector('.wcharts')
        if (!p) return null
        const rows = [...p.querySelectorAll('.tipage__row')].map((r) => r.textContent)
        const arrows = [...p.querySelectorAll('[data-wind-arrow]')].map((a) => a.getAttribute('transform'))
        if (arrows.length === 0 || !rows.some((r) => /KNTU/.test(r))) return null
        return {
          big: p.querySelector('.tipage__value')?.textContent ?? '',
          eyebrow: p.querySelector('.tipage__eyebrow')?.textContent ?? '',
          sub: p.querySelector('.tipage__sub')?.textContent ?? '',
          tabs: [...p.querySelectorAll('.tipage__tabs [role="tab"]')].map((t) => (t.getAttribute('aria-selected') === 'true' ? '*' : '') + t.textContent.trim()),
          bars: Number(p.querySelector('[data-wind-bar]')?.getAttribute('data-wind-bar') ?? 0),
          caps: p.querySelectorAll('.wbar7__cap').length,
          arrows,
          grid: Number(p.querySelector('[data-wind-grid]')?.getAttribute('data-wind-grid') ?? 0),
          cells: p.querySelectorAll('.wcharts__cell:not(.wcharts__cell--none)').length,
          rows,
          text: p.textContent,
          wide: document.documentElement.scrollWidth > innerWidth + 1 || [...p.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > innerWidth + 1),
          planner: [...document.querySelectorAll('.mode-setup, .shootc')].some((e) => e.getBoundingClientRect().height > 0),
        }
      })()`)
      if (w !== null) break
    }
    console.log(`  charts: ${JSON.stringify(w === null ? null : { ...w, text: undefined, arrows: w.arrows.slice(0, 2) })}`)
    if (w === null) fail(`${label}: Charts did not open with the bars and the station`)
    else {
      if (w.tabs.join('|') !== 'Map|*Charts') fail(`${label}: Charts has no Map | Charts with Charts on: ${JSON.stringify(w.tabs)}`)
      if (!/ N$/.test(w.big)) fail(`${label}: a north wind's headline reads "${w.big}"`)
      if (w.bars < 20) fail(`${label}: the 24 h chart drew ${w.bars} bars`)
      if (w.caps === 0) fail(`${label}: no gust caps on the 24 h bars`)
      if (w.arrows.length < 3 || !w.arrows.every((t) => /rotate\((17[5-9]|18[0-5])\)/.test(t ?? ''))) fail(`${label}: the bars' arrows do not all point south for a north wind: ${JSON.stringify(w.arrows)}`)
      if (w.grid !== 12 || w.cells < 40) fail(`${label}: the by-height grid has ${w.grid} hours and ${w.cells} cells`)
      if (!w.rows.some((r) => /^Station.*KNTU.*NNE.*\d+ (min|h)/.test(r))) fail(`${label}: no Station row with KNTU from the NNE and its age: ${JSON.stringify(w.rows)}`)
      if (!w.rows.some((r) => /^Models.*(HRRR|ECMWF).*agree/.test(r))) fail(`${label}: no Models row: ${JSON.stringify(w.rows)}`)
      if (/\bsafe\b/i.test(w.text)) fail(`${label}: Charts says safe`)
      if (w.wide) fail(`${label}: something on Charts runs past 390 px`)
      if (w.planner) fail(`${label}: the planner is on screen with Charts`)
    }
    await page.screenshot({ path: join(OUT, `wind-charts-${label}.png`) })

    /* MORE DETAILS: the Wind page v2, unchanged. */
    await page.locator('.wcharts .tipage__more').first().tap().catch(() => fail(`${label}: no More details on Charts`))
    let o = null
    for (let i = 0; i < 20; i += 1) {
      await wait(500)
      o = await ev(`(() => {
        const p = document.querySelector('.dpage--wind')
        const head = p?.querySelector('[data-wind-headline]')
        if (!p || !head) return null
        return {
          verdict: head.textContent,
          dial: p.querySelector('.dwind__arrow')?.getAttribute('data-to') ?? null,
          arrows: [...p.querySelectorAll('.dwind__ha path')].map((a) => a.getAttribute('transform')),
          tiles: [...p.querySelectorAll('.dwind__tile')].map((t) => t.textContent),
          text: p.textContent,
        }
      })()`)
      if (o !== null && o.tiles.length > 0) break
    }
    console.log(`  more details: ${o?.verdict} | ${JSON.stringify(o?.tiles)}`)
    if (o === null) fail(`${label}: More details did not open the Wind page with a reading`)
    else {
      if (!/from the N\b/.test(o.verdict)) fail(`${label}: More details: a north wind reads "${o.verdict}"`)
      if (o.dial === null || Math.abs(Number(o.dial) - 180) > 5) fail(`${label}: More details: the dial's arrow does not point south (to ${o.dial})`)
      if (o.arrows.length < 6 || !o.arrows.every((t) => /rotate\((17[5-9]|18[0-5])(\.\d+)?\)/.test(t ?? ''))) fail(`${label}: More details: the 12 hours' arrows do not all point south: ${JSON.stringify(o.arrows.slice(0, 3))}`)
      if (!o.tiles.some((t) => /At 400 ft.*over rated/.test(t))) fail(`${label}: More details: the 400 ft tile does not say it is over the Air 3S's rating: ${JSON.stringify(o.tiles)}`)
      if (!o.tiles.some((t) => /Nearest station.*NNE.*KNTU · \d+ (min|h)/.test(t))) fail(`${label}: More details: the station tile is not KNTU from the NNE with its age: ${JSON.stringify(o.tiles)}`)
      if (/\bsafe\b/i.test(o.text)) fail(`${label}: More details says safe`)
    }
    await page.screenshot({ path: join(OUT, `wind-more-${label}.png`) })
    await page.keyboard.press('Escape')
    await wait(800)
    const backToCharts = await ev(`({ charts: !!document.querySelector('.wcharts'), old: !!document.querySelector('.dpage--wind') })`)
    if (!backToCharts.charts || backToCharts.old) fail(`${label}: Back from More details did not land on Charts: ${JSON.stringify(backToCharts)}`)

    /* CHARTS › MAP: the map's wind again, never the planner. */
    await page.locator('.wcharts [role="tab"]', { hasText: 'Map' }).first().tap().catch(() => fail(`${label}: no Map tab on Charts`))
    let again = null
    for (let i = 0; i < 10; i += 1) {
      await wait(400)
      again = await ev(MAPSTATE)
      if (again.view === 'map' && !again.page) break
    }
    console.log(`  charts › map: ${JSON.stringify({ layer: again.layer, view: again.view, page: again.page, planner: again.planner })}`)
    if (again.layer !== 'wind' || again.view !== 'map' || again.page || again.planner) fail(`${label}: Charts › Map did not land on the map's wind: ${JSON.stringify(again)}`)

    /* BACK: the home, the layers off. */
    await page.locator('.topbar__back').first().tap().catch(() => fail(`${label}: no Back on the map's wind`))
    await wait(1500)
    const out = await ev(`({ layer: document.querySelector('.mode-plan')?.getAttribute('data-weather-layer') ?? null, view: document.querySelector('[data-wind-view]')?.getAttribute('data-wind-view') ?? null, home: !!document.querySelector('.home') })`)
    console.log(`  back: ${JSON.stringify(out)}`)
    if (out.layer !== 'off' || out.view !== null) fail(`${label}: Back left the wind view on (${JSON.stringify(out)})`)
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
