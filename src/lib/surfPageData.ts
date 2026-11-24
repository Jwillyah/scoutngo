/*
 * THE SURF PAGE v2's HOURS (Batch N, Section 1): the forecast series read
 * hour by hour into the line and band the page draws. Every number is from
 * src/core (surf.ts, spotSkill.ts, surfRange.ts, briefing.ts); this only
 * reads the series and hands them over.
 *
 * The face is surfAt's (src/lib/surfDay.ts), the same one the home's surf
 * card and the per-spot check (src/lib/useSpotSkill.ts) use: one source.
 */
import { surfTag, windTag, type SurfTag, type WindTag } from '../core/briefing.ts'
import { windSide } from '../core/coastFacing.ts'
import { shelteredMps, type Shelter } from '../core/jettyFactor.ts'
import { BEACH_CAP, surfShape, type SurfShape } from '../core/surf.ts'
import { seaChop, surfChop, surfQuality, type SurfQuality } from '../core/surfCall.ts'
import { buoySeaParts, forecastSeaKinds, seaEnergyAtBeach, seaFaceFt, seaReach, windSeaDominates, type KindPart } from '../core/surfTransform.ts'
import { nowcastAt, type StationObs } from '../core/nowcast.ts'
import { buoyFaceFt, correctedRange, type SkillSample, type SpotStats, type SurfRange } from '../core/spotSkill.ts'
import { buoyConsensus, cappedMiss, LEAN_CAP_FT, leanRange, surfLean, type SurfLean } from '../core/surfNowcast.ts'
import { peakHour, seaSpreadFt } from '../core/surfRange.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'
import type { WatchReading } from '../core/swellWatch.ts'
import type { BuoyReading } from './buoy.ts'
import { surfAt } from './surfDay.ts'
import { hourlyAt, type Hourly } from './tideSheetData.ts'

export interface RangeHour {
  at: Date
  /** The face the forecast gives, before this spot's correction, feet. */
  forecastFt: number
  /** The line (corrected centre) and the likely range, leaned to the live buoy (src/core/surfNowcast.ts). */
  range: SurfRange
  /** How far the buoy moved the centre this hour, feet; 0 when it did not. */
  leanFt: number
  centerFt: number
  /** The spread used for the band, feet (see SURF_SPREAD_SOURCE); null when the forecast gave one reading. */
  spreadFt: number | null
  periodS: number
  fromDeg: number
  shape: SurfShape | null
  side: WindTag | null
  clean: boolean
  tag: SurfTag
  /** The wind on the water, knots (after a jetty's shelter); null when no wind came. */
  windKt: number | null
  /** Whether that wind chops the water (src/core/surfCall.ts surfChop): then never clean, never Rideable. */
  chop: boolean
  /** The pill: Poor, Poor-Fair, Fair, Good, or the chop words when the wind chops the water. */
  quality: SurfQuality
  /** Whether the wind sea dominates the swell at the beach this hour (src/core/surfTransform.ts windSeaDominates); null when the sea's parts could not be worked out. */
  windSeaDominant: boolean | null
}

/*
 * WHAT THE STATION AND THE BUOY SAY NEAR NOW (Batch FIX, Section 3.1). The
 * forecast's wind at VB read 7.8 kt for the 10:30 AM hour on 16 Nov and 7.6
 * kt for 7:30 AM on 17 Nov (measurements/2026-11-17-surf-fix.md), while the
 * beach had N 10-14 and N 13 g15 (fixtures/truth/2026-11-16-vb-surf.json,
 * 2026-11-17-vb-dawn.json): the chop rule needs what is blowing. So an hour
 * near now reads
 *
 *   station  the station's report (src/core/nowcast.ts StationObs, carried to
 *            10 m over the spot), leaning the model's wind the way the home's
 *            wind leans (nowcastAt: all of it at the report, fading over 3 h);
 *            the caller passes only a fresh one (obsFresh)
 *   buoy     the fresh buoy's own parts, wind sea and swell
 *            (src/core/surfTransform.ts buoySeaKinds), for the hours within
 *            LEAN_BUOY_MAX_AGE_MS of its reading; the forecast's parts after
 *
 * Every screen passes the same (src/lib/useSurfNow.ts surfObs).
 */
export interface SurfObs {
  station: StationObs | null
  buoy: { at: number; parts: KindPart[] } | null
}

/*
 * The whole sea's face (wave_*) as one part, by the same transform, only when
 * the forecast gave its parts (what surfAt used); else null (one reading, no
 * spread). Batch DRONE, Section 1: the sea part by part against the sea
 * taken whole.
 */
