/*
 * THE DRONE PAGE'S PLAN TAB (Batch DRONE, Section 2.4; board Drone_P4).
 *
 *   turn back   the battery % to turn for home at, flying `distM` out on
 *               `outDeg` and straight back, in the wind at 400 ft, at a
 *               stated cruise speed, landing with RESERVE_SHARE left. The
 *               ground speed on each leg is the wind triangle's: the
 *               crosswind is held off (sqrt(air² − cross²)) and the headwind
 *               taken off. The pack's minutes are trimmed for the cold
 *               (src/core/droneNow.ts coldTrim). Climb, hover and descent
 *               are not counted; the inputs are on the card.
 *   sun at      sunset seen from `heightFt` up: the horizon dips by
 *   height      sqrt(2h/R) radians, so the sun sets when it is that much
 *               lower than at the ground's sunset. Refraction along the
 *               longer path is not modelled.
 *   sun in the  the next stretch of low sun (above the horizon, under
 *   lens        LOW_SUN_DEG): the bearings within HALF_FIELD_DEG of the
 *               sun's azimuth over it, where a level camera has it in frame
 *   lens fog    the dew-point spread and the air's temperature, and the
 *   and ice     temperature at the height (the standard lapse rate)
 *
 * Facts and their inputs; never "safe" (rule 12), never an instruction
 * (rule 28).
 */
import { RESERVE_SHARE } from './flight.ts'
import { coldTrim } from './droneNow.ts'

const EARTH_RADIUS_M = 6_371_000
const FT = 0.3048
const rad = (d: number) => (d * Math.PI) / 180

/** The cruise the card assumes, m/s (about 19 kt), said on the card. */
export const CRUISE_MPS = 10

export interface TurnBackInput {
  distM: number
  /** The way out, degrees clockwise from north. */
  outDeg: number
  /** The wind at the height: where it comes from, and m/s. */
  windFromDeg: number
  windMps: number
  ratedMin: number
  tempC: number | null
  cruiseMps?: number
}

export type TurnBack =
  | {
      kind: 'ok'
      /** Turn for home with this much battery, %. */
      turnPct: number
      /** Battery used getting out, %. */
      outPct: number
      outGroundMps: number
      backGroundMps: number
      usableMin: number
      trim: number
      /** The headwind on the way back, m/s (negative: a tailwind). */
      headBackMps: number
    }
  /** Out and back does not fit in the pack: `needPct` of it is needed. */
  | { kind: 'short'; needPct: number; usableMin: number; trim: number; headBackMps: number }
  /** The drone makes no headway on a leg at that cruise. */
  | { kind: 'no-headway'; leg: 'out' | 'back'; headBackMps: number }

/** Ground speed on a heading, the wind from `windFromDeg`. Null when the drone cannot hold the line. */
export function groundSpeed(airMps: number, headingDeg: number, windFromDeg: number, windMps: number): number | null {
  const off = rad(windFromDeg - headingDeg)
  const head = windMps * Math.cos(off)
  const cross = windMps * Math.sin(off)
  if (Math.abs(cross) >= airMps) return null
  const gs = Math.sqrt(airMps * airMps - cross * cross) - head
  return gs > 0 ? gs : null
}

export function turnBack(input: TurnBackInput): TurnBack {
  const air = input.cruiseMps ?? CRUISE_MPS
  const backDeg = (input.outDeg + 180) % 360
  const headBackMps = input.windMps * Math.cos(rad(input.windFromDeg - backDeg))
  const out = groundSpeed(air, input.outDeg, input.windFromDeg, input.windMps)
  if (out === null) return { kind: 'no-headway', leg: 'out', headBackMps }
  const back = groundSpeed(air, backDeg, input.windFromDeg, input.windMps)
  if (back === null) return { kind: 'no-headway', leg: 'back', headBackMps }
  const trim = coldTrim(input.tempC)
  const usableMin = input.ratedMin * (1 - trim)
  const pct = (seconds: number) => (seconds / 60 / usableMin) * 100
  const outPct = pct(input.distM / out)
  const backPct = pct(input.distM / back)
  const reservePct = RESERVE_SHARE * 100
  const needPct = outPct + backPct + reservePct
  if (needPct > 100) return { kind: 'short', needPct, usableMin, trim, headBackMps }
  return { kind: 'ok', turnPct: backPct + reservePct, outPct, outGroundMps: out, backGroundMps: back, usableMin, trim, headBackMps }
}

