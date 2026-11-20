/*
 * TAPS FROM A FRESH INSTALL (Batch SIMPLE-2, Section 2: "a first-timer can
 * answer 'should I go, when, where?' in 3 taps or fewer"), IN WEBKIT.
 *
 * Usage:  node scripts/audit-taps.mjs [screenshot-dir]
 * Exits:  0 every task answered within its budget; 1 a task could not be
 *         done, its answer never showed, or it took more taps than its
 *         budget; 2 it could not look.
 *
 * Each task in a new browser context (nothing stored: a fresh install), at
 * 390 x 844, 3:30 PM EST on 2 Nov (the fixtures' week), behind the gate's
 * fixtures. Taps are counted by the walk itself, one per tap it makes;
 * typing is not a tap. A tap the walk has to add because the app did not
 * do it (the search box not focused) is counted too, so a regression shows.
 *
 * Two numbers per task: the taps until the ANSWER is on screen (read from
 * the screen, positively: a value, not a dash), and the taps until its PAGE
 * is open. The target is 3; BUDGET holds each task to what this walk takes
 * now, so it can only get better. Over the target is said in the table.
 *
 * The address search's answer is a stand-in Photon house (the gate's
 * fixtures return no address), routed in this browser only.
 */
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit, devices } from './gate/playwright.mjs'
import { ensureApp, guardAudit, startWatchdog, APP_ORIGIN } from './preflight.mjs'

guardAudit('taps')
const watchdog = startWatchdog('taps', 600_000)
const OUT = process.argv[2] ?? join(process.env.SCOUTNGO_OUT ?? tmpdir(), 'taps')
mkdirSync(OUT, { recursive: true })
await ensureApp()

const TARGET = 3
const NOW = new Date('2026-11-02T20:30:00Z')
const HOUSE = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-76.5836, 36.7282] }, properties: { countrycode: 'US', housenumber: '425', street: 'East Pinner Street', city: 'Suffolk', state: 'Virginia', name: '', osm_type: 'W', osm_id: 1, osm_key: 'building', osm_value: 'yes' } }] }

/* The first run every task starts with: the landing's one button, the search (typed), the spot. */
const FIRST_RUN = (query, row) => [
  { tap: '.land__go', what: 'Open ScoutNGo' },
  { type: query },
  { tap: `.spick__row:has(.spick__name:text-is("${row}"))`, what: row },
]
const persona = (p, word) => ({ tap: `.actpick--persona [data-persona="${p}"]`, what: `What do you do outside? › ${word}` })
/* Read only with nothing over the home: a value under the picker is not on screen. */
const value = (tile) => `(() => { if (document.querySelector('.actpick--sheet, .spick, .menu')) return null; const v = document.querySelector('.home [data-tile="${tile}"] .htile__value')?.textContent?.trim() ?? ''; return v !== '' && v !== '—' && v !== '…' ? v : null })()`

