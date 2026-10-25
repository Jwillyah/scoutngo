/*
 * THE SHOOT DAY IN A CALENDAR, WITH THE TWO ALARMS THAT MATTER.
 *
 *   golden hour starts   the sun comes down through 6 degrees (evening) or
 *                        up through the horizon (morning)
 *   civil twilight ends  the sun is 6 degrees down: night, for 14 CFR 107.
 *                        In the morning the matching moment is civil dawn,
 *                        when night ends.
 *
 * Every time is arithmetic from suncalc's getTimes, the same source as the
 * twilight bands in nightWindow.ts; nothing here is a forecast. Evening or
 * morning is decided by the shoot window: whichever half of the day its
 * middle falls in.
 *
 * THE STROBE. Part 107 asks for anti-collision lighting visible for three
 * statute miles for flight in civil twilight and at night (14 CFR 107.29), so
 * the light is needed FROM SUNSET, not only from the end of twilight. The
 * alarm sits where the brief put it, at the end of civil twilight, and its
 * words say the light should already be on.
 */
import { getTimes } from 'suncalc'
import { foldLine, icsStamp, icsText } from './ics.ts'

export interface ShootIcsInput {
  name: string
  lat: number
  lon: number
  /** The shoot window, as instants. */
  start: Date
  end: Date
  stamp: Date
  /** Stable per plan, so a second download updates rather than duplicates. */
  uid: string
}

export interface ShootMoments {
  half: 'morning' | 'evening'
  goldenStarts: Date | null
  /** Evening: civil twilight ends (dusk). Morning: civil twilight begins (dawn). */
  twilightEdge: Date | null
}

const usable = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())

export function shootMoments(input: Pick<ShootIcsInput, 'lat' | 'lon' | 'start' | 'end'>): ShootMoments {
  const middle = new Date((input.start.getTime() + input.end.getTime()) / 2)
  const t = getTimes(middle, input.lat, input.lon)
  const half = usable(t.solarNoon) && middle.getTime() < t.solarNoon.getTime() ? 'morning' : 'evening'
  if (half === 'evening') {
    return { half, goldenStarts: usable(t.goldenHour) ? t.goldenHour : null, twilightEdge: usable(t.dusk) ? t.dusk : null }
  }
  return { half, goldenStarts: usable(t.sunrise) ? t.sunrise : null, twilightEdge: usable(t.dawn) ? t.dawn : null }
}

const event = (uid: string, stamp: Date, from: Date, to: Date, summary: string, description: string, alarm: string) => [
  'BEGIN:VEVENT',
  `UID:${icsText(uid)}`,
  `DTSTAMP:${icsStamp(stamp)}`,
  `DTSTART:${icsStamp(from)}`,
  `DTEND:${icsStamp(to)}`,
  `SUMMARY:${icsText(summary)}`,
  `DESCRIPTION:${icsText(description)}`,
  'BEGIN:VALARM',
  'TRIGGER:PT0M',
  'ACTION:DISPLAY',
  `DESCRIPTION:${icsText(alarm)}`,
  'END:VALARM',
  'END:VEVENT',
]

const MINUTE = 60_000

export function shootDayIcs(input: ShootIcsInput): string {
  const moments = shootMoments(input)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ScoutNGo//Shoot day//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...event(
      `${input.uid}-window`,
      input.stamp,
      input.start,
      input.end,
      `Shoot: ${input.name}`,
      'The shoot window from ScoutNGo. Sun times are arithmetic for this place and date; the weather is not.',
      `Shoot starts: ${input.name}`,
    ),
  ]
  if (moments.goldenStarts !== null) {
    lines.push(
      ...event(
        `${input.uid}-golden`,
        input.stamp,
        moments.goldenStarts,
        new Date(moments.goldenStarts.getTime() + MINUTE),
        'Golden hour starts',
        moments.half === 'evening' ? 'The sun is 6 degrees up and coming down.' : 'Sunrise: the sun is on the horizon and climbing.',
        'Golden hour starts',
      ),
    )
  }
  if (moments.twilightEdge !== null) {
    lines.push(
      ...event(
        `${input.uid}-twilight`,
        input.stamp,
        moments.twilightEdge,
        new Date(moments.twilightEdge.getTime() + MINUTE),
        moments.half === 'evening' ? 'Civil twilight ends: strobe' : 'Civil twilight begins: strobe',
        moments.half === 'evening'
          ? 'The sun is 6 degrees down: night from here. The anti-collision strobe should already be on, from sunset (14 CFR 107.29).'
          : 'Night ends: civil twilight until sunrise. Keep the anti-collision strobe on until sunrise (14 CFR 107.29).',
        moments.half === 'evening' ? 'Night now. Strobe on.' : 'Civil twilight. Strobe on until sunrise.',
      ),
    )
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
