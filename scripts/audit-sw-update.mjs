/*
 * THE SERVICE WORKER AUDIT: COLD LAUNCH WITH NO SIGNAL, AND A NEW DEPLOY ADOPTED.
 *
 * Usage:  node scripts/audit-sw-update.mjs
 * Exits:  0 when every step below holds, 1 on a problem found, 2 when it
 *         could not look.
 *
 * WHY THIS EXISTS. The app kept no service worker for one reason: a worker is
 * a cache in front of the code, and the classic failure is a phone on an old
 * bundle forever (docs/deploys.md). One was added so a cold launch on a ridge
 * opens the app. The condition for accepting it was proof that a new deploy
 * is still adopted, so this is that proof, run against real builds in a real
 * browser rather than argued:
 *
 *   1  build A is served; a visit installs the worker and caches the shell
 *   2  the server goes away; a COLD launch (new tab) opens build A
 *   3  the server hangs instead; a cold launch still opens A, inside the timeout
 *   4  build B is deployed; the build check's no-store fetch of `/` from the
 *      offline-launched A page reaches the network and sees B -- the worker
 *      does not answer it from the cache
 *   5  a cold launch with signal opens B: document AND bundle are B's
 *   6  the new worker takes over and drops A's hashed files
 *   7  the server goes away again; a cold launch opens B, not A
 *
 * AND THEN THE HOME-SCREEN APP, IN WEBKIT (29 Oct: the pinch fix worked in a
 * Safari private tab and not from the icon), as a browser tab and with the
 * standalone insets, 47 top and 34 bottom:
 *
 *   W1 build A, a saved spot planted, the worker installed; the page touched
 *   W2 B deployed, and the app comes back to the front with no signal yet:
 *      the first check fails (no pill yet, which is the precondition), the
 *      signal returns, and the retry finds B -- "New version ready · Reload"
 *      appears, and the page did NOT reload on its own
 *   W3 Reload lands on B, and every scoutngo key in localStorage is as it was
 *   W4 a relaunch on a slow signal: the worker gives the saved document after
 *      its timeout, the page is touched, the check answers late: the pill,
 *      not a reload; Reload, with signal, lands on the deployed build
 *
 * SHAPE C GUARDS. Every assertion names the build it saw, read two ways: the
 * document's scoutngo-build meta and the hashed entry script the page actually
 * loaded, checked against what each build wrote. A page that rendered nothing
 * fails rather than passing on an empty root.
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, extname } from 'node:path'
import { webkit, devices } from 'playwright'
import { CALIBRATION_VENUE } from '../src/lib/venue.ts'
import { COLD_LOAD_MS } from '../src/lib/adoptBuild.ts'
import { tmpdir } from 'node:os'
import { ensureBrowser, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('service worker')
const watchdog = startWatchdog('service worker', 900_000)

let problems = 0
const problem = (line) => {
  console.log(`      PROBLEM: ${line}`)
  problems += 1
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------- two builds */

const root = mkdtempSync(join(tmpdir(), 'scoutngo-sw-'))
const BUILDS = { A: 'aaaaaaa', B: 'bbbbbbb' }
const entryOf = {}
for (const [name, id] of Object.entries(BUILDS)) {
  const out = join(root, name)
  execSync(`npx vite build --outDir ${out} --emptyOutDir`, {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, VERCEL_GIT_COMMIT_SHA: `${id}000000` },
  })
  const html = readFileSync(join(out, 'index.html'), 'utf8')
  const entry = /<script type="module"[^>]*src="(\/assets\/[^"]+\.js)"/.exec(html)?.[1]
  if (!html.includes(`content="${id}"`) || entry === undefined || !existsSync(join(out, 'sw.js'))) {
    console.log(`=== SERVICE WORKER AUDIT ABORTED: build ${name} did not produce a stamped document, an entry and sw.js ===`)
    process.exit(2)
  }
  entryOf[name] = entry
  console.log(`  build ${name}: id ${id}, entry ${entry}`)
}
if (entryOf.A === entryOf.B) {
  console.log('=== SERVICE WORKER AUDIT ABORTED: both builds have the same entry, so they cannot be told apart ===')
  process.exit(2)
}
watchdog.note('built A and B')

