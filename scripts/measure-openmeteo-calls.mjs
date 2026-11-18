/*
 * HOW MANY CALLS ONE APP OPEN MAKES TO OPEN-METEO, per host (Batch SIMPLE-1,
 * Section 4b: the phone's log showed api.open-meteo.com 429 among ~15 calls
 * in one minute at 1:07 PM).
 *
 * Usage:  node scripts/measure-openmeteo-calls.mjs <label> [out.md]
 * Appends a section to the file given (default
 * measurements/<today>-openmeteo-calls.md).
 *
 * The app itself, from source: its own Vite dev server on PORT (never the
 * gate's server), WebKit as an iPhone 13 at 390 x 844, service workers
 * blocked, the Virginia Beach pier with the page clock at 1:07 PM EST on
 * 18 Nov 2026. Every *.open-meteo.com request is counted and answered by
 * scripts/openMeteoFake.mjs; every other outside host is answered 503 here,
 * so nothing reaches a live service. Five looks, the first four on one
 * phone (one browser context), the fifth on a second:
 *
 *  1. open:      the app opened cold (an empty phone but for the landing
 *                flag), on the home, until nothing new is asked for 8 s.
 *  2. idle:      the home left alone 25 s more (Section 5's daily check
 *                runs when the phone is idle after the first load).
 *  3. surf:      the home's Surf card tapped: what the Surf page adds.
 *  4. reopen:    the page reloaded 2 minutes later on the same phone: a
 *                second open inside the 10 minute cache. Then reopen-cold:
 *                the same day with the weather store emptied and the
 *                bigger-swell log kept, idle 25 s: whether Section 5's daily
 *                check asks the wave models again (it must not).
 *  5. refused:   a second phone opened cold while Open-Meteo answers 429 to
 *                every direct ask and the forecast cache answers: how many
 *                direct asks (each a 429 in the phone's log) one open makes.
 *
 * Each look asserts what it is looking at (the home's root, the Surf page's
 * root) and fails loudly when it is not there (docs/failure-modes.md, C).
 */
import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { webkit, devices } from 'playwright'
import { fakeAnswer, requestShape, unwrapForecast } from './openMeteoFake.mjs'

const label = process.argv[2] ?? 'now'
const OUT = process.argv[3] ?? `measurements/${new Date().toISOString().slice(0, 10)}-openmeteo-calls.md`
const PORT = Number(process.env.SCOUTNGO_MEASURE_PORT ?? 5191)
const APP = `http://127.0.0.1:${PORT}`
const NOW = new Date('2026-11-18T18:07:00Z')
const PIER = { lat: 36.8435575, lon: -75.9713104 }

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
const stop = () => {
  try {
    server.kill()
  } catch {
    /* gone */
  }
}
let shot = null
const die = async (why) => {
  console.error(`MEASURE FAILED: ${why}`)
  if (shot !== null) await shot().catch(() => {})
  stop()
  process.exit(1)
}
for (let i = 0; ; i += 1) {
  const up = await fetch(`${APP}/`).then((r) => r.ok, () => false)
  if (up) break
  if (i > 60) await die(`no dev server on ${APP} after 30 s`)
  await new Promise((r) => setTimeout(r, 500))
}

