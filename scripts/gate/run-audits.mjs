/*
 * THE BROWSER AUDITS, SIDE BY SIDE, AGAINST ONE BUILT SERVER AND NO NETWORK.
 *
 * Usage:  node scripts/gate/run-audits.mjs [name ...]     (the gate runs it with none: all)
 * Env:    SCOUTNGO_APP, SCOUTNGO_CDP, SCOUTNGO_PROXY   set by .githooks/pre-commit
 *         SCOUTNGO_GATE_JOBS                         how many at once (default 4)
 *         SCOUTNGO_OUT                               where the logs go
 *
 * WHY. Run one after another against a dev server and live services, the
 * audits took about half an hour a commit (measurements/2026-11-01-gate-time.md),
 * and the 3D one failed whenever the real imagery was slow. Each audit has
 * its own browser context or its own WebKit, so they do not share storage,
 * and every one of them now gets the same fixed answers from the fixture
 * proxy, so running them together changes nothing they look at.
 *
 * LONGEST FIRST, by last run's times, so the tail is short.
 *
 * THE TIMED LANE: the gesture audit times flicks, the projection audit frames,
 * the reachability audit waits on scrolls settling and the service worker
 * audit on a worker taking over. They run one after another in a lane of
 * their own, on a Chrome of their own at normal priority, beside the rest,
 * which run under nice.
 *
 * EVERY AUDIT RUNS, even after one fails, and every failure is printed with
 * the tail of its log: one gate run says everything that is wrong. Then the
 * network guard reads the proxy's ledger (scripts/audit-network-guard.mjs).
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', DIM = '\x1b[2m', OFF = '\x1b[0m'
const OUT = process.env.SCOUTNGO_OUT ?? tmpdir()
const JOBS = Math.max(1, Number(process.env.SCOUTNGO_GATE_JOBS ?? 6))
/* How long each took last time on this machine, so the longest start first. */
const TIMES = join(tmpdir(), 'scoutngo-audit-times.json')

/** In the gate's order. `summary` picks the line printed on a pass; `pattern` the lines shown first on a failure. */
export const AUDITS = [
  { name: 'reachability', script: 'audit-reachability.mjs', summary: /TOTAL PROBLEMS/, pattern: /PROBLEM|TOTAL|ABORTED/, alone: true, timing: true },
  { name: 'label collision', script: 'audit-labels.mjs', summary: /LABEL PROBLEMS/, pattern: /FAIL|LABEL PROBLEMS|over |ABORTED/ },
  { name: 'gesture', script: 'audit-gestures.mjs', summary: /GESTURE PROBLEMS/, alone: true, quiet: true, timing: true },
  { name: 'standalone', script: 'audit-standalone.mjs', summary: /STANDALONE PROBLEMS/ },
  { name: 'viewfinder', script: 'audit-viewfinder.mjs', summary: /VIEWFINDER PROBLEMS/ },
  { name: 'fly', script: 'audit-fly.mjs', summary: /FLY PROBLEMS/ },
  { name: 'buildings', script: 'audit-buildings.mjs', summary: /BUILDINGS PROBLEMS/, timing: true },
  { name: 'ground seams', script: 'audit-ground-seams.mjs', summary: /GROUND SEAMS PROBLEMS/ },
  { name: 'water coast', script: 'audit-water-coast.mjs', summary: /WATER COAST PROBLEMS/ },
  { name: '3d buildings', script: 'audit-buildings-3d.mjs', summary: /3D BUILDINGS PROBLEMS/ },
  { name: 'sky fire', script: 'audit-skyfire.mjs', summary: /SKY FIRE PROBLEMS/ },
  { name: 'terrain decode', script: 'audit-terrain-decode.mjs', summary: /TERRAIN DECODE PROBLEMS/ },
  { name: 'special light', script: 'audit-special.mjs', summary: /SPECIAL LIGHT PROBLEMS/ },
  { name: 'briefing', script: 'audit-briefing.mjs', summary: /BRIEFING PROBLEMS/ },
  { name: 'menu', script: 'audit-menu.mjs', summary: /MENU PROBLEMS/ },
  { name: 'line up', script: 'audit-lineup.mjs', summary: /LINE UP PROBLEMS/ },
  { name: 'privacy', script: 'audit-privacy.mjs', summary: /PRIVACY PROBLEMS/ },
  { name: 'wind', script: 'audit-wind.mjs', summary: /WIND PROBLEMS/ },
  { name: 'map layers', script: 'audit-map-layers.mjs', summary: /MAP LAYERS PROBLEMS/ },
  { name: 'weather', script: 'audit-weather.mjs', summary: /WEATHER PROBLEMS/ },
  { name: 'locate', script: 'audit-locate.mjs', summary: /LOCATE PROBLEMS/ },
  { name: 'safari tab', script: 'audit-safari-tab.mjs', summary: /SAFARI TAB PROBLEMS/ },
  { name: 'landscape', script: 'audit-landscape.mjs', summary: /LANDSCAPE PROBLEMS/ },
  { name: 'venue pack', script: 'audit-venue-pack.mjs', summary: /VENUE PACK PROBLEMS/ },
  { name: 'one surface', script: 'audit-surface.mjs', summary: /SURFACE PROBLEMS/, pattern: /PROBLEM|FAIL|ABORTED/, timing: true },
  { name: 'overflow', script: 'audit-overflow.mjs', summary: /OVERFLOW PROBLEMS/, timing: true },
  { name: 'projection', script: 'audit-projection.mjs', summary: /PROJECTION FAILURES/, pattern: /FAIL|ABORTED/, alone: true, timing: true },
  { name: 'offline', script: 'audit-offline.mjs', summary: /OFFLINE PROBLEMS/ },
  { name: 'api url', script: 'audit-api-urls.mjs', summary: /API URL PROBLEMS/ },
  { name: '3d network', script: 'audit-3d-network.mjs', summary: /3D NETWORK PROBLEMS/ },
  { name: '3d context', script: 'audit-3d-context.mjs', summary: /3D CONTEXT PROBLEMS/ },
  { name: 'airspace', script: 'audit-airspace.mjs', summary: /AIRSPACE PROBLEMS/ },
  { name: 'call sheet', script: 'audit-callsheet.mjs', summary: /CALL SHEET PROBLEMS/ },
  { name: 'clock screen', script: 'audit-clock-screen.mjs', summary: /CLOCK SCREEN PROBLEMS/ },
  { name: 'service worker', script: 'audit-sw-update.mjs', summary: /SERVICE WORKER PROBLEMS/, alone: true, timing: true },
]

