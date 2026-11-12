/*
 * WHERE'S THE COLOR? (Batch BEST SKY; boards BestSky_Map, BestSky_Card,
 * BestSky_Spot), IN WEBKIT AND CHROMIUM, on the 11 Nov sunset replayed: the
 * grid's questions are answered with the kept tiles (tests/data/
 * bestsky-2026-11-11/, scripts/measure-bestsky-replay.mjs), so the page has
 * the patch over Lynnhaven Inlet that the truth file records
 * (fixtures/truth/2026-11-11-lynnhaven-sunset.json).
 *
 * Usage:  node scripts/audit-bestsky.mjs [screenshot-dir]
 *
 *   privacy   every grid question names a tile (25 points on the 0.05° grid)
 *             and the day, never the spot; one question per tile; a radius
 *             changed and changed back asks nothing again (each kept an hour)
 *   page 1    "Color tonight · sunset 4:57 PM", a dot per page, the imagery (at most 16
 *             tiles), the wash, pin 1 Lynnhaven Inlet, the sheet's "Best:"
 *             and its word, the four radii
 *   home row  "Better color 8 mi WNW · Lynnhaven Inlet · 5:02 PM ›" opens it
 *   page 2    "Best 8 mi WNW", three ranked rows with Lynnhaven Inlet first,
 *             where you are, Show on map, Remind me (in Chromium the file
 *             it hands over: the event, its alarm, no coordinate)
 *   page 3    a row on page 2 brings up that spot: the view, its tags, Why
 *             here, the clock and its bar, the satellite's line
 *
 * Nothing runs off the side of a page; nothing says safe or clear (rule 28);
 * every time reads AM or PM.
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, webkit, devices } from './gate/playwright.mjs'
import { ensureApp, findChrome, goToStage, guardAudit, startWatchdog, APP_ORIGIN, openMenu } from './preflight.mjs'
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'

guardAudit('best sky')
const watchdog = startWatchdog('best sky', 300_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'bestsky')
mkdirSync(OUT, { recursive: true })

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const DIR = 'tests/data/bestsky-2026-11-11'
/* tile-<spacing>-<south>-<west>.json: a tile's first point is its south-west corner. */
const KEPT = new Map(
  readdirSync(DIR)
    .filter((f) => f.startsWith('tile-'))
    .map((f) => {
      const m = /^tile-([\d.]+)-([-\d.]+)-(-[\d.]+)\.json$/.exec(f)
      return [`${Number(m[2]).toFixed(2)},${Number(m[3]).toFixed(2)}`, readFileSync(join(DIR, f), 'utf8')]
    }),
)
/* An hour before the 11 Nov sunset (4:57 PM EST). */
const NOW = new Date('2026-11-11T21:00:00Z')

await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: 'Virginia Beach Fishing Pier' }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-11', startTime: '16:00', endTime: '17:30' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'bestsky', name: 'Best sky check', savedAt: '2026-11-11T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] })
let problems = 0
let looked = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/** The page on screen (by index in the track): what runs off its sides, its text. */
const SEEN = (i) => `JSON.stringify((() => {
  const pg = document.querySelectorAll('.bsky__page')[${i}]
  if (!pg) return { missing: true }
  /* An svg's insides are clipped to it (the imagery tiles run past its box); the svg itself is checked. */
  const off = [...pg.querySelectorAll('*')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && (e.parentElement?.closest('svg') ?? null) === null && (b.right > innerWidth + 1 || b.left < -1) }).map((e) => (e.getAttribute('class') ?? e.tagName)).slice(0, 4)
  return { off, text: pg.innerText }
})())`

