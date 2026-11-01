/*
 * THE NETWORK GUARD: NOTHING THE GATE RAN REACHED A LIVE HOST.
 *
 * Usage:  node scripts/audit-network-guard.mjs   (inside the gate, after every browser audit)
 * Exits:  0 clean; 1 something got out, or the guard is not in the way; 2 could not look.
 *
 * Two halves, because "the ledger is clean" proves nothing by itself: a
 * browser that was never behind the proxy would leave a clean ledger too
 * (docs/failure-modes.md, B: it must have looked).
 *
 *   1. THE GUARD IS IN THE WAY. Chrome (the CDP audits' browser) and WebKit
 *      (Playwright's) each ask for a host that does not exist,
 *      guard-canary.invalid, and for Open-Meteo. Behind the proxy both come
 *      back with the fixture's answer and appear in the ledger; reaching the
 *      real network, .invalid cannot resolve and the request fails.
 *
 *   2. THE LEDGER. Every request the proxy and the api functions saw during
 *      the gate, by host and by the fixture that answered. A host no fixture
 *      covers fails (the app talks to something the gate does not know), and
 *      so does any fetch an audit's own Node process tried to send outside
 *      (scripts/gate/nodeGuard.mjs).
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { connect } from './cdp.mjs'
import { webkit } from './gate/playwright.mjs'
import { APP_ORIGIN, FIXTURE_PROXY, guardAudit, startWatchdog } from './preflight.mjs'

guardAudit('network guard')
const watchdog = startWatchdog('network guard', 120_000)
let problems = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
if (FIXTURE_PROXY === null) {
  console.log('=== NETWORK GUARD AUDIT ABORTED: SCOUTNGO_PROXY is not set, so there is no guard to check (run inside the gate) ===')
  process.exit(2)
}

const ledger = async () => (await fetch(`${APP_ORIGIN}/__gate/ledger`)).json()
const CANARY = 'https://guard-canary.invalid/ping'
const METEO = 'https://api.open-meteo.com/v1/forecast?latitude=36.84&longitude=-75.97&hourly=wind_speed_10m&forecast_days=1'
const probe = `(async () => {
  const out = {}
  for (const [k, u] of [['canary', ${JSON.stringify(CANARY)}], ['meteo', ${JSON.stringify(METEO)}]]) {
    try { const r = await fetch(u); out[k] = r.status + ' ' + (await r.text()).slice(0, 40) } catch (e) { out[k] = 'failed: ' + e.message }
  }
  return out
})()`

const before = await ledger()
const canaryCount = (l) => l.hosts['guard-canary.invalid']?.requests ?? 0

console.log('### the guard is in the way')
const c = await connect()
try {
  await c.send('Page.navigate', { url: `${APP_ORIGIN}/` })
  await c.wait(1500)
  const got = await c.ev(probe)
  console.log(`  Chrome: canary ${got?.canary}; Open-Meteo ${got?.meteo}`)
  if (!/^404 /.test(got?.canary ?? '')) fail(`Chrome's request to a host that does not exist did not reach the proxy (${got?.canary})`)
  if (!/^200 \{"hourly"/.test(got?.meteo ?? '')) fail(`Chrome's Open-Meteo request was not answered by the fixture (${got?.meteo})`)
} finally {
  await c.dispose()
}
const browser = await webkit.launch()
try {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`${APP_ORIGIN}/`)
  const got = await page.evaluate(probe)
  console.log(`  WebKit: canary ${got?.canary}; Open-Meteo ${got?.meteo}`)
  if (!/^404 /.test(got?.canary ?? '')) fail(`WebKit's request to a host that does not exist did not reach the proxy (${got?.canary})`)
  if (!/^200 \{"hourly"/.test(got?.meteo ?? '')) fail(`WebKit's Open-Meteo request was not answered by the fixture (${got?.meteo})`)
} finally {
  await browser.close()
}
const after = await ledger()
if (canaryCount(after) - canaryCount(before) < 2) fail(`the ledger saw ${canaryCount(after) - canaryCount(before)} of the 2 canary requests`)

console.log('### the ledger, since the gate server started')
const hosts = Object.entries(after.hosts).filter(([h]) => h !== 'guard-canary.invalid').sort((a, b) => b[1].requests - a[1].requests)
for (const [host, h] of hosts) console.log(`  ${host.padEnd(42)} ${String(h.requests).padStart(6)}  ${Object.entries(h.fixtures).map(([f, n]) => `${f} ${n}`).join(', ')}`)
const total = hosts.reduce((s, [, h]) => s + h.requests, 0)
console.log(`  ${total} requests to ${hosts.length} outside hosts, every one answered on this machine`)
const unanswered = after.unanswered.filter((u) => !u.href.startsWith(CANARY))
for (const u of unanswered.slice(0, 15)) fail(`no fixture for ${u.href} (${u.via}): add one in scripts/gate/fixtures.mjs`)
for (const d of after.direct) fail(`an audit's own process tried to reach a live host: ${d}`)
writeFileSync(join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'network-ledger.json'), JSON.stringify(after, null, 2))

watchdog.stop()
console.log(`\n=== NETWORK GUARD PROBLEMS: ${problems} ===`)
process.exit(problems === 0 ? 0 : 1)
