/*
 * SKY FIRE AND THE CLOUD CHIP, IN WEBKIT, AS A TAB AND STANDALONE.
 *
 * Usage:  node scripts/audit-skyfire.mjs [screenshot-dir]
 *
 * 29 Oct at the Virginia Beach Fishing Pier, with Open-Meteo answered from
 * tests/data/sky-fire-2026-10-29-sunrise.json (the measured cover along the
 * sun's line) and weather.gov from the KNTU METAR of that morning, so what is
 * drawn is checked against known numbers:
 *
 *   before sunrise  Sky › Fire says "Fire possible" or "Fire likely", the
 *                   three checks with their numbers, the side view with a
 *                   deck and the light's path; "Sky right now" names KNTU
 *   the chip        "CLOUD L·M·H", three numbers that fit the chip, and
 *                   "models split" when the five models are far apart
 *   after sunrise   "How was it?": It fired is kept in localStorage
 *   no sideways scroll in the card at 390 px
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from 'playwright'
import { ensureApp, goToStage, guardAudit, startWatchdog } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('sky fire')
const watchdog = startWatchdog('sky fire', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'skyfire')
mkdirSync(OUT, { recursive: true })
const FIXTURE = JSON.parse(readFileSync('tests/data/sky-fire-2026-10-29-sunrise.json', 'utf8'))
const KNTU = 'METAR KNTU 291056Z 02007KT 10SM BKN030 OVC036 17/15 A3026 RMK AO2 SLP248 T01670150'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-29', startTime: '06:30', endTime: '08:00' }
const url = new URL(await shareLink('http://127.0.0.1:5173/', { id: 'fire', name: 'Fire check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const asked = { fire: 0, split: 0, nws: 0 }

async function routes(ctx) {
  await ctx.route(/api\.open-meteo\.com\/v1\/forecast.*models=/, async (route) => {
    const u = new URL(route.request().url())
    if (u.searchParams.get('hourly') === 'cloud_cover_low') {
      asked.split += 1
      const times = Array.from({ length: 24 }, (_, h) => `2026-10-29T${String(h).padStart(2, '0')}:00`)
      const series = (v) => times.map(() => v)
      return route.fulfill({ json: { hourly: { time: times, cloud_cover_low_gfs_hrrr: series(100), cloud_cover_low_gfs_seamless: series(100), cloud_cover_low_ecmwf_ifs025: series(21), cloud_cover_low_icon_seamless: series(63), cloud_cover_low_gem_seamless: series(0) } } })
    }
    asked.fire += 1
    return route.fulfill({ json: FIXTURE.payload })
  })
  await ctx.route(/api\.weather\.gov/, async (route) => {
    asked.nws += 1
    const u = new URL(route.request().url())
    if (u.pathname.startsWith('/points/')) return route.fulfill({ json: { properties: { observationStations: 'https://api.weather.gov/gridpoints/AKQ/102,53/stations' } } })
    if (u.pathname.endsWith('/stations')) return route.fulfill({ json: { features: [{ properties: { stationIdentifier: 'KNTU' } }] } })
    return route.fulfill({ json: { properties: { rawMessage: KNTU, timestamp: '2026-10-29T10:56:00+00:00', cloudLayers: [] } } })
  })
}

const browser = await webkit.launch()
try {
  for (const [label, insets] of [['browser', { top: 0, bottom: 0 }], ['standalone', { top: 47, bottom: 34 }]]) {
    console.log(`\n### ${label}`)
    for (const [when, phase] of [['2026-10-29T10:15:00Z', 'before'], ['2026-10-29T11:40:00Z', 'after']]) {
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
      await page.clock.setFixedTime(new Date(when))
      const wait = (ms) => page.waitForTimeout(ms)
      const ev = (x) => page.evaluate(x)
      await page.goto(url.href)
      await wait(3500)
      await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
      await wait(1500)
      await page.getByText('Open the map', { exact: true }).click({ timeout: 4000 }).catch(() => {})
      await wait(1500)
      await goToStage(ev, wait, 'plan')
      await wait(3500)

      if (phase === 'before') {
        const chip = await ev(`(() => {
          const c = [...document.querySelectorAll('.chip2')].find((b) => /CLOUD/.test(b.querySelector('.chip2__label')?.textContent ?? ''))
          if (!c) return null
          const v = c.querySelector('.chip2__value')
          return { label: c.querySelector('.chip2__label')?.textContent ?? '', value: v?.textContent ?? '', fits: v ? v.scrollWidth <= v.clientWidth + 1 : false, note: c.querySelector('.chip2__note')?.textContent ?? null, spoken: c.getAttribute('aria-label') }
        })()`)
        console.log(`  chip: ${JSON.stringify(chip)}`)
        if (chip === null) fail(`${label}: no cloud chip`)
        else {
          if (!/^CLOUD L·M·H/.test(chip.label)) fail(`${label}: the chip's label is "${chip.label}"`)
          if (!/^(\d+|—)·(\d+|—)·(\d+|—)$/.test(chip.value)) fail(`${label}: the chip's value "${chip.value}" is not low·mid·high`)
          if (!chip.fits) fail(`${label}: the chip's value is cut off`)
          if (chip.note !== 'models split') fail(`${label}: the five models are 100 points apart and the chip does not say "models split" (${chip.note})`)
          if (!/Low \d+ · Mid \d+ · High \d+/.test(chip.spoken ?? '')) fail(`${label}: the chip does not say the layers in words (${chip.spoken})`)
        }
      }

      await page.locator('button[aria-label="Menu"]').first().tap()
      await wait(700)
      await page.getByText('Sky', { exact: true }).first().tap()
      await wait(1200)
      await page.getByRole('tab', { name: 'Fire' }).tap()
      let fire = null
      for (let i = 0; i < 20; i += 1) {
        await wait(500)
        fire = await ev(`(() => {
          const f = document.querySelector('.fire')
          if (!f) return null
          return {
            verdict: f.querySelector('.fire__verdict')?.textContent ?? null,
            checks: [...f.querySelectorAll('.fire__checks tr')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim()),
            decks: f.querySelectorAll('.fire__deck').length,
            ray: !!f.querySelector('.fire__ray'),
            now: f.querySelector('.fire__now')?.textContent ?? null,
            log: !!f.querySelector('.fire__log'),
            wide: document.documentElement.scrollWidth > innerWidth + 1 || [...f.querySelectorAll('*')].some((e) => e.getBoundingClientRect().right > innerWidth + 1),
            text: f.textContent,
          }
        })()`)
        if (fire?.verdict) break
      }
      looked += 1
      console.log(`  ${phase}: ${fire?.verdict} · ${fire?.checks.length} checks · ${fire?.decks} decks · ray ${fire?.ray} · now ${fire?.now === null ? 'none' : 'shown'}`)
      if (fire === null || fire.verdict === null) fail(`${label} ${phase}: no verdict on the Fire tab`)
      else {
        if (!/^Fire (possible|likely)$/.test(fire.verdict)) fail(`${label} ${phase}: 29 Oct reads "${fire.verdict}", and it fired`)
        if (fire.checks.length !== 3 || !fire.checks.every((c) => /\d/.test(c))) fail(`${label} ${phase}: the checks are ${JSON.stringify(fire.checks)}, not three with numbers`)
        if (fire.decks === 0 || !fire.ray) fail(`${label} ${phase}: the side view has ${fire.decks} decks and ray ${fire.ray}`)
        if (fire.wide) fail(`${label} ${phase}: something in the card runs past 390 px`)
        if (/\bclear of\b|\bsafe\b|\bcertain\b/i.test(fire.text)) fail(`${label} ${phase}: the card says something certain or safe`)
      }
      if (phase === 'before') {
        if (fire?.now === null || !/KNTU/.test(fire?.now ?? '') || !/broken deck at 3,000 ft/.test(fire?.now ?? '')) fail(`${label}: an hour before sunrise "Sky right now" does not name KNTU's deck (${fire?.now})`)
        await page.screenshot({ path: join(OUT, `fire-${label}.png`), fullPage: false })
        await ev(`document.querySelector('.fire__side')?.scrollIntoView({ block: 'center' })`)
        await wait(300)
        await page.screenshot({ path: join(OUT, `fire-side-${label}.png`) })
      } else {
        if (!fire?.log) fail(`${label}: after sunrise there is no "How was it?"`)
        else {
          await page.getByRole('button', { name: 'It fired' }).tap()
          await wait(300)
          const kept = await ev(`JSON.parse(localStorage.getItem('scoutngo.fireLog.v1') ?? '[]').map((e) => e.date + ' ' + e.event + ' ' + e.outcome)`)
          console.log(`  log: ${JSON.stringify(kept)}`)
          if (!kept.includes('2026-10-29 sunrise fired')) fail(`${label}: "It fired" was not kept`)
          await ev(`document.querySelector('.fire__log')?.scrollIntoView({ block: 'center' })`)
          await wait(300)
          await page.screenshot({ path: join(OUT, `fire-log-${label}.png`) })
        }
      }
      await ctx.close()
    }
    watchdog.note(label)
  }
} finally {
  await browser.close()
}
watchdog.stop()
if (asked.fire === 0 || asked.split === 0 || asked.nws === 0) fail(`the app never asked for ${JSON.stringify(asked)}: the routes answered nothing, so this measured the network, not the fixture`)
if (looked === 0) {
  console.log('=== SKY FIRE AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== SKY FIRE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
