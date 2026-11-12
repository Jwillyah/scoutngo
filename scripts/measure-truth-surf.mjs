/*
 * THE SURF CALL AGAINST THE FIELD TRUTH, AND THE NEXT DAYS (Batch TRUTH,
 * Section 2).
 *
 * Usage:  node scripts/measure-truth-surf.mjs [--out <file>]
 * Reads:  fixtures/truth/2026-11-12-vb.json (what was seen, and Surfline's
 *         forecasts for Fri 13 to Sun 15) and the forecast Open-Meteo gave on
 *         the 12th, kept in tests/data/surf-2026-11-12/ (marine and wind,
 *         12-18 Nov, the pier rounded to 2 decimals).
 * Writes: measurements/2026-11-12-truth-surf.md
 *
 * Our numbers are the app's one call (src/lib/useSurfNow.ts surfNowFrom, src/core/surfCall.ts):
 * the 12th by the hour of the observation (11:56 GMT, 6:56 AM), the others by
 * their biggest hour. The beach faces 100° (the truth file's facing). Not
 * tuned to Surfline: the cams on Fri and Sat mornings are the truth.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { spotStats } from '../src/core/spotSkill.ts'
import { truthRow, truthSurfOf } from '../src/core/accuracy.ts'
import { MARINE_NAMES, BRIEF_WIND_NAMES, parseHourly } from '../src/lib/tideSheetData.ts'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'

const outAt = process.argv.indexOf('--out')
const OUT = outAt > 0 ? process.argv[outAt + 1] : 'measurements/2026-11-12-truth-surf.md'
const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-12-vb.json', 'utf8'))
const marine = parseHourly(JSON.parse(readFileSync('tests/data/surf-2026-11-12/marine.json', 'utf8')), MARINE_NAMES)
const wind = parseHourly(JSON.parse(readFileSync('tests/data/surf-2026-11-12/wind.json', 'utf8')), BRIEF_WIND_NAMES)
const now = new Date('2026-11-12T11:56:00Z')
const read = surfNowFrom({ status: 'ready', marine, wind, facing: truth.place.facingDeg, facingState: 'ok', buoy: null }, spotStats([], now.getTime()), now, truth.place.timeZone)
const row = truthRow(truthSurfOf(truth, '2026-11-12'), read.week[0].call)
const ran = new Date().toISOString()
const L = [
  '# The surf call against the field truth, 12 Nov 2026, Virginia Beach pier',
  '',
  `Run: ${ran} · node scripts/measure-truth-surf.mjs · forecast as kept on the 12th (tests/data/surf-2026-11-12/), facing ${truth.place.facingDeg}° · truth fixtures/truth/2026-11-12-vb.json`,
  '',
  '## 12 Nov, against what was seen',
  '',
  '| day | ours | seen | range overlaps | our word | seen word | word matches |',
  '|---|---|---|---|---|---|---|',
  `| ${row.date} | ${row.ours} | ${row.seen} | ${row.rangeHit ? 'yes' : 'no'} | ${row.oursWord} | ${row.seenWord} | ${row.wordHit ? 'yes' : 'no'} |`,
  '',
  '## The next days, ours next to Surfline (not the truth: the cams on those mornings will be)',
  '',
  '| day | ours | our word | wind | Surfline | ours before (12 Nov screens) |',
  '|---|---|---|---|---|---|',
  ...truth.forecasts.map((f) => {
    const d = read.week.find((w) => w.date === f.date)
    return `| ${f.date} | ${d?.call?.words ?? '—'} | ${d?.call?.size ?? '—'} | ${d?.call?.wind ?? '—'} | ${f.surfline} | ${f.ours.length === 0 ? '—' : f.ours.join(' / ')} |`
  }),
  '',
]
writeFileSync(OUT, L.join('\n'))
console.log(L.join('\n'))