/* The home spot, as the home-fit audit sets it; activities not yet asked, so every card shows (src/lib/activities.ts). */
const SPOT = { at: PIER, name: { key: 'x', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }

/* A request in words: host and path, how many points, then every parameter but the coordinates. */
function shape(href) {
  const u = new URL(href)
  const points = (u.searchParams.get('latitude') ?? '').split(',').filter(Boolean).length
  const rest = [...u.searchParams].filter(([k]) => k !== 'latitude' && k !== 'longitude').map(([k, v]) => `${k}=${v}`).join(' ')
  return `${u.host}${u.pathname} · ${points} point${points === 1 ? '' : 's'} · ${rest}`
}

const log = []
const others = new Map()
let phase = 'open'
const browser = await webkit.launch()
let lines = []
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx.route(/^https?:\/\//, (r) => {
    const u = new URL(r.request().url())
    /* A blank page on the app's origin, with no app on it to hold the weather store open while it is deleted. */
    if (u.pathname === '/__blank') return r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>blank</title>' })
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue()
    if (u.hostname.endsWith('open-meteo.com')) {
      log.push({ phase, host: u.hostname, href: u.href, t: Date.now() })
      return r.fulfill({ json: fakeAnswer(u.href, NOW) })
    }
    others.set(u.hostname, (others.get(u.hostname) ?? 0) + 1)
    return r.fulfill({ status: 503, body: 'not in this count' })
  })
  await ctx.addInitScript((spot) => {
    /* A phone's open: the home first (src/lib/briefingOpen.ts reads webdriver as "not a person"). */
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
      localStorage.setItem('scoutngo.nearMe.v1', 'off')
      if (!localStorage.getItem('scoutngo.lastSetup.v1')) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify(spot))
    } catch {
      /* about:blank */
    }
  }, SPOT)
  const page = await ctx.newPage()
  /* What was on screen when a look failed, so the failure says what it saw. */
  shot = async () => {
    const at = `${process.env.TMPDIR ?? '/tmp'}/measure-openmeteo-failed.png`
    await page.screenshot({ path: at })
    console.error(`  on screen: ${at} · ${await page.evaluate(`document.body.innerText.slice(0, 300).replace(/\\s+/g, ' ')`)}`)
  }
  await page.clock.install({ time: NOW })
  await page.clock.resume()
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const settle = async (quietS) => {
    for (let quiet = 0, i = 0; quiet < quietS && i < 90; i += 1) {
      const n = log.length
      await wait(1000)
      quiet = log.length === n ? quiet + 1 : 0
    }
  }
  const onHome = () => ev(`!!document.querySelector('.home')`)

  await page.goto(`${APP}/`)
  for (let i = 0; i < 30 && !(await onHome()); i += 1) await wait(500)
  if (!(await onHome())) await die('the app did not open on the home (no .home), so there is no home open to count')
  await settle(8)

  phase = 'idle'
  await wait(25_000)
  await settle(4)
  if (!(await onHome())) await die('the home went away while idle')
  /* Section 5: the bigger-swell log on this phone (src/lib/swellWatchStore.ts), read where the app keeps it. */
  const logRows = () => ev(`(() => { try { const raw = JSON.parse(localStorage.getItem('scoutngo.swellWatch.v1') ?? '{}'); return Object.values(raw).flatMap((e) => e.r ?? []) } catch { return [] } })()`)
  const today = '2026-11-18'
  const rowWords = (rows) => {
    const made = rows.filter((r) => r.made === today)
    return made.length === 0 ? 'no row made today' : `${made.length} rows made today, ${made.filter((r) => r.models !== undefined).length} with the models' column`
  }
  const afterIdle = rowWords(await logRows())

  phase = 'surf'
  const tapped = await ev(`(() => { const s = document.querySelector('.home [data-shared="surf"]'); const b = s?.closest('button, [role=button], a'); if (!b) return false; b.click(); return true })()`)
  if (!tapped) await die('no Surf card on the home to tap')
  for (let i = 0; i < 20 && !(await ev(`!!document.querySelector('.dpage--surf')`)); i += 1) await wait(500)
  const surfOpen = await ev(`(() => { const e = document.querySelector('.dpage--surf'); return e ? String(e.className).split(' ')[0] : null })()`)
  if (surfOpen === null) await die('tapped the Surf card and no Surf page came up')
  await settle(6)

  phase = 'reopen'
  await page.clock.fastForward('02:00')
  await page.reload()
  for (let i = 0; i < 30 && !(await onHome()); i += 1) await wait(500)
  if (!(await onHome())) await die('the reload did not come back to the home')
  await settle(8)

  /* 4b. reopen-cold: the same day, the weather store emptied (as after Clear or a long gap), the log kept: what a second open asks. */
  phase = 'reopen-cold'
  await page.goto(`${APP}/__blank`)
  const deleted = await ev(`new Promise((done) => { const r = indexedDB.deleteDatabase('scoutngo-weather'); r.onsuccess = () => done('deleted'); r.onerror = () => done('error'); r.onblocked = () => done('blocked') })`)
  if (deleted !== 'deleted') await die(`reopen-cold: the weather store was not deleted (${deleted})`)
  await page.goto(`${APP}/`)
  for (let i = 0; i < 30 && !(await onHome()); i += 1) await wait(500)
  if (!(await onHome())) await die('the cold reload did not come back to the home')
  if (log.filter((r) => r.phase === 'reopen-cold').length === 0) await settle(3)
  await wait(25_000)
  await settle(4)
  if (log.filter((r) => r.phase === 'reopen-cold').length === 0) await die('reopen-cold: nothing was asked with the store emptied, so the store was not emptied')
  const afterCold = rowWords(await logRows())
  await ctx.close()

  /*
   * 5. refused: a second phone, opened cold while Open-Meteo refuses it (429,
   *    the minutely limit) and the app's forecast cache (/api/forecast)
   *    answers, as on a carrier's shared address. The direct asks are the
   *    ones that draw a 429 in the phone's log.
   */
  phase = 'refused'
  const ctx2 = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  await ctx2.route(/^https?:\/\//, (r) => {
    const u = new URL(r.request().url())
    if (u.pathname === '/api/forecast' && u.searchParams.has('om')) {
      const inner = new URL(unwrapForecast(u.href))
      log.push({ phase: 'refused-cache', host: inner.hostname, href: inner.href, t: Date.now() })
      return r.fulfill({ json: fakeAnswer(inner.href, NOW) })
    }
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue()
    if (u.hostname.endsWith('open-meteo.com')) {
      log.push({ phase, host: u.hostname, href: u.href, t: Date.now() })
      return r.fulfill({ status: 429, json: { reason: 'Minutely API request limit exceeded. Please try again in one minute.', error: true } })
    }
    return r.fulfill({ status: 503, body: 'not in this count' })
  })
  await ctx2.addInitScript((spot) => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
      localStorage.setItem('scoutngo.nearMe.v1', 'off')
      if (!localStorage.getItem('scoutngo.lastSetup.v1')) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify(spot))
    } catch {
      /* about:blank */
    }
  }, SPOT)
  const page2 = await ctx2.newPage()
  await page2.clock.install({ time: NOW })
  await page2.clock.resume()
  await page2.goto(`${APP}/`)
  const onHome2 = () => page2.evaluate(`!!document.querySelector('.home')`)
  for (let i = 0; i < 30 && !(await onHome2()); i += 1) await page2.waitForTimeout(500)
  if (!(await onHome2())) await die('refused: the app did not open on the home')
  for (let quiet = 0, i = 0; quiet < 8 && i < 90; i += 1) {
    const n = log.length
    await page2.waitForTimeout(1000)
    quiet = log.length === n ? quiet + 1 : 0
  }
  if (log.filter((r) => r.phase === 'refused').length === 0) await die('refused: nothing was asked of Open-Meteo, so no 429 was seen')
  await ctx2.close()

  const PHASES = [['open', 'App open, on the home (cold)'], ['idle', 'Home left idle 25 s more'], ['surf', 'Surf page opened from the home (added)'], ['reopen', 'Reopened 2 min later, same phone (10 min cache)'], ['reopen-cold', 'Reopened again the same day, weather store emptied, log kept (+25 s idle)'], ['refused', 'Another phone, cold, Open-Meteo refusing it: direct asks, each a 429'], ['refused-cache', 'the same open: asks through the forecast cache']]
  const hosts = [...new Set(log.map((r) => r.host))].sort()
  const count = (p, h) => log.filter((r) => r.phase === p && (h === undefined || r.host === h)).length
  /* What Open-Meteo bills, by the fixture's rule (scripts/openMeteoFake.mjs requestShape): a point is a call, more variables or days count more. */
  /* The opening burst: sent within a second of the look's first request, before any answer can hold the rest back. */
  const burst = (p) => {
    const rows = log.filter((r) => r.phase === p)
    return rows.length === 0 ? 0 : rows.filter((r) => r.t - rows[0].t <= 1000).length
  }
  /* Section 5: the other wave models' question (src/lib/waveModels.ts), by its model ids. */
  const models = (p) => log.filter((r) => r.phase === p && r.href.includes('ecmwf_wam025')).length
  const weight = (p) => log.filter((r) => r.phase === p).reduce((a, r) => a + requestShape(r.href).weight, 0).toFixed(1)
  lines = [
    `## ${label}`,
    '',
    `Run ${new Date().toISOString()} · node scripts/measure-openmeteo-calls.mjs ${label} · ${process.env.SCOUTNGO_COMMIT ?? 'working tree'} · Vite dev server :${PORT}, WebKit iPhone 13 390 x 844, service workers blocked · VB pier ${PIER.lat},${PIER.lon}, page clock ${NOW.toISOString()} · Open-Meteo answered by scripts/openMeteoFake.mjs (429 to every direct ask in the refused look, the forecast cache answering), every other outside host 503.`,
    '',
    `| look | requests | ${hosts.join(' | ')} | billed calls | in the first second | wave models |`,
    `|---|---|${hosts.map(() => '---|').join('')}---|---|---|`,
    ...PHASES.map(([p, words]) => `| ${words} | ${count(p)} | ${hosts.map((h) => count(p, h)).join(' | ')} | ${weight(p)} | ${burst(p)} | ${models(p)} |`),
    '',
    `Bigger-swell log (scoutngo.swellWatch.v1) after the idle look: ${afterIdle}; after the cold reopen: ${afterCold}.`,
    '',
    'Every request, in order:',
    '',
    ...log.map((r) => `- ${r.phase} · ${shape(r.href)}`),
    '',
    `Other hosts answered 503 (not counted): ${[...others].map(([h, n]) => `${h} ${n}`).join(', ') || 'none'}`,
    '',
  ]
} finally {
  await browser.close()
  stop()
}
mkdirSync('measurements', { recursive: true })
if (!existsSync(OUT)) writeFileSync(OUT, `# Open-Meteo calls per app open (Batch SIMPLE-1, Section 4b)\n\nWritten by scripts/measure-openmeteo-calls.mjs; each section is one run.\n\n`)
appendFileSync(OUT, lines.join('\n') + '\n')
console.log(lines.join('\n'))
console.log(`wrote ${OUT}`)
