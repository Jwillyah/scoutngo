/*
 * SUGGEST, WIRED: FETCH WHAT THE ENGINE NEEDS, RUN IT, TURN THE PICKS INTO POSITIONS.
 *
 * The engine is src/core/suggest.ts and does all of the deciding. This file
 * only gathers its inputs -- building footprints with their heights, water,
 * the airspace extract, the kit in the bag -- and makes positions out of what
 * it picked. No model is called. See the header of core/suggest.ts for why.
 *
 * WHAT LEAVES THE DEVICE: a bounding box to Overpass for buildings and water,
 * exactly as Generate did before (README, "What leaves your device"). The
 * airspace is a file in the bundle.
 */
import { resolveSensor, selectedDroneCameras, type KitProfile } from '../core/kit.ts'
import { SENSORS } from '../core/fov.ts'
import type { LatLon } from '../core/geo.ts'
import type { SiteMark } from '../core/siteMark.ts'
import type { SunPosition } from '../core/sun.ts'
import { EYE_HEIGHT_METERS } from '../core/sightline.ts'
import { DEFAULT_SHOT_TYPE, DEFAULT_YAW_DEGREES } from '../core/shotType.ts'
import {
  DROP_STEPS,
  DROP_WORDS,
  lightWords,
  lineWords,
  sideWords,
  suggestPositions,
  type Candidate,
  type SuggestOptic,
  type SuggestResult,
} from '../core/suggest.ts'
import { airspaceShapes } from './airspace.ts'
import { restrictions } from './restrictions.ts'
import { facilityCellAt } from './uasfm.ts'
import { fetchBuildings } from './buildings.ts'
import type { KitSelection } from './kitSelection.ts'
import { fetchSiteGeometry, type SiteGeometry } from './overpass.ts'
import type { CameraPosition } from './plan.ts'
import type { MapBounds } from './generation.ts'
import { boxAround } from './tileRange.ts'
import { formatRange, type Units } from './units.ts'

/** The data box reaches this far past the reach ring, for lines that leave it. */
export const DATA_MARGIN_METERS = 100

/**
 * AIMED AT EYE HEIGHT AT THE SUBJECT, not at its base. A line aimed at the
 * ground at the subject is cut by any kerb near it; a person standing there
 * is what most shots are of. Said on the result.
 */
export const SUBJECT_AIM_METERS = EYE_HEIGHT_METERS

/** The optics in the bag, with the sensor each one's field of view is computed on. */
export function bagOptics(profile: KitProfile, bag: KitSelection): SuggestOptic[] {
  const bodies = profile.bodies.filter((b) => bag.bodyIds.includes(b.id))
  const lenses: SuggestOptic[] = profile.lenses
    .filter((lens) => bag.lensIds.includes(lens.id))
    .map((lens) => ({
      id: lens.id,
      name: lens.name,
      kind: 'lens',
      minFocalLength: lens.minFocalLength,
      maxFocalLength: lens.maxFocalLength,
      sensor: SENSORS[resolveSensor(lens, bodies)],
    }))
  /* A drone camera's focal is a 35mm equivalent: full frame, by definition. */
  const cameras: SuggestOptic[] = selectedDroneCameras(profile, bag.droneIds).map((camera) => ({
    id: camera.id,
    name: camera.name,
    kind: 'drone',
    minFocalLength: camera.equiv35,
    maxFocalLength: camera.equiv35,
    sensor: SENSORS.fullFrame,
  }))
  return [...lenses, ...cameras]
}

export interface SuggestSummary {
  considered: number
  survivors: number
  /** Every step, in order, with how many candidates it dropped. */
  drops: { step: string; count: number }[]
  /** One WHY per picked position, in pick order. */
  picked: string[]
  runnersUp: string[]
  notes: string[]
}

/** "side light, 180 ft from the southwest, nothing mapped in the line · Sony 70-200 118mm". */
export function whyLine(candidate: Candidate, units: Units): string {
  const optic = `${candidate.opticName} ${candidate.focalLength}mm`
  const where =
    candidate.platform === 'air'
      ? `${formatRange(candidate.rangeMeters, units.distance)} out at ${candidate.altitudeFeet} ft` +
        (candidate.gridCeilingFeet === undefined ? '' : ` (under LAANC, grid ceiling ${candidate.gridCeilingFeet} ft)`)
      : formatRange(candidate.rangeMeters, units.distance)
  return `${lightWords(candidate.light)}, ${where} ${sideWords(candidate)}, ${lineWords(candidate)} · ${optic}`
}

export function summarise(result: SuggestResult, units: Units): SuggestSummary {
  return {
    considered: result.considered,
    survivors: result.survivors,
    drops: DROP_STEPS.map((step) => ({ step: DROP_WORDS[step], count: result.dropped[step] })),
    picked: result.picked.map((c) => whyLine(c, units)),
    runnersUp: result.runnersUp.map((r) => `${whyLine(r.candidate, units)}: lost, ${r.lostBecause}`),
    notes: result.notes,
  }
}