/* ----------------------------------------- a server with vercel.json's rules */

const PORT = 5199
const ORIGIN = `http://127.0.0.1:${PORT}`
let serving = 'A'
let mode = 'up' // up | down | hang
/* Extra wait on every document request: a slow signal, not a dead one. */
let docDelay = 0
/* Requests held in hang mode, dropped the moment the signal "comes back". */
const held = new Set()
const setMode = (next) => {
  if (mode === 'hang' && next !== 'hang') {
    for (const socket of held) socket.destroy()
    held.clear()
  }
  mode = next
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }
const server = createServer((req, res) => {
  if (mode === 'hang') {
    /* Never answered: a mountain with the radio on. */
    held.add(req.socket)
    return
  }
  if (mode === 'down') {
    req.socket.destroy()
    return
  }
  const path = new URL(req.url, ORIGIN).pathname
  const dir = join(root, serving)
  let file = join(dir, path)
  if (path === '/' || path === '/how' || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(dir, 'index.html')
  }
  /* The caching contract from vercel.json, which the worker has to live with. */
  const cache = path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
  const answer = () => {
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': cache })
    res.end(readFileSync(file))
  }
  if (file.endsWith('index.html') && docDelay > 0) setTimeout(answer, docDelay)
  else answer()
})
await new Promise((r) => server.listen(PORT, '127.0.0.1', r))

/* ------------------------------------------------------------- the browser */

const browser = await ensureBrowser()
const version = await (await fetch('http://127.0.0.1:9222/json/version')).json()
const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let nextId = 0
const pending = new Map()
ws.onmessage = (event) => {
  const m = JSON.parse(event.data)
  if (m.id !== undefined && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve) => {
    const id = ++nextId
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })

/* An isolated profile: the worker registration lives here and nowhere else. */
const context = (await send('Target.createBrowserContext')).result.browserContextId

/** A cold launch: a brand new tab, nothing in memory but what the browser keeps. */
async function launch(wait = 6000) {
  const target = (await send('Target.createTarget', { url: 'about:blank', browserContextId: context })).result.targetId
  const sessionId = (await send('Target.attachToTarget', { targetId: target, flatten: true })).result.sessionId
  await send('Runtime.enable', {}, sessionId)
  await send('Page.enable', {}, sessionId)
  const began = Date.now()
  await send('Page.navigate', { url: `${ORIGIN}/` }, sessionId)
  await sleep(wait)
  const ev = async (expression) =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.result?.value
  const seen = await ev(`(() => ({
    build: document.querySelector('meta[name="scoutngo-build"]')?.content ?? null,
    entry: document.querySelector('script[type="module"]')?.getAttribute('src') ?? null,
    loaded: performance.getEntriesByType('resource').some((e) => new URL(e.name).pathname === document.querySelector('script[type="module"]')?.getAttribute('src')) || !!document.querySelector('#root')?.children.length,
    rendered: (document.querySelector('#root')?.children.length ?? 0) > 0,
    controlled: navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined,
  }))()`)
  return { ...(seen ?? {}), ms: Date.now() - began, ev, close: () => send('Target.closeTarget', { targetId: target }) }
}

const nameOf = (seen) =>
  seen.build === BUILDS.A && seen.entry === entryOf.A
    ? 'A'
    : seen.build === BUILDS.B && seen.entry === entryOf.B
      ? 'B'
      : `neither (meta ${seen.build}, entry ${seen.entry})`

function expectBuild(step, seen, want) {
  const got = nameOf(seen)
  console.log(`  ${step}: build ${got}, rendered ${seen.rendered}, controlled ${seen.controlled}`)
  if (got !== want) problem(`${step}: expected build ${want}, saw ${got}`)
  if (!seen.rendered) problem(`${step}: the app rendered nothing`)
}

