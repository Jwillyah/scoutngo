/*
 * THE DAY SHEET FIXTURE, WORKED TWICE (Batch SIMPLE-3, S4.7), table in measurements/2026-11-24-day-sheet-fixture.md.
 *
 * Usage: node scripts/measure-day-sheet-fixture.mjs
 * Writes measurements/<today>-day-sheet-fixture.md: our edges of the light
 * (src/core/daySheet.ts lightEdges, the Sky page's marks, golden/color/blue), a second ephemeris
 * (src/core/ephemeris2.ts, Meeus, no suncalc code) and the batch's numbers,
 * for Atlantic Park Surf on Sat 21 Nov 2026. No network.
 */
import { writeFileSync } from 'node:fs'
import { lightEdges } from '../src/core/daySheet.ts'
import { sunApparentCrossings2, sunPosition2, sunRiseSet2 } from '../src/core/ephemeris2.ts'
import { formatClock, zonedTimeToUtc } from '../src/core/timezone.ts'

const LAT = 36.851, LON = -75.98, TZ = 'America/New_York', DATE = '2026-11-21'
const at = (hhmm) => zonedTimeToUtc(DATE, hhmm, TZ)
const from = at('00:00'), to = at('23:59')
const e = lightEdges(DATE, LAT, LON, TZ)
const rs = sunRiseSet2(from, to, LAT, LON)
const g = sunApparentCrossings2(from, to, LAT, LON, 6)
const b = sunApparentCrossings2(from, to, LAT, LON, -4)
const d = sunApparentCrossings2(from, to, LAT, LON, -6)
const rows = [
  ['sunrise', e.sunrise, rs.find((x) => x.rising).at, '06:51'],
  ['golden ends (+6° up)', e.goldenEnds, g.find((x) => x.rising).at, '07:26'],
  ['golden begins (+6° down)', e.goldenStarts, g.find((x) => !x.rising).at, '16:12'],
  ['sunset', e.sunset, rs.find((x) => !x.rising).at, '16:47'],
  ['color begins (-4° up; the batch\'s "blue" 6:31)', e.colorFrom, b.find((x) => x.rising).at, '06:31'],
  ['color ends (-4° down; the batch\'s "blue" 5:08)', e.colorTo, b.find((x) => !x.rising).at, '17:08'],
]
/* The app's blue, -4° to -6°: no batch number. */
const blueRows = [
  ['blue begins (-6° up)', e.blueFrom, d.find((x) => x.rising).at],
  ['blue ends (-6° down)', e.blueTo, d.find((x) => !x.rising).at],
]
const min = (a, c) => ((a.getTime() - c.getTime()) / 60000)
const sig = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
const clock = (d) => formatClock(d, TZ)
let out = `# Day sheet fixture: Atlantic Park Surf, Sat 21 Nov 2026\n\nRun: ${new Date().toISOString().slice(0, 10)}, node scripts/measure-day-sheet-fixture.mjs. Spot 36.851, -75.980, ${TZ}. Ours = src/core/daySheet.ts lightEdges (suncalc; the Sky page's marks). Second = src/core/ephemeris2.ts (Meeus, apparent height with refraction; sunrise/sunset at -0.833°). Batch = docs/batches/batch-simple3.md S4.7. Gaps in minutes.\n\n`
out += '| edge | ours | second ephemeris | batch | ours - second | ours - batch | second - batch |\n|---|---|---|---|---|---|---|\n'
for (const [name, ours, second, batch] of rows) {
  const bt = at(batch)
  out += `| ${name} | ${clock(ours)} | ${clock(second)} | ${clock(bt)} | ${sig(min(ours, second))} | ${sig(min(ours, bt))} | ${sig(min(second, bt))} |\n`
}
out += `\nThe batch's S4.7 "blue 4:47-5:08" (and 6:31-6:51) is the afterglow in the app's convention (src/core/skyPage.ts lightMarks: golden +6° to sunset, color sunset to -4°, blue -4° to -6°). The sheet follows the app, so those batch numbers are compared with the color rows above. The app's blue, against the second ephemeris only (tolerance +-2 min):\n\n| edge | ours | second ephemeris | ours - second | within 2 min |\n|---|---|---|---|---|\n`
for (const [name, ours, second] of blueRows) out += `| ${name} | ${clock(ours)} | ${clock(second)} | ${sig(min(ours, second))} | ${Math.abs(min(ours, second)) <= 2 ? 'yes' : 'NO'} |\n`
const n = e.noon
const n2 = sunPosition2(n.at, LAT, LON)
out += `\nSolar noon: ours ${clock(n.at)} at ${n.altitude.toFixed(1)}°; second ephemeris ${n2.altitude.toFixed(1)}° at the same instant; batch 11:49, 33°.\n`
writeFileSync(`measurements/${new Date().toISOString().slice(0, 10)}-day-sheet-fixture.md`, out)
console.log(out)
