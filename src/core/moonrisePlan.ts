/*
 * THE MOONRISE SHOT LIST, WORKED OUT. The model proposes, code computes.
 *
 * WHICH NIGHT. Around the NEXT full moon, the nights from two before to one
 * after are read: moonrise on the venue's own day (moonTimes.ts) against that
 * day's sunset. The best is the night the moon rises CLOSEST BEFORE sunset,
 * so it comes up into a sky that is still lit and sits low and large while
 * the land still has detail. A night where it rises after sunset is only
 * chosen when none rises before. The next full moon, not the best in six
 * weeks: a closer lead a month out is a different shoot, not a better one.
 * When every night around the next one has already passed, the one after.
 *
 * WHEN. Moonrise and where on the horizon; when it clears CLEAR_ALTITUDE (sea
 * haze swallows the first degree or two, so that is when the moon is
 * actually there to shoot); sunset; civil dusk, when the light is gone.
 *
 * THE FOUR SHOTS, in the order they happen:
 *
 *   1 wide opener  the widest lens, from sunset: the moon low over the pink
 *                  band that rises opposite the sun after sunset
 *   2 line-up      the longest lens, standing where the moon sits behind the
 *                  target at CLEAR_ALTITUDE, and how far to move as it climbs
 *   3 mid          a 70-200, people or surfers in front of the moon
 *   4 drone        only with the LAANC switch on at this spot, under the
 *                  ceiling, facing the moon; strobe on from sunset
 *
 * SETTINGS come from the exposure table (exposure.ts) and the ND table
 * (ndFilter.ts). Where neither has a row -- a twilight landscape, a drone's
 * fixed-aperture camera -- the shot says to meter it rather than carry a
 * number nobody computed.
 */
import { getMoonIllumination, getMoonPosition, getTimes } from 'suncalc'
import { startingExposure, type StartingExposure } from './exposure.ts'
import { destinationPoint, type LatLon } from './geo.ts'
import { ndFor, type NdFilter } from './ndFilter.ts'
import { moonTimesOnLocalDay, localDate } from './moonTimes.ts'
import { moonTurningPoints } from './skyEvents.ts'
import { normalizeBearing } from './sun.ts'
import { zonedTimeToUtc } from './timezone.ts'
import { EYE_HEIGHT_METERS } from './sightline.ts'

/** Degrees up before the moon is clear of the sea haze. */
export const CLEAR_ALTITUDE = 2
/** The line-up's stand points, one per degree the moon climbs. */
export const LINE_UP_ALTITUDES = [2, 3, 4, 5] as const
export const SEARCH_DAYS = 45
/** Minutes after sunset the wide opener runs, while the pink band is up. */
export const WIDE_MINUTES = 20

export interface PlanLens {
  id: string
  name: string
  minFocalLength: number
  maxFocalLength: number
}

export interface MoonriseInput {
  venue: LatLon
  timeZone: string
  /** From when to look for the next full moon. */
  from: Date
  lenses: readonly PlanLens[]
  /** The drone camera's name, or null with no drone in the bag. */
  drone: string | null
  /** The height to fly the drone under, or why it does not fly. */
  droneCeiling: { feet: number } | { reason: string }
  /** The line-up's target and its height above the ground, or null when none is picked. */
  target: { at: LatLon; heightMeters: number | null } | null
}

export interface NightConsidered {
  date: string
  moonrise: Date | null
  sunset: Date | null
  /** Minutes the moon rises before sunset; negative when after. */
  leadMinutes: number | null
  fraction: number
}

export interface LineUpStand {
  altitude: number
  at: Date
  /** Where to stand, and its distance and bearing from the target. */
  stand: LatLon
  fromTargetMeters: number
  /** FROM the target TO the stand point. */
  fromTargetBearing: number
}

export type Shot =
  | {
      kind: 'wide'
      from: Date
      to: Date
      lens: PlanLens | null
      focal: number | null
      facing: number
      exposure: null
    }
  | {
      kind: 'lineup'
      from: Date
      lens: PlanLens | null
      focal: number | null
      facing: number
      exposure: StartingExposure | null
      /** Null when no target is picked or it has no height: the reason says which. */
      stands: LineUpStand[] | null
      reason: string | null
    }
  | {
      kind: 'mid'
      from: Date
      to: Date
      lens: PlanLens | null
      focal: number | null
      facing: number
      exposure: StartingExposure | null
    }
  | {
      kind: 'drone'
      from: Date
      to: Date
      drone: string | null
      altitudeFeet: number | null
      facing: number
      nd: NdFilter | null
      ndReason: string
      /** Why it does not fly, when it does not. */
      reason: string | null
    }

