/*
 * THE SURF CALL ON 12, 13, 14, 16 AND 17 NOV, REPLAYED THROUGH THE APP'S OWN
 * PATH (Batch FIX, Section 3). The successor of
 * scripts/measure-surf-transform.mjs (Batch DRONE, Section 1), which read
 * rangeHourAt at the minute and never passed the chop to the call; this one
 * calls src/lib/useSurfNow.ts surfNowFrom, what the home card, the Surf page
 * and the week read, at the moment the phone was looked at (it reads the
 * hour's half past, as the app does).
 *
 * Truth:
 *   12 and 13 Nov             Flat (0-1 ft)        fixtures/truth/2026-11-12-vb.json, -13-vb.json
 *   14 Nov 1-4 PM             VB 1-2, Croatan 1-2, 1st St Jetty 2-3 (Surfline cams 3:13 PM)
 *   16 Nov 10:50 AM           knee to thigh, wind-chopped, Croatan the only one okay   fixtures/truth/2026-11-16-vb-surf.json
 *   17 Nov 7:05 AM            1st St 0-1, shin to knee, N 13 g15                        fixtures/truth/2026-11-17-vb-dawn.json
 *
 * Usage:  node scripts/measure-surf-fix.mjs label=before root=<a checkout of the old src's parent>
 *         node scripts/measure-surf-fix.mjs                (after: reads the before file beside it)
 * Reads:  tests/data/surf-2026-11-12-14/, tests/data/surf-2026-11-16/, tests/data/surf-2026-11-17/
 *         (Open-Meteo marine and wind at 36.83,-75.97; NDBC 44099, 44014, 44100
 *         realtime and spectral, as the phone gets them through /api/buoy;
 *         NOAA CO-OPS 8638999 Cape Henry wind, 12-17 Nov)
 * Writes: measurements/2026-11-17-surf-fix-before.md (label=before)
 *         measurements/2026-11-17-surf-fix.md (before → after, per day)
 *
 * The buoys: what NDBC had posted BUOY_LAG_MIN before the look; 44099 the
 * nearest, 44014 and 44100 its check. The station: Cape Henry's reading
 * STATION_LAG_MIN before the look, carried to 10 m over the beach
 * (src/core/stationWind.ts normalizeWind), as the phone's coastal pick
 * (src/lib/useStationObs.ts). Code that takes no station ignores it, so the
 * before column is the old code as it ran.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const arg = (k) => process.argv.find((a) => a.startsWith(`${k}=`))?.slice(k.length + 1) ?? null
const LABEL = arg('label') ?? 'after'
const ROOT = resolve(arg('root') ?? '.')
const src = (p) => import(pathToFileURL(resolve(ROOT, 'src', p)).href)
const { parseHourly, MARINE_NAMES, BRIEF_WIND_NAMES } = await src('lib/tideSheetData.ts')
const now$ = await src('lib/useSurfNow.ts')
const { spotStats } = await src('core/spotSkill.ts')
const { beachFactorAt } = await src('core/beachFactor.ts')
const { SURF_SPOTS } = await src('data/surfSpots.ts')
const { normalizeWind } = await src('core/stationWind.ts')
const jetty = await src('core/jettyFactor.ts').catch(() => null)

const BUOY_LAG_MIN = 20
const STATION_LAG_MIN = 6
const KT = 0.514444
const TZ = 'America/New_York'
const num = (x) => (x === undefined || x === 'MM' ? null : Number(x))
const stamp = (f) => new Date(`${f[0]}-${f[1]}-${f[2]}T${f[3]}:${f[4]}:00Z`)
const BUOYS = { '44099': { lat: 36.915, lon: -75.72 }, '44014': { lat: 36.611, lon: -74.836 }, '44100': { lat: 36.258, lon: -75.593 } }

const station = (() => {
  const d = JSON.parse(readFileSync('tests/data/surf-2026-11-17/8638999-wind.json', 'utf8')).data
  return d.map((r) => ({ at: new Date(`${r.t.replace(' ', 'T')}:00Z`), kt: Number(r.s), gustKt: Number(r.g), fromDeg: Number(r.d) })).filter((r) => Number.isFinite(r.kt))
})()
function stationAt(t, facing) {
  const r = station.filter((x) => x.at.getTime() <= t.getTime() - STATION_LAG_MIN * 60_000).sort((a, b) => b.at - a.at)[0]
  if (r === undefined) return null
  const n = normalizeWind({ id: '8638999', kind: 'coastal', mps: r.kt * KT, gustMps: r.gustKt > r.kt ? r.gustKt * KT : null, fromDeg: r.kt === 0 ? null : r.fromDeg }, facing)
  return { obs: { at: r.at, mps: n.mps, fromDeg: r.kt === 0 ? null : r.fromDeg, gustMps: n.gustMps }, raw: r }
}

function day(dir) {
  const marine = parseHourly(JSON.parse(readFileSync(`${dir}/marine.json`, 'utf8')), MARINE_NAMES)
  const wind = parseHourly(JSON.parse(readFileSync(`${dir}/wind.json`, 'utf8')), BRIEF_WIND_NAMES)
  const rows = (b, ext) => readFileSync(`${dir}/${b}.${ext}`, 'utf8').split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '').map((l) => l.trim().split(/\s+/))
  const buoyAt = (id, t) => {
    const f = rows(id, 'txt').filter((r) => stamp(r).getTime() <= t.getTime() - BUOY_LAG_MIN * 60_000 && r[8] !== 'MM').sort((a, b) => stamp(b) - stamp(a))[0]
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

function seaOf(d, place, t) {
  const j = jetty === null || place.id === null ? null : jetty.jettyOf(place.id)
  const buoys = ['44099', '44014', '44100'].map((id) => d.buoyAt(id, t)).filter((b) => b !== null)
  return { status: 'ready', facingState: 'ok', marine: d.marine, wind: d.wind, facing: place.facing, buoy: buoys.find((b) => b.buoy.id === '44099') ?? null, buoys, factor: beachFactorAt(place.at) * (j?.sizeFactor ?? 1), shelter: j?.shelter ?? null }
}

const words = (c, h) => (c === null || h === null ? '—' : `${c.words} ${c.quality ?? c.size} · ${c.wind}${h.clean ? ' · clean' : ''} (centre ${h.centerFt.toFixed(2)}, top ${h.range.highFt.toFixed(2)} ft${h.windKt == null ? '' : `, wind ${h.windKt.toFixed(1)} kt`})`)

/* The app's "now": surfNowFrom at the look, the day called by the hour now (week[0]). */
function callAt(d, place, t, withStation) {
  const sea = seaOf(d, place, t)
  const st = withStation ? stationAt(t, place.facing) : null
  const r = now$.surfNowFrom(sea, stats, t, TZ, st?.obs ?? null)
  const h = r.now
  const c = r.week[0]?.call ?? null
  /* Clean hours left today on the chart (the Surf page's dayHours, the same hours). */
  const left = (r.series ?? []).filter((x) => x.at.getTime() > t.getTime() && x.at.toLocaleDateString('en-US', { timeZone: TZ }) === t.toLocaleDateString('en-US', { timeZone: TZ }) && x.clean)
  return { cell: words(c, h), cleanLeft: left.map((x) => x.at.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric' })), st, week: r.week, watch: r.watch, dominant: h?.windSeaDominant ?? null }
}

const SLOTS = [
  ['Nov 12', 'tests/data/surf-2026-11-12-14', ['2026-11-12T13:30:00Z', '2026-11-12T15:30:00Z', '2026-11-12T17:30:00Z']],
  ['Nov 13', 'tests/data/surf-2026-11-12-14', ['2026-11-13T13:30:00Z', '2026-11-13T15:30:00Z', '2026-11-13T17:30:00Z']],
  ['Nov 14', 'tests/data/surf-2026-11-12-14', ['2026-11-14T18:30:00Z', '2026-11-14T19:30:00Z', '2026-11-14T20:30:00Z', '2026-11-14T21:30:00Z']],
  ['Nov 16', 'tests/data/surf-2026-11-16', ['2026-11-16T15:50:00Z']],
  ['Nov 17', 'tests/data/surf-2026-11-17', ['2026-11-17T12:05:00Z']],
]
const local = (t) => t.toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const rows = []
const notes = []
for (const [, dir, times] of SLOTS) {
  const d = day(dir)
  for (const iso of times) {
    const t = new Date(iso)
    for (const p of PLACES) {
      const model = callAt(d, p, t, false)
      const obs = callAt(d, p, t, true)
      rows.push({ key: `${local(t)} | ${p.name}`, model: model.cell, obs: obs.cell, st: obs.st, cleanLeft: obs.cleanLeft, dominant: obs.dominant })
      if (iso === '2026-11-17T12:05:00Z' && p.id === null) {
        notes.push(...obs.week.map((w) => `- ${w.date}: ${w.call === null ? '—' : `${w.call.words} ${w.call.quality ?? w.call.size} (${w.call.confidence})`}${(w.readings ?? []).length === 0 ? '' : `; readings at the beach, top of the day: ${w.readings.map((r) => `${r.read} ${r.faceFt.toFixed(2)} ft`).join(', ')}`}`))
        if (obs.watch !== undefined) notes.push('', `Bigger-swell watch (src/core/swellWatch.ts): ${obs.watch === null ? 'no chip (no reading reaches 4 ft at the beach on a day called 2 or under)' : obs.watch.words}.`)
      }
    }
  }
}

mkdirSync('measurements', { recursive: true })
const run = `Run: node scripts/measure-surf-fix.mjs${LABEL === 'after' ? '' : ` label=${LABEL}`}, ${new Date().toISOString()}. The app's path (src/lib/useSurfNow.ts surfNowFrom) at the look, the hour read at its half past; buoys ${BUOY_LAG_MIN} min late, 44099 the nearest, 44014 and 44100 its check; Cape Henry (CO-OPS 8638999) ${STATION_LAG_MIN} min late, carried to 10 m; no per-spot history or field reports; VB at ${VB.at.lat},${VB.at.lon} facing ${VB.facing}°, Croatan and 1st Street Jetty at their listed points and facings; region factor ${beachFactorAt(VB.at).toFixed(3)}.`
if (LABEL === 'before') {
  const out = ['# The surf call, 12-17 Nov: before (Batch FIX, Section 3)', '', run, '', 'The code before Batch FIX Section 3 takes no station: its model and station columns are the same call.', '', '| hour | place | call |', '|---|---|---|', ...rows.map((r) => `| ${r.key} | ${r.model} |`), '', '## Week from 17 Nov 7:05 AM, VB', '', ...notes]
  writeFileSync('measurements/2026-11-17-surf-fix-before.md', out.join('\n') + '\n')
  console.log(out.join('\n'))
} else {
  const beforeFile = 'measurements/2026-11-17-surf-fix-before.md'
  if (!existsSync(beforeFile)) throw new Error(`${beforeFile} is missing: run label=before on the old code first`)
  const before = new Map(readFileSync(beforeFile, 'utf8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| hour')).map((l) => {
    const c = l.split(' | ')
    return [`${c[0].slice(2)} | ${c[1]}`, c[2].replace(/ \|$/, '')]
  }))
  const out = ['# The surf call, 12-17 Nov: before → after (Batch FIX, Section 3)', '', run, '', `Before: ${beforeFile} (this script on the code before the change).`, '', 'Truth: 12 and 13 Nov Flat; 14 Nov 1-4 PM VB 1-2, Croatan 1-2, 1st St Jetty 2-3 (Surfline cams 3:13 PM); 16 Nov 10:50 knee to thigh everywhere, Croatan the only one okay, wind-chopped (N 10-14 kt); 17 Nov 7:05 1st St 0-1 shin to knee, N 13 g15.', '', '"after, model wind": the forecast\'s wind alone, as before. "after, with the station": Cape Henry\'s reading leaning the hour (src/lib/surfPageData.ts SurfObs).', '']
  for (const [label] of SLOTS) {
    out.push(`## ${label}`, '', '| hour | place | before | after, model wind | after, with the station | Cape Henry (raw) | wind sea dominates | clean hours left today |', '|---|---|---|---|---|---|---|---|')
    for (const r of rows.filter((x) => x.key.startsWith(`${label},`))) out.push(`| ${r.key} | ${before.get(r.key) ?? '—'} | ${r.model} | ${r.obs} | ${r.st === null ? '—' : `${r.st.raw.kt} kt from ${r.st.raw.fromDeg}° at ${r.st.raw.at.toISOString().slice(11, 16)}Z`} | ${r.dominant === null ? '—' : r.dominant ? 'yes' : 'no'} | ${r.cleanLeft.length === 0 ? 'none' : r.cleanLeft.join(', ')} |`)
    out.push('')
  }
  out.push('## Week from 17 Nov 7:05 AM, VB (with the station)', '', ...notes, '')
  writeFileSync('measurements/2026-11-17-surf-fix.md', out.join('\n'))
  console.log(out.join('\n'))
}
