/*
 * "FAILS ON CELLULAR DATA" (Batch M, Section 1): what one app open asks
 * Open-Meteo, and what the home shows when the phone's address is refused
 * or the link is slow. Run on two builds, before and after.
 *
 * Usage:  node scripts/measure-cellular.mjs <label> <dist> [<label> <dist> ...]
 * Writes: measurements/<today>-cellular.md
 *
 * Each build on the gate's server behind its fixture proxy (nothing live),
 * Chromium as a Pixel 7 at 412 x 915, the Virginia Beach pier saved as the
 * spot, a bare launch (the home opens by itself; navigator.webdriver is
 * hidden, as on a phone), page clock 2026-11-08 8:30 AM EST.
 *
 *   open      every request until 8 s pass with none; Open-Meteo's ones counted,
 *             directly or through the app's forecast cache (api/forecast.ts),
 *             and weighed as Open-Meteo bills them (requestShape)
 *   shared    Open-Meteo itself answers every request 429 (its minutely
 *             limit), as it does to a phone behind a carrier address other
 *             phones have used up; the forecast cache is not refused (the
 *             CDN's copy, or its own address). Counted: the home's dashes.
 *   second    an open, then the same phone 2 hours later on a link with 3 s
 *             of latency: how long until the home shows a wind number.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'
import { findChrome } from './preflight.mjs'
import { requestShape, unwrapForecast } from './openMeteoFake.mjs'

const pairs = []
for (let i = 2; i + 1 < process.argv.length; i += 2) pairs.push([process.argv[i], process.argv[i + 1]])
if (pairs.length === 0) {
  console.log('usage: node scripts/measure-cellular.mjs <label> <dist> [<label> <dist> ...]')
  process.exit(1)
}
const NOW = new Date('2026-11-08T13:30:00Z')
const SPOT = { at: { lat: 36.8435575, lon: -75.9713104 }, name: { key: 'x', name: 'Virginia Beach Fishing Pier' }, shootKind: 'sunset', platform: 'both', reachMeters: 2000 }
const isOm = (href) => /open-meteo\.com\//.test(href) || /\/api\/forecast\?om=/.test(href)
const PORT = 5196

async function run(dist, mode) {
  const server = spawn(process.execPath, ['scripts/gate/server.mjs'], { env: { ...process.env, SCOUTNGO_GATE_DIST: dist, SCOUTNGO_GATE_APP_PORT: String(PORT), SCOUTNGO_GATE_PROXY_PORT: String(PORT + 1) }, stdio: 'ignore' })
  /* The server this run started, not one left over on the port (8 Nov: a stale one served the old build to both). */
  let exited = false
  server.on('exit', () => (exited = true))
  await new Promise((r) => setTimeout(r, 2500))
  if (exited) throw new Error(`the gate server for ${dist} did not start: is port ${PORT} taken?`)
  const APP = `http://127.0.0.1:${PORT}`
  const browser = await chromium.launch({ executablePath: findChrome(), proxy: { server: `http://127.0.0.1:${PORT + 1}`, bypass: '127.0.0.1' } })
  try {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 412, height: 915 }, ignoreHTTPSErrors: true, serviceWorkers: 'block' })
    await ctx.addInitScript((spot) => {
      try {
        localStorage.setItem('scoutngo.landing.v1', 'true')
        localStorage.setItem('scoutngo.nearMe.v1', 'off')
        localStorage.setItem('scoutngo.lastSetup.v1', JSON.stringify(spot))
      } catch {
        /* about:blank */
      }
      Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false })
    }, SPOT)
    if (mode === 'shared') {
      await ctx.route(/^https:\/\/[a-z-]*api\.open-meteo\.com\//, (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":true,"reason":"Minutely API request limit exceeded. Please try again in one minute."}' }))
    }
    const log = []
    let page = await ctx.newPage()
    const watch = (p) => p.on('requestfinished', async (rq) => {
      if (!isOm(rq.url())) return
      const rs = await rq.response()
      log.push({ href: rq.url(), status: rs?.status() ?? 0 })
    })
    watch(page)
    await page.clock.install({ time: NOW })
    await page.clock.resume()
    await page.goto(`${APP}/`)
    for (let quiet = 0, i = 0; quiet < 8 && i < 90; i += 1) {
      const n = log.length
      await page.waitForTimeout(1000)
      quiet = log.length === n ? quiet + 1 : 0
    }
    const text = await page.evaluate(() => document.querySelector('.brief, .home')?.innerText ?? '')
    if (mode !== 'second') return { log, text }
    /* Two hours on, a slow link: how long until a wind number is on the home. */
    await page.close()
    page = await ctx.newPage()
    await page.clock.install({ time: new Date(NOW.getTime() + 2 * 3_600_000) })
    await page.clock.resume()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 3000, downloadThroughput: 50_000, uploadThroughput: 20_000 })
    await page.goto(`${APP}/`, { timeout: 120_000, waitUntil: 'domcontentloaded' })
    /* From the page loaded, not from the tap: the document itself takes the latency. */
    const t0 = Date.now()
    let ms = null
    for (let i = 0; i < 240; i += 1) {
      const has = await page.evaluate(() => /\d+\s*(kt|mph|km\/h|m\/s)/.test(document.querySelector('.brief, .home')?.innerText ?? '')).catch(() => false)
      if (has) {
        ms = Date.now() - t0
        break
      }
      await page.waitForTimeout(250)
    }
    await page.waitForTimeout(1500)
    const early = await page.evaluate(() => document.querySelector('.brief, .home')?.innerText ?? '').catch(() => '')
    const line = await page.evaluate(() => (document.querySelector('.brief, .home')?.innerText ?? '').split('\n').find((l) => /refreshing|Checked|Updated/.test(l)) ?? null).catch(() => null)
    return { log, text, ms, line, early }
  } finally {
    await browser.close()
    server.kill()
    await new Promise((r) => (exited ? r() : server.on('exit', r)))
  }
}

