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
 *   before sunrise  Sky › Fire, in order (Batch G, Section 4): the switch,
 *                   "Fire possible" or "Fire likely" in one sentence, the side
 *                   view with a deck and the light's path, the colour strip,
 *                   the three checks as icons with yes / no, "Why" folded
 *                   with the numbers; "Sky right now" names KNTU in one line;
 *                   no paragraph over two lines above the Why
 *   the chip        "CLOUD L·M·H", three numbers that fit the chip, and
 *                   "models split" when the five models are far apart
 *   after sunrise   "How was it?": It fired is kept in localStorage
 *   no sideways scroll in the card at 390 px
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN, openMenu } from './preflight.mjs'

/* Batch Polish, Section 2: the menu is the home's (and setup's and field's); on the map its Back goes home first (scripts/preflight.mjs openMenu). */
const menuOn = (pg) => openMenu((x) => pg.evaluate(x), (ms) => pg.waitForTimeout(ms))
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { testJpeg } from '../src/lib/compare/testJpeg.ts'

guardAudit('sky fire')
const watchdog = startWatchdog('sky fire', 420_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'skyfire')
mkdirSync(OUT, { recursive: true })
const FIXTURE = JSON.parse(readFileSync('tests/data/sky-fire-2026-10-29-sunrise.json', 'utf8'))
const KNTU = 'METAR KNTU 291056Z 02007KT 10SM BKN030 OVC036 17/15 A3026 RMK AO2 SLP248 T01670150'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-10-29', startTime: '06:30', endTime: '08:00' }
const url = new URL(await shareLink(`${APP_ORIGIN}/`, { id: 'fire', name: 'Fire check', savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }))

let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const asked = { fire: 0, split: 0, nws: 0, aod: 0 }

/*
 * THE VENUE'S OWN FORECAST, ANSWERED TOO (30 Oct). It used to go to the real
 * Open-Meteo, and the night the gate had asked it too often that day the
 * service refused ("Daily API request limit exceeded") and the chip said no
 * data: the audit measured the network. Every hourly variable asked, for the
 * day asked, with 29 Oct's cover at the pier (best_match overhead: low 100,
 * mid 5, high 0) and a light wind.
 */
function venueDay(u) {
  const vars = (u.searchParams.get('hourly') ?? '').split(',').filter(Boolean)
  const day = u.searchParams.get('start_date') ?? '2026-10-29'
  const time = Array.from({ length: 24 }, (_, h) => `${day}T${String(h).padStart(2, '0')}:00`)
  const value = (v) => (/cloud_cover_low/.test(v) ? 100 : /cloud_cover_mid/.test(v) ? 5 : /cloud_cover_high/.test(v) ? 0 : /cloud_cover/.test(v) ? 100 : /direction/.test(v) ? 20 : /gust/.test(v) ? 6 : /wind_speed/.test(v) ? 3 : /visibility/.test(v) ? 16000 : 0)
  return { hourly: Object.fromEntries([['time', time], ...vars.map((v) => [v, time.map(() => value(v))])]) }
}