export interface MoonrisePlan {
  date: string
  timeZone: string
  fraction: number
  moonrise: Date
  riseAzimuth: number
  clears: Date | null
  clearAzimuth: number | null
  sunset: Date
  goldenHour: Date | null
  civilDusk: Date | null
  shots: Shot[]
  nights: NightConsidered[]
}

export type MoonriseResult = { status: 'ok'; plan: MoonrisePlan } | { status: 'none'; reason: string }

const MINUTE = 60_000
const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** The first minute from `from` the moon is at least `altitude` up, within six hours. */
export function moonReaches(from: Date, altitude: number, venue: LatLon): Date | null {
  for (let t = from.getTime(); t <= from.getTime() + 6 * 60 * MINUTE; t += MINUTE) {
    if (getMoonPosition(new Date(t), venue.lat, venue.lon).altitude >= altitude) return new Date(t)
  }
  return null
}

const moonAzimuth = (at: Date, venue: LatLon) => normalizeBearing(getMoonPosition(at, venue.lat, venue.lon).azimuth)

/** The nights around each full moon, and the one where the moon rises closest before sunset. */
export function pickNight(venue: LatLon, timeZone: string, from: Date): { best: NightConsidered | null; nights: NightConsidered[] } {
  /*
   * FROM TWO DAYS BACK. A turning point needs a sample either side of it, so
   * a full moon in the first six hours after `from` was never found, and the
   * plan skipped to the next month: measured on the evening of 25 October
   * 2026, four hours before that night's full moon.
   */
  const { fullMoons } = moonTurningPoints(new Date(from.getTime() - 2 * 86_400_000), new Date(from.getTime() + SEARCH_DAYS * 86_400_000), (at) => getMoonIllumination(at).fraction)
  const today = localDate(from, timeZone)
  for (const full of fullMoons) {
    const nights: NightConsidered[] = []
    const centre = localDate(full.at, timeZone)
    for (const offset of [-2, -1, 0, 1]) {
      const date = shiftDate(centre, offset)
      if (date < today) continue
      const noon = zonedTimeToUtc(date, '12:00', timeZone)
      if (noon === null) continue
      const rise = moonTimesOnLocalDay(noon, venue.lat, venue.lon, timeZone).rise
      /* A moonrise already past is not a plan. */
      if (rise !== null && rise.getTime() < from.getTime()) continue
      const sunsetRaw = getTimes(noon, venue.lat, venue.lon).sunset
      const sunset = usable(sunsetRaw) ? sunsetRaw : null
      nights.push({
        date,
        moonrise: rise,
        sunset,
        leadMinutes: rise === null || sunset === null ? null : Math.round((sunset.getTime() - rise.getTime()) / MINUTE),
        fraction: getMoonIllumination(rise ?? noon).fraction,
      })
    }
    const before = nights.filter((n) => n.leadMinutes !== null && n.leadMinutes >= 0).sort((a, b) => a.leadMinutes! - b.leadMinutes!)
    const after = nights.filter((n) => n.leadMinutes !== null && n.leadMinutes < 0).sort((a, b) => b.leadMinutes! - a.leadMinutes!)
    const best = before[0] ?? after[0] ?? null
    if (best !== null) return { best, nights }
  }
  return { best: null, nights: [] }
}

