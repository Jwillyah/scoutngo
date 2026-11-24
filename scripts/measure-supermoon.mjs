/*
 * THE SUPERMOON, OURS AGAINST A SECOND EPHEMERIS (Batch SIMPLE-3, 2b).
 *
 * Usage:  node scripts/measure-supermoon.mjs
 * Writes: measurements/<today>-supermoon.md
 * Exits:  0 when suncalc's distance reproduces Meeus's worked example 47.a to
 *         0.5 km, the two ephemerides agree within 200 km at every full moon of
 *         2026-27 and on which side of SUPERMOON_MAX_KM each falls, and the
 *         fixture card shows; 1 otherwise.
 *
 * NO NETWORK. Both ephemerides are code in this repo:
 *
 *   ours    suncalc 2.0.2 getMoonPosition().distance: Meeus chapter 47, every
 *           distance term of table 47.A, on Terrestrial Time
 *   second  src/core/ephemeris2.ts moonPosition2().distanceKm: the check-only
 *           ephemeris, written separately from Meeus, its 13 largest distance
 *           terms; it shares no code with suncalc
 *
 * The full instant is src/core/moonPhases.ts (Meeus 49), the one source.
 * The batch's own numbers are a column to check, not a reference.
 */
import { writeFileSync } from 'node:fs'
import { getMoonPosition, getTimes } from 'suncalc'
import { moonPosition2 } from '../src/core/ephemeris2.ts'
import { moonDistanceKm, moonHomeMoment, moonGoAlert, SUPERMOON_MAX_KM } from '../src/core/moonMoment.ts'
import { moonMoments } from '../src/core/moonNights.ts'
import { moonPhasesBetween } from '../src/core/moonPhases.ts'
import { formatClock } from '../src/core/timezone.ts'

const LAT = 36.851
const LON = -75.98
const TZ = 'America/New_York'
const FROM = new Date('2026-01-01T00:00:00Z')
const TO = new Date('2028-01-01T00:00:00Z')
const AGREE_KM = 200
const NOW = new Date('2026-11-24T03:27:00Z') // Mon 23 Nov 10:27 PM EST

let bad = 0
const MIN = 60_000
const round = (d) => new Date(Math.round(d.getTime() / MIN) * MIN)
const clock = (d) => formatClock(round(d), TZ, 12)
const day = (d) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(d)
const km = (x) => Math.round(x * 10) / 10

/* Meeus, Astronomical Algorithms 2nd ed., example 47.a: 1992 Apr 12 0h TD, Δ = 368409.7 km. suncalc adds ΔT itself, so it is given UT (TD − 59 s in 1992). */
const example = km(getMoonPosition(new Date(Date.UTC(1992, 3, 12) - 59_000), 0, 0).distance)
const exampleOk = Math.abs(example - 368409.7) <= 0.5
if (!exampleOk) bad += 1

const rows = moonPhasesBetween(FROM, TO)
  .filter((p) => p.kind === 'full')
  .map((p) => {
    const ours = moonDistanceKm(p.at)
    const second = moonPosition2(p.at, LAT, LON).distanceKm
    const sideOk = (ours <= SUPERMOON_MAX_KM) === (second <= SUPERMOON_MAX_KM)
    const ok = Math.abs(ours - second) <= AGREE_KM && sideOk
    if (!ok) bad += 1
    return { at: p.at, ours, second, ok, superm: ours <= SUPERMOON_MAX_KM }
  })
if (rows.length < 24) bad += 1

const m = moonHomeMoment(NOW, LAT, LON, TZ)
const alert = moonGoAlert(m, NOW)
if (m === null || m.which !== 'supermoon') bad += 1
const sun24 = getTimes(new Date('2026-11-24T17:00:00Z'), LAT, LON)
const set24 = moonMoments(NOW, LAT, LON, TZ, 2).find((x) => x.kind === 'moonset-at-sunrise' && x.date === '2026-11-24')
const full = rows.find((r) => r.at.toISOString().startsWith('2026-11-24'))