async function routes(ctx) {
  /* First, so the routes below (which Playwright tries first) answer the multi-model requests. */
  await ctx.route(/api\.open-meteo\.com\/v1\/forecast/, (route) => route.fulfill({ json: venueDay(new URL(route.request().url())) }))
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
  /* Aerosol for the colour clock: 0.10 for that hour, as Open-Meteo gave it (measurements/2026-10-30-sky-colour.md). */
  await ctx.route(/air-quality-api\.open-meteo\.com/, async (route) => {
    asked.aod += 1
    const times = Array.from({ length: 24 }, (_, h) => `2026-10-29T${String(h).padStart(2, '0')}:00`)
    return route.fulfill({ json: { hourly: { time: times, aerosol_optical_depth: times.map(() => 0.1) } } })
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
          const c = document.querySelector('.chip2[data-chip="cloud"]')
          if (!c) return null
          const v = c.querySelector('.chip2__value')
          const r = c.getBoundingClientRect()
          return { value: v?.textContent ?? '', fits: v ? v.getBoundingClientRect().width <= r.width + 1 : false, spoken: c.getAttribute('aria-label') }
        })()`)
        console.log(`  chip: ${JSON.stringify(chip)}`)
        if (chip === null) fail(`${label}: no sky cell on the map`)
        else {
          /*
           * Batch Polish 2, Section 1: the strip's Sky cell is the forecast's
           * three layers at the bar's time in a word (src/core/statStrip.ts
           * skyCell); the station's report is the Sky page's, checked there.
           */
          if (!/^(Clear|A few clouds|High cloud|Some cloud|Mostly cloudy|Overcast)$/.test(chip.value)) fail(`${label}: the sky cell reads "${chip.value}", not a sky word`)
          if (!chip.fits) fail(`${label}: the sky cell's words run past it`)
          if (!/Cloud Low \d+ · Mid \d+ · High \d+, models split/.test(chip.spoken ?? '')) fail(`${label}: the sky cell does not say the three layers and that the models split (${chip.spoken})`)
        }
      }

      await menuOn(page)
      await wait(700)
      /* Batch Polish, Section 2: the menu's Sky row (the menu opens over the home now, whose Sky card says the same word). */
      await page.locator('nav[aria-label="Stage"] .sidemenu__item').filter({ hasText: /^\s*Sky/ }).first().tap()
      await wait(1200)
      /* Batch Polish 2, Section 1: the station's sky is the Sky page's now ("KNTU now: Overcast · broken at 3,000 ft, ..."), not the map strip's. */
      if (phase === 'before') {
        let st = null
        for (let i = 0; i < 12 && st === null; i += 1) {
          st = await ev(`document.querySelector('.spage__station')?.textContent ?? null`)
          if (st === null) await wait(500)
        }
        console.log(`  the Sky page's station: ${st}`)
        if (st === null || !/^KNTU now: Overcast · broken at 3,000 ft/.test(st)) fail(`${label}: the Sky page does not say KNTU's sky (${JSON.stringify(st)})`)
      }
      /* Batch Pages, Section 3: Menu › Sky is the Sky page; the Sky color page in full is its "Color detail ›". */
      await page.locator('.spage .ppage__foot button:has-text("Color detail")').tap()
      let fire = null
      for (let i = 0; i < 20; i += 1) {
        await wait(500)
        fire = await ev(`(() => {
          const f = document.querySelector('.fire')
          if (!f) return null
          return {
            verdict: f.querySelector('.fire__big')?.textContent ?? null,
            chip: f.querySelector('.fire__chip')?.textContent.trim() ?? null,
            when: f.querySelector('.fire__when')?.textContent ?? null,
            agreement: f.querySelector('.fire__whyfold')?.textContent ?? '',
            checks: [...f.querySelectorAll('.fire__checks--icons li')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim()),
            why: [...f.querySelectorAll('.fire__whyfold .fire__checks li')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim()),
            whyOpen: f.querySelector('.fire__whyfold')?.open ?? null,
            order: ['.fire__kinds', '.fire__big', '.prev__strips', '.fire__checks--icons', '.fire__whyfold'].map((sel) => f.querySelector(sel)?.getBoundingClientRect().top ?? null),
            /* Section 4: no paragraph over two lines on the first screen (above the Why). */
            long: [...f.querySelectorAll('p')].filter((p) => !p.closest('details') && !p.closest('.prev__page:not(:first-child)')).filter((p) => { const r = p.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(p).lineHeight) || parseFloat(getComputedStyle(p).fontSize) * 1.3; const why = f.querySelector('.fire__whyfold'); return why !== null && r.top < why.getBoundingClientRect().top && r.height > lh * 2 + 2 }).map((p) => p.textContent.slice(0, 60)),
            switches: f.querySelectorAll('[aria-label="Which event"]').length,
            station: f.querySelector('.fire__now')?.textContent ?? null,
            verdicts: f.querySelectorAll('.fire__big, .fire__verdict, .prev__verdict').length,
            decks: f.querySelectorAll('.fire__deck').length,
            ray: !!f.querySelector('.fire__ray'),
            now: f.querySelector('.fire__now')?.textContent ?? null,
            log: !!f.querySelector('.fire__log'),
            wide: document.documentElement.scrollWidth > innerWidth + 1 || [...f.querySelectorAll('*')].filter((e) => { const pg = e.closest('.prev__page'); return pg === null || pg === pg.parentElement?.firstElementChild }).some((e) => e.getBoundingClientRect().right > innerWidth + 1) /* the colour clock's later pages wait off to the right of its swipe, by design (30 Oct: the clock is under the verdict now); its first page is held to the screen like the rest */,
            text: f.textContent,
          }
        })()`)
        if (fire?.verdict) break
      }
      looked += 1
      console.log(`  ${phase}: ${fire?.verdict} · ${fire?.checks.length} checks · ${fire?.decks} decks · ray ${fire?.ray} · now ${fire?.now === null ? 'none' : 'shown'}`)
      if (fire === null || fire.verdict === null) fail(`${label} ${phase}: no verdict on the Sky color tab`)
      else {
        /* Batch I, one screen: the verdict big, "N of 5" beside it, the agreement by layer behind Why. */
        /* Batch QA, Section 0: the call in the one word set, "Color possible" or "Color likely" (src/core/skyPage.ts colorHeadline). */
        if (!/^Color (possible|likely)$/.test(fire.verdict)) fail(`${label} ${phase}: 29 Oct reads "${fire.verdict}", and it fired`)
        if (!/^\d of \d$/.test(fire.chip ?? '')) fail(`${label} ${phase}: no agreement chip beside the verdict (${fire.chip})`)
        if (!/\d of \d see lit low deck/.test(fire.agreement)) fail(`${label} ${phase}: Why does not say how many models see the low deck lit`)
        /* Batch G, Section 4: the sky right now in one line, KNTU's deck. */
        if (fire.station === null || !/^Sky right now · KNTU .*: broken at 3,000 ft/.test(fire.station)) fail(`${label} ${phase}: near now "Sky right now" does not say KNTU's deck in one line (${fire.station})`)
        /* The order: switch, verdict, colour strip, the three checks, Why (folded; Batch J, Section 8: the side view is in it). */
        const order = fire.order
        if (order.some((t) => t === null) || order.some((t, i) => i > 0 && t < order[i - 1])) fail(`${label} ${phase}: the page is not switch → verdict → strips → checks → Why (${JSON.stringify(order)})`)
        if (fire.whyOpen !== false) fail(`${label} ${phase}: "Why" is not folded`)
        if (!/^Best \d{1,2}:\d{2}/.test(fire.when ?? '')) fail(`${label} ${phase}: no best time under the verdict (${fire.when})`)
        if (fire.why.length !== 3 || !fire.why.every((c) => /\d/.test(c))) fail(`${label} ${phase}: Why's checks are ${JSON.stringify(fire.why)}, not three with numbers`)
        if (fire.long.length > 0) fail(`${label} ${phase}: paragraphs over two lines on the first screen: ${JSON.stringify(fire.long)}`)
        if (fire.switches !== 1) fail(`${label} ${phase}: ${fire.switches} Sunrise / Sunset switches on the Sky color page, not 1`)
        if (fire.verdicts !== 1) fail(`${label} ${phase}: ${fire.verdicts} verdicts on the Sky color page, not 1`)
        if (fire.checks.length !== 3 || !fire.checks.every((c) => /^(Canvas|Gap|Not blocked) ?(yes|no|partly)$/.test(c))) fail(`${label} ${phase}: the checks are ${JSON.stringify(fire.checks)}, not three icons with yes or no`)
        if (fire.decks === 0 || !fire.ray) fail(`${label} ${phase}: the side view has ${fire.decks} decks and ray ${fire.ray}`)
        if (fire.wide) fail(`${label} ${phase}: something in the card runs past 390 px`)
        if (/\bclear of\b|\bsafe\b|\bcertain\b/i.test(fire.text)) fail(`${label} ${phase}: the card says something certain or safe`)
      }
      if (phase === 'before') {
        if (fire?.now === null || !/KNTU/.test(fire?.now ?? '') || !/broken at 3,000 ft/.test(fire?.now ?? '')) fail(`${label}: an hour before sunrise "Sky right now" does not name KNTU's deck (${fire?.now})`)
        await page.screenshot({ path: join(OUT, `fire-${label}.png`), fullPage: false })
        await ev(`[...document.querySelectorAll('.frow > summary')].find((x) => x.textContent.startsWith('Why'))?.click()`)
        await wait(300)
        await ev(`document.querySelector('.fire__whyfold .fire__side')?.scrollIntoView({ block: 'center' })`)
        await wait(300)
        await page.screenshot({ path: join(OUT, `fire-side-${label}.png`) })

        /*
         * SKY › PREVIEW, the colour clock, on the same morning: the low deck's
         * glow must start before 7:20 (it was seen about 7:15), the strips are
         * coloured minute cells, and pages 2 and 3 say they are coming.
         */
        /* The colour clock is under the verdict on Sky fire since 30 Oct; Batch I: its first page alone there, the four forecasts and the week behind "Compare the 5 forecasts". */
        await ev(`[...document.querySelectorAll('.frow > summary')].find((x) => x.textContent.startsWith('Compare'))?.click()`)
        await ev(`document.querySelector('.prev')?.scrollIntoView({ block: 'start' })`)
        let prev = null
        for (let i = 0; i < 20; i += 1) {
          await wait(500)
          prev = await ev(`(() => {
            const p = document.querySelector('.prev')
            const cmp = document.querySelectorAll('.prev')[1] ?? null
            if (!p || !cmp) return null
            const strips = [...p.querySelectorAll('.prev__strip')]
            return {
              words: document.querySelector('.fire .fire__when')?.textContent ?? null,
              verdict: document.querySelector('.fire .fire__big')?.textContent ?? null,
              strips: strips.length,
              coloured: strips.map((s) => [...s.querySelectorAll('rect')].filter((r) => r.getAttribute('fill')).length),
              cells: strips.map((s) => s.querySelectorAll('rect').length),
              soon: [...document.querySelectorAll('.prev__page--soon')].map((x) => x.textContent),
              dots: cmp.querySelectorAll('.prev__dot').length,
              pages: [...p.querySelectorAll('.prev__page'), ...cmp.querySelectorAll('.prev__page')].map((x) => x.getAttribute('aria-label')),
              illustrative: [...cmp.querySelectorAll('.prev__page')].map((x) => /Clouds illustrative/.test(x.textContent ?? '')),
              wide: [...p.querySelectorAll('.prev__page:first-child *')].some((e) => e.getBoundingClientRect().right > innerWidth + 1),
              wraps: [...p.querySelectorAll('.prev__layer, .prev__ticks span')].some((e) => e.getBoundingClientRect().height > 22),
            }
          })()`)
          if (prev?.words) break
        }
        looked += 1
        console.log(`  preview: ${JSON.stringify(prev)}`)
        if (prev === null || prev.words === null) fail(`${label}: Sky › Preview drew no words`)
        else {
          const glow = /^Best (\d{1,2}):(\d{2})/.exec(prev.words)
          if (glow === null) fail(`${label}: the page does not say when the glow starts: "${prev.words}"`)
          else if (Number(glow[1]) * 60 + Number(glow[2]) >= 7 * 60 + 20) fail(`${label}: the low deck glows from ${glow[1]}:${glow[2]}, and it was seen about 7:15`)
          if (prev.verdict === null || !/^Color (possible|likely)/.test(prev.verdict)) fail(`${label}: Sky color's verdict is not on top (${prev.verdict})`)
          if (prev.strips < 1 || prev.cells.some((n) => n !== 91) || prev.coloured.some((n) => n < 10)) fail(`${label}: the strips are ${JSON.stringify({ cells: prev.cells, coloured: prev.coloured })}`)
          /* Pages that only said "coming" went in Batch E; pages 2 and 3 came back with pictures in Batch F: one dot a page, and each picture page says its clouds are illustrative. */
          if (prev.soon.length !== 0) fail(`${label}: pages that only say they are coming: ${JSON.stringify(prev.soon)}`)
          if (JSON.stringify(prev.pages) !== JSON.stringify(['Colour clock', 'Four forecasts', 'Week of skies'])) fail(`${label}: the preview's pages are ${JSON.stringify(prev.pages)}`)
          if (prev.dots !== 2) fail(`${label}: ${prev.dots} page dots for the two compare pages`)
          if (prev.illustrative.some((x) => !x)) fail(`${label}: a picture page does not say its clouds are illustrative`)
          if (prev.wide) fail(`${label}: something on the colour clock runs past 390 px`)
          if (prev.wraps) fail(`${label}: a strip label or time wraps`)
          if (/\bclear\b|\bsafe\b|\bcertain\b|\bwill\b/i.test(prev.words)) fail(`${label}: the words promise: "${prev.words}"`)
        }
        await ev(`document.querySelector('.prev')?.scrollIntoView({ block: 'start' })`)
        await wait(300)
        await page.screenshot({ path: join(OUT, `preview-${label}.png`) })
        await wait(500)
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

          /*
           * AFTER THE SHOOT: a drone frame from 7:40, facing the sunrise, picked
           * from the phone. It is read on the phone and set against what the
           * app said: backlit, golden hour, and Sky fire's word, as shown.
           */
          /* Batch I: the truth loop is behind "Log it". */
          await ev(`(() => { const d = [...document.querySelectorAll('.frow')].find((x) => x.querySelector('summary')?.textContent.startsWith('Log it')); if (d) d.open = true })()`)
          await wait(300)
          await page.locator('.truth__file').setInputFiles({ name: 'DJI_20261029074012_0001_D.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(testJpeg({ taken: '2026:10:29 07:40:12', lat: 36.8435575, lon: -75.9713104, yaw: 100, aboveTakeoffM: 60 })) })
          await wait(800)
          const row = await ev(`document.querySelector('.truth__list li')?.textContent ?? null`)
          console.log(`  after the shoot: ${row}`)
          if (row === null || !/min after sunrise/.test(row) || !/backlit/.test(row) || !/golden hour/.test(row) || !/it said Color (likely|possible)/.test(row)) fail(`${label}: the photo's row reads ${JSON.stringify(row)}`)
          await page.locator('.truth [role="group"] button', { hasText: 'It fired' }).tap()
          await wait(300)
          const rate = await ev(`[...document.querySelectorAll('.truth .fire__note')].map((p) => p.textContent).join(' | ')`)
          console.log(`  hit rate: ${rate}`)
          if (!/1 shoot logged\. When Sky color said possible or likely it fired 1 of 1 times\./.test(rate)) fail(`${label}: the hit rate reads "${rate}"`)
          const stored = await ev(`localStorage.getItem('scoutngo.truthLog.v1') ?? ''`)
          if (/data:image|base64/.test(stored)) fail(`${label}: the log kept the picture, not only its numbers`)
          await ev(`document.querySelector('.truth')?.scrollIntoView({ block: 'center' })`)
          await wait(300)
          await page.screenshot({ path: join(OUT, `truth-${label}.png`) })
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
if (asked.fire === 0 || asked.split === 0 || asked.nws === 0 || asked.aod === 0) fail(`the app never asked for ${JSON.stringify(asked)}: the routes answered nothing, so this measured the network, not the fixture`)
if (looked === 0) {
  console.log('=== SKY FIRE AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== SKY FIRE PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
