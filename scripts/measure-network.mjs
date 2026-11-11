/*
 * NETWORK, OFFLINE AND SPEED (Batch QA, Section 5).
 *
 * Usage:  node scripts/measure-network.mjs <dist> [--map-min 10] [--out measurements/<file>.md]
 * Serves <dist> with the gate's own server and fixture proxy (scripts/gate/
 * server.mjs): nothing live. Chromium as a Pixel 7, 412 x 915, the VB pier
 * saved, the page clock 2 Nov 2026 10:30 AM EST, inside the fixtures' week.
 *
 *   conditions   good Wi-Fi; slow 3G (400 ms, 400 kb/s down, 400 up); a
 *                connection that drops every 20 s; Open-Meteo refusing
 *                (429); NDBC down; LibreWXR down; offline after one good
 *                load. On each, the home, the Surf, Wind, Tide, Weather and
 *                Sky pages and the map: blank (under 40 characters of text),
 *                a status line said ("retrying", "didn't load", "offline",
 *                "Updated", "ago", "not answered"), or still reading after
 *                15 s ("Reading", "Asking", "…" alone).
 *   counts       requests per app open, and per page opened after it
 *   load         (Batch Beach, Section 4) the home's first useful paint on
 *                slow 3G cold (nothing cached), and the JavaScript fetched
 *                before it, gzipped; --only-load runs only the counts, the
 *                paints and the size
 *   paint        the home's first useful paint on slow 3G with the forecast
 *                cached (a second open): the temperature drawn as a number
 *   size         the built app: every file, and the JavaScript gzipped
 *   memory       the JS heap after --map-min minutes of panning the map
 *
 * Writes the file named by --out (default measurements/<today>-network.md),
 * with the run's parameters.
 */
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium, devices } from './gate/playwright.mjs'
import { findChrome } from './preflight.mjs'

const args = process.argv.slice(2)
const DIST = args[0]
if (!DIST) throw new Error('usage: node scripts/measure-network.mjs <dist> [--map-min 10] [--out file]')
const opt = (name, dflt) => {
  const i = args.indexOf(name)
  return i < 0 ? dflt : args[i + 1]
}
const MAP_MIN = Number(opt('--map-min', '10'))
const ONLY_LOAD = args.includes('--only-load')
const OUT = opt('--out', `measurements/${new Date().toISOString().slice(0, 10)}-network.md`)
const PORT = 5206
const NOW = new Date('2026-11-02T15:30:00Z')
const SPOT = { at: { lat: 36.8435575, lon: -75.9713104 }, name: { key: 'x', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }

const server = spawn(process.execPath, ['scripts/gate/server.mjs'], { env: { ...process.env, SCOUTNGO_GATE_GZIP: '1', SCOUTNGO_GATE_DIST: DIST, SCOUTNGO_GATE_APP_PORT: String(PORT), SCOUTNGO_GATE_PROXY_PORT: String(PORT + 1) }, stdio: 'ignore' })
await new Promise((r) => setTimeout(r, 2500))
const APP = `http://127.0.0.1:${PORT}`
const browser = await chromium.launch({ executablePath: findChrome(), proxy: { server: `http://127.0.0.1:${PORT + 1}`, bypass: '127.0.0.1' } })
const L = []
const say = (s) => {
  console.log(s)
  L.push(s)
}

const fresh = async () => {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, serviceWorkers: 'allow' })
  await ctx.addInitScript((spot) => {
    try {
      /*
       * Batch Beach, Section 4: a phone's open, the home first. Under automation
       * the app opens the setup map instead (src/lib/briefingOpen.ts, webdriver),
       * which is what 2026-11-10-network.md counted as "one app open": the setup
       * screen's imagery, not the home's. As scripts/measure-cellular.mjs does.
       */
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
      localStorage.setItem('scoutngo.landing.v1', 'true')
      localStorage.setItem('scoutngo.nearMe.v1', 'off')
      if (!localStorage.getItem('scoutngo.lastSetup.v1')) localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify(spot))
    } catch {
      /* about:blank */
    }
  }, SPOT)
  const page = await ctx.newPage()
  await page.clock.install({ time: NOW })
  await page.clock.resume()
  const reqs = []
  page.on('request', (r) => reqs.push(r.url()))
  return { ctx, page, reqs, wait: (ms) => page.waitForTimeout(ms) }
}

