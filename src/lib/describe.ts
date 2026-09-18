/*
 * Reading the plain description of a shoot into form fields.
 *
 * WHAT COMES BACK IS PROSE AND A PLACE NAME, NOTHING MORE. Every rule this
 * project has about model output applies here: the response is capped field by
 * field, a coordinate is rejected outright rather than trusted, and the date is
 * a token that src/core/when.ts resolves against the venue's own clock.
 *
 * IT FILLS THE FORM, IT DOES NOT REPLACE IT. Everything parsed lands in the
 * normal input it belongs in, visibly, marked as parsed rather than typed, so
 * the shooter sees exactly what was understood and can correct any of it. There
 * is no hidden state and nothing is acted on that is not on screen.
 */

import { extractJsonObject } from './parsePlan.ts'

export const VENUE_SEARCH_CAP = 120
export const BRIEF_WORD_CAP = 60
export const WANT_WORD_CAP = 40
export const SHOT_LIST_CAP = 12
export const SHOT_LINE_WORD_CAP = 20

/** Which fields came from the description rather than from the keyboard. */
export type ParsedField = 'venue' | 'date' | 'startTime' | 'endTime' | 'brief' | 'want'

export interface DescribedShoot {
  /** A place NAME to geocode. Never a coordinate: see rejectCoordinates. */
  venueSearch: string
  /** yyyy-mm-dd, or a relative token for src/core/when.ts to resolve. */
  date: string
  startTime: string
  endTime: string
  eventBrief: string
  wantOut: string
}

export type DescribeResult =
  | { ok: true; shoot: DescribedShoot; filled: ParsedField[] }
  | { ok: false; reason: string; raw: string }

const words = (text: string, cap: number): string => {
  const list = text.trim().split(/\s+/).filter((w) => w !== '')
  if (list.length <= cap) return list.join(' ')
  return `${list.slice(0, cap).join(' ')}…`
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * A place name that is really a coordinate.
 *
 * THE FAILURE THIS PROJECT EXISTS TO PREVENT, in a new place. A model told not
 * to return coordinates will usually comply, and the once it does not the string
 * looks perfectly plausible and would be handed to a geocoder that dutifully
 * resolves it to a point in a field. Anything shaped like a coordinate pair is
 * dropped, and the venue is left empty for the shooter to type.
 */
export function looksLikeCoordinates(text: string): boolean {
  const trimmed = text.trim()
  // "38.36, -75.60", "38.36 -75.60", "38.36N 75.60W", "38°21'51\"N"
  if (/^[-+]?\d{1,3}(\.\d+)?\s*[,;/ ]\s*[-+]?\d{1,3}(\.\d+)?$/.test(trimmed)) return true
  if (/\d+\s*°/.test(trimmed) && /[NSEW]\b/i.test(trimmed)) return true
  if (/^[-+]?\d{1,3}(\.\d+)?\s*[NS][ ,]+[-+]?\d{1,3}(\.\d+)?\s*[EW]$/i.test(trimmed)) return true
  return false
}

export function parseDescribeResponse(raw: string): DescribeResult {
  const json = extractJsonObject(raw)
  if (json === null) {
    return {
      ok: false,
      reason: raw.includes('{')
        ? 'The response was cut off before the JSON finished.'
        : 'No JSON object found in the response.',
      raw,
    }
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { ok: false, reason: 'The response was not valid JSON.', raw }
  }

  const str = (key: string): string =>
    typeof parsed[key] === 'string' ? (parsed[key] as string).trim() : ''

  const rawVenue = str('venueSearch').slice(0, VENUE_SEARCH_CAP)
  const venueSearch = looksLikeCoordinates(rawVenue) ? '' : rawVenue

  const startTime = TIME.test(str('startTime')) ? str('startTime') : ''
  const endTime = TIME.test(str('endTime')) ? str('endTime') : ''
  const eventBrief = words(str('eventBrief'), BRIEF_WORD_CAP)
  const wantOut = words(str('wantOut'), WANT_WORD_CAP)
  const date = str('date').slice(0, 20)

  const shoot: DescribedShoot = { venueSearch, date, startTime, endTime, eventBrief, wantOut }

  const filled: ParsedField[] = []
  if (venueSearch !== '') filled.push('venue')
  if (date !== '') filled.push('date')
  if (startTime !== '') filled.push('startTime')
  if (endTime !== '') filled.push('endTime')
  if (eventBrief !== '') filled.push('brief')
  if (wantOut !== '') filled.push('want')

  if (filled.length === 0) {
    return { ok: false, reason: 'Nothing usable could be read from that description.', raw }
  }

  return { ok: true, shoot, filled }
}

export const PARSE_ENDPOINT = '/api/parse'

export interface ParseResponse {
  status: 'ok' | 'error'
  raw?: string
  message?: string
}

export async function requestParse(text: string): Promise<ParseResponse> {
  let response: Response
  try {
    response = await fetch(PARSE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {
    return { status: 'error', message: 'Could not reach the parse function.' }
  }

  const body = await response.text()
  try {
    return JSON.parse(body) as ParseResponse
  } catch {
    return {
      status: 'error',
      message:
        response.status === 404 || body.startsWith('<')
          ? 'The parse function is not running. Use `vercel dev`.'
          : `Unexpected response from the function (HTTP ${response.status}).`,
    }
  }
}

/* ------------------------------------------------------------- shot list */

export interface DesiredShot {
  id: string
  text: string
}

/**
 * A pasted shot list, split into lines.
 *
 * SPLIT IN CODE, NOT BY A MODEL. A list someone sent is already a list; asking a
 * model to restate it invites it to rewrite, merge or invent entries. Bullets,
 * numbering and stray punctuation are stripped, everything else is kept as the
 * sender wrote it.
 */
export function parseShotList(text: string): DesiredShot[] {
  return text
    .split(/[\n\r]+/)
    // Leading bullet, dash or numbering, in whatever form the sender used.
    .map((line) => line.replace(/^\s*(?:[-*•·–—]+|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 1)
    .slice(0, SHOT_LIST_CAP)
    .map((line, index) => ({ id: `want-${index + 1}`, text: words(line, SHOT_LINE_WORD_CAP) }))
}

/** What the describe box is doing, for the UI. */
export type DescribeState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'error'; message: string }
  | { status: 'raw'; reason: string; raw: string }
  | {
      status: 'done'
      filled: number
      /** The place name found nothing in the geocoder. */
      needsVenue: boolean
      searched: string
    }
