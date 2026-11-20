/*
 * THE SKY › NIGHT MOON FIXTURE, OURS AGAINST USNO.
 *
 * Usage:  node scripts/measure-moon-fixture.mjs
 * Writes: measurements/<today>-moon-fixture.md
 * Exits:  0 when every time is within 5 min of USNO and every bearing within
 *         2°; 1 when one is not.
 *
 * NO NETWORK. USNO's answers were fetched once, on 19 Nov 2026, and saved
 * under tests/data/usno-moon-2026-11-19/ (rstt/oneday per day, moon/phases,
 * and celnav at each USNO rise and set minute for the bearing). This reads
 * them; tests/moonFixture.test.ts holds the app to the same files.
 *
 * Three columns per row: what Batch SIMPLE-2 wrote as the fixture, what the
 * app's code computes, and USNO. The batch's values are not a reference; they
 * are checked like the rest.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { getMoonIllumination, getMoonPosition, getTimes } from 'suncalc'
import { moonMoments, phaseStrip } from '../src/core/moonNights.ts'
import { moonPhasesBetween } from '../src/core/moonPhases.ts'
import { moonTimesOnLocalDay } from '../src/core/moonTimes.ts'
import { moonTurningPoints } from '../src/core/skyEvents.ts'
import { normalizeBearing } from '../src/core/sun.ts'
import { formatClock, zonedTimeToUtc } from '../src/core/timezone.ts'

const LAT = 36.92
const LON = -76.1
const TZ = 'America/New_York'
const DIR = 'tests/data/usno-moon-2026-11-19'
const TIME_MIN = 5
const AZ_DEG = 2

const oneday = JSON.parse(readFileSync(`${DIR}/rstt-oneday.json`, 'utf8'))
const phasesUsno = JSON.parse(readFileSync(`${DIR}/moon-phases.json`, 'utf8')).answer.phasedata
const celnav = JSON.parse(readFileSync(`${DIR}/celnav-at-events.json`, 'utf8'))

const day = (at) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(at)
const clock = (at) => formatClock(at, TZ, 12)
const when = (at) => `${day(at)} ${clock(at)}`
const noon = (date) => zonedTimeToUtc(date, '12:00', TZ)
const moonAz = (at) => normalizeBearing(getMoonPosition(at, LAT, LON).azimuth)

/* USNO's oneday answers are in EST (tz=-5, dst=false), to the minute. */
function usno(date, body, phen) {
  const data = oneday[date].answer.properties.data
  const row = (body === 'Moon' ? data.moondata : data.sundata).find((e) => e.phen === phen)
  if (row === undefined) return null
  const [h, m] = row.time.split(':').map(Number)
  const [y, mo, d] = date.split('-').map(Number)
  const at = new Date(Date.UTC(y, mo - 1, d, h + 5, m))
  const nav = celnav[`${date} ${body} ${phen} ${row.time}`]
  return { at, azimuth: nav === undefined ? null : nav.object.almanac_data.zn }
}
const usnoPhase = (phase, d) => {
  const p = phasesUsno.find((x) => x.phase === phase && x.day === d)
  const [h, m] = p.time.split(':').map(Number)
  return new Date(Date.UTC(p.year, p.month - 1, p.day, h, m))
}

let ok = true
const gapMin = (a, b) => (a.getTime() - b.getTime()) / 60_000
const fmtGap = (g) => `${g >= 0 ? '+' : ''}${g.toFixed(1)} min`
const fmtAz = (a) => (a === null ? '—' : `${a.toFixed(1)}°`)
const check = (g, dAz) => {
  const pass = Math.abs(g) <= TIME_MIN && (dAz === null || Math.abs(dAz) <= AZ_DEG)
  if (!pass) ok = false
  return pass ? 'ok' : 'FAIL'
}

/* ------------------------------------------------------ the fixture rows */
const ours = {
  rise19: moonTimesOnLocalDay(noon('2026-11-19'), LAT, LON, TZ).rise,
  set20: moonTimesOnLocalDay(noon('2026-11-20'), LAT, LON, TZ).set,
  rise24: moonTimesOnLocalDay(noon('2026-11-24'), LAT, LON, TZ).rise,
  sunset24: getTimes(noon('2026-11-24'), LAT, LON).sunset,
  set23: moonTimesOnLocalDay(noon('2026-11-23'), LAT, LON, TZ).set,
  sunrise23: getTimes(noon('2026-11-23'), LAT, LON).sunrise,
  set24: moonTimesOnLocalDay(noon('2026-11-24'), LAT, LON, TZ).set,
  sunrise24: getTimes(noon('2026-11-24'), LAT, LON).sunrise,
}
const meeus = moonPhasesBetween(new Date('2026-11-19T00:00:00Z'), new Date('2026-12-31T00:00:00Z'))
const full = meeus.find((p) => p.kind === 'full').at
const nu = meeus.find((p) => p.kind === 'new').at

