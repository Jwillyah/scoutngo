/*
 * THE NIGHTLY SURF RECORD (Batch Beach, Section 3). Run each night by
 * .github/workflows/model-skill.yml beside the model-skill file; by hand:
 *
 *   node scripts/skill/build-surf.ts public
 *
 * For every spot in src/data/surfSpots.ts (public places, the list the app
 * ships): what we said and what the sea did, through the app's own code.
 *
 *   leads       our surf range for today, tomorrow and the day after: the
 *               day's biggest hour, 5 AM to 8 PM local (src/lib/surfPageData.ts
 *               dayHours, no per-phone history, the region's beach factor)
 *   buoy        the nearest buoy on the beach's water, its latest reading, as
 *               faces at this beach (src/core/spotSkill.ts buoyFaceFt)
 *   yesterday   the observation proxy: yesterday's buoy, hour by hour 5 AM
 *               to 8 PM, through the same function; its biggest and median
 *
 * Writes out/skill/v1/surf/<date>.json and latest.json; keeps KEEP_DAYS days,
 * the history the learned factors (a later batch) are fitted on.
 *
 * PUBLIC DATA ONLY: Open-Meteo Marine and NOAA NDBC, asked for public spots'
 * coordinates. Nothing about any user. NEVER PARTIAL: a forecast that does
 * not answer for a spot stops the run with nothing written; a buoy that does
 * not is recorded as null, not guessed.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseNdbcWaves } from '../../src/core/accuracy.ts'
import { beachFactorAt, regionOf } from '../../src/core/beachFactor.ts'
import { buoyFaceFt } from '../../src/core/spotSkill.ts'
import { zonedTimeToUtc } from '../../src/core/timezone.ts'
import { SURF_SPOTS } from '../../src/data/surfSpots.ts'
import { nearestBuoys } from '../../src/lib/buoy.ts'
import { dayHours, FIRST_HOUR, LAST_HOUR } from '../../src/lib/surfPageData.ts'
import { peakHour } from '../../src/core/surfRange.ts'
import type { Hourly } from '../../src/lib/tideSheetData.ts'

const [outDir = 'out'] = process.argv.slice(2)
const TZ = 'America/New_York'
const KEEP_DAYS = 60
const LEAD_DAYS = 3
const MARINE = 'https://marine-api.open-meteo.com/v1/marine'
const UA = { 'user-agent': 'scoutngo-surf-record (github.com/Jwillyah/scoutngo)' }

const die = (why: string): never => {
  console.error(`\nFAILED: ${why}`)
  process.exit(1)
}
const localDay = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t)
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
/* No phone's history: the shared record is the transform's own. */
const NO_HISTORY = { n: 0, biasFt: null, spreadFt: null, days: 0 }
const r1 = (x: number) => Math.round(x * 10) / 10

async function text(url: string): Promise<string | null> {
  for (let i = 0; i < 3; i += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: UA })
      if (r.ok) return await r.text()
    } catch {
      /* tried again */
    }
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)))
  }
  return null
}

async function marine(at: { lat: number; lon: number }): Promise<Hourly> {
  const vars = 'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,swell_wave_direction,wind_wave_height'
  const u = `${MARINE}?latitude=${at.lat.toFixed(2)}&longitude=${at.lon.toFixed(2)}&hourly=${vars}&forecast_days=${LEAD_DAYS + 1}&timezone=GMT`
  const t = await text(u)
  if (t === null) return die(`Open-Meteo Marine did not answer for ${at.lat.toFixed(2)}, ${at.lon.toFixed(2)}`)
  const j = JSON.parse(t) as { hourly?: Record<string, (number | null)[]> & { time: string[] } }
  if (j.hourly === undefined) return die('Open-Meteo Marine answered without hours')
  const times = j.hourly.time.map((s) => Date.parse(`${s}:00Z`))
  const values: Record<string, (number | null)[]> = {}
  for (const k of vars.split(',')) values[k] = j.hourly[k] ?? times.map(() => null)
  return { times, values } as Hourly
}

const now = Date.now()
const today = localDay(now)
const yesterday = addDays(today, -1)
const buoyCache = new Map<string, ReturnType<typeof parseNdbcWaves> | null>()

const spots = []
for (const s of SURF_SPOTS) {
  const factor = beachFactorAt(s.at)
  const m = await marine(s.at)
  const leads = Array.from({ length: LEAD_DAYS }, (_, lead) => {
    const date = addDays(today, lead)
    const peak = peakHour(dayHours(m, null, date, TZ, s.facing, NO_HISTORY, factor))
    return peak === null ? { lead, date, lowFt: null, centerFt: null, highFt: null } : { lead, date, lowFt: r1(peak.range.lowFt), centerFt: r1(peak.range.centerFt), highFt: r1(peak.range.highFt) }
  })
  const pick = nearestBuoys(s.at, 1, s.facing)[0] ?? null
  let buoy = null
  let seen = null
  if (pick !== null) {
    if (!buoyCache.has(pick.id)) {
      const t = await text(`https://www.ndbc.noaa.gov/data/realtime2/${pick.id}.txt`)
      buoyCache.set(pick.id, t === null ? null : parseNdbcWaves(t))
    }
    const obs = buoyCache.get(pick.id) ?? null
    const face = (o: { waveM: number; periodS: number | null; fromDeg: number | null }) => buoyFaceFt(o, s.facing, factor)
    const latest = obs?.find((o) => o.periodS !== null && o.fromDeg !== null) ?? null
    if (latest !== null) {
      const f = face(latest)
      buoy = { id: pick.id, at: latest.at.toISOString(), waveFt: r1(latest.waveM * 3.28084), periodS: latest.periodS, fromDeg: latest.fromDeg, faceFt: f === null ? null : r1(f) }
    }
    const from = zonedTimeToUtc(yesterday, `${String(FIRST_HOUR).padStart(2, '0')}:00`, TZ)?.getTime() ?? null
    const to = zonedTimeToUtc(yesterday, `${String(LAST_HOUR + 1).padStart(2, '0')}:00`, TZ)?.getTime() ?? null
    if (obs !== null && from !== null && to !== null) {
      const faces = obs
        .filter((o) => o.at.getTime() >= from && o.at.getTime() < to)
        .map(face)
        .filter((f): f is number => f !== null)
        .sort((a, b) => a - b)
      if (faces.length > 0) seen = { date: yesterday, buoy: pick.id, readings: faces.length, maxFt: r1(faces[faces.length - 1]), medianFt: r1(faces[Math.floor(faces.length / 2)]) }
    }
  }
  spots.push({ id: s.id, name: s.name, facing: s.facing, region: regionOf(s.at)?.id ?? null, factor: Math.round(factor * 1000) / 1000, leads, buoy, yesterday: seen })
}

const file = { v: 1, date: today, made: new Date(now).toISOString(), timeZone: TZ, spots }
const dir = join(outDir, 'skill', 'v1', 'surf')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, `${today}.json`), `${JSON.stringify(file)}\n`)
writeFileSync(join(dir, 'latest.json'), `${JSON.stringify({ v: 1, date: today, file: `${today}.json`, spots: spots.length })}\n`)
const oldest = addDays(today, -(KEEP_DAYS - 1))
for (const f of readdirSync(dir)) if (/^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f.slice(0, 10) < oldest) rmSync(join(dir, f))
console.log(`wrote ${join(dir, `${today}.json`)}: ${spots.length} spots, ${spots.filter((s) => s.buoy !== null).length} with a buoy, ${spots.filter((s) => s.yesterday !== null).length} with yesterday's proxy`)