function wholeSeaFaceFt(marine: Hourly, at: Date, facing: number | null, factor: number): number | null {
  if (hourlyAt(marine, 'swell_wave_height', at) === null) return null
  return seaFaceFt([{ heightM: hourlyAt(marine, 'wave_height', at), periodS: hourlyAt(marine, 'wave_period', at), fromDeg: hourlyAt(marine, 'wave_direction', at) }], facing, factor)
}

/** One hour, or null where the forecast said nothing. `shelter`: a jetty's lee (src/core/jettyFactor.ts), null on an open beach. */
export function rangeHourAt(marine: Hourly, wind: Hourly | null, at: Date, facing: number | null, stats: SpotStats, factor: number = BEACH_CAP, lean: SurfLean | null = null, shelter: Shelter | null = null, obs: SurfObs | null = null): RangeHour | null {
  const s = surfAt(marine, at, facing, factor)
  if (s === null) return null
  const model = (t: Date) => {
    const mps = wind === null ? null : hourlyAt(wind, 'wind_speed_10m', t)
    return mps === null || wind === null ? null : { mps, fromDeg: hourlyAt(wind, 'wind_direction_10m', t), gustMps: null }
  }
  /* Batch FIX, Section 3.1: near a station's report, its wind (SurfObs). */
  const blown = obs?.station == null ? model(at) : nowcastAt(model, obs.station, at)
  const from = blown === null ? null : blown.fromDeg
  const raw = blown === null ? null : blown.mps
  /* Batch DRONE, Section 1.3: at a jetty, the wind from its lee counts its share. */
  const mps = raw === null ? null : shelteredMps(raw, from, shelter)
  /* The briefing's shape (src/lib/useBriefing.ts): with no direction, never Messy. */
  const shape0 = mps === null ? null : surfShape(mps, from ?? 0, from === null ? null : facing)
  const windKt = mps === null ? null : mps / 0.514444
  /* Batch FIX, Section 3.1: the wind sea against the swell at the beach, the buoy's own near its reading, else the forecast's. */
  const b = obs?.buoy ?? null
  const kinds = b !== null && Math.abs(at.getTime() - b.at) <= LEAN_BUOY_MAX_AGE_MS ? b.parts : forecastSeaKinds((n) => hourlyAt(marine, n, at))
  const windSeaDominant = windSeaDominates(seaEnergyAtBeach(kinds, facing, factor))
  const chop = surfChop(windKt, from === null || facing === null ? null : windSide(from, facing)) || seaChop(windKt, from, facing, windSeaDominant)
  /* Batch DRONE, Section 1.4: chop is never clean. */
  const shape = chop && shape0 === 'Clean' ? 'Bumpy' : shape0
  const spread = seaSpreadFt(s.estimate.faceFt, wholeSeaFaceFt(marine, at, facing, factor))
  const { range, shiftFt } = leanRange(correctedRange(s.estimate.faceFt, spread, stats), lean, at.getTime())
  return {
    at,
    forecastFt: s.estimate.faceFt,
    range,
    leanFt: shiftFt,
    centerFt: range.centerFt,
    spreadFt: spread,
    periodS: s.periodS,
    fromDeg: s.fromDeg,
    shape,
    side: windTag(from, facing),
    clean: shape === 'Clean',
    tag: surfTag(range.centerFt, shape),
    windKt,
    chop,
    quality: surfQuality(range.centerFt, chop, shape, s.periodS),
    windSeaDominant,
  }
}

/* A buoy older than this does not lean the surf (the per-spot check's own "this hour", src/lib/useSpotSkill.ts). */
export const LEAN_BUOY_MAX_AGE_MS = 2 * 3_600_000

/**
 * The lean from the live buoy (src/core/surfNowcast.ts): its face at this
 * beach against the forecast's corrected centre at its hour. Null when the
 * buoy is not fresh at `now` or either side cannot be worked out.
 */
/*
 * THE NOWCAST, WEIGHED (Batch LIVE, Section 9A; 14 Nov 2 PM: 44099, at the
 * bay's mouth, read a 5.9 ft NW wind sea "as faces 0.0 ft" and zeroed a
 * forecast of about 1.4 ft while the beaches had 1-3 ft). Batch DRONE,
 * Section 1 (CORE 8.1): every buoy goes through the forecast's own transform
 * part by part (src/core/surfTransform.ts), and the lean is to their
 * weighted face (src/core/surfNowcast.ts buoyConsensus, cappedMiss):
 *
 *   weight   the share of each buoy's sea heading for this beach
 *            (seaReach); a bay-mouth buoy's (BAY_MOUTH) counts half again
 *   cap      ±LEAN_CAP_FT (PULL_MAX_FT) when the buoys disagree with each
 *            other or with the forecast by more than DISAGREE_FT
 *   floor    a buoy never takes the centre below FLOOR_SHARE of the
 *            forecast's: one buoy's 0 never zeroes a forecast
 */