export interface SuggestArgs {
  subject: LatLon
  reach: { centre: LatLon; radiusMeters: number }
  profile: KitProfile
  bag: KitSelection
  platforms: readonly ('ground' | 'air')[]
  airAltitudeFeet: number
  sun: SunPosition
  subjectWidthMeters: number | null
  date: string
  marks: readonly SiteMark[]
  elevationAt?: (at: LatLon) => number | null
  units: Units
  /**
   * The shooter's "I have LAANC here" switch for this venue (laancHere in
   * src/lib/venue.ts). On: drones stay in controlled airspace up to the
   * facility map's ceiling. It never opens a restricted area or a park.
   */
  laanc: boolean
  onStage?: (stage: 'capture' | 'terrain' | 'positions' | 'lighting') => void
}

export type SuggestOutcome =
  /** `site` is the water, roads, structures and power lines read for this run, for the cards. */
  | { status: 'ok'; positions: CameraPosition[]; summary: SuggestSummary; site: SiteGeometry | null }
  | { status: 'error'; message: string }

export async function runSuggest(args: SuggestArgs): Promise<SuggestOutcome> {
  const optics = bagOptics(args.profile, args.bag)
  if (optics.length === 0) {
    return { status: 'error', message: 'Nothing is in the bag. Pack a lens or a drone in the kit first.' }
  }

  /* The box: every candidate is inside the reach ring, and every line ends at the subject. */
  const reachBox = boxAround(args.reach.centre, args.reach.radiusMeters + DATA_MARGIN_METERS)
  const subjectBox = boxAround(args.subject, DATA_MARGIN_METERS)
  const bounds: MapBounds = {
    west: Math.min(reachBox.west, subjectBox.west),
    south: Math.min(reachBox.south, subjectBox.south),
    east: Math.max(reachBox.east, subjectBox.east),
    north: Math.max(reachBox.north, subjectBox.north),
  }

  args.onStage?.('capture')
  const [buildings, site] = await Promise.all([fetchBuildings(bounds), fetchSiteGeometry(bounds)])
  args.onStage?.('terrain')
  const flying = args.platforms.includes('air')
  const [airspace, closed] = flying
    ? await Promise.all([airspaceShapes(), restrictions()])
    : [[], { specialUse: [], parks: [] }]

  args.onStage?.('positions')
  const result = suggestPositions({
    subject: args.subject,
    subjectHeightMeters: SUBJECT_AIM_METERS,
    subjectWidthMeters: args.subjectWidthMeters,
    reach: args.reach,
    optics,
    platforms: args.platforms,
    airAltitudeFeet: args.airAltitudeFeet,
    sun: args.sun,
    footprints:
      buildings.status === 'ok'
        ? buildings.buildings.map((b) => ({ id: b.id, ring: b.ring, heightMeters: b.height.metres }))
        : [],
    water: site.status === 'ok' ? site.geometry.land.water : [],
    coastline: site.status === 'ok' ? (site.geometry.land.coastline ?? []) : [],
    airspace,
    specialUse: closed.specialUse,
    parks: closed.parks,
    laanc: {
      enabled: args.laanc,
      ceilingAt: (at: LatLon) => facilityCellAt(at.lat, at.lon)?.ceilingFeet ?? null,
    },
    marks: args.marks,
    date: args.date,
    ...(args.elevationAt === undefined ? {} : { elevationAt: args.elevationAt }),
  })
  args.onStage?.('lighting')

  /* Said, never silent: a check that could not run is not a check that passed. */
  const notes = [...result.notes]
  if (buildings.status !== 'ok') notes.push(`Buildings not checked: ${buildings.reason}`)
  if (site.status !== 'ok') notes.push(`Water not checked: ${site.reason}`)
  notes.push(`Lines are aimed at ${SUBJECT_AIM_METERS} m up the subject, eye height.`)

  const positions: CameraPosition[] = result.picked.map((c, index) => ({
    id: `pos-${index + 1}`,
    number: index + 1,
    at: c.at,
    lensId: c.opticId,
    focalLength: c.focalLength,
    /* What to shoot is the shooter's: the code picked WHERE, not WHAT. */
    shot: '',
    risk: '',
    angleRationale: whyLine(c, args.units),
    coversShot: null,
    platform: c.platform,
    altitudeFeet: c.altitudeFeet,
    shotType: DEFAULT_SHOT_TYPE,
    yawDegrees: DEFAULT_YAW_DEGREES,
    moved: false,
    origin: 'suggested',
  }))

  return {
    status: 'ok',
    positions,
    summary: { ...summarise(result, args.units), notes },
    site: site.status === 'ok' ? site.geometry : null,
  }
}
