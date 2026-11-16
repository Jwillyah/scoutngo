/*
 * THE SURF TRANSFORM ON 12, 13, 14 AND 16 NOV, REPLAYED (Batch DRONE,
 * Section 1, the real fix for CORE 8.1). One model must give:
 *
 *   12 and 13 Nov             Flat (0–1 ft)    fixtures/truth/2026-11-12-vb.json, -13-vb.json
 *   14 Nov 1–4 PM             VB 1–2, Croatan ≥ 1–2 (Surfline's cams 3:13 PM, src/core/surf.ts)
 *   16 Nov 10:50 AM           VB 1–2, Croatan best, no clean, no Rideable   fixtures/truth/2026-11-16-vb-surf.json
 *
 * Usage:  node scripts/measure-surf-transform.mjs label=before   (the code before the change)
 *         node scripts/measure-surf-transform.mjs                (after: reads the before file beside it)
 * Reads:  tests/data/surf-2026-11-12-14/, tests/data/surf-2026-11-16/
 *         (Open-Meteo marine and wind at 36.83,-75.97; NDBC 44099, 44014, 44100
 *         realtime and spectral, as the phone gets them through /api/buoy)
 * Writes: measurements/2026-11-16-surf-transform-before.md (label=before)
 *         measurements/2026-11-16-surf-transform.md (before → after, per day)
 *
 * The phone's buoys: the readings NDBC had posted LAG_MIN before the hour
 * (on 16 Nov at 10:50 the phone showed 44099's 15:26Z reading, 24 min old);
 * the nearest buoy (44099) leans, 44014 and 44100 are its check. The
 * spectral split rides with each reading, as /api/buoy sends it. No per-spot
 * history, no field reports on the phone. Facing: VB 100° (the oceanfront,
 * fixtures/truth/2026-11-13-vb.json), Croatan and 1st Street Jetty their
 * listed facings (src/data/surfSpots.ts). Each hour read where the app reads
 * it: at half past, the 16 Nov one at 10:50.
 *
 * The same file runs on both sides of the change: what the newer code adds
 * (src/core/jettyFactor.ts, surfCall's quality) is looked for, not assumed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseHourly, MARINE_NAMES, BRIEF_WIND_NAMES } from '../src/lib/tideSheetData.ts'
import { buoyLean, rangeHourAt } from '../src/lib/surfPageData.ts'
import * as callMod from '../src/core/surfCall.ts'
import { sideWords } from '../src/core/homeDay.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { beachFactorAt } from '../src/core/beachFactor.ts'
import { SURF_SPOTS } from '../src/data/surfSpots.ts'

const LABEL = process.argv.find((a) => a.startsWith('label='))?.slice(6) ?? 'after'
const LAG_MIN = 20
const jetty = await import('../src/core/jettyFactor.ts').catch(() => null)
const num = (x) => (x === undefined || x === 'MM' ? null : Number(x))
const stamp = (f) => new Date(`${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`)
const BUOYS = { '44099': { lat: 36.915, lon: -75.72 }, '44014': { lat: 36.611, lon: -74.836 }, '44100': { lat: 36.258, lon: -75.593 } }

function day(dir) {
  const marine = parseHourly(JSON.parse(readFileSync(`${dir}/marine.json`, 'utf8')), MARINE_NAMES)
  const wind = parseHourly(JSON.parse(readFileSync(`${dir}/wind.json`, 'utf8')), BRIEF_WIND_NAMES)
  const rows = (b, ext) => readFileSync(`${dir}/${b}.${ext}`, 'utf8').split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '').map((l) => l.trim().split(/\s+/))
  const buoyAt = (id, t) => {
    const f = rows(id, 'txt').filter((r) => stamp(r).getTime() <= t.getTime() - LAG_MIN * 60_000 && r[8] !== 'MM').sort((a, b) => stamp(b) - stamp(a))[0]
    if (f === undefined) return null
    const s = rows(id, 'spec').find((g) => stamp(g).getTime() === stamp(f).getTime())
    return { status: 'ok', buoy: { id, name: id, at: BUOYS[id], km: 0 }, at: stamp(f), waveM: Number(f[8]), periodS: num(f[9]), fromDeg: num(f[11]), split: s === undefined ? null : { swellM: num(s[6]), swellS: num(s[7]), windWaveM: num(s[8]), windWaveS: num(s[9]), swellFrom: s[10] === 'MM' ? null : s[10], windWaveFrom: s[11] === 'MM' ? null : s[11] } }
  }
  return { marine, wind, buoyAt }
}

const VB = { name: 'VB', id: null, at: { lat: 36.83, lon: -75.97 }, facing: 100 }
const spot = (id) => {
  const s = SURF_SPOTS.find((x) => x.id === id)
  return { name: s.name, id, at: s.at, facing: s.facing }
}
const PLACES = [VB, spot('vb-croatan'), spot('vb-1st-street-jetty')]
const stats = spotStats([], 0)

function callAt(d, place, t) {
  const region = beachFactorAt(place.at)
  const j = jetty === null || place.id === null ? null : jetty.jettyOf(place.id)
  const factor = region * (j?.sizeFactor ?? 1)
  const shelter = j?.shelter ?? null
  const others = ['44014', '44100'].map((id) => d.buoyAt(id, t)).filter((b) => b !== null)
  const b = d.buoyAt('44099', t)
  const lean = buoyLean(d.marine, d.wind, b, place.facing, stats, factor, t.getTime(), others, shelter)
  const plain = rangeHourAt(d.marine, d.wind, t, place.facing, stats, factor, null, shelter)
  const h = rangeHourAt(d.marine, d.wind, t, place.facing, stats, factor, lean, shelter)
  if (h === null) return null
  const c = callMod.surfCall({ centerFt: h.centerFt, shape: h.shape, side: h.side === null ? null : sideWords(h.side), windKt: h.windKt ?? null }, 0)
  return { model: plain?.centerFt ?? null, centre: h.centerFt, words: c.words, tag: c.quality ?? c.size, wind: c.wind, clean: h.clean, factor }
}

const SLOTS = [
  ['Nov 12', 'tests/data/surf-2026-11-12-14', ['2026-11-12T13:30:00Z', '2026-11-12T15:30:00Z', '2026-11-12T17:30:00Z']],
  ['Nov 13', 'tests/data/surf-2026-11-12-14', ['2026-11-13T13:30:00Z', '2026-11-13T15:30:00Z', '2026-11-13T17:30:00Z']],
  ['Nov 14', 'tests/data/surf-2026-11-12-14', ['2026-11-14T18:30:00Z', '2026-11-14T19:30:00Z', '2026-11-14T20:30:00Z', '2026-11-14T21:30:00Z']],
  ['Nov 16', 'tests/data/surf-2026-11-16', ['2026-11-16T15:50:00Z']],
]
const local = (t) => t.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const rows = []
for (const [, dir, times] of SLOTS) {
  const d = day(dir)
  for (const iso of times) {
    const t = new Date(iso)
    for (const p of PLACES) {
      const c = callAt(d, p, t)
      rows.push({ key: `${local(t)} | ${p.name}`, cell: c === null ? '—' : `${c.words} ${c.tag} · ${c.wind}${c.clean ? ' · clean band' : ''} (model ${c.model === null ? '—' : c.model.toFixed(2)}, leaned ${c.centre.toFixed(2)} ft)` })
    }
  }
}

mkdirSync('measurements', { recursive: true })
const run = `Run: node scripts/measure-surf-transform.mjs${LABEL === 'after' ? '' : ` label=${LABEL}`}, ${new Date().toISOString()}. Buoys ${LAG_MIN} min late; 44099 leans, 44014 and 44100 check it; no per-spot history or field reports; VB at ${VB.at.lat},${VB.at.lon} facing ${VB.facing}°, Croatan and 1st Street Jetty at their listed points and facings; region factor ${beachFactorAt(VB.at).toFixed(3)}${jetty === null ? '; no per-spot jetty factors in this code' : `; jetty factors from src/core/jettyFactor.ts`}.`
if (LABEL === 'before') {
  const out = ['# The surf transform, 12-16 Nov: before (Batch DRONE, Section 1)', '', run, '', '| hour | place | call |', '|---|---|---|', ...rows.map((r) => `| ${r.key} | ${r.cell} |`)]
  writeFileSync('measurements/2026-11-16-surf-transform-before.md', out.join('\n') + '\n')
  console.log(out.join('\n'))
} else {
  const beforeFile = 'measurements/2026-11-16-surf-transform-before.md'
  if (!existsSync(beforeFile)) throw new Error(`${beforeFile} is missing: run label=before on the old code first`)
  const before = new Map(readFileSync(beforeFile, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| hour')).map((l) => {
    const c = l.split(' | ')
    return [`${c[0].slice(2)} | ${c[1]}`, c[2].replace(/ \|$/, '')]
  }))
  const out = ['# The surf transform, 12-16 Nov: before → after (Batch DRONE, Section 1)', '', run, '', `Before: ${beforeFile} (the same script on the code before the change).`, '', 'Truth: 12 and 13 Nov Flat; 14 Nov 1-4 PM VB 1-2, Croatan 1-2, 1st St Jetty 2-3 (Surfline cams 3:13 PM); 16 Nov 10:50 knee to thigh everywhere, Croatan the only one okay, wind-chopped (N 10-14 kt).', '']
  for (const [label] of SLOTS) {
    out.push(`## ${label}`, '', '| hour | place | before | after |', '|---|---|---|---|')
    for (const r of rows.filter((x) => x.key.startsWith(`${label},`))) out.push(`| ${r.key} | ${before.get(r.key) ?? '—'} | ${r.cell} |`)
    out.push('')
  }
  writeFileSync('measurements/2026-11-16-surf-transform.md', out.join('\n'))
  console.log(out.join('\n'))
}
