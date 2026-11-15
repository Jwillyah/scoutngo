/*
 * THE SURF NOWCAST ON 12-14 NOV, REPLAYED (Batch LIVE, Section 9A). 14 Nov
 * 3:13 PM: Surfline observed 2-3 ft at 1st St Jetty, Croatan 1-2 with
 * surfers out, North End 1-2; we said 0-1 Flat, the forecast's line having
 * run about 1.7 ft all morning and dropped to 0 at 2 PM when 44099's
 * nowcast took over (wind waves 5.9 ft 5 s NW, swell 0.3 ft 11 s). 12 and
 * 13 Nov were flat (fixtures/truth/2026-11-12-vb.json, 2026-11-13-vb.json).
 *
 * Usage:  node scripts/measure-surf-nowcast.mjs [label=before|after]
 * Reads:  tests/data/surf-2026-11-12-14/ (Open-Meteo's marine and wind at
 *         36.83,-75.97, the 12th to the 14th; NDBC 44099, 44014 and 44100,
 *         their realtime and spectral files)
 * Writes: measurements/2026-11-14-surf-nowcast-<label>.md
 *
 * The phone's buoys: the readings NDBC had posted LAG_MIN before each hour
 * (an assumption); the nearest buoy is the one the app leans on (44099).
 * Facing 100° (the oceanfront, fixtures/truth/2026-11-13-vb.json); beach
 * factor the region's; no per-spot history. Each hour at half past, local.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseHourly, MARINE_NAMES, BRIEF_WIND_NAMES } from '../src/lib/tideSheetData.ts'
import { buoyLean, rangeHourAt } from '../src/lib/surfPageData.ts'
import { surfCall } from '../src/core/surfCall.ts'
import { sideWords } from '../src/core/homeDay.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { beachFactorAt } from '../src/core/beachFactor.ts'

const DIR = 'tests/data/surf-2026-11-12-14'
const LABEL = process.argv.find((a) => a.startsWith('label='))?.slice(6) ?? 'after'
const LAG_MIN = 30
const FACING = 100
const AT = { lat: 36.83, lon: -75.97 }
const marine = parseHourly(JSON.parse(readFileSync(`${DIR}/marine.json`, 'utf8')), MARINE_NAMES)
const wind = parseHourly(JSON.parse(readFileSync(`${DIR}/wind.json`, 'utf8')), BRIEF_WIND_NAMES)
const num = (x) => (x === undefined || x === 'MM' ? null : Number(x))
const rows = (b, ext) => readFileSync(`${DIR}/${b}.${ext}`, 'utf8').split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '').map((l) => l.trim().split(/\s+/))
const stamp = (f) => new Date(`${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`)
const BUOYS = { '44099': { lat: 36.915, lon: -75.72 }, '44014': { lat: 36.611, lon: -74.836 }, '44100': { lat: 36.258, lon: -75.593 } }
function buoyAt(id, t) {
  const f = rows(id, 'txt').filter((r) => stamp(r).getTime() <= t.getTime() - LAG_MIN * 60_000 && r[8] !== 'MM').sort((a, b) => stamp(b) - stamp(a))[0]
  if (f === undefined) return null
  const s = rows(id, 'spec').find((g) => stamp(g).getTime() === stamp(f).getTime())
  return { status: 'ok', buoy: { id, name: id, at: BUOYS[id], km: 0 }, at: stamp(f), waveM: Number(f[8]), periodS: num(f[9]), fromDeg: num(f[11]), split: s === undefined ? null : { swellM: num(s[6]), swellS: num(s[7]), windWaveM: num(s[8]), windWaveS: num(s[9]), swellFrom: s[10] === 'MM' ? null : s[10], windWaveFrom: s[11] === 'MM' ? null : s[11] } }
}
const factor = beachFactorAt(AT)
const stats = spotStats([], 0)
const local = (d) => d.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric' })
const out = [`# The surf nowcast, 12-14 Nov, replayed: ${LABEL} (Batch LIVE, Section 9A)`, '', `Run: node scripts/measure-surf-nowcast.mjs label=${LABEL}, ${new Date().toISOString()}. ${AT.lat},${AT.lon}, facing ${FACING}°, beach factor ${factor.toFixed(3)}, buoys ${LAG_MIN} min late, no per-spot history.`, '', '| hour | 44099 | forecast centre | leaned centre | call |', '|---|---|---|---|---|']
const hours = [['2026-11-12', [8, 10, 12]], ['2026-11-13', [8, 10, 12]], ['2026-11-14', [13, 14, 15, 16]]]
for (const [date, hs] of hours) {
  for (const h of hs) {
    const t = new Date(`${date}T${String(h + 5).padStart(2, '0')}:30:00Z`)
    const others = ['44014', '44100'].map((id) => buoyAt(id, t)).filter((b) => b !== null)
    const b = buoyAt('44099', t)
    const lean = buoyLean(marine, wind, b, FACING, stats, factor, t.getTime(), others)
    const plain = rangeHourAt(marine, wind, t, FACING, stats, factor, null)
    const head = rangeHourAt(marine, wind, t, FACING, stats, factor, lean)
    const call = head === null ? null : surfCall({ centerFt: head.centerFt, shape: head.shape, side: head.side === null ? null : sideWords(head.side) }, 0)
    out.push(`| ${local(t)} | ${b === null ? '—' : `${b.waveM} m ${b.periodS} s from ${b.fromDeg}°`} | ${plain === null ? '—' : plain.centerFt.toFixed(2)} | ${head === null ? '—' : head.centerFt.toFixed(2)} | ${call === null ? '—' : `${call.words} ${call.size}`} |`)
  }
}
mkdirSync('measurements', { recursive: true })
writeFileSync(`measurements/2026-11-14-surf-nowcast-${LABEL}.md`, out.join('\n') + '\n')
console.log(out.join('\n'))
