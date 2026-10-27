/*
 * THE SURF ESTIMATE, TWO PUBLISHED FORMULAS, BESIDE THE BUOY, 3 DAYS.
 *
 * Usage:  node scripts/measure-surf-checks.mjs
 * Writes: measurements/<today>-surf-checks.md
 * Exits:  0 the two formulas within BREAK_AGREE everywhere; 1 not; 2 could not look.
 *
 * Virginia Beach Fishing Pier, every 6 hours over the last 3 days:
 *   the Open-Meteo Marine swell there (past_days=3), broken at the beach by
 *   Komar and Gaillard (1973) and by Le Mehaute and Koh (1967) (src/core/surf.ts),
 *   the beach facing worked out from the map tiles (src/lib/coast.ts);
 *   beside it, Open-Meteo's combined wave height and the nearest NDBC buoy's
 *   observed wave height for the same half hour, so the forecast can be seen
 *   against what the sea did.
 */
import { writeFileSync } from 'node:fs'
import { BREAK_AGREE, breakKomar, breakLeMehaute, angledHeight, BEACH_SLOPE } from '../src/core/surf.ts'
import { coastFacing } from '../src/lib/coast.ts'
import { setVectorLoader } from '../src/lib/vectorTiles.ts'
import { nearestBuoys } from '../src/lib/buoy.ts'
import { parseRealtime } from '../api/buoy.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const FT = 3.28084
setVectorLoader(async (url) => {
  const r = await fetch(url)
  return r.ok ? r.arrayBuffer() : null
})

const lines = []
let ok = true
try {
  const facingRaw = await coastFacing(PIER)
  if (typeof facingRaw === 'string') throw new Error(`no beach facing at the pier (${facingRaw})`)
  const facing = facingRaw.facing
  const params = new URLSearchParams({ latitude: String(PIER.lat), longitude: String(PIER.lon), hourly: 'wave_height,swell_wave_height,swell_wave_period,swell_wave_direction', past_days: '3', forecast_days: '1', timezone: 'GMT' })
  const marine = (await (await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`)).json()).hourly
  const buoy = nearestBuoys(PIER)[0]
  const text = await (await fetch(`https://www.ndbc.noaa.gov/data/realtime2/${buoy.id}.txt`)).text()
  const obs = text
    .split('\n')
    .filter((l) => !l.startsWith('#') && l.trim() !== '')
    .map((l) => parseRealtime(`${text.split('\n')[0]}\n${l}`))
    .filter((o) => o !== null)
  lines.push(`Beach facing ${Math.round(facing)}° (from the map tiles). Beach slope for Le Mehaute and Koh: 1/${Math.round(1 / BEACH_SLOPE)} (assumed). Buoy: NDBC ${buoy.id} ${buoy.name}, ${buoy.km.toFixed(1)} km.`, '')
  lines.push('| time (UTC) | swell (ft, s, from) | angled H0 (ft) | Komar & Gaillard (ft) | Le Mehaute & Koh (ft) | apart | Open-Meteo waves (ft) | buoy observed (ft) |', '|---|---|---|---|---|---|---|---|')
  let worst = 0
  let rows = 0
  const now = Date.now()
  for (let i = 0; i < marine.time.length; i += 6) {
    const t = Date.parse(`${marine.time[i]}:00Z`)
    if (t > now) break
    const h = marine.swell_wave_height[i]
    const T = marine.swell_wave_period[i]
    const d = marine.swell_wave_direction[i]
    if (h == null || T == null || d == null) continue
    const h0 = angledHeight(h, d, facing)
    const k = breakKomar(h0, T)
    const l = breakLeMehaute(h0, T)
    const apart = Math.max(k, l) === 0 ? 0 : Math.abs(k - l) / Math.max(k, l)
    worst = Math.max(worst, apart)
    rows += 1
    const near = obs.reduce((best, o) => (best === null || Math.abs(Date.parse(o.at) - t) < Math.abs(Date.parse(best.at) - t) ? o : best), null)
    const buoyFt = near !== null && Math.abs(Date.parse(near.at) - t) <= 1_800_000 ? (near.waveM * FT).toFixed(1) : '—'
    lines.push(`| ${marine.time[i]} | ${(h * FT).toFixed(1)}, ${T.toFixed(1)}, ${Math.round(d)}° | ${(h0 * FT).toFixed(1)} | ${(k * FT).toFixed(1)} | ${(l * FT).toFixed(1)} | ${(apart * 100).toFixed(0)}% | ${marine.wave_height[i] == null ? '—' : (marine.wave_height[i] * FT).toFixed(1)} | ${buoyFt} |`)
  }
  lines.push('', `${rows} times. Largest difference between the two formulas: ${(worst * 100).toFixed(0)}% (limit ${BREAK_AGREE * 100}%).`, '')
  if (rows < 10) {
    ok = false
    lines.push(`FAIL: only ${rows} times to compare`)
  }
  if (worst > BREAK_AGREE) {
    ok = false
    lines.push('FAIL: the two formulas disagree past the limit')
  }
} catch (error) {
  console.log(`=== SURF CHECKS ABORTED: ${error instanceof Error ? error.message : String(error)} ===`)
  process.exit(2)
}
const out = ['# The surf estimate, two published formulas, beside the buoy', '', `Run: ${new Date().toISOString()} · node scripts/measure-surf-checks.mjs · Virginia Beach Fishing Pier ${PIER.lat}, ${PIER.lon} · Open-Meteo Marine (past 3 days) · NOAA NDBC realtime2`, '', ...lines, ok ? 'Pass.' : 'FAIL.', '']
writeFileSync(`measurements/${new Date().toISOString().slice(0, 10)}-surf-checks.md`, out.join('\n'))
console.log(out.join('\n'))
process.exit(ok ? 0 : 1)
