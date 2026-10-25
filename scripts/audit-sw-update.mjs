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
 * SHAPE C GUARDS. Every assertion names the build it saw, read two ways: the
 * document's scoutngo-build meta and the hashed entry script the page actually
 * loaded, checked against what each build wrote. A page that rendered nothing
 * fails rather than passing on an empty root.
 */
import { execSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { ensureBrowser, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('service worker')
const watchdog = startWatchdog('service worker', 600_000)

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
  const cache = path.startsWith('/assets/')
    ? 'public, max-age=31536000, immutable'
    : path === '/sw.js'
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=0, must-revalidate'
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': cache })
  res.end(readFileSync(file))
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

/* ------------------------------------------------------------------- done */
watchdog.stop()
await send('Target.disposeBrowserContext', { browserContextId: context })
ws.close()
server.close()
await browser.stop()
console.log(`\n=== SERVICE WORKER PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