/* What a screen says: blank, a status line, still reading. */
const STATUS = /retrying|didn.t load|offline|Updated|ago\b|not answered|did not say|no forecast|limit reached/i
const READING = /Reading|Asking|^…$/
const judge = async (page, root) =>
  page.evaluate(([root, statusSrc, readingSrc]) => {
    const r = document.querySelector(root) ?? document.body
    const text = (r.innerText ?? '').trim()
    const els = [...r.querySelectorAll('*')].map((e) => (e.childNodes.length === 1 && e.firstChild?.nodeType === 3 ? (e.textContent ?? '').trim() : '')).filter(Boolean)
    return { chars: text.length, status: new RegExp(statusSrc, 'i').test(text), reading: els.some((t) => new RegExp(readingSrc).test(t)) }
  }, [root, STATUS.source, READING.source])

const SCREENS = [
  ['home', async (p, w) => { await p.goto(`${APP}/`, { waitUntil: 'commit', timeout: 60_000 }); await w(9000) }, '.home'],
  ['surf', async (p, w) => { await p.locator('.home__page[aria-label="Today"] .hcard--surf').first().click({ timeout: 5000, noWaitAfter: true }).catch(() => {}); await w(15000) }, '.dpage--surf'],
  ['tide', async (p, w) => { await p.locator('.dpage__tab:has-text("Tide")').first().click({ timeout: 5000, noWaitAfter: true }).catch(() => {}); await w(15000) }, '.dpage--tide'],
  ['wind', async (p, w) => { await p.locator('.dpage__tab:has-text("Wind")').first().click({ timeout: 5000, noWaitAfter: true }).catch(() => {}); await w(15000) }, '.dpage--wind'],
  ['weather', async (p, w) => { await p.goto(`${APP}/`, { waitUntil: 'commit', timeout: 60_000 }); await w(6000); await p.locator('.home .hwx__temp').first().click({ timeout: 5000, noWaitAfter: true }).catch(() => {}); await w(15000) }, '.wpage'],
  ['sky', async (p, w) => { await p.goto(`${APP}/`, { waitUntil: 'commit', timeout: 60_000 }); await w(6000); await p.locator('.home__page[aria-label="Today"] .hcard--sky').first().click({ timeout: 5000, noWaitAfter: true }).catch(() => {}); await w(15000) }, '.spage'],
  ['map', async (p, w) => { await p.goto(`${APP}/`, { waitUntil: 'commit', timeout: 60_000 }); await w(6000); await p.locator('.home .hbtn--round[aria-label="Open the map"]').first().click({ timeout: 5000, noWaitAfter: true }).catch(() => {}); await w(15000) }, '.mode-plan'],
]

/* A load into a dropped connection fails as it would on a phone: noted, never a crash. */
const safely = (f) => async (p, w) => {
  try {
    await f(p, w)
  } catch (e) {
    console.log(`  (a page load failed: ${String(e).split('\n')[0].slice(0, 80)})`)
  }
}
const walk = async (name, setup) => {
  const s = await fresh()
  const t0 = Date.now()
  /* One good load first, for the conditions that need a cache. */
  if (setup.warm) {
    await s.page.goto(`${APP}/`, { waitUntil: 'commit', timeout: 60_000 })
    await s.wait(10000)
  }
  await setup.before?.(s)
  const rows = []
  for (const [screen, go, root] of SCREENS) {
    await safely(go)(s.page, s.wait)
    const j = await judge(s.page, root).catch(() => ({ chars: 0, status: false, reading: false }))
    rows.push({ screen, ...j })
  }
  await setup.after?.(s)
  const took = Math.round((Date.now() - t0) / 1000)
  await s.ctx.close()
  void took
  const bad = rows.filter((r) => r.chars < 40 || r.reading)
  say(`| ${name} | ${rows.map((r) => `${r.screen} ${r.chars < 40 ? 'BLANK' : r.reading ? 'STILL READING' : r.status ? 'said its state' : 'values'}`).join(' · ')} | ${bad.length === 0 ? 'ok' : `${bad.length} not ok`} |`)
  return bad.length
}

