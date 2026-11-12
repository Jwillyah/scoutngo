/*
 * "REMIND ME 4:30" (Batch BEST SKY, Sections 4-5; boards BestSky_Card,
 * BestSky_Spot): the colour's window at the best spot as a calendar file,
 * made on the phone and handed to it once, as tomorrow's peak window is
 * (src/core/ics.ts). No feed, no server: nothing about you leaves the phone.
 * The event runs from "set up" to the end of the colour; the alarm rings
 * REMIND_BEFORE_MIN before "set up".
 */
import { foldLine, icsStamp, icsText } from './ics.ts'

export const REMIND_BEFORE_MIN = 10

/** First in the description, as the peak window's: a calendar shows its first line. */
export const BEST_SKY_NOTE = 'A reminder to look, not a promise. The sun times are arithmetic; the color is weather.'

export interface BestSkyIcsInput {
  kind: 'sunrise' | 'sunset'
  spotName: string
  /** "Likely", "Possible": the word when the file was made. */
  word: string
  setUp: Date
  colorFrom: Date
  colorTo: Date
  stamp: Date
}

/** When the alarm rings: the label on the button. */
export const remindAt = (setUp: Date): Date => new Date(setUp.getTime() - REMIND_BEFORE_MIN * 60_000)

export function bestSkyIcs(i: BestSkyIcsInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScoutNGo//Best sky reminder//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsText(`bestsky-${i.kind}-${i.colorFrom.toISOString().slice(0, 10)}@scoutngo`)}`,
    `DTSTAMP:${icsStamp(i.stamp)}`,
    `DTSTART:${icsStamp(i.setUp)}`,
    `DTEND:${icsStamp(i.colorTo)}`,
    `SUMMARY:${icsText(`${i.kind === 'sunset' ? 'Sunset' : 'Sunrise'} color · ${i.spotName}`)}`,
    `LOCATION:${icsText(i.spotName)}`,
    `DESCRIPTION:${icsText(`${BEST_SKY_NOTE} ${i.word} at ${i.spotName} when this was made.`)}`,
    'BEGIN:VALARM',
    `TRIGGER:-PT${REMIND_BEFORE_MIN}M`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(`Set up at ${i.spotName}`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export const bestSkyIcsFilename = (i: Pick<BestSkyIcsInput, 'kind' | 'colorFrom'>): string => `scoutngo-${i.kind}-color-${i.colorFrom.toISOString().slice(0, 10)}.ics`
