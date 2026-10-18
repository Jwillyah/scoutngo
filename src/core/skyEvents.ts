/*
 * WHAT IS WORTH DRIVING OUT FOR IN THE NEXT NINETY DAYS, FROM THIS VENUE.
 *
 * Pure arithmetic over the tables in celestial.ts and suncalc. No fetch, no
 * model, no network. Every row here is computed from a date and a coordinate.
 *
 * FOUR KINDS OF ROW, and they are different kinds of claim:
 *
 *   shower          a date from a published table, offered as TWO nights
 *   new moon        the darkest nights of the month, computed
 *   full moon       a moonrise time, computed, which is a shot not an obstacle
 *   milky way       the start and end of the season the core is shootable
 *
 * THE SHOWER ROWS ARE TWO NIGHTS AND THAT IS NOT HEDGING. A shower peaks at a
 * solar longitude, not on a calendar date, and the IMO's own table says its
 * dates are accurate only for the year it was published. The night before a
 * printed peak is frequently as good and sometimes better. One night printed
 * against a shower would claim a precision the source does not have.
 */

import { SHOWERS, type ShowerId } from './celestial.ts'
import type { SkyTarget } from './skyWindow.ts'

export type SkyEventKind = 'shower' | 'new-moon' | 'full-moon' | 'milkyway-season'

export interface SkyEvent {
  /** Stable within a listing, so React keys and .ics uids are not invented. */
  id: string
  kind: SkyEventKind
  name: string
  /** The evening the night belongs to. See skyWindow on why evenings. */
  eveningOf: Date
  /**
   * What to compute a window for, or null for a row that is a note rather
   * than a shoot: the start and end of the Milky Way season, for instance.
   */
  target: SkyTarget | null
  /** One line. What this row IS, never what the night will be like. */
  note: string
}

const DAY_MS = 86_400_000

/** Local midday on a date, which is the safe anchor for "the night of". */
function middayOf(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

/** Midday on the same day as `at`, in local time. */
function middayLike(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate(), 12, 0, 0, 0)
}

/**
 * The shower peaks falling in a span, each as two nights.
 *
 * SEARCHED ACROSS THREE YEARS rather than one, because a ninety day span from
 * late December runs into the next year and the Quadrantids would silently
 * vanish from the list. The previous year is included for the same reason at
 * the other end.
 */
export function showerEventsBetween(from: Date, to: Date): SkyEvent[] {
  const events: SkyEvent[] = []
  const firstYear = from.getFullYear() - 1
  for (let year = firstYear; year <= to.getFullYear() + 1; year += 1) {
    for (const shower of SHOWERS) {
      const peak = middayOf(year, shower.peakMonth, shower.peakDay)
      /*
       * THE NIGHT BEFORE AND THE NIGHT OF. Offered as two separate rows
       * rather than one row with a range, because each is a real night with
       * its own moon, its own window and its own cloud, and a shooter picks
       * one of them.
       */
      for (const [offset, which] of [
        [-DAY_MS, 'the night before the listed peak'],
        [0, 'the listed peak night'],
      ] as const) {
        const eveningOf = new Date(peak.getTime() + offset)
        if (eveningOf < from || eveningOf > to) continue
        events.push({
          id: `shower-${shower.id}-${eveningOf.toISOString().slice(0, 10)}`,
          kind: 'shower',
          name: shower.name,
          eveningOf,
          target: { kind: 'meteors', shower: shower.id as ShowerId },
          note: `${which}, ZHR ${shower.zhr} under a perfect sky`,
        })
      }
    }
  }
  return events
}

/*
 * MOON PHASE BY SAMPLING, NOT BY A SERIES.
 *
 * suncalc gives the illuminated fraction for any instant. A new moon is a
 * local minimum of that fraction and a full moon a local maximum, so sampling
 * every six hours and taking the turning points finds both to within a few
 * hours, which is far finer than "which night is dark" needs.
 *
 * WHY NOT A PHASE FORMULA. Meeus gives one and it is more exact. It would also
 * be a second, independent model of the moon sitting beside the one already in
 * the dependency, free to disagree with it. One source for the moon.
 */
const PHASE_STEP_MS = 6 * 3_600_000

export interface MoonTurningPoint {
  at: Date
  fraction: number
}