/* answer: an expression that returns the words that answer the task, or null. page: the same for its page. budget: [answer, page] taps today. */
const TASKS = [
  {
    name: 'surf now',
    steps: [...FIRST_RUN('Virginia Beach', 'Virginia Beach Pier'), persona('surf', 'Surf'), { tap: '.home [data-tile="surf"]', what: 'the Surf tile' }],
    answer: value('surf'),
    page: `document.querySelector('.dpage--surf .tipage__value, .dpage--surf .dhead__big')?.textContent ?? null`,
    budget: [3, 4],
  },
  {
    name: "tonight's color",
    steps: [...FIRST_RUN('Virginia Beach', 'Virginia Beach Pier'), persona('shoot', 'Shoot'), { tap: '.home [data-tile="sky"]', what: 'the Sky tile' }],
    answer: `(() => { const v = ${value('sky')}; return v === null ? null : v + ' · ' + (document.querySelector('.home [data-tile="sky"] .htile__line')?.textContent ?? '') })()`,
    page: `document.querySelector('.spage [data-shared="skycall"], .spage .tipage__value')?.textContent ?? null`,
    budget: [3, 4],
  },
  {
    name: 'can I fly here',
    /* The wind at 400 ft is on the home; the airspace is Preflight's first row, one tap on. */
    steps: [...FIRST_RUN('Virginia Beach', 'Virginia Beach Pier'), persona('drone', 'Drone'), { tap: '.home [data-tile="drone"]', what: 'the Drone tile' }],
    answer: `(() => { const r = [...document.querySelectorAll('.drpage .tipage__row')].find((x) => x.querySelector('.tipage__label')?.textContent === 'Airspace'); const v = r?.querySelector('.tipage__val')?.textContent?.trim() ?? ''; return v !== '' && !/reading/i.test(v) ? 'Airspace ' + v : null })()`,
    page: `document.querySelector('.drpage .tipage__value')?.textContent ?? null`,
    budget: [4, 4],
  },
  {
    name: 'the tide',
    steps: [...FIRST_RUN('Virginia Beach', 'Virginia Beach Pier'), persona('fish', 'Fish'), { tap: '.home [data-tile="tide"]', what: 'the Tide tile' }],
    answer: value('tide'),
    page: `document.querySelector('.tipage--tide .tipage__value')?.textContent ?? null`,
    budget: [3, 4],
  },
  {
    name: 'plan a shoot',
    steps: [...FIRST_RUN('Virginia Beach', 'Virginia Beach Pier'), persona('shoot', 'Shoot'), { tap: '.home .homep__dock button[aria-label="Menu"]', what: '☰' }, { tap: 'nav[aria-label="Stage"] .mrow:has-text("Plan a shoot")', what: 'Plan a shoot' }],
    /* Not the first run's own setup under the spot search: the planner, with nothing over it. */
    answer: `(document.querySelector('.shell')?.className.includes('shell--setup') ?? false) && !document.querySelector('.spick, .actpick--sheet, .home, .menu') ? 'the planner, on its first step' : null`,
    page: `(document.querySelector('.shell')?.className.includes('shell--setup') ?? false) && !document.querySelector('.spick, .actpick--sheet, .home, .menu') ? 'setup' : null`,
    budget: [5, 5],
  },
  {
    name: 'find a spot by name',
    steps: [...FIRST_RUN('Rudee', 'Rudee Inlet')],
    answer: `(() => { const n = document.querySelector('.home .homep__spotname')?.textContent ?? ''; return /Rudee/.test(n) ? 'home for ' + n : null })()`,
    page: `(() => { const n = document.querySelector('.home .homep__spotname')?.textContent ?? ''; return /Rudee/.test(n) ? n : null })()`,
    budget: [2, 2],
  },
  {
    name: 'find a spot by address',
    address: true,
    steps: [{ tap: '.land__go', what: 'Open ScoutNGo' }, { type: '425 E Pinner St, Suffolk' }, { tap: '.spick__row:has(.spick__name:has-text("Pinner"))', what: 'the address' }],
    answer: `(() => { const n = document.querySelector('.home .homep__spotname')?.textContent ?? ''; return /Pinner/.test(n) ? 'home for ' + n : null })()`,
    page: `(() => { const n = document.querySelector('.home .homep__spotname')?.textContent ?? ''; return /Pinner/.test(n) ? n : null })()`,
    budget: [2, 2],
  },
]

let problems = 0
let done = 0
const fail = (why) => {
  console.log('      PROBLEM: ' + why)
  problems += 1
}
const rows = []