const LOOKS = [
  ['iPhone tab', 'webkit', { width: 390, height: 844 }],
  ['iPhone short', 'webkit', { width: 390, height: 664 }],
  ['Android tab', 'chromium', { width: 412, height: 915 }],
]
const browsers = {}
try {
  for (const [label, engine, viewport] of LOOKS) {
    console.log(`\n### ${label}`)
    browsers[engine] ??= engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: findChrome() })
    const ctx = await browsers[engine].newContext({ ...(engine === 'webkit' ? devices['iPhone 13'] : devices['Pixel 7']), viewport })
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
      } catch {
        /* about:blank */
      }
    })
    const page = await ctx.newPage()
    const asked = []
    const every = []
    page.on('request', (r) => every.push(r.url()))
    await page.route(
      /* The grid's question only: its hourly list is exactly the three cloud layers and it names no models (src/lib/bestSkyData.ts tileUrl; the Sky fire path names its models). */
      (u) => decodeURIComponent(u.href).includes('hourly=cloud_cover_low,cloud_cover_mid,cloud_cover_high&') && !u.href.includes('models='),
      (route) => {
        const u = decodeURIComponent(route.request().url())
        asked.push(u)
        const lat = /latitude=([-\d.]+)/.exec(u)?.[1]
        const lon = /longitude=([-\d.]+)/.exec(u)?.[1]
        const body = KEPT.get(`${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`)
        return body === undefined ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ status: 200, contentType: 'application/json', body })
      },
    )
    await page.clock.install({ time: NOW })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    const tap = (sel) => page.locator(sel).first().click({ timeout: 5000, noWaitAfter: true }).then(() => true, () => false)
    await page.goto(url)
    await wait(3500)
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
    await goToStage(ev, wait, 'plan')
    await wait(2500)
    await openMenu(ev, wait)
    await wait(700)
    await page.locator('.mcard--today').first().click()
    await wait(7000)
    if (!(await ev(`!!document.querySelector('.home')`))) {
      fail(`${label}: no home`)
      await page.screenshot({ path: join(OUT, `nohome-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
      await ctx.close()
      continue
    }
    // <open>
    /* Section 4: the home's row, when somewhere near beats here, opens the page. */
    const row = await ev(`document.querySelector('.home__page[aria-label="Today"] [data-better]')?.textContent ?? null`)
    console.log(`  home row: ${JSON.stringify(row)}`)
    if (!/^Better color \d+ mi [NESW]+ · Lynnhaven Inlet · \d+:\d\d [AP]M ›$/.test(row ?? '')) fail(`${label}: the home's row reads ${JSON.stringify(row)}`)
    if (!(await tap('.home__page[aria-label="Today"] [data-better]'))) fail(`${label}: the home's row does not open the page`)
    // </open>
    await wait(5000)
    if (!(await ev(`!!document.querySelector('.bsky')`))) {
      fail(`${label}: "Where's the color?" did not open`)
      await ctx.close()
      continue
    }
    looked += 1

    /* ------------------------------------------------------------ page 1 */
    const m = JSON.parse(
      await ev(`JSON.stringify({ title: document.querySelector('.bsky .ppage__title')?.textContent, sub: document.querySelector('.bsky .ppage__sub')?.textContent, dots: document.querySelectorAll('.bsky__dots [role=tab]').length, pages: document.querySelectorAll('.bsky__page').length, tiles: document.querySelectorAll('.bsky__map image').length, wash: document.querySelectorAll('.bsky__wash circle').length, pins: [...document.querySelectorAll('.bsky__map .bsky__spot')].map((g) => g.getAttribute('aria-label')), best: document.querySelector('.bsky__sheet .bsky__best')?.textContent, radii: [...document.querySelectorAll('.bsky__page--map .bsky__radius')].map((b) => b.textContent + (b.getAttribute('aria-checked') === 'true' ? '*' : '')) })`),
    )
    console.log(`  page 1: ${JSON.stringify(m)}`)
    if (m.title !== 'Color tonight' || !/^sunset \d+:\d\d [AP]M$/.test(m.sub ?? '')) fail(`${label}: page 1 is titled ${JSON.stringify([m.title, m.sub])}`)
    if (m.dots !== m.pages) fail(`${label}: ${m.dots} dots for ${m.pages} pages`)
    if (m.tiles < 1 || m.tiles > 16) fail(`${label}: ${m.tiles} imagery tiles under the map (1 to 16)`)
    if (m.wash < 1) fail(`${label}: no wash on the 11 Nov patch`)
    if (!(m.pins.includes('1. Lynnhaven Inlet'))) fail(`${label}: pin 1 is not Lynnhaven Inlet (${JSON.stringify(m.pins)})`)
    if (!/^Best: Lynnhaven Inlet · \d+ mi [NESW]+Likely$/.test(m.best ?? '')) fail(`${label}: the sheet reads ${JSON.stringify(m.best)}`)
    if (m.radii.join('|') !== '5 mi|15 mi*|30 mi|60 mi') fail(`${label}: the radii read ${JSON.stringify(m.radii)}`)
    const p1 = JSON.parse(await ev(SEEN(0)))
    if (p1.off.length > 0) fail(`${label}: page 1 runs off the side: ${JSON.stringify(p1.off)}`)
    await page.screenshot({ path: join(OUT, `1-map-${label.replace(/\s/g, '-').toLowerCase()}.png`) })

    /* ----------------------------------------------------------- privacy */
    const tiles = new Set(asked.map((u) => /latitude=([^&]+)&longitude=([^&]+)/.exec(u)?.slice(1).join('|')))
    console.log(`  questions: ${asked.length}, tiles ${tiles.size}`)
    if (asked.length === 0) fail(`${label}: the grid asked nothing`)
    if (tiles.size !== asked.length) fail(`${label}: ${asked.length} questions for ${tiles.size} tiles`)
    for (const u of asked) {
      const lats = /latitude=([^&]+)/.exec(u)?.[1].split(',') ?? []
      const lons = /longitude=([^&]+)/.exec(u)?.[1].split(',') ?? []
      if (lats.length !== 25 || lons.length !== 25) fail(`${label}: a question of ${lats.length} points, not a 25-point tile`)
      if ([...lats, ...lons].some((v) => Math.abs(Number(v) * 20 - Math.round(Number(v) * 20)) > 1e-6)) fail(`${label}: a point off the 0.05° grid: ${u.slice(0, 160)}`)
    }
    const spotLeaks = every.filter((u) => /36\.843|75\.971/.test(decodeURIComponent(u)))
    if (spotLeaks.length > 0) fail(`${label}: the spot left the phone: ${spotLeaks[0].slice(0, 160)}`)
    const before = asked.length
    await tap('.bsky__page--map .bsky__radius:has-text("30 mi")')
    await wait(3500)
    const at30 = asked.length - before
    await tap('.bsky__page--map .bsky__radius:has-text("15 mi")')
    await wait(2500)
    const again = asked.length - before - at30
    console.log(`  30 mi asked ${at30}; back at 15 mi asked ${again}`)
    if (at30 < 1) fail(`${label}: 30 mi asked nothing`)
    if (again !== 0) fail(`${label}: back at 15 mi the tiles were asked again (${again}), not kept the hour`)
    // <page 2>
    /* ------------------------------------------------------------ page 2 (Section 4; board BestSky_Card) */
    await ev(`document.querySelectorAll('.bsky__page')[1]?.scrollIntoView({ inline: 'start' })`)
    await wait(1500)
    const l = JSON.parse(
      await ev(`JSON.stringify((() => { const pg = document.querySelectorAll('.bsky__page')[1]; return { sub: document.querySelector('.bsky .ppage__sub')?.textContent, big: pg.querySelector('[data-bsky-best]')?.textContent, rows: [...pg.querySelectorAll('.bsky__row[data-bsky-rank]')].map((b) => b.querySelector('.bsky__rname')?.textContent + ' ' + b.querySelector('.bsky__pill')?.textContent), here: pg.querySelector('.bsky__row--here .bsky__rname')?.textContent, remind: pg.querySelector('[data-bsky-remind]')?.textContent ?? null, show: !!pg.querySelector('.bsky__btn--main') } })())`),
    )
    console.log(`  page 2: ${JSON.stringify(l)}`)
    if (l.sub !== 'near you · tonight') fail(`${label}: page 2's line reads ${JSON.stringify(l.sub)}`)
    if (!/^Best \d+ mi [NESW]+$/.test(l.big ?? '')) fail(`${label}: page 2's headline reads ${JSON.stringify(l.big)}`)
    if (l.rows.length !== 3 || l.rows[0] !== 'Lynnhaven Inlet Likely') fail(`${label}: the ranked rows are ${JSON.stringify(l.rows)}`)
    if (!/^Where you are · /.test(l.here ?? '')) fail(`${label}: no "Where you are" row`)
    if (!l.show) fail(`${label}: no "Show on map"`)
    if (!/^Remind me \d+:\d\d [AP]M$/.test(l.remind ?? '')) fail(`${label}: the reminder button reads ${JSON.stringify(l.remind)}`)
    const p2 = JSON.parse(await ev(SEEN(1)))
    if (p2.off.length > 0) fail(`${label}: page 2 runs off the side: ${JSON.stringify(p2.off)}`)
    await page.screenshot({ path: join(OUT, `2-list-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
    /* The reminder is a file made on the phone: the colour's window at the spot, its alarm, and no coordinate in it. */
    if (engine === 'chromium') {
      const [file] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), tap('.bsky__page:nth-child(2) [data-bsky-remind]')])
      const text = file === null ? null : readFileSync(await file.path(), 'utf8')
      if (text === null) fail(`${label}: "Remind me" handed over no file`)
      else {
        if (!/SUMMARY:Sunset color · Lynnhaven Inlet/.test(text) || !/BEGIN:VALARM/.test(text)) fail(`${label}: the reminder file reads ${JSON.stringify(text.slice(0, 300))}`)
        if (/36\.8|75\.9|GEO:/.test(text)) fail(`${label}: the reminder file carries a coordinate`)
      }
    }
    // </page 2>
    // <page 3>
    /* ------------------------------------------------------------ page 3 (Section 5; board BestSky_Spot): the spot picked on page 2 */
    await tap('.bsky__page:nth-child(2) .bsky__row[data-bsky-rank="2"]')
    await wait(1800)
    const sp = JSON.parse(
      await ev(`JSON.stringify((() => { const pg = document.querySelectorAll('.bsky__page')[2]; return { on: document.querySelectorAll('.bsky__dots [role=tab]')[2]?.getAttribute('aria-selected'), name: pg.querySelector('[data-bsky-spot]')?.textContent, word: pg.querySelector('.bsky__spothead .bsky__pill')?.textContent, scene: !!pg.querySelector('.bsky__scene'), glow: !!pg.querySelector('[data-bsky-glow]'), tags: [...pg.querySelectorAll('.bsky__tag')].map((t) => t.textContent), why: !!pg.querySelector('.bsky__whyhere .bsky__profile'), times: pg.querySelector('.bsky__times')?.textContent, bar: pg.querySelectorAll('.bsky__barpart').length, sat: pg.querySelector('.bsky__sat')?.textContent } })())`),
    )
    console.log(`  page 3: ${JSON.stringify(sp)}`)
    if (sp.on !== 'true') fail(`${label}: a row on page 2 did not bring page 3 up`)
    /* The view whole and in sight: on 390 x 664 the page's column squeezed it to a 25 px sliver (12 Nov). */
    const scene = JSON.parse(await ev(`JSON.stringify((() => { const b = document.querySelectorAll('.bsky__page')[2]?.querySelector('.bsky__scene')?.getBoundingClientRect(); return b ? { top: b.top, h: b.height, w: b.width } : null })())`))
    if (scene === null || scene.top < 0 || scene.h < scene.w * 0.5) fail(`${label}: page 3's view is ${JSON.stringify(scene)}, not whole and in sight`)
    if (sp.name !== 'Lesner Bridge') fail(`${label}: page 3 shows ${JSON.stringify(sp.name)}, not the spot picked (Lesner Bridge)`)
    if (!/^(Likely|Possible|Little)$/.test(sp.word ?? '')) fail(`${label}: page 3's word is ${JSON.stringify(sp.word)}`)
    if (!sp.scene || !sp.glow) fail(`${label}: no view from the spot`)
    if (!sp.tags.some((t) => /^faces [NESW]+$/.test(t)) || !sp.tags.includes('water in front')) fail(`${label}: the tags read ${JSON.stringify(sp.tags)}`)
    if (!sp.why) fail(`${label}: no "Why here"`)
    if (!/set up \d+:\d\d [AP]M.*color \d+:\d\d [AP]M–\d+:\d\d [AP]M.*peak \d+:\d\d [AP]M.*dark \d+:\d\d [AP]M/.test(sp.times ?? '')) fail(`${label}: the clock reads ${JSON.stringify(sp.times)}`)
    if (sp.bar < 2) fail(`${label}: the clock's bar has ${sp.bar} parts`)
    if (!sp.sat) fail(`${label}: no line on where the satellite stands`)
    const p3 = JSON.parse(await ev(SEEN(2)))
    if (p3.off.length > 0) fail(`${label}: page 3 runs off the side: ${JSON.stringify(p3.off)}`)
    await page.screenshot({ path: join(OUT, `3-spot-${label.replace(/\s/g, '-').toLowerCase()}.png`) })
    // </page 3>
    for (const i of [0, 1, 2]) {
      const t = JSON.parse(await ev(SEEN(i)))
      if (!t.missing && /\bsafe\b|all clear|clear to/i.test(t.text)) fail(`${label}: page ${i + 1} says safe or clear`)
      /* Every time with its AM or PM on the default 12 hour clock (scripts/audit-clock.mjs's rule). */
      const bare = t.missing ? [] : [...t.text.matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b(?!\s?[AP]M)/g)].map((x) => t.text.slice(Math.max(0, x.index - 20), x.index + 8))
      if (bare.length > 0) fail(`${label}: page ${i + 1} has a time without AM or PM: ${JSON.stringify(bare[0])}`)
    }
    await page.locator('.bsky .ppage__back').click()
    await wait(800)
    if (await ev(`!!document.querySelector('.bsky')`)) fail(`${label}: Back left the page open`)
    await ctx.close()
    watchdog.note(label)
  }
} finally {
  for (const b of Object.values(browsers)) await b.close()
}
watchdog.stop()
if (looked === 0) {
  console.log('=== BEST SKY AUDIT ABORTED: nothing was looked at ===')
  process.exit(2)
}
console.log(`  screenshots: ${OUT}`)
console.log(`\n=== BEST SKY PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