const cdpThrottle = async (s, on) => {
  const c = await s.ctx.newCDPSession(s.page)
  await c.send('Network.enable')
  await c.send('Network.emulateNetworkConditions', on ? { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 } : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
}

say(`# Network, offline and speed`)
say('')
say(`Run ${new Date().toISOString()} · \`node scripts/measure-network.mjs ${DIST} --map-min ${MAP_MIN}${ONLY_LOAD ? ' --only-load' : ''}\` · Chromium (Pixel 7) 412 x 915 · the VB pier saved · page clock ${NOW.toISOString()} · the gate's server and fixture proxy (scripts/gate/server.mjs), the app's files gzipped as the host sends them (SCOUTNGO_GATE_GZIP), nothing live.`)
say('')
const ONLY_MEMORY = args.includes('--only-memory')
if (!ONLY_MEMORY) {
if (!ONLY_LOAD) {
say('## Every page under each condition')
say('')
say('BLANK: under 40 characters of text. STILL READING: a "Reading…" or a lone "…" after 15 s. "said its state": a status line (retrying, didn\'t load, offline, updated, ago).')
say('')
say('| condition | screens | result |')
say('|---|---|---|')
let notOk = 0
notOk += await walk('good Wi-Fi', {})
notOk += await walk('slow 3G', { before: (s) => cdpThrottle(s, true) })
notOk += await walk('drops every 20 s', {
  before: (s) => {
    let off = false
    s.timer = setInterval(() => {
      off = !off
      void s.ctx.setOffline(off).catch(() => {})
    }, 20_000)
  },
  after: (s) => clearInterval(s.timer),
})
notOk += await walk('Open-Meteo 429', { before: (s) => s.ctx.route(/open-meteo|\/api\/forecast/, (r) => r.fulfill({ status: 429, body: 'Too many requests' })) })
notOk += await walk('NDBC down', { before: (s) => s.ctx.route(/ndbc\.noaa\.gov|\/api\/buoy/, (r) => r.fulfill({ status: 503, body: 'down' })) })
notOk += await walk('LibreWXR down', { before: (s) => s.ctx.route(/librewxr/, (r) => r.fulfill({ status: 503, body: 'down' })) })
notOk += await walk('offline after one good load', { warm: true, before: (s) => s.ctx.setOffline(true) })
say('')
say(`${notOk} screen(s) blank or still reading across the conditions.`)
}

/* Requests per open and per page. */
say('')
say('## Requests')
say('')
{
  const s = await fresh()
  await s.page.goto(`${APP}/`)
  await s.wait(10000)
  const open = s.reqs.filter((u) => !u.startsWith(`${APP}/assets`) && !u.startsWith(`${APP}/home/`)).length
  say(`- one app open (the home): ${open} requests that are not the app's own files (${s.reqs.length} in all)`)
  for (const [screen, go] of SCREENS.slice(1)) {
    const n0 = s.reqs.length
    await go(s.page, s.wait)
    say(`- ${screen}: ${s.reqs.slice(n0).filter((u) => !u.startsWith(`${APP}/assets`)).length} more`)
  }
  await s.ctx.close()
}

/* Batch Beach, Section 4: the first useful paint on slow 3G, cold, and the JavaScript asked for before it. */
const tempDrawn = (page) => page.evaluate(() => /\d+°/.test(document.querySelector('.home .hwx__temp')?.textContent ?? '')).catch(() => false)
say('')
say('## The home on slow 3G, cold (nothing cached)')
say('')
{
  const s = await fresh()
  await cdpThrottle(s, true)
  const js = []
  s.page.on('request', (r) => {
    const u = r.url()
    if (u.startsWith(`${APP}/`) && u.endsWith('.js')) js.push(u)
  })
  const t0 = Date.now()
  await s.page.goto(`${APP}/`, { waitUntil: 'commit', timeout: 90_000 }).catch(() => {})
  let ms = null
  for (let i = 0; i < 600; i += 1) {
    if (await tempDrawn(s.page)) {
      ms = Date.now() - t0
      break
    }
    await s.wait(100)
  }
  const before = [...new Set(js)]
  const gz = before.reduce((a, u) => {
    try {
      return a + gzipSync(readFileSync(join(DIST, new URL(u).pathname))).length
    } catch {
      return a
    }
  }, 0)
  say(`- the temperature drawn as a number: ${ms === null ? 'not within 60 s' : `${(ms / 1000).toFixed(1)} s`} after the open (target under 8 s)`)
  say(`- JavaScript asked for before it: ${before.length} files, ${(gz / 1000).toFixed(0)} KB gzipped (target under 250 KB)`)
  await s.ctx.close()
}

/* First useful paint on slow 3G, forecast cached. */
say('')
say('## The home on slow 3G, the forecast cached')
say('')
{
  const s = await fresh()
  await s.page.goto(`${APP}/`)
  await s.wait(10000)
  await cdpThrottle(s, true)
  const t0 = Date.now()
  await s.page.goto(`${APP}/`, { waitUntil: 'commit' })
  let ms = null
  for (let i = 0; i < 300; i += 1) {
    if (await s.page.evaluate(() => /\d+°/.test(document.querySelector('.home .hwx__temp')?.textContent ?? '')).catch(() => false)) {
      ms = Date.now() - t0
      break
    }
    await s.wait(100)
  }
  say(`- the temperature drawn as a number: ${ms === null ? 'not within 30 s' : `${(ms / 1000).toFixed(1)} s`} after the open (target under 3 s)`)
  await s.ctx.close()
}

/* The app's size. */
say('')
say('## Size')
say('')
{
  const files = []
  const walkDir = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f)
      if (statSync(p).isDirectory()) walkDir(p)
      else files.push(p)
    }
  }
  walkDir(DIST)
  const total = files.reduce((a, f) => a + statSync(f).size, 0)
  const js = files.filter((f) => f.endsWith('.js'))
  const jsRaw = js.reduce((a, f) => a + statSync(f).size, 0)
  const jsGz = js.reduce((a, f) => a + gzipSync(readFileSync(f)).length, 0)
  say(`- the built app: ${(total / 1e6).toFixed(1)} MB in ${files.length} files; JavaScript ${(jsRaw / 1e6).toFixed(2)} MB, ${(jsGz / 1e6).toFixed(2)} MB gzipped, in ${js.length} files`)
}

}

