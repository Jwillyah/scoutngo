/*
 * THE SHARED CORRECTIONS FILE, MADE (Batch L, Section 1). Run each night by
 * .github/workflows/model-skill.yml; runnable by hand the same way:
 *
 *   node scripts/skill/build-shared.ts skill/midatl.json out/
 *
 * For every station in the region's config: the last `days` days of hourly
 * reports (IEM for ASOS stations, NDBC for buoys) and what each of the six
 * models forecast for those hours 0-24, 24-48 and 48-72 hours ahead
 * (Open-Meteo's previous runs). Scored with src/core/sharedSkill.ts, the
 * same code the phone reads it with. Writes
 *
 *   out/skill/v1/<region>/<date>.json.gz   the file, gzipped
 *   out/skill/v1/<region>/latest.json      which file is newest, its size and rows
 *
 * and keeps the previous days' files the site already has (up to KEEP_DAYS).
 *
 * NEVER PARTIAL. Any source that does not answer, a station or buoy with no
 * reports, or a model with no forecast at a station stops the run with a
 * non-zero exit and nothing is written: the site keeps yesterday's file,
 * which the phone stops using after 3 days.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { asosUrl, parseAsos } from '../../src/core/asos.ts'
import { BLEND_MODELS, type ModelId } from '../../src/core/modelSkill.ts'
import { buildShared, LEADS, parseNdbcMet, rowCount, SHARED_VARS, validateShared, type Lead, type LeadSeries, type Obs, type SharedVar } from '../../src/core/sharedSkill.ts'

const [configPath = 'skill/midatl.json', outDir = 'out'] = process.argv.slice(2)
const PAGES = process.env.SKILL_PAGES_BASE ?? 'https://jwillyah.github.io/scoutngo/skill/v1'
const PREVIOUS = 'https://previous-runs-api.open-meteo.com/v1/forecast'
const KEEP_DAYS = 7
const PER_REQUEST = 5

interface Config {
  region: string
  name: string
  timeZone: string
  days: number
  stations: { id: string; kind: 'asos' | 'ndbc'; name: string; lat: number; lon: number }[]
}
const cfg = JSON.parse(readFileSync(configPath, 'utf8')) as Config

const problems: string[] = []
const die = (why: string): never => {
  console.error(`\nFAILED: ${why}`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get(url: string, what: string, tries = 3): Promise<Response> {
  let last = ''
  for (let i = 0; i < tries; i += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { 'user-agent': 'scoutngo-model-skill (github.com/Jwillyah/scoutngo)' } })
      if (r.ok) return r
      last = `HTTP ${r.status}`
    } catch (e) {
      last = e instanceof Error ? e.message : String(e)
    }
    await sleep(5_000 * (i + 1))
  }
  return die(`${what}: ${last}`)
}

/* ------------------------------------------------------------ the dates */

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: cfg.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
const local = (utcKey: string) => {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(`${utcKey}:00Z`)).map((p) => [p.type, p.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 }
}
const now = new Date()
const date = local(now.toISOString().slice(0, 16)).date
/* A day either side of the window, so every local hour in it has its report and forecast. */
const fetchFrom = new Date(Date.parse(`${date}T00:00:00Z`) - (cfg.days + 2) * 86_400_000)
console.log(`${cfg.region}: ${cfg.stations.length} stations, ${cfg.days} days to ${date} (${cfg.timeZone})`)

/* ------------------------------------------------------- station reports */

const obs: Record<string, Obs[]> = {}
const asos = cfg.stations.filter((s) => s.kind === 'asos')
if (asos.length > 0) {
  const csv = await (await get(asosUrl(asos.map((s) => s.id), fetchFrom, now), 'IEM ASOS')).text()
  const rows = parseAsos(csv, asos.map((s) => s.id))
  if (rows.length === 0) die('IEM ASOS answered with no reports')
  for (const r of rows) (obs[r.station] ??= []).push({ at: r.at, temp: r.tempC, dew: r.dewC ?? null, wind: r.windMps, gust: r.gustMps, dir: r.dirDeg ?? null, cloud: r.cloudPct, wet: r.wet })
  console.log(`IEM: ${rows.length} reports`)
}

for (const b of cfg.stations.filter((s) => s.kind === 'ndbc')) {
  const rows = parseNdbcMet(await (await get(`https://www.ndbc.noaa.gov/data/realtime2/${b.id}.txt`, `NDBC ${b.id}`)).text()).filter((o) => o.at >= fetchFrom)
  if (rows.length === 0) problems.push(`buoy ${b.id} ${b.name}: no reports in the window`)
  obs[b.id] = rows
}
console.log(`NDBC: ${cfg.stations.filter((s) => s.kind === 'ndbc').length} buoys`)
for (const s of cfg.stations) if ((obs[s.id] ?? []).length === 0 && !problems.some((p) => p.includes(s.id))) problems.push(`${s.id} ${s.name}: no reports`)
if (problems.length > 0) die('stations with no reports (remove them from the config, or wait for the source)')

/* ------------------------------------------------------------- forecasts */

