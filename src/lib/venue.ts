/**
 * Venue draft: the shape of the input form, plus validation and window
 * resolution. Kept out of the components so it can be reasoned about on its own.
 *
 * Note this is form plumbing, not geometry. All solar and lighting math lives in
 * src/core/ and is not duplicated here.
 */

import type { LatLon } from '../core/geo.ts'

export interface VenueDraft {
  name: string
  /** Kept as raw text so partial input like "-" or "38." does not fight the user. */
  latitude: string
  longitude: string
  /** yyyy-mm-dd */
  date: string
  /** HH:MM, 24 hour */
  startTime: string
  endTime: string
  eventDescription: string
  desiredOutcome: string
}

export type VenueField = keyof VenueDraft

export type VenueErrors = Partial<Record<VenueField, string>>

export const EMPTY_VENUE: VenueDraft = {
  name: '',
  latitude: '',
  longitude: '',
  date: '',
  startTime: '',
  endTime: '',
  eventDescription: '',
  desiredOutcome: '',
}

/**
 * The calibration case from docs/brief.md. Brew River Dock Bar, Salisbury MD,
 * Saturday 12 September 2026, 11:00 to 15:00 local. The right answer is already
 * known for this venue, which is what makes it useful for testing fast.
 */
export const CALIBRATION_VENUE: VenueDraft = {
  name: 'Brew River Dock Bar, Salisbury MD',
  latitude: '38.3648',
  longitude: '-75.6069',
  date: '2026-09-12',
  startTime: '11:00',
  endTime: '15:00',
  eventDescription:
    'Boat docking contest on the Wicomico River. The river runs southwest to ' +
    'northeast. The dock bar, the deck and the crowd are on the north bank. The ' +
    'docking course pilings sit in the water directly in front of the deck. ' +
    'Public access on the south bank along Riverside Drive. Boats run the course ' +
    'through the afternoon, crowd on the deck and along the rail the whole time.',
  desiredOutcome:
    'Vertical cuts, 10 to 25 seconds. Compressed shots of boats hitting the ' +
    'pilings, crowd reaction from across the water, and a couple of drone ' +
    'establishers that show the river and the bar together.',
}

const TIME_PATTERN = /^\d{2}:\d{2}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function parseCoordinate(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  // Number('') is 0 and Number(' ') is 0, both already excluded above.
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

export function validateVenue(draft: VenueDraft): VenueErrors {
  const errors: VenueErrors = {}

  if (draft.name.trim() === '') {
    errors.name = 'Name the venue so you can find it again.'
  }

  const lat = parseCoordinate(draft.latitude)
  if (draft.latitude.trim() === '') {
    errors.latitude = 'Required.'
  } else if (lat === null) {
    errors.latitude = 'Not a number.'
  } else if (lat < -90 || lat > 90) {
    errors.latitude = 'Out of range. Latitude runs -90 to 90.'
  }

  const lon = parseCoordinate(draft.longitude)
  if (draft.longitude.trim() === '') {
    errors.longitude = 'Required.'
  } else if (lon === null) {
    errors.longitude = 'Not a number.'
  } else if (lon < -180 || lon > 180) {
    errors.longitude = 'Out of range. Longitude runs -180 to 180.'
  }

  if (!DATE_PATTERN.test(draft.date)) {
    errors.date = 'Required.'
  } else if (Number.isNaN(new Date(`${draft.date}T12:00:00`).getTime())) {
    errors.date = 'Not a real date.'
  }

  if (!TIME_PATTERN.test(draft.startTime)) errors.startTime = 'Required.'
  if (!TIME_PATTERN.test(draft.endTime)) errors.endTime = 'Required.'

  if (!errors.startTime && !errors.endTime && draft.endTime <= draft.startTime) {
    errors.endTime = 'End time must be after the start.'
  }

  return errors
}

export function hasErrors(errors: VenueErrors): boolean {
  return Object.keys(errors).length > 0
}

export interface VenueWindow {
  lat: number
  lon: number
  start: Date
  middle: Date
  end: Date
  /** The device timezone the times were read in. Worth surfacing: the venue may not be in it. */
  timeZone: string
}

/**
 * Turns a valid draft into the numbers src/core/ wants. Returns null when the
 * draft is not complete enough to resolve. Times are read in the device's own
 * timezone, which is why timeZone comes back with them.
 */
export function resolveWindow(draft: VenueDraft): VenueWindow | null {
  if (hasErrors(validateVenue(draft))) return null

  const lat = parseCoordinate(draft.latitude)
  const lon = parseCoordinate(draft.longitude)
  if (lat === null || lon === null) return null

  const start = new Date(`${draft.date}T${draft.startTime}:00`)
  const end = new Date(`${draft.date}T${draft.endTime}:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null

  return {
    lat,
    lon,
    start,
    end,
    middle: new Date((start.getTime() + end.getTime()) / 2),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
}

/**
 * The venue coordinate on its own, ignoring the date and time window. The map
 * needs a centre as soon as the coordinates are good, long before the window is.
 */
export function venueLatLon(draft: VenueDraft): LatLon | null {
  const errors = validateVenue(draft)
  if (errors.latitude !== undefined || errors.longitude !== undefined) return null

  const lat = parseCoordinate(draft.latitude)
  const lon = parseCoordinate(draft.longitude)
  return lat === null || lon === null ? null : { lat, lon }
}

/** Writes a map derived coordinate back into the form, at pin resolution. */
export function withCoordinates(draft: VenueDraft, at: LatLon): VenueDraft {
  return { ...draft, latitude: at.lat.toFixed(6), longitude: at.lon.toFixed(6) }
}