/* 1 */
console.log('\n### 1 · build A served, the worker installs')
let tab = await launch(8000)
expectBuild('first visit', tab, 'A')
const installed = await tab.ev(`(async () => {
  for (let i = 0; i < 40; i += 1) {
    const reg = await navigator.serviceWorker.getRegistration()
    if (reg?.active) {
      const keys = (await (await caches.open('scoutngo-shell-v1')).keys()).map((r) => new URL(r.url).pathname)
      if (keys.includes(${JSON.stringify(entryOf.A)})) return { active: reg.active.scriptURL, keys: keys.length }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
})()`)
console.log(`  worker: ${JSON.stringify(installed)}`)
if (installed === null) problem('the worker never became active with build A cached')
await tab.close()
watchdog.note('step 1')

/* 2 */
console.log('\n### 2 · server gone, cold launch')
setMode('down')
tab = await launch()
expectBuild('offline cold launch', tab, 'A')
await tab.close()

/* 3 */
console.log('\n### 3 · server hangs, cold launch')
setMode('hang')
tab = await launch(6000)
expectBuild('no-bars cold launch', tab, 'A')
watchdog.note('step 3')

/* 4: from the page that was opened from the cache, deploy B and ask as the build check does. */
console.log('\n### 4 · B deployed: the build check reaches the network')
serving = 'B'
setMode('up')
const checked = await tab.ev(`fetch('/', { cache: 'no-store' }).then((r) => r.text()).then((t) => /content="([^"]+)"/.exec(t.slice(t.indexOf('scoutngo-build')))?.[1] ?? null)`)
console.log(`  no-store fetch of / from the A page sees build: ${checked}`)
if (checked !== BUILDS.B) problem(`the build check saw ${checked}, not the deployed ${BUILDS.B}: the worker answered it`)
await tab.close()

/* 5 */
console.log('\n### 5 · cold launch with signal')
tab = await launch(8000)
expectBuild('cold launch after deploy', tab, 'B')
watchdog.note('step 5')

/* 6 */
console.log('\n### 6 · the new worker takes over')
const swapped = await tab.ev(`(async () => {
  for (let i = 0; i < 40; i += 1) {
    const reg = await navigator.serviceWorker.getRegistration()
    const keys = (await (await caches.open('scoutngo-shell-v1')).keys()).map((r) => new URL(r.url).pathname)
    if (reg?.active && keys.includes(${JSON.stringify(entryOf.B)}) && !keys.includes(${JSON.stringify(entryOf.A)})) {
      const text = await (await fetch('/sw.js', { cache: 'no-store' })).text()
      return { build: /build (\\w+)/.exec(text)?.[1] ?? null, keys: keys.length }
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return null
})()`)
console.log(`  shell cache: ${JSON.stringify(swapped)}`)
if (swapped === null) {
  const why = await tab.ev(`(async () => {
    const reg = await navigator.serviceWorker.getRegistration()
    const keys = (await (await caches.open('scoutngo-shell-v1')).keys()).map((r) => new URL(r.url).pathname)
    const text = await (await fetch('/sw.js', { cache: 'no-store' })).text()
    return { active: !!reg?.active, waiting: !!reg?.waiting, installing: !!reg?.installing, served: /build (\\w+)/.exec(text)?.[1], keys }
  })()`)
  console.log(`  why: ${JSON.stringify(why)}`)
  problem('B was never cached with A dropped')
}
await tab.close()

/* 7 */
console.log('\n### 7 · server gone again, cold launch')
setMode('down')
tab = await launch()
expectBuild('offline cold launch after deploy', tab, 'B')
await tab.close()

/* ----------------------------------------------- the home-screen app, WebKit */

watchdog.stop()
await send('Target.disposeBrowserContext', { browserContextId: context })
ws.close()
await browser.stop()

