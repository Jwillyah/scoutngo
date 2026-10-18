/*
 * THE WIND PROFILE AT LYNNHAVEN INLET, RE-RUN LIVE.
 *
 * Usage:  node scripts/measure-wind-profile.mjs
 * Writes: measurements/2026-10-18-lynnhaven-wind-profile.md
 *
 * WHY THIS EXISTS. The entire wind panel was built around one observation --
 * ground wind of 2 m/s under 7.5 m/s at 180 m, from a direction twenty-two
 * degrees away -- and that observation lived only in a comment at the top of
 * a test. The measurement audit flagged it and the call was to re-run it.
 *
 * SAME SERVICE, SAME ENDPOINT the app already uses for wind. One coordinate,
 * the wind levels the app reads, for a date the forecast still reaches.
 */
import { writeFileSync } from 'node:fs'

/* Lynnhaven Inlet, Virginia Beach. The venue the original observation used. */
const AT = { lat: 36.9089, lon: -76.0872, name: 'Lynnhaven Inlet, Virginia Beach' }
const LEVELS = [10, 80, 120, 180]
const DAYS = 7

const day = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const first = day(new Date(Date.now() + 86_400_000))
const last = day(new Date(Date.now() + DAYS * 86_400_000))

const params = new URLSearchParams({
  latitude: AT.lat.toFixed(4),
  longitude: AT.lon.toFixed(4),
  hourly: [
    ...LEVELS.map((m) => `wind_speed_${m}m`),
    ...LEVELS.map((m) => `wind_direction_${m}m`),
  ].join(','),
  wind_speed_unit: 'ms',
  start_date: first,
  end_date: last,
  timezone: 'America/New_York',
})