const rows = [
  ['Thu 19 Nov moonrise', '1:47 PM', ours.rise19, true, usno('2026-11-19', 'Moon', 'Rise')],
  ['Fri 20 Nov moonset', '2:10 AM ~273°', ours.set20, true, usno('2026-11-20', 'Moon', 'Set')],
  ['Full moon', 'Tue 24 Nov 9:53 AM', full, false, { at: usnoPhase('Full Moon', 24), azimuth: null }],
  ['Tue 24 Nov moonrise', '4:41 PM ~57°', ours.rise24, true, usno('2026-11-24', 'Moon', 'Rise')],
  ['Tue 24 Nov sunset', '4:46 PM', ours.sunset24, false, usno('2026-11-24', 'Sun', 'Set')],
  ['Mon 23 Nov moonset', '6:57 AM ~296°', ours.set23, true, usno('2026-11-23', 'Moon', 'Set')],
  ['Mon 23 Nov sunrise', '6:54 AM', ours.sunrise23, false, usno('2026-11-23', 'Sun', 'Rise')],
  ['New moon', 'Tue 8 Dec 7:51 PM', nu, false, { at: usnoPhase('New Moon', 9), azimuth: null }],
  ['Tue 24 Nov moonset (not in the batch)', '—', ours.set24, true, usno('2026-11-24', 'Moon', 'Set')],
  ['Tue 24 Nov sunrise (not in the batch)', '—', ours.sunrise24, false, usno('2026-11-24', 'Sun', 'Rise')],
]
const fixture = rows.map(([label, batch, at, isMoon, ref]) => {
  const az = isMoon ? moonAz(at) : null
  const dAz = az === null || ref.azimuth === null ? null : az - ref.azimuth
  const g = gapMin(at, ref.at)
  return `| ${label} | ${batch} | ${when(at)}${az === null ? '' : ` · ${fmtAz(az)}`} | ${when(ref.at)}${ref.azimuth === null ? '' : ` · ${fmtAz(ref.azimuth)}`} | ${fmtGap(g)}${dAz === null ? '' : ` · ${dAz >= 0 ? '+' : ''}${dAz.toFixed(1)}°`} | ${check(g, dAz)} |`
})

/* -------------------------------------- every rise and set, 19–26 Nov, 7–9 Dec */
const every = []
for (const date of Object.keys(oneday)) {
  const t = moonTimesOnLocalDay(noon(date), LAT, LON, TZ)
  for (const [phen, at] of [['Rise', t.rise], ['Set', t.set]]) {
    const ref = usno(date, 'Moon', phen)
    if (ref === null && at === null) continue
    if (ref === null || at === null) {
      ok = false
      every.push(`| ${date} | moon${phen.toLowerCase()} | ${at === null ? 'none' : clock(at)} | ${ref === null ? 'none' : clock(ref.at)} | — | FAIL |`)
      continue
    }
    const az = moonAz(at)
    const dAz = ref.azimuth === null ? null : az - ref.azimuth
    const g = gapMin(at, ref.at)
    every.push(`| ${date} | moon${phen.toLowerCase()} | ${clock(at)} · ${fmtAz(az)} | ${clock(ref.at)} · ${fmtAz(ref.azimuth)} | ${fmtGap(g)}${dAz === null ? '' : ` · ${dAz >= 0 ? '+' : ''}${dAz.toFixed(1)}°`} | ${check(g, dAz)} |`)
  }
}

/* ---------------------- the phase instant: why suncalc could not be used */
const scan = (from, to, fn) => {
  let best = null
  for (let t = from.getTime(); t <= to.getTime(); t += 60_000) {
    const v = fn(new Date(t))
    if (best === null || v > best.v) best = { at: new Date(t), v }
  }
  return best.at
}
const crossing = (from, to, test) => {
  let prev = getMoonIllumination(from).phase
  for (let t = from.getTime() + 60_000; t <= to.getTime(); t += 60_000) {
    const p = getMoonIllumination(new Date(t)).phase
    if (test(prev, p)) return new Date(t)
    prev = p
  }
  return null
}
const fullWin = [zonedTimeToUtc('2026-11-23', '12:00', TZ), zonedTimeToUtc('2026-11-25', '12:00', TZ)]
const newWin = [zonedTimeToUtc('2026-12-07', '12:00', TZ), zonedTimeToUtc('2026-12-10', '00:00', TZ)]
const grid = moonTurningPoints(new Date('2026-11-19T00:00:00Z'), new Date('2026-12-15T00:00:00Z'), (at) => getMoonIllumination(at).fraction)
const methods = [
  ['skyEvents.ts moonTurningPoints, 6-hour grid', grid.fullMoons[0].at, grid.newMoons[0].at],
  ["suncalc's share lit at its extreme, every minute", scan(...fullWin, (at) => getMoonIllumination(at).fraction), scan(...newWin, (at) => -getMoonIllumination(at).fraction)],
  ["suncalc's phase crossing 0.5 (full) and 1 → 0 (new), every minute", crossing(...fullWin, (a, b) => a < 0.5 && b >= 0.5), crossing(...newWin, (a, b) => a > 0.9 && b < 0.1)],
  ['moonPhases.ts, Meeus chapter 49 (the app now)', full, nu],
]
const usnoFull = usnoPhase('Full Moon', 24)
const usnoNew = usnoPhase('New Moon', 9)
const phaseRows = methods.map(([m, f, n]) => `| ${m} | ${when(f)} (${fmtGap(gapMin(f, usnoFull))}) | ${when(n)} (${fmtGap(gapMin(n, usnoNew))}) |`)

