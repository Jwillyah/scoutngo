/*
 * THE MOONRISE NIGHT AS A CALENDAR FILE, built on the phone and handed over.
 *
 * Two alarms, as asked: at the start of golden hour, to be set up, and ten
 * minutes before moonrise, to be on the first frame. The times in the text
 * go through formatClock like every other time; the event times themselves
 * are UTC stamps, which every calendar converts to its own clock.
 */
import { foldLine, icsStamp, icsText } from './ics.ts'
import type { MoonrisePlan } from './moonrisePlan.ts'
import { formatClock } from './timezone.ts'

export const MOONRISE_ALARM_MINUTES = 10
const MINUTE = 60_000

const event = (uid: string, stamp: Date, at: Date, minutes: number, summary: string, description: string, trigger: string) => [
  'BEGIN:VEVENT',
  `UID:${icsText(uid)}`,
  `DTSTAMP:${icsStamp(stamp)}`,
  `DTSTART:${icsStamp(at)}`,
  `DTEND:${icsStamp(new Date(at.getTime() + minutes * MINUTE))}`,
  `SUMMARY:${icsText(summary)}`,
  `DESCRIPTION:${icsText(description)}`,
  'BEGIN:VALARM',
  `TRIGGER:${trigger}`,
  'ACTION:DISPLAY',
  `DESCRIPTION:${icsText(summary)}`,
  'END:VALARM',
  'END:VEVENT',
]

export function moonriseIcs(plan: MoonrisePlan, shotList: string, stamp: Date = new Date()): string {
  const clock = (d: Date) => formatClock(d, plan.timeZone)
  const uid = `scoutngo-moonrise-${plan.date}`
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ScoutNGo//Moonrise//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  if (plan.goldenHour !== null) {
    lines.push(
      ...event(`${uid}-golden`, stamp, plan.goldenHour, 1, 'Golden hour starts: set up for the moonrise', `Moonrise ${clock(plan.moonrise)}. Sunset ${clock(plan.sunset)}.`, 'PT0M'),
    )
  }
  const end = plan.civilDusk ?? new Date(plan.sunset.getTime() + 30 * MINUTE)
  lines.push(
    ...event(
      `${uid}-rise`,
      stamp,
      plan.moonrise,
      Math.max(1, Math.round((end.getTime() - plan.moonrise.getTime()) / MINUTE)),
      `Moonrise ${clock(plan.moonrise)}`,
      `${shotList}\n\nTimes are arithmetic for this place and date; the haze and the cloud are not.`,
      `-PT${MOONRISE_ALARM_MINUTES}M`,
    ),
  )
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}

export const moonriseIcsFilename = (plan: MoonrisePlan) => `scoutngo-moonrise-${plan.date}.ics`
