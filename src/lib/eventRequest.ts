/**
 * Talking to the event endpoint, and reading a file the shooter picked.
 *
 * NOTHING IS SENT UNTIL AN IMAGE IS UPLOADED. There is no background call here
 * and no prefetch: both of these run on an explicit press, and the one that
 * sends the artwork says so on the button. See the privacy section of README.md.
 */

import type { EventElement } from './eventLayout.ts'
import { stripDataUrl } from './planRequest.ts'

export const EVENT_ENDPOINT = '/api/event'

/**
 * A ceiling on the upload.
 *
 * Anthropic resizes anything larger anyway, so a 12MB phone screenshot costs
 * upload time and nothing else. Rejected with a plain message rather than
 * silently downscaled: the shooter picked a file and is owed an answer about
 * it.
 */
export const MAX_UPLOAD_BYTES = 6_000_000

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

export type EventResponse =
  | { status: 'ok'; raw: string; stopReason?: string | null }
  | { status: 'error'; message: string }

export interface UploadedLayout {
  /** Base64 without the data URL prefix, which is what the API wants. */
  data: string
  /** The data URL, which is what an <img> wants. Not persisted: see spots.ts. */
  dataUrl: string
  mediaType: string
  name: string
}

export type ReadFileResult =
  | { ok: true; layout: UploadedLayout }
  | { ok: false; reason: string }

/*
 * arrayBuffer() and btoa rather than FileReader.
 *
 * FileReader is a DOM API and does not exist in Node, so the read path could not
 * be tested at all. `File.arrayBuffer()` is standard in both, which means the
 * size and type guards above are covered by real tests rather than by hope.
 *
 * Chunked, because String.fromCharCode applied to six million bytes at once
 * overflows the call stack.
 */
function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Reads a picked file into memory. Never touches the network. */
export function readLayoutFile(file: File): Promise<ReadFileResult> {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return Promise.resolve({
      ok: false,
      reason: 'That is not an image the reader can open. Use a PNG, JPEG or WebP.',
    })
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Promise.resolve({
      ok: false,
      reason: `That image is ${Math.round(file.size / 1_000_000)}MB. The limit is ${
        MAX_UPLOAD_BYTES / 1_000_000
      }MB.`,
    })
  }

  return file
    .arrayBuffer()
    .then((buffer): ReadFileResult => {
      const bytes = new Uint8Array(buffer)
      if (bytes.length === 0) return { ok: false, reason: 'That file came back empty.' }
      const data = toBase64(bytes)
      return {
        ok: true,
        layout: {
          data,
          dataUrl: `data:${file.type};base64,${data}`,
          mediaType: file.type,
          name: file.name,
        },
      }
    })
    .catch(() => ({ ok: false, reason: 'That file could not be read.' }))
}

async function post(body: unknown): Promise<EventResponse> {
  let response: Response
  try {
    response = await fetch(EVENT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return { status: 'error', message: 'Could not reach the event function.' }
  }

  // Under a bare `vite` dev server the function does not exist and Vite answers
  // with the app's own HTML, so a non JSON body is a real and likely case.
  const text = await response.text()
  try {
    return JSON.parse(text) as EventResponse
  } catch {
    return {
      status: 'error',
      message:
        response.status === 404 || text.startsWith('<')
          ? 'The event function is not running. Use `vercel dev`, which serves the app and the functions together.'
          : `Unexpected response from the function (HTTP ${response.status}).`,
    }
  }
}

/** STEP 1: read the artwork. The satellite view is not involved. */
export function requestEventRead(layout: UploadedLayout): Promise<EventResponse> {
  return post({ step: 'read', layout: layout.data, layoutMediaType: layout.mediaType })
}

/**
 * STEP 2: place what was read onto the satellite capture.
 *
 * `capture` is the JPEG from MapHandle.capture(), taken AT PITCH ZERO. A capture
 * with tilt on it would unproject pixels near the horizon into hundreds of
 * metres of error, so the caller flattens the map first and restores the tilt
 * after.
 */
export function requestEventPlace(
  layout: UploadedLayout,
  capture: { dataUrl: string; northBearing: number },
  elements: EventElement[],
): Promise<EventResponse> {
  return post({
    step: 'place',
    layout: layout.data,
    layoutMediaType: layout.mediaType,
    capture: stripDataUrl(capture.dataUrl),
    captureNorthBearing: capture.northBearing,
    /* Only what step 2 needs to answer: ids, types and how many points each had. */
    elements: elements.map((element) => ({
      id: element.id,
      type: element.type,
      label: element.label,
      points: element.layoutPoints,
    })),
  })
}