/* ------------------------------------------- the Night tab on the fixture */
const thuEvening = zonedTimeToUtc('2026-11-19', '19:00', TZ)
const strip = phaseStrip(thuEvening, LAT, LON, TZ)
const moments = moonMoments(thuEvening, LAT, LON, TZ)
const lit23 = getMoonIllumination(ours.set23).fraction
const momentLines = moments.map((m) =>
  m.kind === 'big-moonrise'
    ? `- Big moonrise ${m.date}: rises ${clock(m.moonrise.at)} at ${m.moonrise.azimuth.toFixed(1)}° (${m.moonrise.compass}), sunset ${clock(m.sunset)}, ${m.minutesBeforeSunset} min before sunset, ${(m.lit * 100).toFixed(1)}% lit`
    : `- Moonset at sunrise ${m.date}: sets ${clock(m.moonset.at)} at ${m.moonset.azimuth.toFixed(1)}° (${m.moonset.compass}), sunrise ${clock(m.sunrise)}, ${m.minutesAfterSunrise} min after sunrise, ${(m.lit * 100).toFixed(1)}% lit`,
)

const today = new Date().toLocaleDateString('en-CA')
const lines = [
  "# The moon at Chic's Beach, ours against USNO",
  '',
  `**Date:** ${today}`,
  '**Script:** `scripts/measure-moon-fixture.mjs` (no network; reads the saved answers)',
  `**Place:** ${LAT}, ${LON}, sea level, ${TZ} (EST, UTC−5, all dates here)`,
  '**Ours:** suncalc 2.0.2 through `src/core/moonTimes.ts` moonTimesOnLocalDay (rise, set), suncalc getMoonPosition (bearing), getTimes at local noon (sunrise, sunset), `src/core/moonPhases.ts` (full, new)',
  `**Second ephemeris:** US Naval Observatory API 4.0.1, fetched once on 2026-11-19 with User-Agent "ScoutNGo (+https://github.com/Jwillyah/scoutngo)" and saved in \`${DIR}/\`: rstt/oneday (tz=-5, dst=false), moon/phases/date (nump=8), celnav at each USNO rise and set minute (Zn, the bearing)`,
  `**Tolerance:** ${TIME_MIN} min, ${AZ_DEG}°. USNO prints to the minute, so up to 0.5 min of each gap is its rounding.`,
  '',
  '## The fixture: batch, ours, USNO',
  '',
  '| | batch fixture | ours | USNO | ours − USNO | |',
  '|---|---|---|---|---|---|',
  ...fixture,
  '',
  '## Every moonrise and moonset in the saved days',
  '',
  '| date (EST) | event | ours | USNO | ours − USNO | |',
  '|---|---|---|---|---|---|',
  ...every,
  '',
  '## The full and new moon instant, four ways',
  '',
  `USNO: full ${when(usnoFull)}, new ${when(usnoNew)}.`,
  '',
  '| method | full (− USNO) | new (− USNO) |',
  '|---|---|---|',
  ...phaseRows,
  '',
  '## The Night tab on the fixture, Thu 19 Nov 7:00 PM',
  '',
  `- Strip: ${strip.map((s) => `${s.date.slice(5)}${s.mark === null ? '' : ` ${s.mark.toUpperCase()}`}`).join(', ')}`,
  `- Mon 23 Nov: moonset ${clock(ours.set23)} at ${(lit23 * 100).toFixed(1)}% lit, sunrise ${clock(ours.sunrise23)}, ${Math.round(gapMin(ours.sunrise23, ours.set23))} min apart: lit enough, not close enough.`,
  ...momentLines,
  '',
  ok ? `## Within ${TIME_MIN} min and ${AZ_DEG}° of USNO.` : '## FAILED: not within tolerance of USNO.',
  '',
]
const file = `measurements/${today}-moon-fixture.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`written to ${file}`)
process.exit(ok ? 0 : 1)
