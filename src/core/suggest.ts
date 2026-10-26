/*
 * SUGGEST: WHERE TO STAND, WORKED OUT, NOT ASKED FOR.
 *
 * WHY THIS REPLACES THE MODEL. Suggest used to hand a satellite image to a
 * language model and ask where to stand. That is geometry through a model,
 * which breaks this project's first rule, and it showed: from straight above
 * a model cannot tell a two-storey building from a twelve-storey one, so it
 * put tripods behind hotels. Everything a good position depends on is
 * arithmetic over data the app already has, so it is done here:
 *
 *   1  CANDIDATES. A ring around the subject for every optic in the bag, at
 *      the distances that optic frames the subject (fov.ts), every
 *      BEARING_STEP_DEGREES.
 *   2  WHERE YOU CANNOT STAND OR FLY. Inside a building footprint or in
 *      water (ground); in a national park unit, a restricted or prohibited
 *      area, or surface-area controlled airspace (air) -- the last kept only
 *      when the shooter has LAANC there, and flown no higher than the grid
 *      ceiling; or outside the reach ring the shooter drew.
 *   3  LINE OF SIGHT. The straight line to the subject, against building
 *      footprints with their heights, the terrain, and the shooter's own
 *      hazard marks (sightline.ts). A footprint OpenStreetMap gives no height
 *      for is ASSUMED TO BLOCK: the candidate survives only labelled "line of
 *      sight unverified", and never outranks one that was checked.
 *   4  LIGHT at the shoot time (lighting.ts).
 *   5  THE BEST THREE TO FIVE, at least SPACING_METERS apart, each with the
 *      reason it was picked, and the reason the nearest runners-up were not.
 *
 * NO MODEL CALL, NO NETWORK. Every input arrives as data; the caller fetches
 * buildings and water and passes them in. The model may later write one line
 * describing a picked spot. It may not choose, move or score one.
 *
 * NEVER "CLEAR". A candidate that crosses nothing mapped says so -- "nothing
 * mapped in the line" -- because an unmapped tree is still a tree. See
 * CLAUDE.md: the app never says an area is clear.
 */

import { cameraHeightMeters, blockers } from './sightline.ts'
import { computeFOV, PRACTICAL_MAX_STANDOFF_METERS, rangeForFrameWidth, standoffBand, type SensorSize } from './fov.ts'
import { bearingBetween, destinationPoint, distanceMeters, type LatLon, type Position } from './geo.ts'
import { classifyLighting, classificationOf, type Classification } from './lighting.ts'
import { airspaceAt, type AirspaceShape } from './airspaceLookup.ts'
import { floorReaches, insideShape, type ParkUnit, type SpecialUseArea } from './restrictions.ts'
import { compassWord } from './compassWords.ts'
import { isInSea, isInWater, type Ring } from './siting.ts'
import type { SiteMark } from './siteMark.ts'
import type { SunPosition } from './sun.ts'

/* ------------------------------------------------------------- the rules */

/** Every this many degrees round the subject. 36 bearings per distance. */
export const BEARING_STEP_DEGREES = 10

/** Picked positions are at least this far apart: the brief's 90 m. */
export const SPACING_METERS = 90

export const MAX_PICKS = 5
export const MIN_PICKS = 3

/**
 * HOW MUCH WIDER THAN THE SUBJECT THE FRAME IS, at the distance an optic
 * "frames it": the subject fills two thirds of the width, with room either
 * side. A choice about composition, named so it can be argued with.
 */
export const FRAME_FILL = 1.5

/**
 * The subject width assumed when the shooter has not given one. Said on
 * screen whenever it is used, because every distance depends on it.
 */
export const NOMINAL_SUBJECT_METERS = 20

/*
 * HOW A DRONE FRAMES THE SUBJECT: from above, looking down this steeply.
 *
 * A fixed altitude cannot work for a fixed focal length. At 200 ft the Air 3S
 * tele frames a 30 m width at 58 m, which is closer than the 61 m it is
 * flying at, so from 200 ft it cannot frame a 20 m subject at all. Measured
 * in the first run at Atlantic Park: all 72 air candidates dropped. So the
 * aircraft flies at the height that frames the subject along this look-down,
 * capped at the planned altitude.
 */
export const AIR_LOOK_DOWN_DEGREES = 30
/** Below this an aircraft is not making an aerial; the candidate is dropped and says why. */
export const MIN_AIR_ALTITUDE_FEET = 30

