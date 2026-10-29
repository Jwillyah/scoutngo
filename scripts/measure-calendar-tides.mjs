/*
 * THE CALENDAR'S "LOW TIDE NEAR SUNRISE / SUNSET", WORKED OUT TWO WAYS.
 *
 * Usage:  node scripts/measure-calendar-tides.mjs
 * Writes: measurements/<today>-calendar-tides.md
 * Exits:  0 the two agree on every date; 1 they do not; 2 could not look.
 *
 * The app's way: src/core/calendarMonth.ts, with NOAA's turns asked in GMT
 * and parsed by the app (src/lib/noaa.ts), and sunrise and sunset stepped a
 * minute at a time on the calibrated horizon (src/core/sunrise.ts).
 *
 * The second way: NOAA's own table in local time (lst_ldt), read as text,
 * and suncalc's analytic getTimes() sunrise and sunset. A low within 90
 * minutes of either, each way. Three dates at the Virginia Beach pier.
 */
import { writeFileSync } from 'node:fs'
import { getTimes } from 'suncalc'
import { calendarMonth } from '../src/core/calendarMonth.ts'
import { LOW_NEAR_SUNRISE_MIN } from '../src/core/glassMornings.ts'
import { zonedTimeToUtc } from '../src/core/timezone.ts'
import { APPLICATION, parseExtremes, PREDICTIONS_URL } from '../src/lib/noaa.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const TZ = 'America/New_York'
const STATION = '8639168'
const DATES = ['2026-11-03', '2026-11-15', '2026-11-27']

const ask = async (params) => {
  const r = await fetch(`${PREDICTIONS_URL}?${new URLSearchParams({ product: 'predictions', application: APPLICATION, datum: 'MLLW', station: STATION, units: 'english', format: 'json', interval: 'hilo', ...params })}`)
  if (!r.ok) throw new Error(`NOAA answered HTTP ${r.status}`)
  return r.json()
}

try {
  const rows = []
  let agree = true
  for (const date of DATES) {
    const d = date.replace(/-/g, '')
    const gmt = parseExtremes(await ask({ begin_date: d, end_date: d, time_zone: 'gmt' }))
    /* The app's: the calendar for the month, this day. Buffer the day either side, as the page does. */
    const around = parseExtremes(await ask({ begin_date: d, end_date: d, time_zone: 'gmt', range: '48' }))
    const day = calendarMonth({ year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)), ...PIER, timeZone: TZ, today: date, forecastUntil: null, extremes: [...gmt, ...around], windAt: () => null, skyAt: () => null, facing: null, surfFtAt: () => null, milkyDates: new Set() }).find((x) => x.date === date)
    if (day === undefined) throw new Error(`no ${date} in its own month`)
    const app = { rise: day.marks.includes('tide-rise'), set: day.marks.includes('tide-set') }
    /* The second way: NOAA's local table as text, and suncalc's sunrise and sunset. */
    const local = (await ask({ begin_date: d, end_date: d, time_zone: 'lst_ldt' })).predictions ?? []
    const lows = local.filter((p) => p.type === 'L').map((p) => zonedTimeToUtc(p.t.slice(0, 10), p.t.slice(11, 16), TZ))
    const noon = zonedTimeToUtc(date, '12:00', TZ)
    const t = getTimes(noon, PIER.lat, PIER.lon)
    const near = (sun) => lows.some((l) => l !== null && Math.abs(l.getTime() - sun.getTime()) <= LOW_NEAR_SUNRISE_MIN * 60_000)
    const other = { rise: near(t.sunrise), set: near(t.sunset) }
    const same = app.rise === other.rise && app.set === other.set
    if (!same) agree = false
    rows.push(`| ${date} | ${local.map((p) => `${p.type} ${p.t.slice(11)}`).join(', ')} | ${t.sunrise.toISOString().slice(11, 16)}Z / ${t.sunset.toISOString().slice(11, 16)}Z | ${app.rise ? 'yes' : 'no'} / ${app.set ? 'yes' : 'no'} | ${other.rise ? 'yes' : 'no'} / ${other.set ? 'yes' : 'no'} | ${same ? 'agree' : '**DISAGREE**'} |`)
    console.log(`  ${date}: app ${JSON.stringify(app)}, NOAA table + suncalc ${JSON.stringify(other)}`)
  }
  const lines = [
    "# The calendar's low tide near sunrise and sunset, two ways",
    '',
    `Run: ${new Date().toISOString()} · node scripts/measure-calendar-tides.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · station ${STATION} · within ${LOW_NEAR_SUNRISE_MIN} min`,
    '',
    "App: src/core/calendarMonth.ts on NOAA's turns asked in GMT, sunrise and sunset on the calibrated horizon. Second way: NOAA's own local-time table read as text, and suncalc's getTimes().",
    '',
    '| date | NOAA local table | suncalc sunrise / sunset | app: near sunrise / sunset | second way | |',
    '|---|---|---|---|---|---|',
    ...rows,
    '',
    agree ? 'The two agree on every date.' : 'They DISAGREE: see the table.',
    '',
  ]
  const file = `measurements/${new Date().toISOString().slice(0, 10)}-calendar-tides.md`
  writeFileSync(file, lines.join('\n'))
  console.log(`wrote ${file}`)
  process.exit(agree ? 0 : 1)
} catch (error) {
  console.error(`could not look: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(2)
}