export const BAY_MOUTH: ReadonlySet<string> = new Set(['44099'])
export const BAY_MOUTH_WEIGHT = 0.5
/** The lean's cap, feet (src/core/surfNowcast.ts LEAN_CAP_FT). */
export const PULL_MAX_FT = LEAN_CAP_FT
export const FLOOR_SHARE = 0.5

type OkReading = Extract<BuoyReading, { status: 'ok' }>

/** A buoy reading's face at this beach and the weight it carries in the lean; null when it cannot be worked out. */
export function buoyFaceWeighed(b: OkReading, facing: number | null, factor: number): { faceFt: number; weight: number } | null {
  const parts = buoySeaParts(b)
  const faceFt = seaFaceFt(parts, facing, factor)
  const reach = seaReach(parts, facing)
  if (faceFt === null || reach === null) return null
  return { faceFt, weight: reach * (BAY_MOUTH.has(b.buoy.id) ? BAY_MOUTH_WEIGHT : 1) }
}

export function buoyLean(marine: Hourly, wind: Hourly | null, buoy: BuoyReading | null, facing: number | null, stats: SpotStats, factor: number, now: number, others: readonly BuoyReading[] = [], shelter: Shelter | null = null): SurfLean | null {
  if (buoy === null || buoy.status !== 'ok') return null
  const at = buoy.at.getTime()
  if (!Number.isFinite(at) || now - at > LEAN_BUOY_MAX_AGE_MS || at > now + 3_600_000) return null
  const fresh = others.filter((o): o is OkReading => o.status === 'ok' && o.buoy.id !== buoy.buoy.id && Math.abs(o.at.getTime() - at) <= LEAN_BUOY_MAX_AGE_MS)
  const faces = [buoy, ...fresh].map((b) => buoyFaceWeighed(b, facing, factor)).filter((f): f is { faceFt: number; weight: number } => f !== null)
  const there = rangeHourAt(marine, wind, buoy.at, facing, stats, factor, null, shelter)
  const centre = there === null ? null : there.centerFt
  const raw = surfLean(buoyConsensus(faces), centre, at)
  if (raw === null || centre === null) return raw
  const floor = -(1 - FLOOR_SHARE) * centre
  return { ...raw, missFt: Math.max(floor, cappedMiss(raw.missFt, faces.map((f) => f.faceFt))) }
}

/* The hours the page draws, local: 5 AM to 8 PM, each at half past (the home's hours). */
export const FIRST_HOUR = 5
export const LAST_HOUR = 20

/** A local day's hours, FIRST_HOUR to LAST_HOUR, at half past. */
export function dayHours(marine: Hourly, wind: Hourly | null, isoDate: string, timeZone: string, facing: number | null, stats: SpotStats, factor: number = BEACH_CAP, lean: SurfLean | null = null, shelter: Shelter | null = null, obs: SurfObs | null = null): RangeHour[] {
  const out: RangeHour[] = []
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h += 1) {
    const t = zonedTimeToUtc(isoDate, `${String(h).padStart(2, '0')}:30`, timeZone)
    if (t === null) continue
    const r = rangeHourAt(marine, wind, t, facing, stats, factor, lean, shelter, obs)
    if (r !== null) out.push(r)
  }
  return out
}

/*
 * THE READINGS THE BIGGER-SWELL WATCH SETS AGAINST THE CALL (Batch FIX,
 * Section 3.4; src/core/swellWatch.ts). What the app already holds: one
 * model, Open-Meteo Marine's best match (fetchMarine asks no other and no
 * ensemble), read the two ways the spread reads it, each broken at this
 * beach by the transform, before any lean or this spot's correction: part by
 * part, and the whole sea taken as one. Each its biggest face of the day,
 * FIRST_HOUR to LAST_HOUR.
 */
export const WATCH_MODEL = 'Open-Meteo Marine (best match)'
export function dayReadings(marine: Hourly, isoDate: string, timeZone: string, facing: number | null, factor: number = BEACH_CAP): WatchReading[] {
  let parts: number | null = null
  let whole: number | null = null
  for (let h = FIRST_HOUR; h <= LAST_HOUR; h += 1) {
    const t = zonedTimeToUtc(isoDate, `${String(h).padStart(2, '0')}:30`, timeZone)
    if (t === null) continue
    const s = surfAt(marine, t, facing, factor)
    if (s !== null) parts = Math.max(parts ?? 0, s.estimate.faceFt)
    const w = wholeSeaFaceFt(marine, t, facing, factor)
    if (w !== null) whole = Math.max(whole ?? 0, w)
  }
  return [
    ...(parts === null ? [] : [{ model: WATCH_MODEL, read: 'part by part', faceFt: parts }]),
    ...(whole === null ? [] : [{ model: WATCH_MODEL, read: 'the whole sea as one', faceFt: whole }]),
  ]
}