if (!ONLY_LOAD) {
/* Memory after the map in use. */
say('')
say('## Memory')
say('')
{
  const s = await fresh()
  await s.page.goto(`${APP}/`)
  await s.wait(8000)
  await s.page.locator('.home .hbtn--round[aria-label="Open the map"]').first().click({ timeout: 5000, noWaitAfter: true }).catch(() => {})
  await s.wait(5000)
  /* The heap from the browser itself (CDP Runtime.getHeapUsage): performance.memory reads 0 in this Chrome. */
  const cdp = await s.ctx.newCDPSession(s.page)
  const heap = async () => (await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6
  const start = await heap()
  const end = Date.now() + MAP_MIN * 60_000
  let step = 0
  while (Date.now() < end) {
    const x = 206 + Math.round(Math.sin(step) * 120)
    const y = 360 + Math.round(Math.cos(step) * 140)
    await s.page.mouse.move(206, 360)
    await s.page.mouse.down()
    await s.page.mouse.move(x, y, { steps: 8 })
    await s.page.mouse.up()
    await s.wait(1500)
    step += 1
  }
  const after = await heap()
  say(`- the JS heap: ${start.toFixed(0)} MB on the map, ${after.toFixed(0)} MB after ${MAP_MIN} min of panning (${step} drags)`)
  await s.ctx.close()
}
}

await browser.close()
server.kill()
writeFileSync(OUT, `${L.join('\n')}\n`)
console.log(`wrote ${OUT}`)
process.exit(0)