const today = new Date().toLocaleDateString('en-CA')
const lines = [
  '# The supermoon of 24 Nov 2026, ours against a second ephemeris',
  '',
  `**Date:** ${today}`,
  '**Script:** `scripts/measure-supermoon.mjs` (no network)',
  `**Place:** Atlantic Park Surf, ${LAT}, ${LON}, ${TZ} (EST, UTC−5)`,
  `**Rule:** a full moon whose Earth–Moon distance (centre to centre) at the full instant is ${SUPERMOON_MAX_KM.toLocaleString('en-US')} km or less`,
  '**Ours:** suncalc 2.0.2 getMoonPosition().distance (Meeus 47, full table 47.A, TT), through `src/core/moonMoment.ts` moonDistanceKm; full instant `src/core/moonPhases.ts` (Meeus 49)',
  '**Second:** `src/core/ephemeris2.ts` moonPosition2().distanceKm (Meeus 47, its 13 largest distance terms, separate code)',
  `**Tolerance:** ${AGREE_KM} km between the two, and the same side of the line`,
  `**Card checked at:** ${day(NOW)} ${clock(NOW)}`,
  '',
  '## Meeus example 47.a',
  '',
  `1992 Apr 12 0h TD, book: 368409.7 km; suncalc: ${example} km · ${exampleOk ? 'ok' : 'FAIL'}`,
  '',
  '## The fixture: batch, ours',
  '',
  '| | batch | ours | |',
  '|---|---|---|---|',
  `| distance at full | 360,765 km | ${full === undefined ? '—' : `${km(full.ours)} km (second ${km(full.second)} km)`} | ${full !== undefined && full.superm ? 'supermoon' : 'FAIL'} |`,
  `| full instant | — | ${full === undefined ? '—' : `${day(full.at)} ${clock(full.at)}`} | |`,
  `| Mon 23 Nov 10:27 PM card | shows | ${m === null ? 'none' : `"${m.eyebrow}" / "${m.line}"`} | ${m?.which === 'supermoon' ? 'ok' : 'FAIL'} |`,
  `| Tue 24 moonrise | 4:38 PM ENE ~57° | ${m === null ? '—' : `${clock(m.event.at)} ${m.event.compass} ${m.event.azimuth.toFixed(1)}°`} | |`,
  `| Tue 24 sunset | 4:50 PM | ${sun24.sunset instanceof Date ? clock(sun24.sunset) : '—'} | |`,
  `| Tue 24 moonset | 7:00 AM WNW | ${set24 === undefined ? '—' : `${clock(set24.moonset.at)} ${set24.moonset.compass} ${set24.moonset.azimuth.toFixed(1)}° (sunrise ${clock(set24.sunrise)}, ${(set24.lit * 100).toFixed(1)}% lit)`} | |`,
  `| Go alert | 15 min before the rise | ${alert === null ? 'none' : `${clock(alert.fireAt)} "${alert.text}"`} | |`,
  '',
  '## Every full moon, 2026–2027',
  '',
  '| full (EST) | ours km | second km | ours − second | supermoon | |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${day(r.at)} ${r.at.getUTCFullYear()} ${clock(r.at)} | ${km(r.ours)} | ${km(r.second)} | ${(r.ours - r.second).toFixed(1)} | ${r.superm ? 'yes' : 'no'} | ${r.ok ? 'ok' : 'FAIL'} |`),
  '',
  `${rows.length} full moons; ${rows.filter((r) => r.superm).length} supermoons by the rule; ${bad === 0 ? 'every check passed' : `${bad} checks FAILED`}.`,
  '',
]
const file = `measurements/${today}-supermoon.md`
writeFileSync(file, lines.join('\n'))
console.log(`wrote ${file}${bad === 0 ? '' : ` · ${bad} FAILED`}`)
process.exit(bad === 0 ? 0 : 1)
