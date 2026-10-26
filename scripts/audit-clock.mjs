/*
 * THE CLOCK AUDIT: EVERY TIME GOES THROUGH ONE FORMATTER.
 *
 * Usage:  node scripts/audit-clock.mjs            the source, in the fast gate
 *         node scripts/audit-clock.mjs --screen   the app on :5173 as drawn
 * Exits:  0 clean, 1 on a time printed outside the formatter, 2 when it could
 *         not look.
 *
 * WHY. The app printed "18:14" in some places and "6:14 PM" in none, and four
 * components had their own toLocaleString with its own options. A setting for
 * 12 or 24 hour means nothing while any of them is left: formatClock and its
 * helpers in src/core/timezone.ts are the one place a time is written.
 *
 * THE SOURCE HALF reads every .ts and .tsx under src, tests aside, and fails
 * on a time formatted anywhere but src/core/timezone.ts: toLocaleTimeString,
 * toLocaleString or Intl.DateTimeFormat with an hour, hour12 or hourCycle, an
 * ISO string cut to its clock, an hour read off a Date into text, or a
 * formatter's output cut with slice. A line that formats an hour for DATA
 * rather than display (a forecast's hourly key) carries a comment naming why:
 * `clock-audit: data, <reason>` on the line or the one above.
 *
 * THE SCREEN HALF opens Plan, the chip cards and the Sky card's pages, and
 * reads the text on the glass. On the default 12 hour clock a bare "18:14"
 * anywhere is a time that missed the formatter; switched to 24 hour, an "AM"
 * or "PM" is. Both directions, because a page with no times on it at all
 * passes the first half trivially.
 *
 * SHAPE B GUARDS. The source half runs its own patterns over planted samples
 * first and fails if any goes undetected, and fails on zero files read. The
 * screen half fails unless it read times on screen in both modes.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const HOME = 'src/core/timezone.ts'

const PATTERNS = [
  { why: 'toLocaleTimeString', re: /toLocaleTimeString\s*\(/ },
  { why: 'toLocaleString with an hour', re: /toLocaleString\s*\([^)]*\{[^}]*\bhour\b/s },
  { why: 'Intl.DateTimeFormat with an hour', re: /DateTimeFormat\s*\([^)]*\{[^}]*\bhour\s*:/s },
  { why: 'hour12 or hourCycle', re: /\bhour12\b|\bhourCycle\b/ },
  { why: 'an ISO string cut to its clock', re: /toISOString\(\)\s*\.\s*(slice|substring|substr)\(\s*11/ },
  { why: 'an hour read off a Date into text', re: /\$\{[^}]*\.get(UTC)?Hours\(\)/ },
  { why: "a formatter's output cut with slice", re: /format(Clock|Hour)\([^)]*\)\s*\.\s*(slice|substring|substr)\(/ },
]

const SAMPLES = [
  "at.toLocaleTimeString('en-US')",
  "x.toLocaleString([], {\n  month: 'short',\n  hour: '2-digit',\n})",
  "new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' })",
  '{ hour12: false }',
  'when.toISOString().slice(11, 16)',
  '`${d.getHours()}:00`',
  'formatClock(p.t, timeZone).slice(0, 2)',
]

const screen = process.argv.includes('--screen')
if (screen) {
  await screenHalf()
} else {
  sourceHalf()
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function sourceHalf() {
  let problems = 0
  console.log('### the patterns catch what they are for')
  for (const [i, sample] of SAMPLES.entries()) {
    const caught = PATTERNS.some((p) => p.re.test(sample))
    console.log(`  ${caught ? 'ok     ' : 'PROBLEM'} sample ${i + 1} ${caught ? 'caught' : 'NOT caught'}: ${sample.replace(/\n\s*/g, ' ')}`)
    if (!caught) problems += 1
  }

  const files = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.startsWith('src/data/'))
  if (files.length === 0) {
    console.log('=== CLOCK AUDIT ABORTED: no source files found under src ===')
    process.exit(2)
  }
  console.log(`### ${files.length} source files, ${HOME} is the formatter`)
  let allowed = 0
  for (const file of files) {
    if (relative('.', file) === HOME) continue
    const text = readFileSync(file, 'utf8')
    for (const { why, re } of PATTERNS) {
      const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
      for (const m of text.matchAll(global)) {
        const line = text.slice(0, m.index).split('\n').length
        const lines = text.split('\n')
        const near = `${lines[line - 2] ?? ''}\n${lines[line - 1] ?? ''}`
        if (/clock-audit: data, \S/.test(near)) {
          allowed += 1
          continue
        }
        console.log(`  PROBLEM ${file}:${line} ${why}: ${m[0].replace(/\s+/g, ' ').slice(0, 80)}`)
        problems += 1
      }
    }
  }
  console.log(`  ${allowed} marked as data, not display`)
  console.log(`\n=== CLOCK PROBLEMS: ${problems} across ${files.length} files ===`)
  process.exit(problems === 0 ? 0 : 1)
}

