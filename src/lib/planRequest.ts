import { computeFOV, SENSORS, standoffBand } from '../core/fov.ts'
import { DEFAULT_KIT, resolveSensor, selectedDroneCameras } from '../core/kit.ts'
import { getSunPosition, normalizeBearing } from '../core/sun.ts'
import { formatClock } from '../core/timezone.ts'
import type { KitSelection } from './kitSelection.ts'
import type { DroneCameraSpec, LensSpec } from './parsePlan.ts'
import type { SiteSummary } from './overpass.ts'
import type { VenueDraft, VenueWindow } from './venue.ts'

export interface MapBounds {
  west: number
  south: number
  east: number
  north: number
}

/** Only the lenses actually coming on the shoot are offered to the model. */
export function selectedLenses(kit: KitSelection): LensSpec[] {
  return DEFAULT_KIT.lenses
    .filter((lens) => kit.lensIds.includes(lens.id))
    .map((lens) => ({
      id: lens.id,
      name: lens.name,
      min: lens.minFocalLength,
      max: lens.maxFocalLength,
    }))
}

export function selectedBodyNames(kit: KitSelection): string[] {
  return DEFAULT_KIT.bodies.filter((b) => kit.bodyIds.includes(b.id)).map((b) => b.name)
}

/** The drone cameras in play, in the shape the parser validates against. */
export function selectedDroneCameraSpecs(kit: KitSelection): DroneCameraSpec[] {
  return selectedDroneCameras(DEFAULT_KIT, kit.droneIds).map((camera) => ({
    id: camera.id,
    name: camera.name,
    equiv35: camera.equiv35,
  }))
}

/**
 * An optic as the MODEL needs to see it: what it is, what focal lengths it has,
 * and how far back it may stand.
 *
 * The standoff numbers are computed here, by src/core/fov.ts, and handed over as
 * facts. The model is not asked to work out how far 400mm reaches; it is told.
 * That is the same division as everywhere else: the model receives arithmetic and
 * never performs it.
 */
export interface OpticSpec {
  id: string
  name: string
  kind: 'lens' | 'drone'
  minFocalLength: number
  maxFocalLength: number
  /** Max metres from the subject at the widest end, where the frame opens fastest. */
  maxStandoffAtMin: number
  /** Max metres at the longest end. */
  maxStandoffAtMax: number
}

const roundTo5 = (n: number) => Math.round(n / 5) * 5

/**
 * Every optic in play with its standoff band, ground lenses and drone cameras
 * together. The drone cameras are fixed focal lengths, so both ends of their band
 * are the same number.
 */
export function selectedOptics(kit: KitSelection): OpticSpec[] {
  const bodies = DEFAULT_KIT.bodies.filter((b) => kit.bodyIds.includes(b.id))

  const lenses: OpticSpec[] = DEFAULT_KIT.lenses
    .filter((lens) => kit.lensIds.includes(lens.id))
    .map((lens) => {
      const sensor = SENSORS[resolveSensor(lens, bodies)]
      return {
        id: lens.id,
        name: lens.name,
        kind: 'lens' as const,
        minFocalLength: lens.minFocalLength,
        maxFocalLength: lens.maxFocalLength,
        maxStandoffAtMin: roundTo5(
          standoffBand(computeFOV(lens.minFocalLength, sensor).hFOV, 'ground').maxMeters,
        ),
        maxStandoffAtMax: roundTo5(
          standoffBand(computeFOV(lens.maxFocalLength, sensor).hFOV, 'ground').maxMeters,
        ),
      }
    })

  const cameras: OpticSpec[] = selectedDroneCameras(DEFAULT_KIT, kit.droneIds).map((camera) => {
    // 35mm equivalent on full frame: the same arithmetic the ground lenses use.
    const hFOV = computeFOV(camera.equiv35, SENSORS.fullFrame).hFOV
    const max = roundTo5(standoffBand(hFOV, 'air').maxMeters)
    return {
      id: camera.id,
      name: camera.name,
      kind: 'drone' as const,
      minFocalLength: camera.equiv35,
      maxFocalLength: camera.equiv35,
      maxStandoffAtMin: max,
      maxStandoffAtMax: max,
    }
  })

  return [...lenses, ...cameras]
}

