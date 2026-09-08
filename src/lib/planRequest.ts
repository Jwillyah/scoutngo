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

export interface GenerateRequestBody {
  venueName: string
  event: string
  outcome: string
  date: string
  startTime: string
  endTime: string
  style: string
  bodies: string[]
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
): GenerateRequestBody {
  return {
    venueName: venue.name,
    event: venue.eventDescription,
    outcome: venue.desiredOutcome,
    date: venue.date,
    startTime: venue.startTime,
    endTime: venue.endTime,
    style: kit.styleNotes,
    bodies: selectedBodyNames(kit),
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

export const GENERATE_ENDPOINT = '/.netlify/functions/generate'

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

  // Under `npm run dev` the function does not exist and Vite answers with the
  // app's own HTML, so a non JSON body is a real and likely case.
  const text = await response.text()
  try {
    return JSON.parse(text) as GenerateResponse
  } catch {
    return {
      status: 'error',
      message:
        response.status === 404 || text.startsWith('<')
          ? 'The generate function is not running. Use `netlify dev` instead of `npm run dev`.'
          : `Unexpected response from the function (HTTP ${response.status}).`,
    }
  }
}

/** What the Plan panel shows about the last generate attempt. */
export type GenerationState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'error'; message: string }
  /** Parsing failed. The raw response is shown rather than a dead end. */
  | { status: 'raw'; reason: string; raw: string }
  | { status: 'done'; count: number; dropped: number }