const out = [
  '# Cellular: what one open asks Open-Meteo, and what the home shows when refused',
  '',
  `Run ${new Date().toISOString()} · node scripts/measure-cellular.mjs ${pairs.map((p) => p.join(' ')).join(' ')} · Chromium (Pixel 7) 412 x 915 · VB pier saved, bare launch, page clock ${NOW.toISOString()} · the gate's fixtures, nothing live.`,
  '',
  'Weight is what Open-Meteo bills (scripts/openMeteoFake.mjs requestShape; the live service’s X-RateLimit-Cost header said the same 14.4 for an 8-point colour path, checked by hand with curl on 8 Nov). Free tier: 600 a minute, 5,000 an hour, 10,000 a day, per IP address.',
  '',
]
for (const [label, dist] of pairs) {
  const open = await run(dist, 'open')
  const shared = await run(dist, 'shared')
  const second = await run(dist, 'second')
  const shapes = open.log.map((l) => ({ ...requestShape(l.href), via: /\/api\/forecast\?/.test(l.href) ? 'cache' : 'direct', status: l.status, inner: unwrapForecast(l.href) }))
  const weight = shapes.reduce((a, s) => a + s.weight, 0)
  const byKind = {}
  for (const s of shapes) {
    const k = `${s.host.split('.')[0]} · ${s.points} point${s.points === 1 ? '' : 's'} · ${s.vars.slice(0, 3).join(',')}${s.vars.length > 3 ? '…' : ''}${s.models.length ? ` · ${s.models.length} models` : ''}`
    byKind[k] = byKind[k] ?? { n: 0, w: 0, via: s.via }
    byKind[k].n += 1
    byKind[k].w += s.weight
  }
  const dashes = (t) => (t.match(/(^|\s)—(\s|$)/gm) ?? []).length
  out.push(`## ${label} (${dist})`, '', `- one open: ${shapes.length} Open-Meteo requests, weight ${weight.toFixed(1)}, ${shapes.filter((s) => s.via === 'cache').length} through the forecast cache, ${shapes.filter((s) => s.via === 'direct').length} direct`)
  out.push(`- Open-Meteo refusing the phone's address (429): the home showed ${dashes(shared.text)} dashes (${dashes(open.text)} when answered); ${shared.log.filter((l) => l.status === 429).length} requests refused`)
  out.push(`- second open, 2 h later, 3 s latency: a wind number on the home ${second.ms === null ? 'never (in 60 s)' : `${(second.ms / 1000).toFixed(1)} s after the page loaded`}; ${dashes(second.early)} dashes 1.5 s after that; its status line: ${JSON.stringify(second.line)}`)
  out.push('', '| request | count | weight | via |', '|---|---|---|---|')
  for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1].w - a[1].w)) out.push(`| ${k} | ${v.n} | ${v.w.toFixed(1)} | ${v.via} |`)
  out.push('')
  console.log(label, shapes.length, weight.toFixed(1), dashes(shared.text), second.ms)
}
mkdirSync('measurements', { recursive: true })
const file = `measurements/${new Date().toISOString().slice(0, 10)}-cellular.md`
writeFileSync(file, out.join('\n'))
console.log(`wrote ${file}`)
process.exit(0)
