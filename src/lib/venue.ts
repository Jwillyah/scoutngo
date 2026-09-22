/**
 * Venue draft: the shape of the input form, plus validation and window
 * resolution. Kept out of the components so it can be reasoned about on its own.
 *
 * Note this is form plumbing, not geometry. All solar and lighting math lives in
 * src/core/ and is not duplicated here.
 */

import type { LatLon } from '../core/geo.ts'
import {
  deviceTimeZone,
  isAwayFromDevice,
  venueTimeZone,
  zonedTimeToUtc,
  zoneLabel,
  zoneShort,
} from '../core/timezone.ts'

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
 * Today, as the device reckons it, in the YYYY-MM-DD an `input[type=date]` wants.
 *
 * NOT toISOString().slice(0, 10). That is UTC, and for anyone west of Greenwich
 * it returns tomorrow's date for most of the evening. The date field has to say
 * what the calendar on the wall says.
 */
export function localISODate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * The window a cold start begins with.
 *
 * WHY THERE IS A DEFAULT AT ALL. An empty date and an empty window blocked the
 * forward button, and on a short viewport the fields that would have unblocked
 * it were off the bottom of the screen. Nobody should meet a disabled button
 * because of a field they cannot see. A default that is wrong is editable in two
 * taps; a blocked button with no visible cause is a dead end.
 *
 * WHY THIS BLOCK. Mid afternoon into evening is where the light this tool exists
 * to plan actually happens: it spans the sun dropping through the good angles
 * and, for much of the year at these latitudes, golden hour with it. It is a
 * starting point, it is marked on screen as a default, and it is editable.
 */
export const DEFAULT_START_TIME = '15:00'
export const DEFAULT_END_TIME = '19:00'

export function defaultVenue(now: Date): VenueDraft {
  return {
    ...EMPTY_VENUE,
    date: localISODate(now),
    startTime: DEFAULT_START_TIME,
    endTime: DEFAULT_END_TIME,
  }
}

/**
 * The calibration case from docs/brief.md. Brew River Dock Bar, Salisbury MD,
 * Saturday 12 September 2026, 11:00 to 15:00 local. The right answer is already
 * known for this venue, which is what makes it useful for testing fast.
 */
export const CALIBRATION_VENUE: VenueDraft = {
  name: 'Brew River Dock Bar, Salisbury MD',
  latitude: '38.364236',
  longitude: '-75.605912',
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
  /**
   * Absolute instants, resolved through the VENUE's timezone. Every one of these
   * is what src/core/ wants: a Date is a moment, not a clock reading.
   */
  start: Date
  middle: Date
  end: Date
  /** The venue's own IANA timezone, resolved from its coordinates. */
  timeZone: string
  /** How to show it: "EDT, UTC-4". Daylight time is decided at the start instant. */
  timeZoneLabel: string
  /** The same thing at its shortest, "EDT", for tight spots like the scrubber. */
  timeZoneShort: string
  /** True when the venue is not in the zone this device is set to. */
  travelling: boolean
  /** The device zone, so the UI can name both when they differ. */
  deviceTimeZone: string
  /**
   * Set when the coordinates resolved to no timezone at all and the device zone
   * is standing in. Rare, mid ocean mostly, but it must not be silent.
   */
  timeZoneFallback: boolean
}

/**
 * Turns a valid draft into the instants src/core/ wants. Returns null when the
 * draft is not complete enough to resolve.
 *
 * The times in the form are WALL CLOCK readings at the venue. They are resolved
 * through the timezone of the venue's own coordinates, not the device's. See the
 * header of src/core/timezone.ts for the bug this replaced: reading 11:00 in the
 * device zone while the venue is three zones away put every sun position three
 * hours out, which is the one thing this tool must not get wrong.
 *
 * A consequence worth knowing: moving the venue pin across a timezone boundary
 * changes these instants without the form text changing, because 11:00 at the new
 * place is a different moment. That is correct.
 */
export function resolveWindow(draft: VenueDraft): VenueWindow | null {
  if (hasErrors(validateVenue(draft))) return null

  const lat = parseCoordinate(draft.latitude)
  const lon = parseCoordinate(draft.longitude)
  if (lat === null || lon === null) return null

  const resolved = venueTimeZone(lat, lon)
  const timeZone = resolved ?? deviceTimeZone()

  const start = zonedTimeToUtc(draft.date, draft.startTime, timeZone)
  const end = zonedTimeToUtc(draft.date, draft.endTime, timeZone)
  if (start === null || end === null) return null

  return {
    lat,
    lon,
    start,
    end,
    middle: new Date((start.getTime() + end.getTime()) / 2),
    timeZone,
    timeZoneLabel: zoneLabel(start, timeZone),
    timeZoneShort: zoneShort(start, timeZone),
    travelling: isAwayFromDevice(timeZone),
    deviceTimeZone: deviceTimeZone(),
    timeZoneFallback: resolved === null,
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
