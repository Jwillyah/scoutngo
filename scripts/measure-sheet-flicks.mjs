/*
 * THE PLAN SHEET UNDER A FLICK: HOW MANY LANDED WHERE THEY SHOULD.
 *
 * Usage:  node scripts/measure-sheet-flicks.mjs [label]
 * Writes: measurements/<today>-sheet-flicks[-label].md
 * Exits:  0 every drag landed right; 1 some did not; 2 could not look.
 *
 * At 390 x 844 with touch emulation, in Plan at the calibration venue: 20
 * flicks up and 20 down from each detent at mixed speeds and lengths, from
 * the handle, the date row and the card's empty space, then slow drags held
 * still before release (scripts/sheetFlicks.mjs).
 */
import { writeFileSync } from 'node:fs'
import { connect } from './cdp.mjs'
import { goToStage, guardAudit } from './preflight.mjs'
import { MIN_REAL_FLICKS, runSheetFlicks } from './sheetFlicks.mjs'

guardAudit('sheet flicks')
const label = process.argv[2] ?? ''
const c = await connect()
const { ev, wait, load, dispose } = c
try {
  await load('http://127.0.0.1:5173/?calibration=1&probe=1')
  await ev(`localStorage.setItem('scoutngo.landing.v1','true')`)
  await load('http://127.0.0.1:5173/?calibration=1&probe=1')
  await goToStage(ev, wait, 'plan')
  await wait(3000)
  const rows = await runSheetFlicks(c)
  const done = rows.filter((r) => r.want !== null)
  const wrong = done.filter((r) => r.wrong)
  const by = (kind) => {
    const these = done.filter((r) => r.kind.startsWith(kind))
    return `${these.length - these.filter((r) => r.wrong).length} of ${these.length}`
  }
  const lines = [
    '# The plan sheet under a flick',
    '',
    `Run: ${new Date().toISOString()} · node scripts/measure-sheet-flicks.mjs ${label} · Chrome headless, 390 x 844, touch emulation (Input.dispatchTouchEvent), the calibration venue, ${process.env.SCOUTNGO_COMMIT ?? 'working tree'}`,
    '',
    `Detent heights: ${Object.entries(rows.heights ?? {}).map(([d, h]) => `${d} ${Math.round(h)} px`).join(', ')}.`,
    '',
    `Landed right: flicks up ${by('flick up')}, flicks down ${by('flick down')}, slow drags ${by('slow')}; ${done.length - wrong.length} of ${done.length} in all.${rows.length > done.length ? ` ${rows.length - done.length} could not be set up.` : ''}`,
    '',
    `Arrived as real flicks (the page saw them faster than the flick speed), of 20 each: ${Object.entries(rows.realFlicks ?? {}).map(([k, n]) => `${k} ${n}`).join(', ')}. At least ${MIN_REAL_FLICKS} each, or the run did not test flicks.`,
    '',
    '| from | drag | started on | px | px/ms asked | px/ms the page saw at release | should land | landed |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.from} | ${r.kind} | ${r.on ?? '—'} | ${r.len ?? '—'} | ${r.speed ?? '—'} | ${typeof r.seen === 'number' ? Math.abs(r.seen).toFixed(2) : '—'} | ${r.want ?? '—'} | ${r.got ?? r.note}${r.wrong ? ' **WRONG**' : ''} |`),
    '',
  ]
  const file = `measurements/${new Date().toISOString().slice(0, 10)}-sheet-flicks${label ? '-' + label : ''}.md`
  writeFileSync(file, lines.join('\n'))
  console.log(lines.slice(0, 8).join('\n'))
  console.log(`wrote ${file}`)
  await dispose()
  const tooFew = Object.entries(rows.realFlicks ?? {}).filter(([, n]) => n < MIN_REAL_FLICKS)
  if (tooFew.length > 0) {
    console.error(`could not look: too few drags arrived as flicks (${tooFew.map(([k, n]) => `${k} ${n}`).join(', ')})`)
    await dispose()
    process.exit(2)
  }
  process.exit(wrong.length === 0 && done.length === rows.length ? 0 : 1)
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  await dispose()
  process.exit(2)
}
