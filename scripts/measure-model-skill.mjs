/*
 * HOW EACH MODEL DID AT VIRGINIA BEACH, LIVE (Batch K, Section 1).
 *
 * Usage:  node scripts/measure-model-skill.mjs [lat lon]
 * Reads:  live: Open-Meteo previous runs at the two nearest stations,
 *         Iowa State's hourly reports for them, Open-Meteo's six models
 * Writes: measurements/<today>-model-skill.md
 *
 * The same code the phone runs (src/lib/blendData.ts updateSkill), with an
 * in-memory localStorage: 30 days scored, each model's mean error, and the
 * blended week with its spread. Not part of the gate (it is live).
 */
import { writeFileSync } from 'node:fs'
const mem = new Map()
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }
const { updateSkill, skillStations, blendUrl, parseBlend } = await import('../src/lib/blendData.ts')
const { skillOverall, BLEND_MODELS, MODEL_LABEL, blendRun, blendDays } = await import('../src/core/modelSkill.ts')

const venue = { lat: Number(process.argv[2] ?? 36.92), lon: Number(process.argv[3] ?? -76.07) }
const tz = 'America/New_York'
const now = new Date()
const st = skillStations(venue)
const h = await updateSkill(venue, tz, now)
const f = (x, d = 1) => (x === null || x === undefined ? '—' : x.toFixed(d))
const lines = [
  `# Model skill at ${venue.lat}, ${venue.lon}, live, ${now.toISOString()}`,
  '',
  `Command: node scripts/measure-model-skill.mjs ${venue.lat} ${venue.lon}`,
  `Stations: ${st.map((s) => `${s.id} (${s.km.toFixed(1)} km)`).join(', ')}`,
  `Days scored: ${h?.days.length ?? 0} (${h?.days[0]?.date} to ${h?.days.at(-1)?.date})`,
  '',
  'Forecast made the day before minus measured. Temperature °C, wind and gust m/s, cloud %, rain hit rate.',
  '',
  '| model | temp bias | temp MAE | wind bias | wind MAE | gust bias | cloud bias | rain hit |',
  '|---|---|---|---|---|---|---|---|',
]
for (const m of BLEND_MODELS) {
  const s = (v) => skillOverall(h, m, v)
  lines.push(`| ${MODEL_LABEL[m]} | ${f(s('temp').bias)} | ${f(s('temp').mae)} | ${f(s('wind').bias)} | ${f(s('wind').mae)} | ${f(s('gust').bias)} | ${f(s('cloud').bias)} | ${s('rain').hit === null ? '—' : `${Math.round(s('rain').hit * 100)}%`} |`)
}
const run = parseBlend(await (await fetch(blendUrl(venue))).json())
const days = blendDays(blendRun(run, h, tz), tz)
lines.push('', '## The blended week, corrected', '', '| date | high °C | spread | low °C | rain chance | wind max m/s |', '|---|---|---|---|---|---|')
for (const d of days) lines.push(`| ${d.date} | ${f(d.hi)} | ${f(d.hiLo)}–${f(d.hiHi)} | ${f(d.lo)} | ${d.rainChance === null ? '—' : `${Math.round(d.rainChance * 100)}%`} | ${f(d.windMax)} |`)
const out = `measurements/${now.toISOString().slice(0, 10)}-model-skill.md`
writeFileSync(out, `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
console.log(`wrote ${out}`)