/** Line-of-sight sampling along the line, in metres. */
export const SAMPLE_STEP_METERS = 2
/** Terrain sampling along the line. The DEM is ~30 m; finer is pretending. */
export const TERRAIN_STEP_METERS = 20
/** Ground standing this far above the line blocks it. Below it is DEM noise. */
export const TERRAIN_TOLERANCE_METERS = 1

/**
 * WHICH LIGHT SCORES HIGHEST, AND WHY. Side light gives a subject shape and
 * texture; front light shows it plainly but flat; back light is silhouette and
 * flare, a deliberate shot rather than a default one. A judgement about light,
 * kept in one table so the ranking can be read and changed.
 */
export const LIGHT_SCORE: Record<Classification, number> = {
  'side-lit': 3,
  'front-lit': 2,
  backlit: 1,
}

/* ------------------------------------------------------------- the inputs */

export interface SuggestOptic {
  id: string
  name: string
  kind: 'lens' | 'drone'
  minFocalLength: number
  maxFocalLength: number
  /** The sensor this optic's field of view is computed against (35mm-equivalent drones: full frame). */
  sensor: SensorSize
}

/** A building footprint and how tall it is, or null when OSM did not say. */
export interface Footprint {
  id: string
  ring: Position[]
  heightMeters: number | null
}

export interface SuggestInput {
  subject: LatLon
  /** How high up the subject the shot is aimed. 0: its base. */
  subjectHeightMeters: number
  /** Null when the shooter has not said: NOMINAL_SUBJECT_METERS is used and said. */
  subjectWidthMeters: number | null
  /** The reach ring: centre and radius. Candidates outside it are dropped. */
  reach: { centre: LatLon; radiusMeters: number }
  optics: readonly SuggestOptic[]
  platforms: readonly ('ground' | 'air')[]
  /** The highest an aircraft is planned to fly. It flies lower when that frames the subject. */
  airAltitudeFeet: number
  sun: SunPosition
  footprints: readonly Footprint[]
  water: Ring[][]
  /** OSM coastline ways: the sea is on their right. See isInSea in siting.ts. */
  coastline?: readonly Position[][]
  /** Surface-area controlled airspace in the extract. Air candidates inside are dropped, unless `laanc` is on. */
  airspace: readonly AirspaceShape[]
  /**
   * Restricted and prohibited areas (restrictions.ts). An air candidate whose
   * height the area's floor reaches, or may reach, is dropped, LAANC or not:
   * LAANC does not open a restricted area.
   */
  specialUse?: readonly SpecialUseArea[]
  /** National Park Service units. No drone launch inside one: air candidates there are dropped. */
  parks?: readonly ParkUnit[]
  /**
   * THE "I HAVE LAANC HERE" SWITCH, per saved spot, on the phone only.
   *
   * On: an air candidate in controlled airspace is KEPT where the facility
   * map has a ceiling above 0, and flown no higher than that ceiling at its
   * own grid square. Off or absent: controlled airspace drops it, as before.
   */
  laanc?: { enabled: boolean; ceilingAt: (at: LatLon) => number | null }
  marks: readonly SiteMark[]
  /** yyyy-mm-dd, for the leaf question in sightline.ts. */
  date: string
  /** Ground elevation in metres, or null where unknown. Absent: terrain not checked. */
  elevationAt?: (at: LatLon) => number | null
}

/* ------------------------------------------------------------- the outputs */

export type DropStep =
  | 'outside-reach'
  | 'cannot-frame-from-altitude'
  | 'inside-building'
  | 'in-water'
  | 'national-park'
  | 'restricted-or-prohibited'
  | 'controlled-airspace'
  | 'grid-ceiling-too-low'
  | 'building-in-line'
  | 'terrain-in-line'
  | 'marked-hazard-in-line'

/** In the order the steps run, for the report. */
export const DROP_STEPS: readonly DropStep[] = [
  'outside-reach',
  'cannot-frame-from-altitude',
  'inside-building',
  'in-water',
  'national-park',
  'restricted-or-prohibited',
  'controlled-airspace',
  'grid-ceiling-too-low',
  'building-in-line',
  'terrain-in-line',
  'marked-hazard-in-line',
]

