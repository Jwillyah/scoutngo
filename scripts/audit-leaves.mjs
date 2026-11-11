/*
 * WHAT LEAVES THE PHONE, FROM A CAPTURE (Batch QA, Section 6), IN WEBKIT.
 *
 * Usage:  node scripts/audit-leaves.mjs [screenshot-dir]
 *
 * Walks the app the way a person does at the Virginia Beach pier (the home,
 * every page, the menu, the map's weather layers, the Sky page and Color
 * detail, 3D) and records every request the page makes. Then, from the
 * capture and not from the code:
 *
 *   hosts     every host asked, through this app's own /api/ proxies too
 *             (the host they forward to), each in src/lib/hosts.ts, the
 *             list the Privacy page shows: a host not on it fails
 *   points    every coordinate in a query or a path at most 2 decimals
 *             (about a kilometre), as the Privacy page says; map tiles are
 *             cells (z/x/y), never a point
 *   referrer  no request outside this app carries a Referer with a path, a
 *             query or a hash (a shared plan's link holds the venue)
 *   the user  no request carries anything from this phone's storage
 *             (a kit, a spot name) or a cookie
 *
 * It prints, per host, the path shapes and the parameters it received:
 * the Privacy page's "What leaves your phone" is checked against it.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, goToStage, guardAudit, startWatchdog, APP_ORIGIN, openMenu } from './preflight.mjs'

/* Batch Polish, Section 2: the menu is the home's (and setup's and field's); on the map its Back goes home first (scripts/preflight.mjs openMenu). */
const menuOn = (pg) => openMenu((x) => pg.evaluate(x), (ms) => pg.waitForTimeout(ms))
import { shareLink } from '../src/lib/planShare.ts'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { placeKey } from '../src/core/venueName.ts'
import { HOSTS } from '../src/lib/hosts.ts'

guardAudit('leaves')
const watchdog = startWatchdog('leaves', 600_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'leaves')
mkdirSync(OUT, { recursive: true })

let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}

/* A spot name no request may carry, and a point with more decimals than any request may. */
const SECRET_NAME = 'Leaves Check Point'
const PIER = { lat: 36.8435575, lon: -75.9713104 }
await ensureApp()
const venue = { ...CALIBRATION_VENUE, name: { key: placeKey(String(PIER.lat), String(PIER.lon)), name: SECRET_NAME }, latitude: String(PIER.lat), longitude: String(PIER.lon), date: '2026-11-02', startTime: '09:00', endTime: '11:00' }
const url = await shareLink(`${APP_ORIGIN}/`, { id: 'leaves', name: SECRET_NAME, savedAt: '2026-10-29T00:00:00Z', venue, kit: { bodyIds: [], lensIds: [], droneIds: ['dji-air-3s'], styleNotes: '' }, positions: [] })

const asked = []
const browser = await webkit.launch()
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('scoutngo.landing.v1', 'true')
    } catch {
      /* about:blank */
    }
  })
  const page = await ctx.newPage()
  page.on('request', (r) => asked.push({ url: r.url(), headers: r.headers() }))
  await page.clock.setFixedTime(new Date('2026-11-02T20:30:00Z'))
  const wait = (ms) => page.waitForTimeout(ms)
  const ev = (x) => page.evaluate(x)
  const tap = (sel, ms = 2500) => page.locator(sel).first().click({ timeout: 5000, noWaitAfter: true }).then(() => wait(ms), () => console.log(`  (no ${sel})`))
  await page.goto(url)
    /* The shared plan's own question first: other screens wait under it. */
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await wait(4000)
  await goToStage(ev, wait, 'plan')
  await wait(2500)
  watchdog.note('the map')
  await menuOn(page)
  await tap('.mcard--today', 4000)
  for (const card of ['surf', 'wind', 'tide']) {
    await tap(`.home__page[aria-label="Today"] .hcard--${card}`, 4000)
    if (card === 'surf') await tap('.dpage__tab:has-text("Buoys")', 4000)
    await tap('.dpage__back:visible', 1500)
  }
  await tap('.home__page[aria-label="Today"] .hcard--sky', 4000)
  await tap('button:has-text("Color detail")', 5000)
  watchdog.note('sky')
  await page.goto(url)
    /* The shared plan's own question first: other screens wait under it. */
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await wait(3000)
  await goToStage(ev, wait, 'plan')
  await menuOn(page)
  await tap('nav[aria-label="Stage"] .mcard--weather', 4000)
  await page.goto(url)
    /* The shared plan's own question first: other screens wait under it. */
    await page.getByRole('button', { name: /^open$/i }).click({ timeout: 4000 }).catch(() => {})
  await wait(3000)
  await goToStage(ev, wait, 'plan')
  await tap('button[aria-label="Features"]', 2000)
  for (const w of ['radar', 'wind', 'clouds']) await tap(`[data-weather="${w}"]`, 4000)
  await tap('.sheet .card2__x', 1500)
  await tap('button[aria-label="Open the 3D clay model"]', 12000)
  watchdog.note('3d')
  await ctx.close()
} finally {
  await browser.close()
}

