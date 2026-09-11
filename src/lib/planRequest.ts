import { DEFAULT_KIT } from '../core/kit.ts'
import type { KitSelection } from './kitSelection.ts'
import type { LensSpec } from './parsePlan.ts'
import type { SiteSummary } from './overpass.ts'
import type { VenueDraft } from './venue.ts'

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
  bodies: string[]
  drones: string[]
  lenses: LensSpec[]
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
    bodies: selectedBodyNames(kit),
    drones: selectedDroneNames(kit),
    lenses: selectedLenses(kit),
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
