/*
 * A ONE-OFF CALENDAR ALARM, MADE ON THE PHONE (Batch H, Sections 2 and 4).
 *
 * "Remind me 4:20", "Wake me 5:30", "Remind me Tue", "Add to calendar": an
 * .ics file with one event and one alarm at the time the button says, saved
 * by the phone into its own calendar. No server, no push: the calendar app
 * rings it. The event is the shoot (be set up, the colour); the alarm is the
 * button's time, written as an absolute DATE-TIME so it rings when it says.
 */
import { foldLine, icsStamp, icsText } from './ics.ts'

export interface AlertInput {
  title: string
  /** The event in the calendar: from be-set-up to the end of the colour. */
  from: Date
  to: Date
  /** When the phone rings. */
  alarmAt: Date
  description: string
  uid: string
  stamp: Date
}

export function alertIcs(a: AlertInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScoutNGo//Briefing alert//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${icsText(a.uid)}`,
    `DTSTAMP:${icsStamp(a.stamp)}`,
    `DTSTART:${icsStamp(a.from)}`,
    `DTEND:${icsStamp(a.to)}`,
    `SUMMARY:${icsText(a.title)}`,
    `DESCRIPTION:${icsText(a.description)}`,
    'BEGIN:VALARM',
    `TRIGGER;VALUE=DATE-TIME:${icsStamp(a.alarmAt)}`,
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(a.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

/** Remind: 20 minutes before be-set-up (or 45 before the event with no glow to set up for). */
export const REMIND_BEFORE_MS = 20 * 60_000
export const REMIND_BARE_MS = 45 * 60_000
/** Wake: the final call, an hour before sunrise, when the stations can speak. */
export const WAKE_BEFORE_MS = 60 * 60_000

export function remindAt(event: Date, setUp: Date | null): Date {
  return setUp === null ? new Date(event.getTime() - REMIND_BARE_MS) : new Date(setUp.getTime() - REMIND_BEFORE_MS)
}
export const wakeAt = (sunrise: Date): Date => new Date(sunrise.getTime() - WAKE_BEFORE_MS)