const API: Record<SharedVar, string> = { temp: 'temperature_2m', dew: 'dew_point_2m', wind: 'wind_speed_10m', gust: 'wind_gusts_10m', dir: 'wind_direction_10m', cloud: 'cloud_cover', rain: 'precipitation' }
const SUFFIX: Record<Lead, string> = { d0: '', d1: '_previous_day1', d2: '_previous_day2' }
const forecasts: Record<string, LeadSeries> = {}
for (let i = 0; i < cfg.stations.length; i += PER_REQUEST) {
  const group = cfg.stations.slice(i, i + PER_REQUEST)
  const p = new URLSearchParams({
    latitude: group.map((s) => s.lat.toFixed(2)).join(','),
    longitude: group.map((s) => s.lon.toFixed(2)).join(','),
    hourly: SHARED_VARS.flatMap((v) => LEADS.map((l) => `${API[v]}${SUFFIX[l]}`)).join(','),
    models: BLEND_MODELS.join(','),
    wind_speed_unit: 'ms',
    past_days: String(cfg.days + 2),
    forecast_days: '1',
    timezone: 'GMT',
  })
  const payload = (await (await get(`${PREVIOUS}?${p.toString()}`, `Open-Meteo previous runs (${group.map((s) => s.id).join(',')})`)).json()) as unknown
  const locs = Array.isArray(payload) ? payload : [payload]
  if (locs.length !== group.length) die(`Open-Meteo answered ${locs.length} places for ${group.length}`)
  group.forEach((s, k) => {
    const h = (locs[k] as { hourly?: Record<string, unknown> }).hourly
    if (h === undefined || !Array.isArray(h.time)) return problems.push(`${s.id}: no forecast`)
    const times = h.time as string[]
    const per: LeadSeries = {}
    for (const m of BLEND_MODELS) {
      for (const l of LEADS) {
        for (const v of SHARED_VARS) {
          const list = h[`${API[v]}${SUFFIX[l]}_${m}`]
          if (!Array.isArray(list) || !list.some((x) => typeof x === 'number')) continue
          ;(((per[m] ??= {})[l] ??= {}) as Partial<Record<SharedVar, ReadonlyMap<string, number | null>>>)[v] = new Map(times.map((t, j) => [t, typeof list[j] === 'number' ? (list[j] as number) : null]))
        }
      }
      /* Every model must have at least its temperature 0-24 h ahead at every station. */
      if (per[m]?.d0?.temp === undefined) problems.push(`${s.id}: ${m} has no forecast`)
    }
    forecasts[s.id] = per
  })
  await sleep(4_000)
}
if (problems.length > 0) die('models missing from the previous runs')
console.log(`Open-Meteo: ${Object.keys(forecasts).length} places x ${BLEND_MODELS.length} models`)

/* ----------------------------------------------------------- the file */

const file = buildShared({ region: cfg.region, name: cfg.name, timeZone: cfg.timeZone, generated: now, date, days: cfg.days, stations: cfg.stations, obs, forecasts, local })
for (const s of file.stations) if (s.obs === 0) problems.push(`${s.id} ${s.name}: no hour with both a report and a forecast`)
if (problems.length > 0) die('stations that could not be scored')
const v = validateShared(file)
if (!v.ok) die(`the file does not pass its own schema: ${v.reason}`)

const raw = Buffer.from(JSON.stringify(file))
const gz = gzipSync(raw, { level: 9 })
const dir = join(outDir, 'skill/v1', cfg.region)
mkdirSync(dir, { recursive: true })
const name = `${date}.json.gz`
writeFileSync(join(dir, name), gz)

/* The days before, as the site has them now: so a phone mid-download never finds its file gone. */
const history: string[] = [name]
try {
  const prev = (await (await fetch(`${PAGES}/${cfg.region}/latest.json`, { signal: AbortSignal.timeout(30_000) })).json()) as { history?: string[] }
  for (const f of (prev.history ?? []).filter((x) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(x) && x !== name).slice(0, KEEP_DAYS - 1)) {
    const r = await fetch(`${PAGES}/${cfg.region}/${f}`, { signal: AbortSignal.timeout(60_000) })
    if (!r.ok) continue
    writeFileSync(join(dir, f), Buffer.from(await r.arrayBuffer()))
    history.push(f)
  }
} catch {
  console.log('no earlier files on the site (first run)')
}

const manifest = {
  schema: file.schema,
  region: file.region,
  date,
  generated: file.generated,
  file: name,
  bytes: gz.length,
  rawBytes: raw.length,
  sha256: createHash('sha256').update(gz).digest('hex'),
  stations: file.stations.length,
  rows: rowCount(file),
  history,
}
writeFileSync(join(dir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n')
writeFileSync(join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>scoutngo model skill</title><p>Public model-accuracy files for scoutngo. Schema: <a href="https://github.com/Jwillyah/scoutngo/blob/main/docs/model-skill.md">docs/model-skill.md</a>. Newest: <a href="skill/v1/${cfg.region}/latest.json">${cfg.region}</a>.</p>\n`)

console.log(`\n${name}: ${file.stations.length} stations, ${manifest.rows} rows, ${raw.length} bytes, ${gz.length} gzipped`)
for (const id of ['KNTU', 'KORF']) {
  const c = file.check[id]
  if (c === undefined) continue
  for (const m of BLEND_MODELS) {
    const x = c[m as ModelId]
    if (x !== undefined) console.log(`  check ${id} ${m}: temp bias ${x.rawBias} -> ${x.corrBias}, MAE ${x.rawMae} -> ${x.corrMae} (${x.n} h, last 7 days)`)
  }
}