export function moonrisePlan(input: MoonriseInput): MoonriseResult {
  const { best, nights } = pickNight(input.venue, input.timeZone, input.from)
  if (best === null || best.moonrise === null || best.sunset === null) {
    return { status: 'none', reason: `No full moon night with both a moonrise and a sunset in the next ${SEARCH_DAYS} days at this place.` }
  }
  const { venue } = input
  const moonrise = best.moonrise
  const sunset = best.sunset
  const t = getTimes(zonedTimeToUtc(best.date, '12:00', input.timeZone) ?? sunset, venue.lat, venue.lon)
  const goldenHour = usable(t.goldenHour) ? t.goldenHour : null
  const civilDusk = usable(t.dusk) ? t.dusk : null
  const clears = moonReaches(moonrise, CLEAR_ALTITUDE, venue)
  const end = civilDusk ?? new Date(sunset.getTime() + 30 * MINUTE)

  const lenses = [...input.lenses]
  const widest = lenses.sort((a, b) => a.minFocalLength - b.minFocalLength)[0] ?? null
  const longest = [...input.lenses].sort((a, b) => b.maxFocalLength - a.maxFocalLength)[0] ?? null
  const seventyTwoHundred =
    input.lenses.find((l) => l.minFocalLength <= 70 && l.maxFocalLength >= 200) ??
    input.lenses.find((l) => l.maxFocalLength >= 70 && l.minFocalLength <= 200) ??
    null
  const moonExposure = startingExposure('moon', 'twilight')

  /* 1. The wide opener: from sunset, while the band is up; facing the moon. */
  const wideFrom = new Date(Math.max(sunset.getTime(), moonrise.getTime()))
  const wide: Shot = {
    kind: 'wide',
    from: wideFrom,
    to: new Date(Math.min(wideFrom.getTime() + WIDE_MINUTES * MINUTE, end.getTime())),
    lens: widest,
    focal: widest?.minFocalLength ?? null,
    facing: moonAzimuth(wideFrom, venue),
    exposure: null,
  }

  /* 2. The line-up: where the moon sits behind the target, a degree at a time. */
  const lineupFrom = clears ?? moonrise
  let stands: LineUpStand[] | null = null
  let reason: string | null = null
  if (input.target === null) reason = 'Pick a target on the map (a pier, a lighthouse, a building) to place this shot.'
  else if (input.target.heightMeters === null) reason = 'Give the target its height to place this shot.'
  else if (input.target.heightMeters <= EYE_HEIGHT_METERS) reason = `The target has to be taller than eye height, ${EYE_HEIGHT_METERS} m, for the moon to sit behind it.`
  else {
    const rise = input.target.heightMeters - EYE_HEIGHT_METERS
    const target = input.target.at
    stands = LINE_UP_ALTITUDES.flatMap((altitude) => {
      const at = moonReaches(moonrise, altitude, venue)
      if (at === null) return []
      /* The moon's direction from the target is its direction from anywhere nearby: stand on the far side of the target. */
      const behind = normalizeBearing(moonAzimuth(at, venue) + 180)
      const meters = rise / Math.tan((altitude * Math.PI) / 180)
      return [{ altitude, at, stand: destinationPoint(target, behind, meters), fromTargetMeters: meters, fromTargetBearing: behind }]
    })
  }
  const lineup: Shot = {
    kind: 'lineup',
    from: lineupFrom,
    lens: longest,
    focal: longest?.maxFocalLength ?? null,
    facing: moonAzimuth(lineupFrom, venue),
    exposure: moonExposure,
    stands,
    reason,
  }

  /* 3. The mid: people in front of the moon, once it is clear, until dusk. */
  const midFrom = clears ?? moonrise
  const mid: Shot = {
    kind: 'mid',
    from: midFrom,
    to: end,
    lens: seventyTwoHundred,
    focal: seventyTwoHundred === null ? null : Math.min(200, seventyTwoHundred.maxFocalLength),
    facing: moonAzimuth(midFrom, venue),
    exposure: moonExposure,
  }

  /* 4. The drone: only where it may fly, facing the moon, from sunset with the strobe on. */
  const droneFrom = new Date(Math.max(sunset.getTime(), moonrise.getTime()))
  const nd = ndFor({ minutesBeforeSunset: (sunset.getTime() - droneFrom.getTime()) / MINUTE - 0.001, sky: 'hazy', mode: 'default', overWater: false })
  const droneReason =
    input.drone === null ? 'No drone in the bag.' : 'reason' in input.droneCeiling ? input.droneCeiling.reason : null
  const drone: Shot = {
    kind: 'drone',
    from: droneFrom,
    to: end,
    drone: input.drone,
    altitudeFeet: droneReason === null && 'feet' in input.droneCeiling ? input.droneCeiling.feet : null,
    facing: moonAzimuth(droneFrom, venue),
    nd: nd.nd,
    ndReason: nd.reason,
    reason: droneReason,
  }

  return {
    status: 'ok',
    plan: {
      date: best.date,
      timeZone: input.timeZone,
      fraction: best.fraction,
      moonrise,
      riseAzimuth: moonAzimuth(moonrise, venue),
      clears,
      clearAzimuth: clears === null ? null : moonAzimuth(clears, venue),
      sunset,
      goldenHour,
      civilDusk,
      shots: [wide, lineup, mid, drone],
      nights,
    },
  }
}