/*
 * EACH WAVE MODEL'S DAY AT THE BEACH (Batch 3D, Section 3.2): read as the best
 * match is (dayReadings), the same hours, the same transform: part by part
 * where the model splits the sea, and the whole sea as one always (ECMWF WAM
 * gives only the whole). Labelled by the model's own name.
 */
export function modelDayReadings(models: readonly { model: string; marine: Hourly }[], isoDate: string, timeZone: string, facing: number | null, factor: number = BEACH_CAP): WatchReading[] {
  const out: WatchReading[] = []
  for (const m of models) {
    let parts: number | null = null
    let whole: number | null = null
    for (let h = FIRST_HOUR; h <= LAST_HOUR; h += 1) {
      const t = zonedTimeToUtc(isoDate, `${String(h).padStart(2, '0')}:30`, timeZone)
      if (t === null) continue
      if (hourlyAt(m.marine, 'swell_wave_height', t) !== null) {
        const s = surfAt(m.marine, t, facing, factor)
        if (s !== null) parts = Math.max(parts ?? 0, s.estimate.faceFt)
      }
      const w = seaFaceFt([{ heightM: hourlyAt(m.marine, 'wave_height', t), periodS: hourlyAt(m.marine, 'wave_period', t), fromDeg: hourlyAt(m.marine, 'wave_direction', t) }], facing, factor)
      if (w !== null) whole = Math.max(whole ?? 0, w)
    }
    if (parts !== null) out.push({ model: m.model, read: 'part by part', faceFt: parts })
    if (whole !== null) out.push({ model: m.model, read: 'the whole sea as one', faceFt: whole })
  }
  return out
}

export const addDays =(iso: string, n: number): string => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** Seven days from `today`, each its biggest hour (null where the forecast does not reach). */
export function weekPeaks(marine: Hourly, wind: Hourly | null, today: string, timeZone: string, facing: number | null, stats: SpotStats, factor: number = BEACH_CAP, lean: SurfLean | null = null, shelter: Shelter | null = null, obs: SurfObs | null = null): { date: string; peak: RangeHour | null }[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i)
    return {
      date,
      peak: peakHour(dayHours(marine, wind, date, timeZone, facing, stats, factor, lean, shelter, obs)),
    }
  })
}

export interface BuoyDot {
  at: Date
  faceFt: number
  /** 'live': the reading on screen now; 'kept': one this phone checked earlier (the per-spot book). */
  from: 'live' | 'kept'
}

/**
 * The buoy readings on the chart: the ones this phone checked at this spot
 * in the day's window (src/lib/spotSkillStore.ts, one an hour, kept to the
 * hour, drawn at its middle), and the latest reading, at its own time.
 * All as faces by buoyFaceFt, the forecast's own function.
 */
export function buoyDots(kept: readonly SkillSample[], live: BuoyReading | null, facing: number | null, from: number, to: number, factor: number = BEACH_CAP): BuoyDot[] {
  const out: BuoyDot[] = []
  let liveHour: number | null = null
  if (live !== null && live.status === 'ok') {
    const ft = buoyFaceFt(live, facing, factor)
    const t = live.at.getTime()
    if (ft !== null && t >= from && t <= to) {
      out.push({ at: live.at, faceFt: ft, from: 'live' })
      liveHour = Math.floor(t / 3_600_000)
    }
  }
  for (const s of kept) {
    const mid = s.at + 1_800_000
    if (mid < from || mid > to || Math.floor(s.at / 3_600_000) === liveHour) continue
    out.push({ at: new Date(mid), faceFt: s.buoyFt, from: 'kept' })
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())
}

export interface DotOutside {
  dot: BuoyDot
  side: 'above' | 'below'
  /** The band's ends at the dot's hour. */
  lowFt: number
  highFt: number
}

/**
 * Batch Beach, Section 2: the chart never shows a likely range that leaves
 * out a buoy reading without saying so. Each dot against the band at the
 * nearest hour drawn (within 45 minutes); a dot with no hour near it is not
 * judged.
 */
export function dotsOutside(hours: readonly RangeHour[], dots: readonly BuoyDot[]): DotOutside[] {
  const out: DotOutside[] = []
  for (const dot of dots) {
    const t = dot.at.getTime()
    let best: RangeHour | null = null
    for (const h of hours) if (best === null || Math.abs(h.at.getTime() - t) < Math.abs(best.at.getTime() - t)) best = h
    if (best === null || Math.abs(best.at.getTime() - t) > 45 * 60_000) continue
    const { lowFt, highFt } = best.range
    if (dot.faceFt > highFt + 0.05) out.push({ dot, side: 'above', lowFt, highFt })
    else if (dot.faceFt < lowFt - 0.05) out.push({ dot, side: 'below', lowFt, highFt })
  }
  return out
}