export function moonTurningPoints(
  from: Date,
  to: Date,
  illumination: (at: Date) => number,
): { newMoons: MoonTurningPoint[]; fullMoons: MoonTurningPoint[] } {
  const samples: MoonTurningPoint[] = []
  for (let t = from.getTime(); t <= to.getTime(); t += PHASE_STEP_MS) {
    const at = new Date(t)
    samples.push({ at, fraction: illumination(at) })
  }
  const newMoons: MoonTurningPoint[] = []
  const fullMoons: MoonTurningPoint[] = []
  for (let i = 1; i < samples.length - 1; i += 1) {
    const previous = samples[i - 1]
    const current = samples[i]
    const next = samples[i + 1]
    if (previous === undefined || current === undefined || next === undefined) continue
    if (current.fraction < previous.fraction && current.fraction <= next.fraction) {
      newMoons.push(current)
    }
    if (current.fraction > previous.fraction && current.fraction >= next.fraction) {
      fullMoons.push(current)
    }
  }
  return { newMoons, fullMoons }
}

export interface SkyEventsInput {
  from: Date
  days: number
  /** Illuminated fraction of the moon. Injected so core stays testable. */
  illumination: (at: Date) => number
  /** Moonrise for the day containing an instant, or null. */
  moonrise: (at: Date) => Date | null
  /**
   * Whether the Milky Way core is shootable on a given evening. Injected
   * rather than computed here, because it needs the horizon and the dark span
   * and that is skyWindow's job, not this file's.
   */
  milkyWayShootable: (eveningOf: Date) => boolean
}

/**
 * Everything worth a row, in date order.
 *
 * THE LIST IS COMPUTED, NOT CURATED. Nothing here is a judgement about whether
 * a night will be good; the rows say what is happening and the window block
 * says what the constraints are. There is no score and no recommendation.
 */
export function upcomingSkyEvents(input: SkyEventsInput): SkyEvent[] {
  const from = middayLike(input.from)
  const to = new Date(from.getTime() + input.days * DAY_MS)

  const events: SkyEvent[] = showerEventsBetween(from, to)

  const { newMoons, fullMoons } = moonTurningPoints(from, to, input.illumination)

  for (const point of newMoons) {
    const eveningOf = middayLike(point.at)
    events.push({
      id: `new-moon-${eveningOf.toISOString().slice(0, 10)}`,
      kind: 'new-moon',
      name: 'New moon',
      eveningOf,
      /*
       * A new moon is not a target, it is a CONDITION: the darkest sky of the
       * month. The row points at the Milky Way when the core is up, and
       * otherwise carries no target at all rather than inventing one.
       */
      target: input.milkyWayShootable(eveningOf) ? { kind: 'milkyway' } : null,
      note: input.milkyWayShootable(eveningOf)
        ? 'Darkest sky of the month, and the core is up'
        : 'Darkest sky of the month',
    })
  }

  for (const point of fullMoons) {
    const eveningOf = middayLike(point.at)
    const rise = input.moonrise(point.at)
    events.push({
      id: `full-moon-${eveningOf.toISOString().slice(0, 10)}`,
      kind: 'full-moon',
      name: 'Full moon',
      eveningOf,
      target: { kind: 'moon' },
      /*
       * A full moon is a SHOT on this list, not a warning. The useful fact is
       * the moonrise, because a full moon rises near sunset and the few
       * minutes it spends low and large against a ridge is the frame.
       */
      note:
        rise === null
          ? 'Moonrise did not compute for this date'
          : 'Rises near sunset, large and low against the ridge',
    })
  }

  /*
   * THE SEASON EDGES, not every night of it. The core being up is true for
   * months; what is worth a row is the night it STARTS being true at this
   * venue and the night it stops, because those are the two dates a shooter
   * writes down.
   */
  let previous: boolean | null = null
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const eveningOf = new Date(t)
    const shootable = input.milkyWayShootable(eveningOf)
    if (previous !== null && shootable !== previous) {
      events.push({
        id: `milkyway-${shootable ? 'opens' : 'closes'}-${eveningOf.toISOString().slice(0, 10)}`,
        kind: 'milkyway-season',
        name: shootable ? 'Milky Way core season opens' : 'Milky Way core season closes',
        eveningOf,
        target: shootable ? { kind: 'milkyway' } : null,
        note: shootable
          ? 'First night the core clears the horizon in the dark'
          : 'Last night the core clears the horizon in the dark',
      })
    }
    previous = shootable
  }

  return events
    .filter((event) => event.eveningOf >= from && event.eveningOf <= to)
    .sort((a, b) => a.eveningOf.getTime() - b.eveningOf.getTime())
}

/** How many days ahead the list looks. The brief asked for ninety. */
export const SKY_EVENT_DAYS = 90
