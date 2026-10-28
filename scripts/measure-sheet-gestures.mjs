/*
 * THE PLAN SHEET UNDER A THUMB: TWENTY DRAGS, HOW MANY MOVED THE WRONG THING.
 *
 * Usage:  node scripts/measure-sheet-gestures.mjs [label]
 * Writes: measurements/<today>-sheet-gestures[-label].md
 * Exits:  0 none wrong; 1 some; 2 could not look.
 *
 * At 390 x 844 with touch emulation, in Plan at the calibration venue, the
 * twenty drags in scripts/sheetGestures.mjs: sideways and up-and-down on the
 * time bar's chart, on the grab handle and the date row, on the tool dock's
 * lower edge and on the card, at three times of day and all three detents.
 */
import { writeFileSync } from 'node:fs'
import { goToStage, guardAudit } from './preflight.mjs'
import { connect } from './cdp.mjs'
import { describeDrag, runSheetGestures } from './sheetGestures.mjs'

guardAudit('sheet gestures')
const label = process.argv[2] ?? ''
const c = await connect()
const { ev, wait, load, shot, dispose } = c
try {
  await ev(`localStorage.clear()`)
  await load('http://127.0.0.1:5173/?calibration=1&probe=1')
  await ev(`localStorage.setItem('scoutngo.landing.v1','true')`)
  await load('http://127.0.0.1:5173/?calibration=1&probe=1')
  await wait(5000)
  await goToStage(ev, wait, 'plan')
  await wait(4000)
  const rows = await runSheetGestures(c)
  if (process.env.SCOUTNGO_OUT) await shot(process.env.SCOUTNGO_OUT, `gestures${label ? '-' + label : ''}`)
  const wrong = rows.filter((r) => r.wrong)
  const head = describeDrag
  const lines = [
    '# The plan sheet under a thumb',
    '',
    `Run: ${new Date().toISOString()} · node scripts/measure-sheet-gestures.mjs ${label} · Chrome headless, 390 x 844, touch emulation (Input.dispatchTouchEvent), the calibration venue, commit ${process.env.SCOUTNGO_COMMIT ?? 'working tree'}`,
    '',
    `${wrong.length} of ${rows.length} drags moved the wrong thing.`,
    '',
    '| # | drag | should move | moved |',
    '|---|---|---|---|',
    ...rows.map((r) => {
      const should = `${r.want.time ? 'time' : 'not the time'}, sheet ${r.want.sheet}`
      const got = r.got === null ? r.note : `${r.got.time ? 'time' : 'not the time'}, sheet ${r.got.sheet}`
      return `| ${r.n} | ${head(r)} | ${should} | ${got}${r.wrong ? ' **WRONG**' : ''} |`
    }),
    '',
  ]
  const date = new Date().toISOString().slice(0, 10)
  writeFileSync(`measurements/${date}-sheet-gestures${label ? '-' + label : ''}.md`, lines.join('\n'))
  console.log(lines.join('\n'))
  await dispose()
  process.exit(wrong.length === 0 ? 0 : 1)
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  await dispose()
  process.exit(2)
}