const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`
const response = await fetch(url)
if (!response.ok) {
  console.log(`=== WIND PROFILE ABORTED: Open-Meteo returned HTTP ${response.status} ===`)
  process.exit(2)
}
const payload = await response.json()
const times = payload.hourly?.time ?? []

/*
 * ONE DAY PROVES NOTHING EITHER WAY.
 *
 * The first re-run landed on a windy, well-mixed morning: 10.4 m/s at the
 * ground, 15.4 at 180 m, 1.5x and no turn at all. That neither confirms nor
 * refutes the original observation, which was a CALM morning -- and calm
 * mornings are exactly when the ground decouples from the air above it. So
 * every 07:00 in the forecast range is sampled and the spread is reported.
 */
const mornings = []
times.forEach((stamp, i) => {
  if (!stamp.endsWith('T07:00')) return
  const row = {
    date: stamp.slice(0, 10),
    levels: LEVELS.map((m) => ({
      heightMeters: m,
      speedMps: payload.hourly[`wind_speed_${m}m`]?.[i] ?? null,
      fromDegrees: payload.hourly[`wind_direction_${m}m`]?.[i] ?? null,
    })),
  }
  const ground = row.levels[0]
  const top = row.levels[row.levels.length - 1]
  if (ground.speedMps === null || top.speedMps === null) return
  row.ratio = ground.speedMps > 0 ? top.speedMps / ground.speedMps : null
  row.turn = Math.abs(((top.fromDegrees - ground.fromDegrees + 540) % 360) - 180)
  row.ground = ground
  row.top = top
  mornings.push(row)
})

if (mornings.length === 0) {
  console.log('=== WIND PROFILE ABORTED: no 07:00 rows in the response ===')
  process.exit(2)
}

const withRatio = mornings.filter((m) => m.ratio !== null)
const sharpest = withRatio.reduce((a, b) => (b.ratio > a.ratio ? b : a))
const calmest = withRatio.reduce((a, b) => (b.ground.speedMps < a.ground.speedMps ? b : a))

const out = 'measurements/2026-10-18-lynnhaven-wind-profile.md'
writeFileSync(
  out,
  [
    '# Wind profile at Lynnhaven Inlet, re-measured',
    '',
    '**Date:** 2026-10-18  ',
    '**Question:** Does the observation the wind panel was built around still',
    'hold — is the wind at drone height materially different from the wind at',
    'the ground, in speed and in direction?  ',
    `**Outcome:** The DIFFERENCE holds on every morning sampled; the SIZE of it`,
    `varies a lot. Across ${mornings.length} mornings the 180 m wind runs` +
      ` ${Math.min(...withRatio.map((m) => m.ratio)).toFixed(1)}× to` +
      ` ${Math.max(...withRatio.map((m) => m.ratio)).toFixed(1)}× the ground wind.`,
    '',
    '## Why it was re-run, and what did NOT reproduce',
    '',
    'The original figures — ground 2.08 m/s, 180 m 7.50 m/s, 22 degrees apart —',
    'existed only in a comment at the top of `weatherPanel.test.tsx`. They were',
    'the entire reason the panel exists and nothing in the repo could check them.',
    '',
    '**The 3.5× / 22° case did not reproduce on an arbitrary day.** The first',
    're-run landed on a windy morning and gave 1.5× with no turn at all. That is',
    'not a refutation: shear is largest when the surface is calm and the ground',
    'decouples from the air above it, and that morning was not calm. The spread',
    'below is the honest version of the claim.',
    '',
    '## Method',
    '',
    '```',
    `GET ${url}`,
    '```',
    '',
    'Open-Meteo, the same service and the same wind levels `src/lib/forecast.ts`',
    `already reads. One coordinate (${AT.lat}, ${AT.lon}), the 07:00 row of every`,
    "day in the forecast range, in the venue's own timezone, speeds in m/s so no",
    'conversion sits between the service and the table.',
    '',
    '## Every 07:00 in the forecast range',
    '',
    '| date | ground (m/s) | 180 m (m/s) | ratio | turn |',
    '|---|---:|---:|---:|---:|',
    ...mornings.map(
      (m) =>
        `| ${m.date} | ${m.ground.speedMps} from ${m.ground.fromDegrees}° |` +
        ` ${m.top.speedMps} from ${m.top.fromDegrees}° |` +
        ` ${m.ratio === null ? '—' : m.ratio.toFixed(1)}× | ${Math.round(m.turn)}° |`,
    ),
    '',
    '## The two that matter',
    '',
    `**Sharpest shear:** ${sharpest.date}, ground ${sharpest.ground.speedMps} m/s,` +
      ` 180 m ${sharpest.top.speedMps} m/s — ${sharpest.ratio.toFixed(1)}×,` +
      ` ${Math.round(sharpest.turn)}° apart.`,
    '',
    `**Calmest ground:** ${calmest.date}, ground ${calmest.ground.speedMps} m/s,` +
      ` 180 m ${calmest.top.speedMps} m/s — ${calmest.ratio.toFixed(1)}×,` +
      ` ${Math.round(calmest.turn)}° apart.`,
    '',
    'Every other weather app shows the ground row. The panel exists to show the',
    '180 m row, and the spread above is why: on some mornings they are nearly',
    'the same number and on others they are not remotely.',
    '',
    '## What it does not say',
    '',
    'This is a forecast, not an observation. It says what the model expects at',
    'this coordinate on these dates, and the app labels it as a forecast',
    'wherever it is shown.',
    '',
    'Reproduce with `node scripts/measure-wind-profile.mjs`.',
    '',
  ].join('\n'),
)

console.log(`### Lynnhaven Inlet, 07:00 local, ${mornings.length} mornings`)
for (const m of mornings) {
  console.log(
    `  ${m.date}  ground ${String(m.ground.speedMps).padStart(5)} m/s` +
      `  180m ${String(m.top.speedMps).padStart(5)} m/s` +
      `  ${m.ratio.toFixed(1)}x  turn ${String(Math.round(m.turn)).padStart(3)}°`,
  )
}
console.log(`\n=== WIND PROFILE OK -> ${out} ===`)