/* ------------------------------------------------------------- the capture */
const app = new URL(APP_ORIGIN)
const known = new Set(HOSTS.map((h) => h.host))
const byHost = new Map()
const coord = /-?\d{1,3}\.\d+/g
for (const a of asked) {
  const u = new URL(a.url)
  if (u.protocol === 'data:' || u.protocol === 'blob:') continue
  /* This app's own proxies forward to a host named in the request (api/forecast?om=api.open-meteo.com/..). */
  const own = u.host === app.host
  if (own && !u.pathname.startsWith('/api/')) continue
  const om = u.searchParams.get('om')
  const host = own ? (om?.split('/')[0] ?? `${app.host}${u.pathname}`) : u.host
  const rec = byHost.get(host) ?? { n: 0, paths: new Set(), params: new Map() }
  rec.n += 1
  rec.paths.add((own ? u.pathname : u.pathname).replace(/\/\d+(?=\/|\.|$)/g, '/{n}').replace(/-?\d+\.\d+,-?\d+\.\d+/g, '{lat},{lon}'))
  for (const [k, v] of u.searchParams) if (k !== 'om') rec.params.set(k, rec.params.get(k) ?? v.slice(0, 60))
  byHost.set(host, rec)
  /* Points: every decimal number in the query and the path (tiles are integers: z/x/y). */
  const text = `${decodeURIComponent(u.pathname)}?${decodeURIComponent(u.search)}`.replace(/(start|end)_date=[^&]*/g, '').replace(/\b\d{4}-\d{2}-\d{2}T?[\d:.]*Z?/g, '')
  for (const m of text.matchAll(coord)) {
    const [, dec] = m[0].split('.')
    if (dec.length > 2 && Math.abs(Number(m[0])) <= 180 && /lat|lon|point|bbox|center|^\/points|latitude|longitude|,/.test(text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 2))) fail(`${host}: a point to ${dec.length} decimals: ${m[0]} in ${a.url.slice(0, 140)}`)
  }
  if (!own) {
    const ref = a.headers.referer ?? a.headers.referrer ?? null
    if (ref !== null && ref !== '') {
      const r = new URL(ref)
      if (r.hash !== '' || r.search !== '' || (r.pathname !== '/' && r.pathname !== '')) fail(`${host}: the Referer carries ${ref.slice(0, 80)}`)
    }
    if ((a.headers.cookie ?? '') !== '') fail(`${host}: a cookie went with the request`)
  }
  if (a.url.includes(encodeURIComponent(SECRET_NAME)) || a.url.includes(SECRET_NAME) || a.url.includes('dji-air-3s')) fail(`${host}: the spot's name or the kit left the phone: ${a.url.slice(0, 140)}`)
}
console.log(`\n### ${asked.length} requests; ${byHost.size} hosts outside the page`)
for (const [host, rec] of [...byHost.entries()].sort()) {
  const listed = known.has(host) || host.startsWith(`${app.host}/`)
  console.log(`  ${listed ? 'listed  ' : 'UNLISTED'} ${host} · ${rec.n} · paths ${[...rec.paths].slice(0, 3).join(' ')} · params ${[...rec.params.entries()].map(([k, v]) => `${k}=${v}`).join(' ').slice(0, 220)}`)
  if (!listed) fail(`${host} was asked and is not on the Privacy page's list (src/lib/hosts.ts)`)
}
/* A walk that never left the map sees tiles only: the forecast must have been asked, or nothing was looked at. */
if (![...byHost.keys()].some((h) => /open-meteo/.test(h))) fail('no forecast request was captured: the walk did not reach the home and its pages')
if (byHost.size === 0) {
  console.log('=== LEAVES AUDIT ABORTED: nothing was captured ===')
  process.exit(2)
}
watchdog.stop()
console.log(`\n=== LEAVES PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