export const DROP_WORDS: Record<DropStep, string> = {
  'outside-reach': 'outside the reach ring',
  'cannot-frame-from-altitude': `would have to fly under ${MIN_AIR_ALTITUDE_FEET} ft to frame the subject`,
  'inside-building': 'inside a building footprint',
  'in-water': 'in water',
  'national-park': 'a drone launch inside a national park unit',
  'restricted-or-prohibited': 'in a restricted or prohibited area',
  'controlled-airspace': 'in controlled airspace (needs authorization)',
  'grid-ceiling-too-low': `grid ceiling too low to fly ${MIN_AIR_ALTITUDE_FEET} ft or more here`,
  'building-in-line': 'a building of known height in the line',
  'terrain-in-line': 'terrain in the line',
  'marked-hazard-in-line': 'a marked hazard in the line',
}

export interface Candidate {
  at: LatLon
  platform: 'ground' | 'air'
  opticId: string
  opticName: string
  focalLength: number
  /** Ground distance from the subject. */
  rangeMeters: number
  /** FROM the subject TO the candidate. */
  positionBearing: number
  /** FROM the candidate TO the subject: where the camera points. */
  cameraBearing: number
  altitudeFeet: number
  /**
   * The ceiling this point is flown under when the drone is flying under LAANC
   * in controlled airspace: the facility map's, or the shooter's approved
   * ceiling where that is lower (flyCeiling in src/lib/venue.ts). Absent
   * otherwise. altitudeFeet never exceeds it.
   */
  ceilingFeet?: number
  /** Null when the sun is down: there is no light class to score. */
  light: Classification | null
  /** Degrees between where the camera points and the sun: 90 is pure side light. */
  lightDelta: number
  /** Verified: nothing mapped crosses the line. Unverified: a footprint with no height does. */
  lineOfSight: 'nothing-mapped' | 'unverified'
  /** Whether terrain was sampled along this line at all. */
  terrainChecked: boolean
  score: number
}

export interface RunnerUp {
  candidate: Candidate
  lostBecause: string
}

export interface SuggestResult {
  picked: Candidate[]
  /** The best few not picked, and why each lost. */
  runnersUp: RunnerUp[]
  /** Every candidate step 1 generated. */
  considered: number
  dropped: Record<DropStep, number>
  survivors: number
  /** Things the result depends on that the shooter should know. */
  notes: string[]
}

/* ------------------------------------------------------------- geometry */