const SHOTS = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'sw-update')
mkdirSync(SHOTS, { recursive: true })
const webWatch = startWatchdog('service worker, WebKit', 600_000)
const SPOT = { id: 'sw-audit-spot', name: 'Kept across the update', savedAt: '2026-10-29T00:00:00Z', venue: CALIBRATION_VENUE, kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' }, positions: [] }
const wk = await webkit.launch()

async function homeScreen(label, insets) {
  console.log(`\n### WebKit, ${label}`)
  serving = 'A'
  setMode('up')
  docDelay = 0
  const ctx = await wk.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
  await ctx.addInitScript(([top, bottom, spot]) => {
    if (localStorage.getItem('scoutngo.spots.v1') === null) localStorage.setItem('scoutngo.spots.v1', JSON.stringify([spot]))
    const add = () => {
      const s = document.createElement('style')
      s.textContent = `:root{--safe-top:${top}px!important;--safe-bottom:${bottom}px!important}`
      document.head.appendChild(s)
    }
    if (document.head) add()
    else document.addEventListener('DOMContentLoaded', add)
  }, [insets.top, insets.bottom, SPOT])
  const page = await ctx.newPage()
  const seen = () => page.evaluate(() => ({
    build: document.querySelector('meta[name="scoutngo-build"]')?.content ?? null,
    entry: document.querySelector('script[type="module"]')?.getAttribute('src') ?? null,
    rendered: (document.querySelector('#root')?.children.length ?? 0) > 0,
    controlled: !!navigator.serviceWorker?.controller,
    url: location.href,
  }))
  const kept = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('scoutngo.') && k !== 'scoutngo.adopted.v1' && k !== 'scoutngo.storageProbe.v1').sort().map((k) => [k, localStorage.getItem(k)])))
  const pill = () => page.evaluate(() => {
    const el = document.querySelector('.newbuild')
    if (!el) return null
    const r = el.getBoundingClientRect(), b = el.querySelector('button')?.getBoundingClientRect()
    return { text: el.textContent.trim(), top: r.top, bottom: r.bottom, left: r.left, right: r.right, button: b ? { w: b.width, h: b.height } : null }
  })
  const waitFor = async (fn, ms) => {
    for (let t = 0; t < ms; t += 250) {
      const v = await fn().catch(() => null)
      if (v) return v
      await page.waitForTimeout(250)
    }
    return null
  }

  /* W1 */
  await page.goto(`${ORIGIN}/`)
  const active = await waitFor(() => page.evaluate(async (entry) => {
    const reg = await navigator.serviceWorker.getRegistration()
    const keys = reg?.active ? (await (await caches.open('scoutngo-shell-v1')).keys()).map((r) => new URL(r.url).pathname) : []
    return keys.includes(entry) && !!navigator.serviceWorker.controller
  }, entryOf.A), 20_000)
  if (!active) {
    console.log('=== SERVICE WORKER AUDIT ABORTED: in WebKit the worker never controlled the page with build A cached ===')
    process.exit(2)
  }
  let now = await seen()
  expectBuild(`W1 ${label}, first visit`, now, 'A')
  const before = await kept()
  if (!String(before['scoutngo.spots.v1'] ?? '').includes(SPOT.id)) problem(`W1 ${label}: the planted spot is not in localStorage, so W3 would compare nothing`)
  await page.touchscreen.tap(195, 420)
  await page.waitForTimeout(COLD_LOAD_MS + 500)

  /* W2 */
  serving = 'B'
  setMode('down')
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await page.waitForTimeout(1500)
  if ((await pill()) !== null) problem(`W2 ${label}: the pill was up while the server was down, so the first check did not fail and the retry was not what was measured`)
  setMode('up')
  const shown = await waitFor(pill, 20_000)
  now = await seen()
  console.log(`  W2 ${label}: pill ${JSON.stringify(shown)}; page still ${nameOf(now)} at ${now.url}`)
  if (shown === null) problem(`W2 ${label}: no pill within 20 s of the signal coming back`)
  else {
    if (!/^New version ready\s*Reload$/.test(shown.text)) problem(`W2 ${label}: the pill reads "${shown.text}"`)
    if (shown.top < insets.top) problem(`W2 ${label}: the pill's top ${shown.top} is under the status bar (${insets.top})`)
    if (shown.left < 0 || shown.right > 390) problem(`W2 ${label}: the pill runs off the screen (${shown.left}..${shown.right})`)
    if (!shown.button || shown.button.h < 44) problem(`W2 ${label}: Reload is ${JSON.stringify(shown.button)}, under 44 px`)
  }
  if (nameOf(now) !== 'A') problem(`W2 ${label}: the page reloaded on its own after it was touched`)
  await page.screenshot({ path: join(SHOTS, `pill-${label}.png`) })

  /* W3 */
  if (shown !== null) {
    await Promise.all([page.waitForNavigation({ timeout: 15_000 }).catch(() => null), page.locator('.newbuild__btn').tap()])
    await waitFor(async () => (await seen()).rendered, 15_000)
    now = await seen()
    expectBuild(`W3 ${label}, after Reload`, now, 'B')
    const after = await kept()
    for (const [key, value] of Object.entries(before)) if (after[key] !== value) problem(`W3 ${label}: ${key} changed across the update`)
    console.log(`  W3 ${label}: ${Object.keys(before).length} scoutngo keys kept`)
    await page.screenshot({ path: join(SHOTS, `reloaded-${label}.png`) })
  }
  await page.close()

  /* W4 */
  serving = 'A'
  docDelay = 4500
  const slow = await ctx.newPage()
  const began = Date.now()
  await slow.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => null)
  const tab = slow
  const look = () => tab.evaluate(() => ({
    build: document.querySelector('meta[name="scoutngo-build"]')?.content ?? null,
    entry: document.querySelector('script[type="module"]')?.getAttribute('src') ?? null,
    rendered: (document.querySelector('#root')?.children.length ?? 0) > 0,
    controlled: !!navigator.serviceWorker?.controller,
    url: location.href,
  }))
  for (let t = 0; t < 8000 && !(await look().catch(() => ({}))).rendered; t += 100) await tab.waitForTimeout(100)
  await tab.touchscreen.tap(195, 420)
  now = await look()
  console.log(`  W4 ${label}: launched in ${Date.now() - began} ms on ${nameOf(now)} (the saved document, the network was slower than the worker waits)`)
  if (nameOf(now) !== 'B') problem(`W4 ${label}: the slow launch did not open the saved build B, so this step did not measure a late answer`)
  let late = null
  for (let t = 0; t < 15_000 && late === null; t += 250) {
    late = await tab.evaluate(() => document.querySelector('.newbuild')?.textContent ?? null).catch(() => null)
    if (late === null) await tab.waitForTimeout(250)
  }
  now = await look()
  if (late === null) problem(`W4 ${label}: no pill after a late answer`)
  if (nameOf(now) !== 'B') problem(`W4 ${label}: the touched page reloaded on its own, onto ${nameOf(now)}`)
  docDelay = 0
  if (late !== null) {
    await Promise.all([tab.waitForNavigation({ timeout: 15_000 }).catch(() => null), tab.locator('.newbuild__btn').tap()])
    for (let t = 0; t < 15_000 && !(await look().catch(() => ({}))).rendered; t += 250) await tab.waitForTimeout(250)
    now = await look()
    expectBuild(`W4 ${label}, after Reload`, now, 'A')
  }
  await ctx.close()
  webWatch.note(`WebKit ${label}`)
}

try {
  await homeScreen('browser', { top: 0, bottom: 0 })
  await homeScreen('standalone', { top: 47, bottom: 34 })
} finally {
  await wk.close()
}
webWatch.stop()
server.close()
console.log(`  screenshots: ${SHOTS}`)
console.log(`\n=== SERVICE WORKER PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