/**
 * Where the sun is at each end of the window and in the middle.
 *
 * COMPUTED HERE, BEFORE THE CALL, and sent as fact. This is the change that stops
 * positions being placed blind: the model used to be told nothing about light and
 * had no way to prefer one bank of the river over the other, so it placed by
 * geometry alone and the app labelled the result afterwards.
 *
 * The direction of travel is still one way. The model receives these numbers; it
 * never returns one, and src/core/lighting.ts recomputes every lighting call from
 * the coordinates that come back regardless of what the model was told.
 */
export interface SunFact {
  label: string
  /** Venue wall clock, so it lines up with the window the shooter typed. */
  clock: string
  azimuth: number
  altitude: number
}

export function sunFacts(venueWindow: VenueWindow): SunFact[] {
  const { lat, lon, timeZone } = venueWindow
  return [
    { label: 'Start', at: venueWindow.start },
    { label: 'Mid', at: venueWindow.middle },
    { label: 'End', at: venueWindow.end },
  ].map(({ label, at }) => {
    const sun = getSunPosition(at, lat, lon)
    return {
      label,
      clock: formatClock(at, timeZone),
      azimuth: Number(sun.azimuth.toFixed(1)),
      altitude: Number(sun.altitude.toFixed(1)),
    }
  })
}

export function selectedDroneNames(kit: KitSelection): string[] {
  return DEFAULT_KIT.drones
    .filter((d) => kit.droneIds.includes(d.id))
    .map((d) => `${d.name}, ${d.weightGrams}g`)
}

/** Air positions are only offered when a drone is actually coming. */
export function droneAvailable(kit: KitSelection): boolean {
  return kit.droneIds.length > 0
}

export interface GenerateRequestBody {
  venueName: string
  event: string
  outcome: string
  date: string
  startTime: string
  endTime: string
  /** How the window's zone is written, "EDT, UTC-4". Empty if it did not resolve. */
  timeZoneLabel: string
  style: string
  drones: string[]
  /** Ground lenses and drone cameras, each with its computed standoff band. */
  optics: OpticSpec[]
  /** Sun azimuth and altitude across the window, computed before the call. */
  sun: SunFact[]
  /**
   * Where the subject sits in the attached image, 0 to 1. The model is asked to
   * spread positions AROUND this point, so it has to know where it is.
   */
  subjectPoint?: { x: number; y: number }
  /**
   * Compass bearing that points toward the TOP of the image, normally 0.
   *
   * Without this the sun bearings are unusable: the model is told the sun is at
   * 134 degrees and has no way to know which direction that is on the picture in
   * front of it. This is the number that connects the two.
   */
  imageNorthBearing: number
  bounds: MapBounds
  image: string
  mediaType: string
  /** Real OSM shapes, when Overpass answered. Absent means it did not. */
  site?: SiteSummary
}

/** Strips the `data:image/jpeg;base64,` prefix the canvas puts on. */
export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',')
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1)
}

