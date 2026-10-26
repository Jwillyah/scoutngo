/*
 * MOONRISE AT VIRGINIA BEACH: suncalc AS CALLED, AND ON THE VENUE'S DAY.
 *
 * Usage:  node scripts/measure-moonrise.mjs
 * Writes: measurements/<today>-moonrise-virginia-beach.md
 * Exits:  0 when the local-day moonrise on 25 October 2026 is within 5 min of
 *         the almanac's 5:41 PM EDT; 1 when it is not.
 *
 * THE REFERENCE. The Old Farmer's Almanac, Virginia Beach VA, read
 * 2026-10-25 at almanac.com/astronomy/moon-rise-and-set/VA/Virginia%20Beach:
 * "Rises 5:41 P.M. E", "All times are Eastern Daylight Time at sea level."
 * suncalc also computes for sea level with no horizon, so the two agree in
 * what they assume.
 *
 * WHY THE SECOND TABLE. suncalc 2.0.2's getMoonTimes scans the UTC day of the
 * date it is given, which at UTC-4 is 8 PM the evening before to 8 PM. On 25
 * October the rise is before 8 PM, so the plain call happens to be right; the
 * days around it where it is not are listed, because a check that only looks
 * where the bug does not show is a check that cannot fail.
 */
import { writeFileSync } from 'node:fs'
import { getMoonTimes } from 'suncalc'
import { moonTimesOnLocalDay } from '../src/core/moonTimes.ts'
import { formatClock, zonedTimeToUtc } from '../src/core/timezone.ts'

const VB = { lat: 36.85, lon: -75.975 }
const TZ = 'America/New_York'
const DATE = '2026-10-25'
const ALMANAC = { text: '5:41 PM', at: zonedTimeToUtc(DATE, '17:41', TZ) }
const TOLERANCE_MIN = 5

const usable = (d) => d instanceof Date && !Number.isNaN(d.getTime())
const clock = (d) => (usable(d) ? `${formatClock(d, TZ, 12)} on ${new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d)}` : 'none')

const midnight = zonedTimeToUtc(DATE, '00:00', TZ)
const plain = getMoonTimes(midnight, VB.lat, VB.lon)
const local = moonTimesOnLocalDay(midnight, VB.lat, VB.lon, TZ)
const off = usable(local.rise) ? (local.rise.getTime() - ALMANAC.at.getTime()) / 60_000 : null
const ok = off !== null && Math.abs(off) <= TOLERANCE_MIN

/* Every day of October and November 2026: where does the plain call disagree? */
const disagree = []
for (let d = new Date(Date.UTC(2026, 9, 1)); d < new Date(Date.UTC(2026, 11, 1)); d = new Date(d.getTime() + 86_400_000)) {
  const date = d.toISOString().slice(0, 10)
  const at = zonedTimeToUtc(date, '00:00', TZ)
  const p = getMoonTimes(at, VB.lat, VB.lon).rise
  const l = moonTimesOnLocalDay(at, VB.lat, VB.lon, TZ).rise
  const same = usable(p) && usable(l) ? p.getTime() === l.getTime() : usable(p) === usable(l)
  if (!same) disagree.push(`| ${date} | ${clock(p)} | ${clock(l)} |`)
}

const lines = [
  '# Moonrise at Virginia Beach, 25 October 2026',
  '',
  `**Date:** ${new Date().toLocaleDateString('en-CA')}`,
  '**Script:** `scripts/measure-moonrise.mjs`',
  `**Place:** ${VB.lat}, ${VB.lon}, sea level, ${TZ}`,
  '**suncalc:** 2.0.2',
  `**Reference:** Old Farmer's Almanac, "Rises 5:41 P.M. E", Eastern Daylight Time at sea level, read 2026-10-25`,
  '',
  '| | moonrise |',
  '|---|---|',
  `| getMoonTimes(local midnight), as the app called it | ${clock(plain.rise)} |`,
  `| moonTimesOnLocalDay, the venue's own day | ${clock(local.rise)} |`,
  `| almanac | ${ALMANAC.text} |`,
  '',
  `Local-day moonrise against the almanac: ${off === null ? 'no moonrise' : `${off >= 0 ? '+' : ''}${off.toFixed(1)} min`}, tolerance ${TOLERANCE_MIN} min.`,
  '',
  `## Days in October and November 2026 where the plain call gives a different moonrise: ${disagree.length}`,
  '',
  '| local date | getMoonTimes(local midnight) | moonTimesOnLocalDay |',
  '|---|---|---|',
  ...disagree,
  '',
  ok ? `## Within ${TOLERANCE_MIN} min of the almanac.` : '## FAILED: not within tolerance of the almanac.',
  '',
]
const file = `measurements/${new Date().toLocaleDateString('en-CA')}-moonrise-virginia-beach.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`written to ${file}`)
process.exit(ok ? 0 : 1)
