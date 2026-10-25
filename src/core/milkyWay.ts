/*
 * WHEN THE MILKY WAY'S CORE CAN BE SHOT, NIGHT BY NIGHT.
 *
 * Three things have to hold at once, and each is arithmetic:
 *
 *   DARK ........ the sun 18 degrees or more below the horizon (astronomical
 *                 night). Earlier, the sky glow drowns the core.
 *   CORE UP ..... the galactic core at least CORE_MIN_ALTITUDE above the
 *                 horizon. Its position is a fixed point on the sky
 *                 (celestial.ts GALACTIC_CORE), turned into altitude and
 *                 azimuth with the same sidereal-time arithmetic the meteor
 *                 radiants use.
 *   MOON ........ below the horizon, OR less than half lit. A bright moon up
 *                 washes the core out; a thin one does not.
 *
 * Sampled every SAMPLE_MINUTES across the night. Each night gets a score from
 * how long all three hold, how high the core gets in that time and how much
 * moon is up, and the reason in words a beginner can read.
 *
 * NO MODEL AND NO NETWORK. suncalc for the sun and moon, celestial.ts for the
 * core. The night is the one that STARTS on the date asked for.
 */
import { getMoonIllumination, getMoonPosition, getTimes } from 'suncalc'
import { equatorialToHorizontal, GALACTIC_CORE } from './celestial.ts'

/** Below this the core is lost in the horizon haze and the ground. */
export const CORE_MIN_ALTITUDE = 5
/** A moon at least this lit, and up, rules a sample out. */
export const BRIGHT_MOON_FRACTION = 0.5
export const SAMPLE_MINUTES = 10

/** How long a night's shoot window needs to be for full marks on length. */
const FULL_LENGTH_MINUTES = 240
/** How high the core needs to climb for full marks on height. */
const FULL_HEIGHT_DEGREES = 30

export interface CorePosition {
  altitude: number
  azimuth: number
}

export function corePosition(at: Date, lat: number, lon: number): CorePosition {
  return equatorialToHorizontal(GALACTIC_CORE.ra, GALACTIC_CORE.dec, lat, lon, at)
}

export interface MilkyWayNight {
  /** The calendar date the night starts on, yyyy-mm-dd, in the venue's zone. */
  date: string
  /** Astronomical dusk to dawn, or null when it never gets fully dark. */
  dark: { from: Date; to: Date } | null
  /** First and last good sample, or null when there were none. */
  window: { from: Date; to: Date } | null
  /** Minutes of good samples. Can be less than window length if the moon interrupts. */
  shootMinutes: number
  /** Highest core altitude during the good samples. Null when there were none. */
  maxCoreAltitude: number | null
  /** Moon illumination at the middle of the night, 0 to 1. */
  moonFraction: number
  /** 0 to 100. */
  score: number
  /** In plain words. Never empty. */
  reason: string
}

/** "4 h 10 m", "50 m". */
export function hoursMinutes(minutes: number): string {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} m`
  return m === 0 ? `${h} h` : `${h} h ${m} m`
}

/** Minutes the zone is ahead of UTC at an instant. */
function offsetMinutes(at: Date, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name)
  if (match === null) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0))
}

/** Local noon on a calendar date in a zone, as an instant. */
export function localNoon(date: string, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d, 12)
  return new Date(guess - offsetMinutes(new Date(guess), timeZone) * 60_000)
}

function isoDateIn(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

const validDate = (at: Date | null | undefined): at is Date =>
  at instanceof Date && Number.isFinite(at.getTime())

export function milkyWayNight(date: string, lat: number, lon: number, timeZone: string): MilkyWayNight {
  const dusk = getTimes(localNoon(date, timeZone), lat, lon).night
  const dawn = getTimes(localNoon(nextDate(date), timeZone), lat, lon).nightEnd
  const middle = validDate(dusk) && validDate(dawn)
    ? new Date((dusk.getTime() + dawn.getTime()) / 2)
    : new Date(localNoon(date, timeZone).getTime() + 12 * 3_600_000)
  const moonFraction = getMoonIllumination(middle).fraction

  const empty = (reason: string, dark: MilkyWayNight['dark']): MilkyWayNight => ({
    date,
    dark,
    window: null,
    shootMinutes: 0,
    maxCoreAltitude: null,
    moonFraction,
    score: 0,
    reason,
  })

  if (!validDate(dusk) || !validDate(dawn) || dawn.getTime() <= dusk.getTime()) {
    return empty('It never gets fully dark tonight: the sun stays less than 18 degrees below the horizon.', null)
  }
  const dark = { from: dusk, to: dawn }

  let good = 0
  let first: Date | null = null
  let last: Date | null = null
  let maxCore: number | null = null
  let coreEverUp = false
  let moonBlocked = 0
  let dimMoonUp = 0
  for (let t = dusk.getTime(); t <= dawn.getTime(); t += SAMPLE_MINUTES * 60_000) {
    const at = new Date(t)
    const core = corePosition(at, lat, lon)
    if (core.altitude < CORE_MIN_ALTITUDE) continue
    coreEverUp = true
    const moonUp = getMoonPosition(at, lat, lon).altitude > 0
    const lit = getMoonIllumination(at).fraction
    if (moonUp && lit >= BRIGHT_MOON_FRACTION) {
      moonBlocked += 1
      continue
    }
    if (moonUp) dimMoonUp += 1
    good += 1
    first ??= at
    last = at
    maxCore = Math.max(maxCore ?? -90, core.altitude)
  }

  if (!coreEverUp) {
    return empty('The core stays below the horizon all through the dark hours tonight.', dark)
  }
  if (good === 0) {
    return empty(`A bright moon (${Math.round(moonFraction * 100)}% lit) is up whenever the core is.`, dark)
  }

  const shootMinutes = good * SAMPLE_MINUTES
  const length = Math.min(1, shootMinutes / FULL_LENGTH_MINUTES) * 50
  const height = Math.min(1, (maxCore as number) / FULL_HEIGHT_DEGREES) * 30
  /* Moonlight: full marks with no moon up; a dim moon up costs in proportion to how lit it is. */
  const moonUpShare = dimMoonUp / good
  const moon = 20 * (1 - moonUpShare * moonFraction)
  const score = Math.round(length + height + moon)

  const moonWords =
    dimMoonUp === 0
      ? 'moon down'
      : `a thin moon (${Math.round(moonFraction * 100)}% lit) up for part of it`
  const cut = moonBlocked > 0 ? `, ${hoursMinutes(moonBlocked * SAMPLE_MINUTES)} lost to a bright moon` : ''
  return {
    date,
    dark,
    window: { from: first as Date, to: last as Date },
    shootMinutes,
    maxCoreAltitude: maxCore,
    moonFraction,
    score,
    reason: `${hoursMinutes(shootMinutes)} of dark sky with the core up to ${Math.round(maxCore as number)} degrees, ${moonWords}${cut}.`,
  }
}

/** The next `nights` nights from `start`, best first. Ties keep date order. */
export function rankNights(
  lat: number,
  lon: number,
  start: Date,
  nights = 30,
  timeZone = 'UTC',
): MilkyWayNight[] {
  let date = isoDateIn(start, timeZone)
  const all: MilkyWayNight[] = []
  for (let i = 0; i < nights; i++) {
    all.push(milkyWayNight(date, lat, lon, timeZone))
    date = nextDate(date)
  }
  return all
    .map((night, index) => ({ night, index }))
    .sort((a, b) => b.night.score - a.night.score || a.index - b.index)
    .map(({ night }) => night)
}