/* ------------------------------------------------------- sun at height */

/** The horizon's dip from `heightFt` up, degrees: sqrt(2h/R) radians. */
export const dipDeg = (heightFt: number): number => (Math.sqrt((2 * Math.max(0, heightFt) * FT) / EARTH_RADIUS_M) * 180) / Math.PI

/**
 * Sunset seen from `heightFt`: when the sun is `dipDeg` lower than it was at
 * the ground's sunset. `sunAlt` gives the sun's altitude in degrees (the same
 * function the ground's sunset came from, so its refraction convention cancels).
 */
export function sunsetAtHeight(groundSunset: Date, heightFt: number, sunAlt: (t: Date) => number): Date {
  const target = sunAlt(groundSunset) - dipDeg(heightFt)
  let lo = groundSunset.getTime()
  let hi = lo + 30 * 60_000
  /* The sun is still falling 30 minutes after sunset everywhere the app is used; bisect to a second. */
  for (let i = 0; i < 40 && hi - lo > 1000; i += 1) {
    const mid = (lo + hi) / 2
    if (sunAlt(new Date(mid)) > target) lo = mid
    else hi = mid
  }
  return new Date(Math.round((lo + hi) / 2))
}

/* ------------------------------------------------------ sun in the lens */

/** A level camera has the sun in frame while it is under this. */
export const LOW_SUN_DEG = 25
/** Half a wide drone lens's horizontal field, degrees. */
export const HALF_FIELD_DEG = 20

export interface LensSun {
  from: Date
  to: Date
  /** The bearings to keep the camera off, degrees, clockwise from `fromDeg` to `toDeg`. */
  fromDeg: number
  toDeg: number
  /** The sun's azimuth in the middle of the stretch. */
  midDeg: number
  /** 'evening': the stretch runs to sunset; 'morning': from sunrise. */
  part: 'morning' | 'evening'
}

/**
 * The next stretch of low sun from `now`, scanned every 5 minutes over 30
 * hours. `sunAt(t)` gives altitude and azimuth (degrees, clockwise from north).
 * Null when there is none (polar night).
 */
export function lensSun(now: Date, sunAt: (t: Date) => { altitude: number; azimuth: number }): LensSun | null {
  const step = 5 * 60_000
  let start: number | null = null
  let end = 0
  const az: number[] = []
  for (let t = now.getTime(); t <= now.getTime() + 30 * 3_600_000; t += step) {
    const s = sunAt(new Date(t))
    const low = s.altitude > 0 && s.altitude < LOW_SUN_DEG
    if (low) {
      if (start === null) start = t
      end = t
      az.push(s.azimuth)
    } else if (start !== null) break
  }
  if (start === null || az.length === 0) return null
  /* Azimuths of one stretch sit within a half circle: unwrap round the first. */
  const base = az[0]
  const un = az.map((a) => base + ((((a - base + 180) % 360) + 360) % 360) - 180)
  const lo = Math.min(...un) - HALF_FIELD_DEG
  const hi = Math.max(...un) + HALF_FIELD_DEG
  const norm = (d: number) => ((Math.round(d) % 360) + 360) % 360
  const rising = sunAt(new Date(end)).altitude > sunAt(new Date(start)).altitude
  return { from: new Date(start), to: new Date(end + step), fromDeg: norm(lo), toDeg: norm(hi), midDeg: norm((lo + hi) / 2), part: rising ? 'morning' : 'evening' }
}

