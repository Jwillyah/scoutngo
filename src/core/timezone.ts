/*
 * The venue's timezone, and wall clock times in it.
 *
 * THE BUG THIS EXISTS TO FIX. Times used to be read in the DEVICE timezone. Enter
 * 11:00 for a venue in Maryland while sitting in California and the app computed
 * the sun for 11:00 Pacific, which is 14:00 in Maryland: three hours of solar
 * azimuth wrong, so every lighting class on every position was wrong. Flying in
 * cold to a place in another timezone is the entire use case, so this was wrong in
 * exactly the situation the tool is for.
 *
 * THE RULE. A time the user typed is a WALL CLOCK reading at the venue. It is not
 * an instant until it is paired with the venue's timezone. Only instants go to
 * suncalc. Nothing downstream of resolveWindow needs to know any of this, because
 * a Date is already an absolute instant: fix the conversion here and sun.ts,
 * lighting.ts and the scrubber are all correct without changing a line.
 *
 * Arithmetic, so it lives in core and is tested. Like geo.ts it takes one
 * dependency, tz-lookup, for the coordinate to timezone table. The offset
 * arithmetic itself is done with Intl, which ships with the platform and carries
 * the current tz database, so no offset table is hardcoded here and DST is not
 * modelled by hand.
 */

import tzlookup from 'tz-lookup'

/** What to fall back to when a coordinate has no timezone we can resolve. */
export const deviceTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * The IANA timezone at a coordinate, offline, from the packed boundary table.
 * Null when the coordinate is not resolvable, so the caller decides the fallback
 * rather than being silently given the wrong zone.
 */
export function venueTimeZone(lat: number, lon: number): string | null {
  try {
    return tzlookup(lat, lon)
  } catch {
    return null
  }
}

/*
 * One formatter per zone, kept. Constructing an Intl.DateTimeFormat is the
 * expensive part, and the time scrubber calls through here on every frame of a
 * drag.
 */
const partFormatters = new Map<string, Intl.DateTimeFormat>()

function partFormatter(timeZone: string): Intl.DateTimeFormat {
  const held = partFormatters.get(timeZone)
  if (held !== undefined) return held
  const made = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // h23 rather than hour12:false: that spelling can report midnight as hour 24.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  partFormatters.set(timeZone, made)
  return made
}

/**
 * The zone's offset from UTC at a given instant, in milliseconds, positive east.
 *
 * Read the wall clock the zone shows at that instant, then read that clock back
 * as if it were UTC. The difference is the offset, by definition. Nothing about
 * DST is special cased: the platform's tz database has already applied it.
 */
export function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = partFormatter(timeZone).formatToParts(instant)
  const field = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((part) => part.type === type)
    return found === undefined ? Number.NaN : Number(found.value)
  }

  const asIfUtc = Date.UTC(
    field('year'),
    field('month') - 1,
    field('day'),
    field('hour'),
    field('minute'),
    field('second'),
  )
  // Seconds are the finest field formatted, so compare against the instant
  // floored to the second or the answer is off by up to 999ms.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds())
}

/**
 * A wall clock reading at the venue, turned into the absolute instant it names.
 * `date` is yyyy-mm-dd and `time` is HH:MM, both exactly as the form holds them.
 * Null when either is unparseable.
 *
 * Two passes. The first guesses the offset using the offset in force at the same
 * clock reading treated as UTC; the second re-reads the offset at the instant that
 * guess landed on, which is what makes the hour either side of a DST change come
 * out right. Inside the spring forward gap the named wall clock does not exist at
 * all, and this returns the instant an hour of it maps onto rather than failing.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const wallClockAsUtc = Date.parse(`${date}T${time}:00Z`)
  if (Number.isNaN(wallClockAsUtc)) return null

  const firstPass = wallClockAsUtc - zoneOffsetMs(new Date(wallClockAsUtc), timeZone)
  const secondPass = wallClockAsUtc - zoneOffsetMs(new Date(firstPass), timeZone)
  return Number.isNaN(secondPass) ? null : new Date(secondPass)
}

/*
 * THE ONE CLOCK. Every time the app prints -- chips, cards, the time bar, the
 * call sheet, the calendar file -- goes through formatClock or one of the
 * helpers beside it, and scripts/audit-clock.mjs fails the gate on a time
 * formatted anywhere else.
 *
 * 12 HOUR BY DEFAULT, "6:14 PM", because that is how a clock reads in the
 * country this app is used in; 24 hour, "18:14", is a setting. The setting is
 * held here as module state, set by the app from the stored units on every
 * render (setClockHours), so that core code which prints a time -- the call
 * sheet's tools, the time bar's ticks -- prints it the shooter's way without
 * every caller threading a flag through. It changes how a time is WRITTEN,
 * never which instant it is.
 *
 * NO ZONE LABEL BY DEFAULT. A venue in the phone's own zone needs none. When
 * the venue's clock differs from the phone's at that instant, venueAndYours
 * says both: "6:14 PM venue time · 3:14 PM yours". The test is the offset at
 * the instant, not the zone's name: America/Detroit and America/New_York
 * read the same clock.
 */
export type ClockHours = 12 | 24
export const DEFAULT_CLOCK_HOURS: ClockHours = 12
let clockHours: ClockHours = DEFAULT_CLOCK_HOURS

export function setClockHours(hours: ClockHours): void {
  clockHours = hours
}

export function currentClockHours(): ClockHours {
  return clockHours
}