export function buildGenerateBody(
  venue: VenueDraft,
  kit: KitSelection,
  capture: { dataUrl: string; bounds: MapBounds; mediaType: string },
  site?: SiteSummary,
  /*
   * The venue's zone, so "11:00 to 15:00" in the prompt is not the same ambiguity
   * the app just stopped having. Nothing is computed from it: the sun is worked out
   * in src/core/ from real instants, and this is context only.
   */
  timeZoneLabel = '',
  /** Sun across the window. Empty only when the window has not resolved. */
  sun: SunFact[] = [],
  /** Where the subject is in the image, and which way the image is oriented. */
  framing: { subjectPoint?: { x: number; y: number }; imageNorthBearing?: number } = {},
): GenerateRequestBody {
  return {
    venueName: venue.name,
    event: venue.eventDescription,
    outcome: venue.desiredOutcome,
    date: venue.date,
    startTime: venue.startTime,
    endTime: venue.endTime,
    timeZoneLabel,
    style: kit.styleNotes,
    drones: selectedDroneNames(kit),
    optics: selectedOptics(kit),
    sun,
    ...(framing.subjectPoint === undefined ? {} : { subjectPoint: framing.subjectPoint }),
    /*
     * The map camera's bearing is how far the view is rotated clockwise from
     * north, so north sits that many degrees anticlockwise from the top of the
     * image. Negating turns it into "the compass bearing of image up".
     */
    imageNorthBearing: normalizeBearing(-(framing.imageNorthBearing ?? 0)),
    bounds: capture.bounds,
    image: stripDataUrl(capture.dataUrl),
    mediaType: capture.mediaType,
    ...(site === undefined ? {} : { site }),
  }
}

export interface GenerateResponse {
  status: 'ok' | 'error'
  raw?: string
  message?: string
  stopReason?: string | null
  usage?: { input: number; output: number }
}

export const GENERATE_ENDPOINT = '/api/generate'

export async function requestPlan(body: GenerateRequestBody): Promise<GenerateResponse> {
  let response: Response
  try {
    response = await fetch(GENERATE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { status: 'error', message: 'Could not reach the generate function.' }
  }

  // Under a bare `vite` dev server the function does not exist and Vite answers
  // with the app's own HTML, so a non JSON body is a real and likely case.
  const text = await response.text()
  try {
    return JSON.parse(text) as GenerateResponse
  } catch {
    return {
      status: 'error',
      message:
        response.status === 404 || text.startsWith('<')
          ? 'The generate function is not running. Use `vercel dev`, which serves the app and the functions together.'
          : `Unexpected response from the function (HTTP ${response.status}).`,
    }
  }
}

/*
 * The stages of a generate, in the order they happen.
 *
 * These are the REAL steps in App.onGenerate, not a decorative sequence and not a
 * timer. Each one is set immediately before the work it names begins, so the stage
 * shown is always the thing the app is actually blocked on. Two of them take real
 * time, `terrain` waiting on Overpass and `positions` waiting on the model; `capture`
 * and `lighting` are arithmetic and go by in a frame. They are still listed, because
 * a list that only shows the slow steps is a list that cannot be checked against
 * what the code does.
 *
 * If a step is added to onGenerate, add it here. If one is removed, remove it here.
 * Nothing advances on its own.
 */
export const GENERATE_STAGES = [
  { key: 'capture', label: 'Capturing the view' },
  { key: 'terrain', label: 'Reading the terrain' },
  { key: 'positions', label: 'Asking for positions' },
  { key: 'lighting', label: 'Computing lighting' },
] as const

export type GenerateStage = (typeof GENERATE_STAGES)[number]['key']

/** Where a stage sits in the sequence. -1 for a key that is not one. */
export function stageIndex(stage: GenerateStage): number {
  return GENERATE_STAGES.findIndex((entry) => entry.key === stage)
}

export function stageLabel(stage: GenerateStage): string {
  return GENERATE_STAGES.find((entry) => entry.key === stage)?.label ?? ''
}

/** What the Plan panel shows about the last generate attempt. */
export type GenerationState =
  | { status: 'idle' }
  /** Mid flight, on the named step. Nothing here is inferred from elapsed time. */
  | { status: 'working'; stage: GenerateStage }
  | { status: 'error'; message: string }
  /** Parsing failed. The raw response is shown rather than a dead end. */
  | { status: 'raw'; reason: string; raw: string }
  | { status: 'done'; count: number; dropped: number }