const browser = await webkit.launch()
try {
  for (const task of TASKS) {
    console.log(`\n### ${task.name}`)
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } })
    if (task.address === true) await ctx.route('https://photon.komoot.io/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HOUSE) }))
    const page = await ctx.newPage()
    await page.clock.install({ time: NOW })
    await page.clock.resume()
    const wait = (ms) => page.waitForTimeout(ms)
    const ev = (x) => page.evaluate(x)
    await page.goto(`${APP_ORIGIN}/`)
    await wait(3000)
    let taps = 0
    let answeredAt = null
    let answer = null
    const path = []
    const look = async () => {
      if (answeredAt !== null) return
      const a = await ev(task.answer).catch(() => null)
      if (a !== null && a !== false && a !== '') {
        answeredAt = taps
        answer = String(a)
      }
    }
    let broke = false
    for (const step of task.steps) {
      if (step.type !== undefined) {
        /* The box should already have the cursor (App focuses it); if not, a person taps it: counted. */
        const focused = await ev(`document.activeElement?.classList.contains('spick__search') ?? false`)
        if (!focused) {
          await page.locator('.spick__search').first().click({ timeout: 4000 }).catch(() => {})
          taps += 1
          path.push('the search box (not focused)')
        }
        await page.keyboard.type(step.type, { delay: 15 })
        path.push(`type "${step.type}"`)
        await wait(2500)
        continue
      }
      const ok = await page.locator(step.tap).first().click({ timeout: 6000 }).then(() => true, () => false)
      if (!ok) {
        fail(`${task.name}: could not tap ${step.what} (${step.tap}) after ${taps} taps`)
        await page.screenshot({ path: join(OUT, `${task.name.replace(/\W+/g, '-')}-stuck.png`) })
        broke = true
        break
      }
      taps += 1
      path.push(step.what)
      /* The answer is read as it arrives: the forecast is asked once the spot is picked. */
      for (let i = 0; i < 16 && answeredAt === null; i += 1) {
        await wait(500)
        await look()
      }
      if (answeredAt === null) await wait(800)
    }
    let pageWords = null
    for (let i = 0; i < 20 && !broke; i += 1) {
      pageWords = await ev(task.page).catch(() => null)
      if (pageWords !== null && pageWords !== '') break
      await wait(500)
    }
    await look()
    await page.screenshot({ path: join(OUT, `${task.name.replace(/\W+/g, '-')}.png`) })
    await ctx.close()
    watchdog.note(task.name)
    if (broke) continue
    done += 1
    const pageAt = pageWords === null || pageWords === '' ? null : taps
    rows.push({ task: task.name, answer: answeredAt, page: pageAt, said: answer, path: path.join(' › ') })
    console.log(`  answer after ${answeredAt ?? '—'} taps: ${answer ?? 'never on screen'}; its page after ${pageAt ?? '—'} taps`)
    if (answeredAt === null) fail(`${task.name}: the answer never showed`)
    else if (answeredAt > task.budget[0]) fail(`${task.name}: the answer took ${answeredAt} taps, its budget is ${task.budget[0]}`)
    if (pageAt === null) fail(`${task.name}: its page never opened`)
    else if (pageAt > task.budget[1]) fail(`${task.name}: its page took ${pageAt} taps, its budget is ${task.budget[1]}`)
  }
} finally {
  await browser.close()
}
watchdog.stop()

console.log('\n| Task | Taps to the answer | Taps to its page | Within 3? | What answered | Path (typing not counted) |')
console.log('|---|---|---|---|---|---|')
for (const r of rows) console.log(`| ${r.task} | ${r.answer ?? '—'} | ${r.page ?? '—'} | ${r.answer !== null && r.answer <= TARGET ? 'yes' : 'no'} | ${(r.said ?? '—').replace(/\|/g, '/')} | ${r.path} |`)
if (done === 0) {
  console.log('\n=== TAPS AUDIT ABORTED: no task was walked ===')
  process.exit(2)
}
console.log(`\n=== TAPS PROBLEMS: ${problems} (${done} of ${TASKS.length} tasks walked; ${rows.filter((r) => r.answer !== null && r.answer <= TARGET).length} within ${TARGET} taps) ===`)
process.exit(problems === 0 ? 0 : 1)