async function screenHalf() {
  const { connect } = await import('./cdp.mjs')
  const { goToStage, guardAudit, setSheet, startWatchdog } = await import('./preflight.mjs')
  guardAudit('clock')
  const watchdog = startWatchdog('clock', 300_000)
  const { send, ev, wait, dispose } = await connect()
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true })

  /* Any H:MM or HH:MM; AM/PM after it is read separately. */
  const READ = `(() => {
    const text = document.body.innerText
    const times = [...text.matchAll(/\\b([01]?\\d|2[0-3]):[0-5]\\d\\b(\\s?[AP]M\\b)?/g)].map((m) => ({ t: m[0], twelve: m[2] !== undefined, at: text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).replace(/\\s+/g, ' ') }))
    const meridiem = [...text.matchAll(/\\b\\d{1,2}(:[0-5]\\d)?\\s?[AP]M\\b/g)].map((m) => m[0])
    return { times, meridiem }
  })()`

  const visit = async (clock) => {
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/' })
    await wait(2500)
    await ev(`localStorage.clear(); localStorage.setItem('scoutngo.landing.v1','true');
      localStorage.setItem('scoutngo.settings', JSON.stringify({ showNumbers: true, showLabels: false, showTerrain: false, showBuildings: false, units: { wind: 'kt', distance: 'ft', clock: ${clock} } }))`)
    await send('Page.navigate', { url: 'http://127.0.0.1:5173/?calibration=1&probe=1' })
    await wait(8000)
    await goToStage(ev, wait, 'plan')
    const pages = []
    const read = async (where) => pages.push({ where, ...(await ev(READ)) })
    await setSheet(ev, wait, 'half')
    await read('plan, half sheet')
    for (const chip of ['golden', 'wind', 'cloud', 'tide']) {
      const opened = await ev(`(() => { const b = document.querySelector('.chips2 [data-chip="${chip}"]') ?? [...document.querySelectorAll('.chips2 button')].find((x) => x.textContent.toLowerCase().includes('${chip === 'golden' ? 'golden' : chip}')); b?.click(); return !!b })()`)
      if (!opened) continue
      await wait(900)
      await read(`${chip} card`)
      await ev(`document.querySelector('.card [aria-label="Close"], .card__close')?.click()`)
      await wait(500)
    }
    await ev(`document.querySelector('button[aria-label="Menu"]')?.click()`)
    await wait(400)
    await ev(`[...document.querySelectorAll('.sidemenu__item')].find((x) => x.textContent.includes('Sky'))?.click()`)
    await wait(1500)
    const tabs = await ev(`[...document.querySelectorAll('.skyc__tabs button, [role="tab"]')].map((b) => b.textContent.trim())`)
    for (const [i, tab] of (tabs ?? []).entries()) {
      await ev(`[...document.querySelectorAll('.skyc__tabs button, [role="tab"]')][${i}]?.click()`)
      await wait(900)
      await read(`sky: ${tab}`)
    }
    watchdog.note(`clock ${clock}`)
    return pages
  }

  let problems = 0
  const twelve = await visit(12)
  const twentyFour = await visit(24)
  await send('Emulation.clearDeviceMetricsOverride')
  watchdog.stop()
  await dispose()

  console.log('### 12 hour, the default: every time on screen reads AM or PM')
  let seen12 = 0
  for (const page of twelve) {
    const bare = page.times.filter((t) => !t.twelve)
    seen12 += page.times.length
    console.log(`  ${bare.length === 0 ? 'ok     ' : 'PROBLEM'} ${page.where}: ${page.times.length} times${page.times[0] === undefined ? '' : ` (${page.times[0].t})`}${bare.length === 0 ? '' : `, bare: ${bare.map((b) => `"${b.at}"`).join(', ')}`}`)
    problems += bare.length
  }
  console.log('### 24 hour: no AM or PM anywhere')
  let seen24 = 0
  for (const page of twentyFour) {
    seen24 += page.times.length
    console.log(`  ${page.meridiem.length === 0 ? 'ok     ' : 'PROBLEM'} ${page.where}: ${page.times.length} times${page.times[0] === undefined ? '' : ` (${page.times[0].t})`}${page.meridiem.length === 0 ? '' : `, still 12 hour: ${page.meridiem.join(', ')}`}`)
    problems += page.meridiem.length
  }
  if (seen12 === 0 || seen24 === 0) {
    console.log(`=== CLOCK AUDIT ABORTED: read ${seen12} times at 12 hour and ${seen24} at 24, so there was nothing to check ===`)
    process.exit(2)
  }
  console.log(`\n=== CLOCK SCREEN PROBLEMS: ${problems} across ${seen12 + seen24} times ===`)
  process.exit(problems === 0 ? 0 : 1)
}
