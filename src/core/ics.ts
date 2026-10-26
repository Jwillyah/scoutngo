/*
 * TOMORROW'S PEAK WINDOW, AS A CALENDAR FILE.
 *
 * WHAT IT IS, SAID IN THE EVENT ITSELF: a reminder to LOOK, not a prediction.
 * Nothing in this app can know tomorrow's sky from today. The sun's position
 * is arithmetic and is as certain as anything here gets; whether there is
 * anything to photograph when it gets there is weather, and a calendar entry
 * written a day early cannot carry weather. So the description says so, in the
 * event, where it will be read tomorrow rather than here where it is read now.
 *
 * NO SERVER AND NO SUBSCRIPTION FEED. A subscription would mean a URL that
 * answers with this person's venue and times, which means their location on
 * somebody's server on a schedule. This is a file, generated on the device,
 * handed to the OS once. There is nothing to revoke and nothing to leak.
 */

import { compassWord } from './compassWords.ts'

export interface PeakEventInput {
  /** Start and end of the peak band. */
  from: Date
  to: Date
  /** Where to look, as a bearing. Rendered as a word in the description. */
  bearing: number | null
  /** When the file was made, which becomes DTSTAMP. */
  stamp: Date
  /**
   * A stable identifier for the event.
   *
   * Passed in rather than generated from Math.random so the same window
   * produces the same UID and a second download updates the entry instead of
   * adding a duplicate beside it.
   */
  uid: string
}

/** RFC 5545 wants UTC basic format: 20261016T224400Z. */
export function icsStamp(at: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return (
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` + // clock-audit: data, an iCalendar UTC stamp
    `T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`
  )
}

/**
 * Escape a text value.
 *
 * RFC 5545 reserves backslash, semicolon and comma inside TEXT, and newlines
 * are written as a literal \\n. A venue name with a comma in it broke the
 * DESCRIPTION line into a second parameter without this.
 */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Fold a line to 75 octets, as the spec requires.
 *
 * Not cosmetic: a long DESCRIPTION on one line is rejected or truncated by
 * strict parsers, and the honesty sentence is the longest line in the file,
 * so the one line that must survive is the one most likely to be cut.
 *
 * Counted in UTF-8 BYTES rather than characters, and a multi-byte character is
 * never split across the fold.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  if (encoder.encode(line).length <= 75) return line

  const out: string[] = []
  let current = ''
  let bytes = 0
  /* First line allows 75 octets; continuations start with a space, so 74. */
  let limit = 75
  for (const char of line) {
    const size = encoder.encode(char).length
    if (bytes + size > limit) {
      out.push(current)
      current = ''
      bytes = 0
      limit = 74
    }
    current += char
    bytes += size
  }
  if (current !== '') out.push(current)
  return out.join('\r\n ')
}

/**
 * THE HONESTY LINE, as a constant so it cannot be edited out of one call site.
 *
 * It is the DESCRIPTION's first sentence rather than a footnote, because a
 * calendar shows the first line of a description in a notification.
 */
export const ICS_REMINDER_NOTE =
  'A reminder to look, not a prediction. The sun times are arithmetic; ' +
  'tomorrow’s sky is not, and nothing in ScoutNGo knows it from today.'

/**
 * One VEVENT, as a complete .ics file.
 *
 * CRLF line endings throughout, which the spec requires and which some
 * calendar clients enforce.
 */
export function peakEventIcs(input: PeakEventInput): string {
  const look =
    input.bearing === null
      ? 'Look toward the sun.'
      : `Look ${compassWord(input.bearing)}.`

  const description = `${ICS_REMINDER_NOTE} ${look}`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScoutNGo//Peak window reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsText(input.uid)}`,
    `DTSTAMP:${icsStamp(input.stamp)}`,
    `DTSTART:${icsStamp(input.from)}`,
    `DTEND:${icsStamp(input.to)}`,
    `SUMMARY:${icsText('Peak light — look up')}`,
    `DESCRIPTION:${icsText(description)}`,
    /*
     * Fifteen minutes, which is long enough to get outside and short enough
     * that it is still about this window. The peak band is about eleven
     * minutes long, so an alarm at the start of it is an alarm during it.
     */
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText('Peak light soon')}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/** A filename that sorts and says what it is. */
export function icsFilename(from: Date): string {
  return `scoutngo-peak-${from.toISOString().slice(0, 10)}.ics`
}

/* ------------------------------------------------------- a sky event window */

/**
 * The constraints that produced a window, as the .ics description.
 *
 * THE CONSTRAINTS GO IN THE FILE, not just the times. A calendar entry that
 * says 03:31 to 06:00 and nothing else is a number with no provenance three
 * weeks later, and the first question standing in a field at 03:20 is "why
 * does this start now" -- which is answerable only if the answer travelled
 * with the event.
 */
export interface SkyEventIcsInput {
  /** The computed window. */
  from: Date
  to: Date
  /** What the night is for. Becomes the SUMMARY. */
  title: string
  /** One line per constraint, already formatted in venue local time. */
  constraintLines: readonly string[]
  /** Which horizon produced it, stated rather than implied. */
  horizonSource: 'terrain' | 'flat'
  /** The NPF and starting exposure lines, when the kit produced any. */
  kitLines: readonly string[]
  stamp: Date
  uid: string
}

/**
 * A sky event as a complete .ics file.
 *
 * IT REUSES ICS_REMINDER_NOTE, deliberately. A meteor window is arithmetic in
 * exactly the way a peak light band is arithmetic, and the sky over it is
 * unknown in exactly the same way. The same sentence is the honest one, and
 * having one constant means it cannot be softened in one place and not the
 * other.
 */
export function skyEventIcs(input: SkyEventIcsInput): string {
  const horizon =
    input.horizonSource === 'terrain'
      ? 'Times use the terrain horizon from the elevation data.'
      : 'Times use a flat horizon: no elevation data was available for this venue.'

  const description = [
    ICS_REMINDER_NOTE,
    horizon,
    ...input.constraintLines,
    ...input.kitLines,
  ].join(' \\n')

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScoutNGo//Sky event window//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsText(input.uid)}`,
    `DTSTAMP:${icsStamp(input.stamp)}`,
    `DTSTART:${icsStamp(input.from)}`,
    `DTEND:${icsStamp(input.to)}`,
    `SUMMARY:${icsText(input.title)}`,
    `DESCRIPTION:${icsText(description)}`,
    /*
     * Forty minutes, not fifteen. A sky window is somewhere dark, which means
     * a drive and a walk, and the alarm has to fire while there is still time
     * to do both. The peak-light alarm is fifteen because that one is about
     * stepping outside.
     */
    'BEGIN:VALARM',
    'TRIGGER:-PT40M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(`${input.title} window opens soon`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/** A filename that sorts and says which night it is. */
export function skyEventIcsFilename(title: string, from: Date): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `scoutngo-${slug}-${from.toISOString().slice(0, 10)}.ics`
}
