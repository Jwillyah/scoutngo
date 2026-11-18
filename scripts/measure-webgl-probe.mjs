/*
 * THE WEBGL PROBE IN PLAYWRIGHT'S WEBKIT (Batch 3D, Section 1.1). Opens
 * /?probe=webgl as an iPhone 13 at 390 x 844, waits for every step, saves a
 * screenshot, and writes the probe's own text to measurements/<date>-webgl-
 * probe-webkit.md with the run's parameters. Then the context limit: how
 * many live WebGL contexts this WebKit keeps before it loses the oldest.
 *
 * This WebKit is not the phone (docs/failure-modes.md C): it is the Mac's
 * GPU through the same ANGLE-Metal path, with no iOS memory limit. What it
 * proves is that the probe runs end to end and what passes here; the phone's
 * own run is the answer for the phone.
 *
 * Usage:  node scripts/measure-webgl-probe.mjs [screenshot.png]
 *         (behind the gate's fixture proxy: SCOUTNGO_APP and SCOUTNGO_PROXY)
 * Exits:  0 the probe finished; 2 could not look (no report in time).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { webkit, devices } from './gate/playwright.mjs'
import { APP_ORIGIN } from './preflight.mjs'

const SHOT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'webgl-probe-webkit.png')
const WAIT_MS = 240_000
const day = new Date().toLocaleDateString('en-CA')
const OUT = `measurements/${day}-webgl-probe-webkit.md`
mkdirSync(dirname(SHOT), { recursive: true })

/* The proxy's ledger is the server's whole life: this run's share is after minus before. */
const readLedger = () => (process.env.SCOUTNGO_APP === undefined ? Promise.resolve(null) : fetch(`${APP_ORIGIN}/__gate/ledger`).then((r) => r.json()).catch(() => null))
const ledgerBefore = await readLedger()
const browser = await webkit.launch()
let report = null
let limit = null
let ledger = null
const consoleLines = []
try {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleLines.push(`${m.type()}: ${m.text().slice(0, 200)}`)
  })
  const t0 = Date.now()
  await page.goto(`${APP_ORIGIN}/?probe=webgl`)
  await page.waitForFunction(() => typeof window.__probe === 'string', null, { timeout: WAIT_MS, polling: 500 }).catch(() => {})
  report = await page.evaluate(() => window.__probe ?? null)
  const seconds = Math.round((Date.now() - t0) / 1000)
  await page.screenshot({ path: SHOT })
  console.log(report ?? 'NO REPORT')
  console.log(`(${seconds} s)`)

  /* The context limit, on a blank page of its own: contexts kept alive, one at a time, until the first is lost. */
  const blank = await ctx.newPage()
  const warnings = []
  blank.on('console', (m) => warnings.push(m.text()))
  await blank.setContent('<canvas id=a></canvas>')
  limit = await blank.evaluate(async () => {
    const el = document.getElementById('a')
    const first = el.getContext('webgl2')
    let made = 1
    let lostWhen = null
    el.addEventListener('webglcontextlost', () => (lostWhen = lostWhen ?? made), false)
    const keep = []
    for (let i = 0; i < 24; i += 1) {
      const c = document.createElement('canvas')
      keep.push(c)
      c.getContext('webgl2')
      made += 1
      await new Promise((r) => setTimeout(r, 20))
    }
    return { firstLost: first.isContextLost(), lostWhenLive: lostWhen, made }
  })
  limit.warning = warnings.find((w) => /too many active WebGL contexts/i.test(w)) ?? null
  ledger = await readLedger()
  await blank.close()
  await page.close()

  const hosts = ledger === null ? 'not behind the gate proxy' : Object.entries(ledger.hosts).map(([h, v]) => `${h} ${v.requests - (ledgerBefore?.hosts?.[h]?.requests ?? 0)}`).join(', ')
  const md = [
    `# The WebGL probe in Playwright's WebKit, ${day}`,
    '',
    'Written by `scripts/measure-webgl-probe.mjs` (Batch 3D, Section 1.1).',
    '',
    '## Parameters',
    '',
    `- page: ${APP_ORIGIN}/?probe=webgl (the built dist/, served by scripts/gate/server.mjs)`,
    `- browser: Playwright WebKit ${browser.version()}, device "iPhone 13" (${devices['iPhone 13'].userAgent}), viewport 390 x 844, service workers blocked`,
    `- network: ${process.env.SCOUTNGO_PROXY ? `every request through the fixture proxy ${process.env.SCOUTNGO_PROXY}` : 'live (no proxy)'}; hosts asked in this run (the proxy's ledger): ${hosts}`,
    `- run took ${seconds} s; screenshot ${SHOT}`,
    '- the machine: a Mac (Apple GPU through ANGLE-Metal, no iOS memory limit). NOT the phone.',
    '',
    '## The probe\'s own text (Copy all)',
    '',
    '```',
    report ?? 'NO REPORT: the probe did not finish in time',
    '```',
    '',
    '## The live-context limit',
    '',
    `One WebGL 2 context made first, then ${limit.made - 1} more kept alive, 20 ms apart: the first ${limit.firstLost ? `was lost when ${limit.lostWhenLive} contexts were live` : 'was never lost'}.`,
    `WebKit's console said: ${limit.warning === null ? 'nothing' : `"${limit.warning}"`}`,
    '',
    '## Console errors and warnings on the probe page',
    '',
    ...(consoleLines.length === 0 ? ['none'] : consoleLines.slice(0, 20).map((l) => `- ${l}`)),
    '',
  ].join('\n')
  writeFileSync(OUT, md)
  console.log(`wrote ${OUT}`)
} finally {
  await browser.close()
}
process.exit(report === null ? 2 : 0)
