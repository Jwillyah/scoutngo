/*
 * THE GATE'S ONE SERVER: THE BUILT APP, AND THE ONLY WAY OUT OF THE BROWSERS.
 *
 * Usage:  node scripts/gate/server.mjs        (the gate starts it; see .githooks/pre-commit)
 *
 *   :5180  the built app from dist/, the way Vercel serves it (the page
 *          rewrites, /api/* run from api/*.ts with their upstreams answered
 *          by fixtures). Built once per gate and shared by every audit, in
 *          place of a dev server compiling modules on first ask.
 *   :5181  an HTTP proxy every audit browser is launched behind (Chrome with
 *          --proxy-server, WebKit with Playwright's proxy option). It never
 *          opens a connection anywhere: HTTPS is terminated here with a
 *          throwaway certificate and answered from scripts/gate/fixtures.mjs.
 *
 * THE LEDGER. Every request that reached the proxy is counted by host and
 * by which fixture answered (GET /__gate/ledger on :5180). The network guard
 * (scripts/audit-network-guard.mjs) reads it and fails the gate on a request
 * nothing answered, and proves the browsers really are behind the proxy.
 *
 * WHY NO SERVICE WORKER HERE. In a page a service worker controls, WebKit
 * sends requests past Playwright's routes, and several audits answer a host
 * with their own fixture through a route (a 429, a refused location). The
 * worker is the venue pack and service worker audits' subject, and they serve
 * dist/ themselves with it on; here /sw.js is a 404, as on the dev server.
 */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createTls } from 'node:https'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'
import { answer } from './fixtures.mjs'

export const GATE_APP_PORT = Number(process.env.SCOUTNGO_GATE_APP_PORT ?? 5180)
export const GATE_PROXY_PORT = Number(process.env.SCOUTNGO_GATE_PROXY_PORT ?? 5181)
const ROOT = new URL('../..', import.meta.url).pathname
const DIST = process.env.SCOUTNGO_GATE_DIST ?? join(ROOT, 'dist')

const ledger = { started: new Date().toISOString(), hosts: {}, unanswered: [], direct: [] }
const note = (href, fixture, via) => {
  let host = '?'
  try {
    host = new URL(href).host
  } catch {
    /* counted under ? */
  }
  const h = (ledger.hosts[host] ??= { requests: 0, fixtures: {} })
  h.requests += 1
  h.fixtures[fixture] = (h.fixtures[fixture] ?? 0) + 1
  if (fixture === 'none' && ledger.unanswered.length < 200) ledger.unanswered.push({ href: href.slice(0, 200), via })
}

/* ------------------------------------------------------------ the fetch inside api/ */
/*
 * The api functions run here, and each fetches one upstream (NDBC, the
 * aviation weather service, Mapbox). Their fetch is the fixture's: nothing
 * leaves from this process either.
 */
globalThis.fetch = async (input) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const a = await answer(href)
  note(href, a.fixture, 'api')
  return new Response(a.body, { status: a.status, headers: { 'content-type': a.type } })
}
const API = {}
for (const name of ['buoy', 'metar', 'pirep', 'search', 'streetview', 'calendar', 'nhc', 'forecast']) {
  if (existsSync(join(ROOT, 'api', `${name}.ts`))) API[name] = await import(join(ROOT, 'api', `${name}.ts`))
}

/* -------------------------------------------------------------------- the app */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.pbf': 'application/x-protobuf', '.xml': 'application/xml', '.txt': 'text/plain', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2' }

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks)
}

const app = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${GATE_APP_PORT}`)
  if (url.pathname === '/__gate/ledger') {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(ledger))
  }
  if (url.pathname === '/__gate/direct') {
    /* A Node-side fetch an audit tried to send outside (scripts/gate/nodeGuard.mjs). */
    const body = (await readBody(req)).toString()
    if (ledger.direct.length < 200) ledger.direct.push(body.slice(0, 300))
    res.writeHead(204)
    return res.end()
  }
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/\/$/, '')
    const mod = API[name]
    if (mod === undefined || typeof mod[req.method] !== 'function') {
      res.writeHead(404)
      return res.end()
    }
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req)
    const response = await mod[req.method](new Request(url.href, { method: req.method, headers: req.headers, body }))
    res.writeHead(response.status, Object.fromEntries(response.headers))
    return res.end(Buffer.from(await response.arrayBuffer()))
  }
  if (url.pathname === '/sw.js') {
    res.writeHead(404)
    return res.end()
  }
  let file = normalize(join(DIST, decodeURIComponent(url.pathname)))
  if (!file.startsWith(DIST)) {
    res.writeHead(403)
    return res.end()
  }
  if (!existsSync(file) || statSync(file).isDirectory()) {
    /* The page rewrites in vercel.json: every path the app owns is index.html. */
    if (extname(url.pathname) !== '' && !url.pathname.endsWith('.html')) {
      res.writeHead(404)
      return res.end()
    }
    file = join(DIST, 'index.html')
  }
  /*
   * Batch Beach, Section 4: as the host sends them, gzipped, when
   * SCOUTNGO_GATE_GZIP=1 (scripts/measure-network.mjs only: a slow-3G paint
   * measured with the files uncompressed counts bytes no phone downloads).
   * The audits run without it, as before.
   */
  const gzip = process.env.SCOUTNGO_GATE_GZIP === '1' && /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? '')) && /\.(js|css|html|json|svg)$/.test(file)
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    'access-control-allow-origin': '*',
    ...(gzip ? { 'content-encoding': 'gzip', vary: 'accept-encoding' } : {}),
  })
  res.end(gzip ? gzipSync(readFileSync(file)) : readFileSync(file))
})

/* ------------------------------------------------------------------ the proxy */
const certDir = mkdtempSync(join(tmpdir(), 'scoutngo-gate-cert-'))
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=scoutngo-gate-fixtures', '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')], { stdio: 'ignore' })

async function fulfil(req, res, href, via) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': '*', 'access-control-allow-headers': '*', 'access-control-max-age': '600' })
    note(href, 'CORS preflight', via)
    return res.end()
  }
  const a = await answer(href)
  note(href, a.fixture, via)
  res.writeHead(a.status, { 'content-type': a.type, 'content-length': a.body.length, 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
  res.end(req.method === 'HEAD' ? undefined : a.body)
}

/* The HTTPS side: one TLS server, never listening, fed the sockets CONNECT hands over. */
const tls = createTls({ key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) }, (req, res) => {
  fulfil(req, res, `https://${req.headers.host}${req.url}`, 'https')
})

const proxy = createServer((req, res) => {
  /* Plain HTTP through a proxy carries the absolute URL. */
  const href = /^https?:\/\//.test(req.url) ? req.url : `http://${req.headers.host}${req.url}`
  fulfil(req, res, href, 'http')
})
proxy.on('connect', (req, socket, head) => {
  socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
  if (head?.length) socket.unshift(head)
  tls.emit('connection', socket)
})
proxy.on('clientError', (_e, socket) => socket.destroy())

await new Promise((r) => app.listen(GATE_APP_PORT, '127.0.0.1', r))
await new Promise((r) => proxy.listen(GATE_PROXY_PORT, '127.0.0.1', r))
console.log(`gate app on http://127.0.0.1:${GATE_APP_PORT} (dist/ built ${existsSync(join(DIST, 'index.html')) ? statSync(join(DIST, 'index.html')).mtime.toISOString() : 'NOT BUILT'}), fixture proxy on 127.0.0.1:${GATE_PROXY_PORT}`)