const only = process.argv.slice(2)
const todo = only.length === 0 ? AUDITS : AUDITS.filter((a) => only.includes(a.name) || only.includes(a.script))
if (todo.length === 0) {
  console.log(`${RED}no audit called ${only.join(', ')}${OFF}`)
  process.exit(2)
}

const ROOT = new URL('../..', import.meta.url).pathname
const results = new Map()

/*
 * ONE RE-RUN FOR A TIMING AUDIT, SAID OUT LOUD (Batch E). The audits that
 * time flicks, scrolls, sheets and a worker's takeover can fail on a busy
 * machine with nothing wrong in the code. Each waits on a settled state now;
 * if one still fails, it runs once more, in the same slot, and the gate prints that
 * it did and keeps the first run's log beside the second. A second failure
 * fails the gate. Only these: an audit that does not time anything gets no
 * second chance, because a re-run there could only hide something.
 */
async function run(audit) {
  const first = await runOnce(audit)
  if (first.code === 0 || audit.timing !== true) return first
  const firstLog = first.log.replace(/\.log$/, '.first.log')
  writeFileSync(firstLog, first.text)
  const reasons = first.text.split('\n').filter((l) => /PROBLEM|ABORTED/.test(l)).slice(0, 3).map((l) => l.trim()).join(' | ')
  console.log(`${YELLOW}↻ ${audit.name} failed its first run; running it once more. First run: ${reasons || 'see ' + firstLog}${OFF}`)
  retried.push({ name: audit.name, reasons, firstLog })
  return runOnce({ ...audit, retried: true })
}
const retried = []

