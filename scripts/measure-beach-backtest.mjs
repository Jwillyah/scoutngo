/*
 * THE RIGHT BEACH, 30 DAYS BACK (Batch Beach, Section 1).
 *
 * Usage:  node scripts/measure-beach-backtest.mjs [--days 30] [--out measurements/<file>.md]
 * Reads:  live, public, keyless: NDBC realtime2 (44095 Oregon Inlet, 44099
 *         Cape Henry), Open-Meteo Marine with past_days, OpenFreeMap's
 *         vector tiles (the map's own) for the facing the app read at the
 *         10 Nov Rodanthe pin.
 *
 * At S-Turns and Mirlo Beach (src/data/surfSpots.ts), every hour of the
 * buoy, through the app's own transform (src/core/surf.ts surfEstimate):
 *
 *   before   the facing the app read at the 10 Nov pin (the town's point on
 *            the sound side, the tiles' circle method), as it did
 *   after    the spot's own ocean facing
 *
 * and how often a buoy of 2 ft or more came out under 1 ft at the beach.
 * Then the model (Open-Meteo Marine, the swell at the spot, the same
 * transform) against the buoy's own beach estimate, by the hour: the
 * forecast's bias per region, OBX (44095) and Virginia Beach (44099 at the
 * pier). This is the forecast against the buoy, not the beach against the
 * buoy: only a look at the beach can calibrate that (src/data/beachObservations.ts).
 *
 * NOT IN THE GATE: it reaches live hosts.
 */
import { writeFileSync } from 'node:fs'

const mem = new Map()
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }
const { setVectorLoader } = await import('../src/lib/vectorTiles.ts')
const { seaTestAround } = await import('../src/lib/coast.ts')
const { facingByCircle } = await import('../src/core/coastFacing.ts')
const { parseNdbcWaves } = await import('../src/core/accuracy.ts')
const { surfEstimate } = await import('../src/core/surf.ts')
const { SURF_SPOTS } = await import('../src/data/surfSpots.ts')
setVectorLoader(async (url) => {
  const r = await fetch(url).catch(() => null)
  return r === null || !r.ok ? null : await r.arrayBuffer()
})

const args = process.argv.slice(2)
const DAYS = Number(args.includes('--days') ? args[args.indexOf('--days') + 1] : 30)
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : `measurements/${new Date().toISOString().slice(0, 10)}-beach-backtest.md`
const FT = 3.28084
const PIN_10_NOV = { lat: 35.5935, lon: -75.4679 }
const spot = (id) => SURF_SPOTS.find((s) => s.id === id)
const VB = { id: 'vb-pier', name: 'VB Pier', at: { lat: 36.844, lon: -75.971 }, facing: 80 }

const text = async (u) => {
  const r = await fetch(u)
  if (!r.ok) throw new Error(`${u}: ${r.status}`)
  return r.text()
}
const since = Date.now() - DAYS * 86_400_000
const buoy = async (id) => parseNdbcWaves(await text(`https://www.ndbc.noaa.gov/data/realtime2/${id}.txt`)).filter((o) => o.at.getTime() >= since && o.periodS !== null && o.fromDeg !== null)

const L = []
const say = (s) => {
  console.log(s)
  L.push(s)
}
const pct = (a, b) => (b === 0 ? '—' : `${Math.round((100 * a) / b)}%`)
const mean = (xs) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)

/* The facing the app read at the 10 Nov pin, by the tiles' circle method (src/lib/coast.ts before Batch Beach). */
const near = await seaTestAround(PIN_10_NOV)
const before = near === null ? null : facingByCircle(PIN_10_NOV, near)