/* ------------------------------------------------------- lens fog, ice */

/** The standard lapse rate, °C per metre. */
export const LAPSE_C_PER_M = 0.0065

export interface LensAir {
  /** 'likely' within FOG_SPREAD_C, 'possible' within twice that, 'unlikely' past it. */
  fog: 'likely' | 'possible' | 'unlikely'
  spreadC: number
  /** The air at the height, °C. */
  aloftC: number
  /** At or under freezing at the height with moisture (spread within FOG_SPREAD_C, or rain likely). */
  icing: boolean
}

/** A lens fogs as it meets air within this many degrees of its dew point. */
export const FOG_SPREAD_C = 2.5

export function lensAir(tempC: number, dewC: number, heightFt: number, rainPct: number | null): LensAir {
  const spreadC = Math.max(0, tempC - dewC)
  const aloftC = tempC - LAPSE_C_PER_M * heightFt * FT
  const wet = spreadC <= FOG_SPREAD_C || (rainPct !== null && rainPct >= 50)
  return {
    fog: spreadC <= FOG_SPREAD_C ? 'likely' : spreadC <= 2 * FOG_SPREAD_C ? 'possible' : 'unlikely',
    spreadC,
    aloftC,
    icing: wet && aloftC <= 0,
  }
}

/*
 * THE LENS FOG WORD (Batch FIX, Section 6.8). Two words, one rule:
 *
 *   Possible   the air's temperature and dew point are within
 *              LENS_FOG_SPREAD_F (5 °F) of each other, or the lens comes from
 *              a warm car into air at least WARM_CAR_DROP_F (15 °F) colder
 *   Low        otherwise
 *
 * The car's cabin is not measured: WARM_CAR_F (70 °F) stands for a heated
 * car, and "How we got this" says so. The old card's three steps ("likely",
 * "possible", "unlikely") at 2.5 and 5 °C said "Fog possible" at a 9 °F
 * spread.
 */
export const LENS_FOG_SPREAD_F = 5
export const WARM_CAR_DROP_F = 15
export const WARM_CAR_F = 70

export interface LensFog {
  word: 'Possible' | 'Low'
  /** Why "Possible": the dew point is close, or the car is warm. Null for "Low". */
  why: 'dew' | 'car' | null
}

export function lensFog(tempC: number, dewC: number, carF: number = WARM_CAR_F): LensFog {
  /* In tenths of a °F, so 5.0 °F stays 5.0 and not 5.000000001 after the °C round trip. */
  const spreadF = Math.round(Math.max(0, tempC - dewC) * 1.8 * 10) / 10
  const airF = Math.round((tempC * 1.8 + 32) * 10) / 10
  if (spreadF <= LENS_FOG_SPREAD_F) return { word: 'Possible', why: 'dew' }
  if (carF - airF >= WARM_CAR_DROP_F) return { word: 'Possible', why: 'car' }
  return { word: 'Low', why: null }
}

/** "Low sun SE" with "until 9:29 AM" (morning) or "from 3:40 PM" (evening): where the sun sits low, as a fact. */
export function lensSunWords(low: LensSun | null, point: (deg: number) => string, clock: (d: Date) => string): { big: string; small: string } {
  if (low === null) return { big: 'Sun not low', small: 'in the next day' }
  return { big: `Low sun ${point(low.midDeg)}`, small: low.part === 'morning' ? `until ${clock(low.to)}` : `from ${clock(low.from)}` }
}

/** "Sets 4:55 PM" and "+2 min" over the beach's sunset. */
export function sunAtHeightWords(s400: Date | null, beach: Date | null, clock: (d: Date) => string): { big: string; small: string } {
  if (s400 === null || beach === null) return { big: 'No sunset', small: 'in the forecast’s days' }
  const later = Math.round((s400.getTime() - beach.getTime()) / 60_000)
  return { big: `Sets ${clock(s400)}`, small: later < 1 ? 'as on the beach' : `+${later} min` }
}
