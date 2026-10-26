/*
 * THE MOONRISE SHOT LIST IN WORDS. Every number is the plan's
 * (src/core/moonrisePlan.ts); this file only writes it down, in the
 * shooter's clock and units. It is the whole shot list without a key: the
 * model, when there is one, only rewords what is here.
 *
 * NO COORDINATE. A stand point is said as a distance and a compass point from
 * the target, which is what someone walking a beach can use, and which is
 * also what may go to the model: the venue coordinate never leaves the phone.
 */
import { compassWord } from '../core/compassWords.ts'
import { distanceMeters } from '../core/geo.ts'
import { STARTING_EXPOSURE_LABEL, type StartingExposure } from '../core/exposure.ts'
import type { MoonrisePlan, Shot } from '../core/moonrisePlan.ts'
import { formatClock, formatSpan, zonedTimeToUtc } from '../core/timezone.ts'
import { formatRange, type Units } from './units.ts'

export interface ShotWords {
  title: string
  when: string
  lines: string[]
}

const shutter = (seconds: number) => (seconds >= 1 ? `${seconds} s` : `1/${Math.round(1 / seconds)}`)

export function exposureWords(e: StartingExposure | null): string {
  if (e === null) return 'Meter it: the exposure table has no row for this.'
  return `ISO ${e.iso}, f/${e.aperture}, ${shutter(e.seconds)}, ${STARTING_EXPOSURE_LABEL}.`
}

const facing = (bearing: number) => `Facing ${compassWord(bearing)}, ${Math.round(bearing)}°.`

/** "Mon, Oct 26": the night's date on the venue's calendar. */
export function dayWords(plan: MoonrisePlan): string {
  const noon = zonedTimeToUtc(plan.date, '12:00', plan.timeZone)
  return noon === null ? plan.date : new Intl.DateTimeFormat('en-US', { timeZone: plan.timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(noon)
}

export function nightWords(plan: MoonrisePlan): string[] {
  const clock = (d: Date) => formatClock(d, plan.timeZone)
  const lead = Math.round((plan.sunset.getTime() - plan.moonrise.getTime()) / 60_000)
  return [
    `${dayWords(plan)}, ${Math.round(plan.fraction * 100)}% lit.`,
    `Moonrise ${clock(plan.moonrise)}, ${compassWord(plan.riseAzimuth)} at ${Math.round(plan.riseAzimuth)}°, ${
      lead >= 0 ? `${lead} min before sunset` : `${-lead} min after sunset`
    }.`,
    plan.clears === null
      ? 'It does not clear 2° within six hours.'
      : `Clears 2° above the haze at ${clock(plan.clears)}${plan.clearAzimuth === null ? '' : `, ${Math.round(plan.clearAzimuth)}°`}.`,
    `Sunset ${clock(plan.sunset)}.${plan.civilDusk === null ? '' : ` Civil dusk ${clock(plan.civilDusk)}.`}`,
  ]
}

export function shotWords(plan: MoonrisePlan, shot: Shot, units: Units): ShotWords {
  const clock = (d: Date) => formatClock(d, plan.timeZone)
  const span = (a: Date, b: Date) => formatSpan(clock(a), clock(b))
  const lens = (name: string | undefined, focal: number | null) =>
    name === undefined || focal === null ? 'No lens in the bag for this.' : `${name} at ${focal}mm.`
  switch (shot.kind) {
    case 'wide':
      return {
        title: 'Wide opener',
        when: span(shot.from, shot.to),
        lines: [lens(shot.lens?.name, shot.focal), facing(shot.facing), 'The moon low, with the pink band over it after sunset.', exposureWords(shot.exposure)],
      }
    case 'lineup': {
      const lines = [lens(shot.lens?.name, shot.focal), facing(shot.facing)]
      if (shot.stands === null || shot.stands.length === 0) {
        lines.push(shot.reason ?? 'The moon does not reach 2° in time to place this.')
      } else {
        const [first, ...rest] = shot.stands
        lines.push(
          `Stand ${formatRange(first.fromTargetMeters, units.distance)} ${compassWord(first.fromTargetBearing)} of the target at ${clock(first.at)}: the moon sits behind it at ${first.altitude}°.`,
        )
        /* As it climbs: the next stand point, and the walk from the last one, which is the slide. */
        let last = first
        for (const s of rest) {
          lines.push(
            `${clock(s.at)}, ${s.altitude}°: ${formatRange(s.fromTargetMeters, units.distance)} ${compassWord(s.fromTargetBearing)} of it, a ${formatRange(distanceMeters(last.stand, s.stand), units.distance)} walk in.`,
          )
          last = s
        }
      }
      lines.push(exposureWords(shot.exposure))
      return { title: 'Line-up', when: clock(shot.from), lines }
    }
    case 'mid':
      return {
        title: 'Mid',
        when: span(shot.from, shot.to),
        lines: [lens(shot.lens?.name, shot.focal), facing(shot.facing), 'People or surfers in front of the moon.', exposureWords(shot.exposure)],
      }
    case 'drone':
      if (shot.reason !== null) return { title: 'Drone', when: '', lines: [`Not flown: ${shot.reason}`] }
      return {
        title: 'Drone',
        when: span(shot.from, shot.to),
        lines: [
          `${shot.drone ?? 'The drone'} at ${shot.altitudeFeet} ft, under the ceiling.`,
          facing(shot.facing),
          'Anti-collision strobe on from sunset (14 CFR 107.29); night from civil dusk.',
          `ND: ${shot.nd ?? 'none'}. ${shot.ndReason}`,
          'Meter it: the exposure table has no row for the drone camera.',
          "Check today's flight restrictions at tfr.faa.gov.",
        ],
      }
  }
}

/** The plan as the call sheet's moonrise_plan tool gives it: words, and the times by label for repair. */
export function moonriseToolContext(plan: MoonrisePlan, units: Units) {
  const clock = (d: Date) => formatClock(d, plan.timeZone)
  const values: Record<string, string> = { moonrise: clock(plan.moonrise), sunset: clock(plan.sunset) }
  if (plan.clears !== null) values.clears = clock(plan.clears)
  if (plan.civilDusk !== null) values['civil dusk'] = clock(plan.civilDusk)
  return { night: nightWords(plan), shots: plan.shots.map((s) => shotWords(plan, s, units)), values }
}

export const MOONRISE_PROMPT =
  'Moonrise shoot. Write the shot list from the moonrise_plan tool: the night first, then the four shots in its order, each with its time, lens, facing, where to stand and settings exactly as given. Short lines.'

/** The whole list as text, for the card's copy and as the model's source. */
export function shotListText(plan: MoonrisePlan, units: Units): string {
  const shots = plan.shots.map((s, i) => {
    const w = shotWords(plan, s, units)
    return [`${i + 1}. ${w.title}${w.when === '' ? '' : `, ${w.when}`}`, ...w.lines.map((l) => `   ${l}`)].join('\n')
  })
  return [...nightWords(plan), '', ...shots].join('\n')
}