say('# The right beach, 30 days back: S-Turns and Mirlo against 44095')
say('')
say(`Run ${new Date().toISOString()} · \`node scripts/measure-beach-backtest.mjs --days ${DAYS}\` · NDBC realtime2 44095 and 44099, the last ${DAYS} days; Open-Meteo Marine (past_days ${DAYS}); OpenFreeMap tiles for the facing at the 10 Nov pin (${PIN_10_NOV.lat}, ${PIN_10_NOV.lon}).`)
say('')
say(`- the facing the app read at the 10 Nov pin: ${before === null ? 'the tiles did not answer' : `${Math.round(before)}°`} (the sound side)`)
say('')

const b95 = await buoy('44095')
const b99 = await buoy('44099')
say('## Before and after, the buoy through the transform')
say('')
say('| spot | facing before | facing after | buoy hours | ≥ 2 ft | of those, under 1 ft at the beach: before | after | mean face before | after |')
say('|---|---|---|---|---|---|---|---|---|')
for (const s of [spot('s-turns'), spot('mirlo-beach')]) {
  const big = b95.filter((o) => o.waveM * FT >= 2)
  const face = (o, f) => surfEstimate(o.waveM, o.periodS, o.fromDeg, f).faceFt
  const under = (f) => big.filter((o) => face(o, f) < 1).length
  const mb = before === null ? null : mean(b95.map((o) => face(o, before)))
  const ma = mean(b95.map((o) => face(o, s.facing)))
  say(`| ${s.name} | ${before === null ? '—' : `${Math.round(before)}°`} | ${s.facing}° | ${b95.length} | ${big.length} | ${before === null ? '—' : `${under(before)} (${pct(under(before), big.length)})`} | ${under(s.facing)} (${pct(under(s.facing), big.length)}) | ${mb === null ? '—' : `${mb.toFixed(1)} ft`} | ${ma === null ? '—' : `${ma.toFixed(1)} ft`} |`)
}

say('')
say('## The forecast against the buoy, by region')
say('')
say("The model's face (Open-Meteo Marine's swell at the spot) against the buoy's face at the same hour, both through the same transform and facing. Positive: the forecast high.")
say('')
say('| region | spot | buoy | pairs | forecast mean | buoy mean | bias | ratio forecast / buoy |')
say('|---|---|---|---|---|---|---|---|')
const marine = async (at) => {
  const u = `https://marine-api.open-meteo.com/v1/marine?latitude=${at.lat.toFixed(2)}&longitude=${at.lon.toFixed(2)}&hourly=swell_wave_height,swell_wave_period,swell_wave_direction&past_days=${DAYS}&forecast_days=1&timezone=GMT`
  const j = JSON.parse(await text(u))
  const h = j.hourly
  return h.time.map((t, i) => ({ at: Date.parse(`${t}:00Z`), m: h.swell_wave_height[i], t: h.swell_wave_period[i], d: h.swell_wave_direction[i] }))
}
for (const [region, s, obs, id] of [['OBX', spot('s-turns'), b95, '44095'], ['OBX', spot('mirlo-beach'), b95, '44095'], ['Virginia Beach', VB, b99, '44099']]) {
  const model = await marine(s.at)
  const pairs = []
  for (const o of obs) {
    const hr = Math.round(o.at.getTime() / 3_600_000) * 3_600_000
    const m = model.find((x) => x.at === hr)
    if (m === undefined || m.m === null || m.t === null || m.d === null) continue
    pairs.push([surfEstimate(m.m, m.t, m.d, s.facing).faceFt, surfEstimate(o.waveM, o.periodS, o.fromDeg, s.facing).faceFt])
  }
  const fm = mean(pairs.map((p) => p[0]))
  const bm = mean(pairs.map((p) => p[1]))
  say(`| ${region} | ${s.name} | ${id} | ${pairs.length} | ${fm === null ? '—' : `${fm.toFixed(2)} ft`} | ${bm === null ? '—' : `${bm.toFixed(2)} ft`} | ${fm === null ? '—' : `${(fm - bm).toFixed(2)} ft`} | ${fm === null || !bm ? '—' : (fm / bm).toFixed(2)} |`)
}

writeFileSync(OUT, `${L.join('\n')}\n`)
console.log(`wrote ${OUT}`)