/** Hour 0-23 and minute 0-59 on the zone's wall clock at an instant. */
function wallClock(at: Date, timeZone: string): { hour: number; minute: number } | null {
  const parts = partFormatter(timeZone).formatToParts(at)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value)
  return Number.isFinite(hour) && Number.isFinite(minute) ? { hour, minute } : null
}

/** "6:14 PM" or "18:14", from an hour and minute. The one place the shape is decided. */
export function writeClock(hour: number, minute: number, hours: ClockHours = clockHours): string {
  const mm = String(minute).padStart(2, '0')
  if (hours === 24) return `${String(hour).padStart(2, '0')}:${mm}`
  return `${hour % 12 === 0 ? 12 : hour % 12}:${mm} ${hour < 12 ? 'AM' : 'PM'}`
}

/** The time at the venue for an instant: "6:14 PM", or "18:14" on a 24 hour clock. */
export function formatClock(at: Date, timeZone: string, hours: ClockHours = clockHours): string {
  const wall = wallClock(at, timeZone)
  return wall === null ? '--:--' : writeClock(wall.hour, wall.minute, hours)
}

/** The hour alone, for ticks too narrow for minutes: "6 PM", or "18". */
export function formatHour(at: Date, timeZone: string, hours: ClockHours = clockHours): string {
  const wall = wallClock(at, timeZone)
  if (wall === null) return '--'
  if (hours === 24) return String(wall.hour).padStart(2, '0')
  return `${wall.hour % 12 === 0 ? 12 : wall.hour % 12} ${wall.hour < 12 ? 'AM' : 'PM'}`
}

/** A time typed as "17:00" (an <input type="time"> value), written the shooter's way. Null when it is not one. */
export function formatWallTime(typed: string, hours: ClockHours = clockHours): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(typed.trim())
  if (match === null) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour > 23 || minute > 59 ? null : writeClock(hour, minute, hours)
}

/**
 * Two times as a span: "5:00–6:30 PM" when both are in the same half of the
 * day, "11:30 AM–1:00 PM" when not, "17:00–18:30" on a 24 hour clock.
 */
export function formatSpan(from: string, to: string, hours: ClockHours = clockHours): string {
  if (hours === 12 && from.slice(-2) === to.slice(-2) && /[AP]M$/.test(from)) return `${from.slice(0, -3)}–${to}`
  return `${from}–${to}`
}

/** A day and a time, for when something was saved: "Oct 25, 6:14 PM". */
export function formatDayTime(at: Date, timeZone: string, hours: ClockHours = clockHours): string {
  const day = new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(at)
  return `${day}, ${formatClock(at, timeZone, hours)}`
}

/** Whether the venue's clock reads differently from this phone's at that instant. */
export function differsFromDevice(at: Date, timeZone: string): boolean {
  return zoneOffsetMs(at, timeZone) !== zoneOffsetMs(at, deviceTimeZone())
}

/**
 * The time, with the phone's own beside it only when the two clocks differ:
 * "6:14 PM", or "6:14 PM venue time · 3:14 PM yours".
 */
export function venueAndYours(at: Date, timeZone: string, hours: ClockHours = clockHours): string {
  const venue = formatClock(at, timeZone, hours)
  if (!differsFromDevice(at, timeZone)) return venue
  return `${venue} venue time · ${formatClock(at, deviceTimeZone(), hours)} yours`
}

/** The short word after a time where there is no room for both clocks: "" at home, "venue time" away. */
export function zoneWord(at: Date, timeZone: string): string {
  return differsFromDevice(at, timeZone) ? 'venue time' : ''
}

/** "UTC-4", "UTC+9:30". The offset written the way a person reads it. */
export function formatOffset(at: Date, timeZone: string): string {
  const minutes = Math.round(zoneOffsetMs(at, timeZone) / 60000)
  if (Number.isNaN(minutes)) return 'UTC'
  const sign = minutes < 0 ? '-' : '+'
  const whole = Math.abs(minutes)
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  return `UTC${sign}${hours}${rest === 0 ? '' : `:${String(rest).padStart(2, '0')}`}`
}

/**
 * The short zone name at that instant, "EDT" or "AEST". Zones with no abbreviation
 * come back from Intl as "GMT+5:30" and similar, which is the offset again, so
 * those are dropped in favour of formatOffset below.
 */
export function zoneAbbreviation(at: Date, timeZone: string): string | null {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' })
    .formatToParts(at)
  const name = parts.find((part) => part.type === 'timeZoneName')?.value
  if (name === undefined) return null
  return /^(?:GMT|UTC)/.test(name) ? null : name
}

/**
 * The shortest honest name for the zone: "EDT" where there is an abbreviation,
 * "UTC+5:45" where there is not. For places too tight for the full label, such as
 * beside the time on the scrubber.
 */
export function zoneShort(at: Date, timeZone: string): string {
  return zoneAbbreviation(at, timeZone) ?? formatOffset(at, timeZone)
}

/**
 * How the timezone is shown to the user: "EDT, UTC-4", or just "UTC+5:45" where
 * there is no abbreviation. Whether it is daylight time is part of the answer, so
 * this is computed at an instant rather than for the zone in the abstract.
 */
export function zoneLabel(at: Date, timeZone: string): string {
  const abbreviation = zoneAbbreviation(at, timeZone)
  const offset = formatOffset(at, timeZone)
  return abbreviation === null ? offset : `${abbreviation}, ${offset}`
}

/**
 * True when the venue is not in the timezone this device is set to, which is the
 * case worth saying out loud: the clock in the corner of the screen is not the
 * clock these times are in.
 */
export function isAwayFromDevice(timeZone: string): boolean {
  return timeZone !== deviceTimeZone()
}
