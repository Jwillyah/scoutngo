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
    `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}` +
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