function runOnce(audit) {
  const log = join(OUT, `${audit.script.replace(/^audit-|\.mjs$/g, '')}.log`)
  const began = Date.now()
  return new Promise((resolve) => {
    /*
     * PRIORITY, NOT LUCK. The timed lane gets the machine first: its own
     * Chrome (SCOUTNGO_CDP_TIMED, started at normal priority) and a normal
     * process, while the rest run under nice and so take what is left. A
     * flick timed on a starved CPU is not a flick (1 Nov: six at once
     * failed the gesture audit; one at a time passed every run).
     */
    const node = [process.execPath, '--import', join(ROOT, 'scripts/gate/nodeGuard.mjs'), join(ROOT, 'scripts', audit.script)]
    const high = audit.alone === true
    const [cmd, ...args] = high ? node : ['nice', '-n', '15', ...node]
    const cdp = high && process.env.SCOUTNGO_CDP_TIMED ? { SCOUTNGO_CDP: process.env.SCOUTNGO_CDP_TIMED } : {}
    const child = spawn(cmd, args, {
      cwd: ROOT,
      env: { ...process.env, ...cdp, SCOUTNGO_OUT: OUT },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks = []
    child.stdout.on('data', (d) => chunks.push(d))
    child.stderr.on('data', (d) => chunks.push(d))
    child.on('close', (code) => {
      const text = Buffer.concat(chunks).toString()
      writeFileSync(log, text)
      const seconds = Math.round((Date.now() - began) / 1000)
      const line = text.split('\n').filter((l) => audit.summary.test(l)).pop()?.replace(/=+/g, '').trim() ?? '(no summary line)'
      const r = { audit, code, seconds, text, log, line, retried: audit.retried === true }
      results.set(audit.name, r)
      if (code === 0) console.log(`${GREEN}✓ ${line}${OFF} ${DIM}${audit.name}, ${seconds}s${r.retried ? ', on its second run' : ''}${OFF}`)
      else console.log(`${RED}✗ ${audit.name} (exit ${code}, ${seconds}s)${OFF} ${DIM}${log}${OFF}`)
      resolve(r)
    })
  })
}

const began = Date.now()
let last = {}
try {
  if (existsSync(TIMES)) last = Object.fromEntries(JSON.parse(readFileSync(TIMES, 'utf8')).audits.map((a) => [a.name, a.seconds]))
} catch {
  /* No history: the gate's order. */
}
const shared = todo.filter((a) => !a.alone).sort((a, b) => (last[b.name] ?? 60) - (last[a.name] ?? 60))
const alone = todo.filter((a) => a.alone)
console.log(`${DIM}· ${todo.length} audits, ${JOBS} at a time; one at a time in their own lane: ${alone.map((a) => a.name).join(', ') || 'none'}${OFF}`)

/*
 * Two lanes at once: the timed audits one after another in a lane of their
 * own, never two of them together, and the rest JOBS - 1 at a time beside it.
 */
/*
 * QUIET WHILE THE FLICKS ARE TIMED: while a `quiet` audit runs (the gesture
 * audit), only QUIET_JOBS of the rest run beside it. With five beside it, a
 * pinch "held still" read undefined once in three runs (1 Nov); with one or
 * two it has not failed.
 */
const QUIET_JOBS = 2
let next = 0
let quiet = false
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await Promise.all([
  (async () => {
    for (const a of alone) {
      quiet = a.quiet === true
      await run(a)
      quiet = false
    }
  })(),
  ...Array.from({ length: Math.max(1, Math.min(JOBS - (alone.length > 0 ? 1 : 0), shared.length)) }, async (_, worker) => {
    while (next < shared.length) {
      if (quiet && worker >= QUIET_JOBS) {
        await sleep(500)
        continue
      }
      const a = shared[next]
      next += 1
      await run(a)
    }
  }),
])

/* Last, when the whole set ran: what reached the proxy, and proof the browsers were behind it. */
if (only.length === 0) await run({ name: 'network guard', script: 'audit-network-guard.mjs', summary: /NETWORK GUARD PROBLEMS/ })

if (retried.length > 0) {
  console.log(`${YELLOW}↻ re-run once: ${retried.map((r) => `${r.name} (${results.get(r.name)?.code === 0 ? 'passed the second time' : 'failed again'})`).join(', ')}${OFF}`)
}
const failed = [...results.values()].filter((r) => r.code !== 0)
for (const r of failed) {
  console.log(`${YELLOW}  --- what ${r.audit.name} actually printed (last 25 lines) ---${OFF}`)
  console.log(r.text.trimEnd().split('\n').slice(-25).join('\n'))
  const pattern = r.audit.pattern ?? /PROBLEM|ABORTED/
  const hits = r.text.split('\n').filter((l) => pattern.test(l)).slice(-20)
  console.log(`${YELLOW}  --- lines matching ${pattern.source} ---${OFF}`)
  console.log(hits.length ? hits.join('\n') : '  (none: see the tail above)')
}

const total = Math.round((Date.now() - began) / 1000)
const slowest = [...results.values()].sort((a, b) => b.seconds - a.seconds).slice(0, 5).map((r) => `${r.audit.name} ${r.seconds}s`).join(', ')
console.log(`${DIM}· browser audits took ${Math.floor(total / 60)}m${String(total % 60).padStart(2, '0')}s; slowest: ${slowest}${OFF}`)
const timesJson = JSON.stringify({ total, jobs: JOBS, audits: [...results.values()].map((r) => ({ name: r.audit.name, seconds: r.seconds, code: r.code })) }, null, 2)
writeFileSync(join(OUT, 'audit-times.json'), timesJson)
writeFileSync(join(OUT, 'audit-retries.json'), JSON.stringify(retried, null, 2))
if (only.length === 0) writeFileSync(TIMES, timesJson)
if (failed.length > 0) {
  console.log(`${RED}✗ ${failed.length} of ${results.size} audits failed: ${failed.map((r) => r.audit.name).join(', ')}${OFF}`)
  process.exit(1)
}