/** Ray casting on a [lon, lat] ring. Small rings, so planar is exact enough. */
function inRing(ring: readonly Position[], at: LatLon): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > at.lat !== yj > at.lat && at.lon < ((xj - xi) * (at.lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

interface Boxed {
  footprint: Footprint
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
}

function boxed(footprints: readonly Footprint[]): Boxed[] {
  return footprints
    .filter((f) => f.ring.length >= 3)
    .map((footprint) => {
      const lons = footprint.ring.map((p) => p[0])
      const lats = footprint.ring.map((p) => p[1])
      return {
        footprint,
        minLon: Math.min(...lons),
        minLat: Math.min(...lats),
        maxLon: Math.max(...lons),
        maxLat: Math.max(...lats),
      }
    })
}

const insideBox = (b: Boxed, at: LatLon) =>
  at.lon >= b.minLon && at.lon <= b.maxLon && at.lat >= b.minLat && at.lat <= b.maxLat

/* ------------------------------------------------------------- step 1 */

interface Ring1 {
  optic: SuggestOptic
  platform: 'ground' | 'air'
  focalLength: number
  /** The straight-line distance at which this focal frames the subject. */
  framingMeters: number
}

/** The distances an optic frames the subject at: its two ends, and the middle for a zoom. */
function framingRings(
  optic: SuggestOptic,
  platform: 'ground' | 'air',
  subjectWidth: number,
): Ring1[] {
  const target = subjectWidth * FRAME_FILL
  const focals =
    optic.minFocalLength === optic.maxFocalLength
      ? [optic.minFocalLength]
      : [
          optic.minFocalLength,
          Math.round(Math.sqrt(optic.minFocalLength * optic.maxFocalLength)),
          optic.maxFocalLength,
        ]
  const out: Ring1[] = []
  for (const focal of focals) {
    const hFOV = computeFOV(focal, optic.sensor).hFOV
    const band = standoffBand(hFOV, platform, subjectWidth)
    const framing = rangeForFrameWidth(target, hFOV)
    /* Past the practical standoff the haze costs more than the reach buys: see fov.ts. */
    if (framing > PRACTICAL_MAX_STANDOFF_METERS[platform] || framing < band.minMeters) continue
    out.push({ optic, platform, focalLength: focal, framingMeters: framing })
  }
  return out
}

/* ------------------------------------------------------------- step 3 */

type LineVerdict =
  | { blocked: DropStep }
  | { blocked: null; unverified: boolean; terrainChecked: boolean }

function lineOfSight(
  input: SuggestInput,
  camera: LatLon,
  cameraHeight: number,
  buildings: readonly Boxed[],
): LineVerdict {
  const total = distanceMeters(camera, input.subject)
  const bearing = bearingBetween(camera, input.subject)

  /* Terrain first, because it decides the heights the buildings are judged against. */
  const ground = input.elevationAt
  let terrainChecked = false
  let cameraGround = 0
  let subjectGround = 0
  if (ground !== undefined) {
    const c = ground(camera)
    const s = ground(input.subject)
    if (c !== null && s !== null) {
      terrainChecked = true
      cameraGround = c
      subjectGround = s
      const from = c + cameraHeight
      const to = s + input.subjectHeightMeters
      for (let along = TERRAIN_STEP_METERS; along < total - TERRAIN_STEP_METERS / 2; along += TERRAIN_STEP_METERS) {
        const here = ground(destinationPoint(camera, bearing, along))
        if (here === null) {
          terrainChecked = false
          break
        }
        const line = from + (to - from) * (along / total)
        if (here > line + TERRAIN_TOLERANCE_METERS) return { blocked: 'terrain-in-line' }
      }
    }
  }

  /* Buildings: the subject's own and the one the camera is in are not in the way. */
  const lineFrom = cameraGround + cameraHeight
  const lineTo = subjectGround + input.subjectHeightMeters
  const lonMin = Math.min(camera.lon, input.subject.lon)
  const lonMax = Math.max(camera.lon, input.subject.lon)
  const latMin = Math.min(camera.lat, input.subject.lat)
  const latMax = Math.max(camera.lat, input.subject.lat)
  let unverified = false
  for (const b of buildings) {
    if (b.maxLon < lonMin || b.minLon > lonMax || b.maxLat < latMin || b.minLat > latMax) continue
    if (insideBox(b, input.subject) && inRing(b.footprint.ring, input.subject)) continue
    if (insideBox(b, camera) && inRing(b.footprint.ring, camera)) continue
    for (let along = SAMPLE_STEP_METERS; along < total; along += SAMPLE_STEP_METERS) {
      const here = destinationPoint(camera, bearing, along)
      if (!insideBox(b, here) || !inRing(b.footprint.ring, here)) continue
      if (b.footprint.heightMeters === null) {
        /* ASSUMED TO BLOCK: never counted as open, never as a known block. */
        unverified = true
        break
      }
      const line = lineFrom + (lineTo - lineFrom) * (along / total)
      /* The building stands on the ground there; without terrain, the camera's ground. */
      if (cameraGround + b.footprint.heightMeters > line) return { blocked: 'building-in-line' }
      break
    }
  }

  /* The shooter's own marks: wires, trees, signs they measured. */
  const marked = blockers({
    camera,
    cameraHeightMeters: cameraHeight,
    subject: input.subject,
    subjectHeightMeters: input.subjectHeightMeters,
    marks: input.marks,
    date: input.date,
  })
  if (marked.length > 0) return { blocked: 'marked-hazard-in-line' }

  return { blocked: null, unverified, terrainChecked }
}

/* ------------------------------------------------------------- the run */

export function suggestPositions(input: SuggestInput): SuggestResult {
  const dropped = Object.fromEntries(DROP_STEPS.map((s) => [s, 0])) as Record<DropStep, number>
  const notes: string[] = []
  const subjectWidth = input.subjectWidthMeters ?? NOMINAL_SUBJECT_METERS
  if (input.subjectWidthMeters === null) {
    notes.push(
      `Subject size not set, so distances frame a ${NOMINAL_SUBJECT_METERS} m subject. Set it in Setup for distances that fit.`,
    )
  }
  if (input.elevationAt === undefined) notes.push('Terrain not checked: turn terrain on to include ridges.')
  if (input.footprints.length === 0) {
    notes.push('No building footprints for this area, so no building was checked. Unmapped is not empty.')
  }
  const sunUp = input.sun.altitude > 0
  if (!sunUp) notes.push('The sun is down at the shoot time, so light was not scored.')

  const buildings = boxed(input.footprints)
  const survivors: Candidate[] = []
  let considered = 0

  const rings = input.platforms.flatMap((platform) =>
    input.optics
      .filter((optic) => (platform === 'air' ? optic.kind === 'drone' : optic.kind === 'lens'))
      .flatMap((optic) => framingRings(optic, platform, subjectWidth)),
  )

  for (const ring of rings) {
    /*
     * An aircraft frames along its slant. It flies at the height that puts the
     * subject AIR_LOOK_DOWN_DEGREES below it at the framing distance, or at
     * the planned ceiling if that is lower; the ground distance is what is left.
     */
    const ceilingMeters = input.airAltitudeFeet * 0.3048
    const ringAltitudeMeters =
      ring.platform === 'air'
        ? Math.min(ceilingMeters, ring.framingMeters * Math.sin((AIR_LOOK_DOWN_DEGREES * Math.PI) / 180))
        : 0
    const ringAltitudeFeet = Math.round(ringAltitudeMeters / 0.3048 / 5) * 5
    const groundRangeAt = (metres: number) =>
      ring.platform === 'air' ? Math.sqrt(Math.max(0, ring.framingMeters ** 2 - metres ** 2)) : ring.framingMeters
    for (let positionBearing = 0; positionBearing < 360; positionBearing += BEARING_STEP_DEGREES) {
      considered += 1

      if (ring.platform === 'air' && ringAltitudeFeet < MIN_AIR_ALTITUDE_FEET) {
        dropped['cannot-frame-from-altitude'] += 1
        continue
      }
      let altitudeFeet = ringAltitudeFeet
      let groundRange = groundRangeAt(ringAltitudeMeters)
      let at = destinationPoint(input.subject, positionBearing, groundRange)
      let ceilingFeet: number | undefined

      /*
       * CONTROLLED AIRSPACE, AND THE LAANC SWITCH. Off: dropped, as it always
       * was. On: flown no higher than the facility map's ceiling. Flying lower
       * moves the aircraft OUT along its framing slant, which can land it in a
       * different grid square, so the ceiling is read again where it ends up
       * and the candidate goes if it would still be above it.
       */
      if (ring.platform === 'air' && airspaceAt(input.airspace, at).length > 0) {
        if (input.laanc?.enabled !== true) {
          dropped['controlled-airspace'] += 1
          continue
        }
        let ok = false
        for (let pass = 0; pass < 3; pass++) {
          const ceiling = input.laanc.ceilingAt(at)
          if (ceiling === null || ceiling <= 0) break
          if (altitudeFeet <= ceiling) {
            ceilingFeet = ceiling
            ok = true
            break
          }
          altitudeFeet = Math.floor(ceiling / 5) * 5
          if (altitudeFeet < MIN_AIR_ALTITUDE_FEET) break
          groundRange = groundRangeAt(altitudeFeet * 0.3048)
          at = destinationPoint(input.subject, positionBearing, groundRange)
        }
        if (!ok) {
          dropped['grid-ceiling-too-low'] += 1
          continue
        }
      }

      /* Step 2: where nobody can stand or fly. */
      if (distanceMeters(input.reach.centre, at) > input.reach.radiusMeters) {
        dropped['outside-reach'] += 1
        continue
      }
      if (ring.platform === 'air') {
        /* No launch in a park unit; no flight where a restricted or prohibited floor reaches. */
        if ((input.parks ?? []).some((park) => insideShape(park, at))) {
          dropped['national-park'] += 1
          continue
        }
        if (
          (input.specialUse ?? []).some(
            (area) => insideShape(area, at) && floorReaches(area, altitudeFeet) !== 'above',
          )
        ) {
          dropped['restricted-or-prohibited'] += 1
          continue
        }
      }
      if (ring.platform === 'ground') {
        if (buildings.some((b) => insideBox(b, at) && inRing(b.footprint.ring, at))) {
          dropped['inside-building'] += 1
          continue
        }
        if (isInWater(at, input.water) || isInSea(at, input.coastline ?? [])) {
          dropped['in-water'] += 1
          continue
        }
      }

      /* Step 3: the line to the subject. */
      const verdict = lineOfSight(input, at, cameraHeightMeters(ring.platform, altitudeFeet), buildings)
      if (verdict.blocked !== null) {
        dropped[verdict.blocked] += 1
        continue
      }

      /* Step 4: the light. */
      const positionBearingExact = bearingBetween(input.subject, at)
      const cameraBearing = bearingBetween(at, input.subject)
      const read = classifyLighting(
        { shotType: 'framed', positionBearing: positionBearingExact, cameraBearing },
        input.sun,
      )
      const light = sunUp ? classificationOf(read) : null
      const lightDelta = read.shotType === 'framed' ? read.lighting.delta : 0
      survivors.push({
        at,
        platform: ring.platform,
        opticId: ring.optic.id,
        opticName: ring.optic.name,
        focalLength: ring.focalLength,
        rangeMeters: groundRange,
        positionBearing: positionBearingExact,
        cameraBearing,
        altitudeFeet: ring.platform === 'air' ? altitudeFeet : 0,
        ...(ceilingFeet === undefined ? {} : { ceilingFeet }),
        light,
        lightDelta,
        lineOfSight: verdict.unverified ? 'unverified' : 'nothing-mapped',
        terrainChecked: verdict.terrainChecked,
        /* A checked line always outranks an unverified one; light decides within. */
        score: (verdict.unverified ? 0 : 10) + (light === null ? 0 : LIGHT_SCORE[light]),
      })
    }
  }

  /*
   * Step 5: best first, spread out. Within a score the LIGHT breaks the tie --
   * side light closest to 90 degrees off the camera, the most modelling -- and
   * only then distance. Breaking ties on distance alone sent the first run's
   * top pick to an ultra-wide 13 m from the subject.
   */
  const ranked = survivors
    .map((c, index) => ({ c, index }))
    .sort(
      (a, b) =>
        b.c.score - a.c.score ||
        Math.abs(a.c.lightDelta - 90) - Math.abs(b.c.lightDelta - 90) ||
        a.c.rangeMeters - b.c.rangeMeters ||
        a.index - b.index,
    )
    .map(({ c }) => c)

  const picked: Candidate[] = []
  const runnersUp: RunnerUp[] = []
  for (const candidate of ranked) {
    if (picked.length >= MAX_PICKS) break
    const near = picked.find((p) => distanceMeters(p.at, candidate.at) < SPACING_METERS)
    if (near === undefined) {
      picked.push(candidate)
    } else if (runnersUp.length === 0 && candidate.opticId !== near.opticId) {
      /* ONE spacing loss is worth naming; ten near-copies of a pick are not. */
      runnersUp.push({
        candidate,
        lostBecause: `${Math.round(distanceMeters(near.at, candidate.at))} m from #${picked.indexOf(near) + 1}, closer than ${SPACING_METERS} m`,
      })
    }
  }
  /* And the best of what scored lower than the last pick, if the spread did not already name three. */
  const last = picked.at(-1)
  for (const candidate of ranked) {
    if (runnersUp.length >= 3 || last === undefined) break
    if (picked.includes(candidate) || runnersUp.some((r) => r.candidate === candidate)) continue
    if (candidate.score >= last.score) continue
    runnersUp.push({ candidate, lostBecause: lostOnScore(candidate, last) })
  }

  if (picked.length < MIN_PICKS) {
    notes.push(
      picked.length === 0
        ? 'No position survived. The reasons each candidate was dropped are listed.'
        : `Only ${picked.length} position${picked.length === 1 ? '' : 's'} survived ${SPACING_METERS} m apart.`,
    )
  }

  return { picked, runnersUp, considered, dropped, survivors: survivors.length, notes }
}

function lostOnScore(candidate: Candidate, last: Candidate): string {
  if (candidate.lineOfSight === 'unverified' && last.lineOfSight !== 'unverified') {
    return 'line of sight unverified: a building with no mapped height is in the way'
  }
  if (candidate.light !== null && last.light !== null && candidate.light !== last.light) {
    return `${lightWords(candidate.light)}, which scores below ${lightWords(last.light)}`
  }
  return 'scored lower than the last pick'
}

export function lightWords(light: Classification | null): string {
  switch (light) {
    case 'side-lit':
      return 'side light'
    case 'front-lit':
      return 'front light'
    case 'backlit':
      return 'back light'
    default:
      return 'sun down'
  }
}

/** The line-of-sight half of a WHY. Never "clear": see the header. */
export function lineWords(candidate: Candidate): string {
  const base =
    candidate.lineOfSight === 'unverified'
      ? 'line of sight unverified'
      : 'nothing mapped in the line'
  return candidate.terrainChecked ? `${base}, terrain checked` : base
}

/** "from the southwest": where the position stands, seen from the subject. */
export function sideWords(candidate: Candidate): string {
  return `from the ${compassWord(candidate.positionBearing)}`
}
