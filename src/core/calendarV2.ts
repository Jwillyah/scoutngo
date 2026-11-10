/*
 * CALENDAR v2 (Batch Pages, Section 4; board CalendarV2). Five kinds of mark,
 * each a coloured circle with a white icon, at most two a day, the most
 * important first; the legend's chips are the filters. Every mark is a
 * computed fact for a day inside the forecast (src/core/calendarMonth.ts
 * works out the days); a day past the forecast is faded and carries none.
 *
 *   surf      Fun or bigger at sunrise, at a beach (calendarMonth's own)
 *   sky       a colourful sky at sunrise or sunset: mid or high cloud to
 *             catch the light, little low cloud (src/core/colorChance.ts)
 *   glassy    the wind at sunrise GLASSY_KT or less
 *   tide      a low tide within 90 minutes of sunrise or sunset
 *   moon      the day of a full or new moon
 *
 * The order is the importance: when a day has more than two, the first two
 * show; the day's list under the grid says all of them in words.
 */
import type { CalendarDay } from './calendarMonth.ts'
import { LOW_NEAR_SUNRISE_MIN } from './glassMornings.ts'

export type CalCat = 'surf' | 'sky' | 'glassy' | 'tide' | 'moon'
export const CAT_ORDER: readonly CalCat[] = ['surf', 'sky', 'glassy', 'tide', 'moon']
export const CAT_LABEL: Record<CalCat, string> = { surf: 'Surf', sky: 'Sky color', glassy: 'Glassy', tide: 'Low tide', moon: 'Moon' }
/** Glassy: the wind at sunrise this or less, knots (Batch Pages, Section 4). */
export const GLASSY_KT = 5
/** The most marks a day shows in the grid. */
export const MAX_MARKS = 2

const KT = 1.943844

/** A day's kinds, in order of importance; none past the forecast. */
export function dayCats(d: CalendarDay): CalCat[] {
  if (!d.forecast) return []
  const w = d.facts.windAtSunrise
  const has: Record<CalCat, boolean> = {
    surf: d.marks.includes('surf'),
    sky: d.marks.includes('colour-rise') || d.marks.includes('colour-set'),
    glassy: w !== null && w.speedMps * KT <= GLASSY_KT,
    tide: d.facts.lowNearSunrise !== null || d.facts.lowNearSunset !== null,
    moon: d.moon.named !== null,
  }
  return CAT_ORDER.filter((c) => has[c])
}

/** What the grid shows for a day: its kinds, only the filtered ones when any filter is on, MAX_MARKS at most. */
export function shownCats(d: CalendarDay, filters: ReadonlySet<CalCat>): CalCat[] {
  return dayCats(d)
    .filter((c) => filters.size === 0 || filters.has(c))
    .slice(0, MAX_MARKS)
}

export interface DayLine {
  cat: CalCat | null
  text: string
}

/**
 * The selected day in words, one line a kind, from the same facts:
 * "Glassy at sunrise 6:36 AM (wind 4 kt, offshore)". `clock` words a time,
 * `speed` a wind in the user's unit.
 */
export function dayLines(d: CalendarDay, clock: (t: Date | null) => string, speed: (mps: number) => string): DayLine[] {
  const out: DayLine[] = []
  for (const c of dayCats(d)) {
    if (c === 'surf') out.push({ cat: c, text: `Surf ${d.facts.surfFt === null ? '' : `${Math.round(d.facts.surfFt)} ft `}at sunrise ${clock(d.sunrise)}` })
    if (c === 'sky') {
      const at = d.marks.includes('colour-set') ? 'sunset' : 'sunrise'
      out.push({ cat: c, text: `Color possible at ${at} ${clock(at === 'sunset' ? d.sunset : d.sunrise)}: cloud up high to catch it, little low cloud` })
    }
    if (c === 'glassy') {
      const w = d.facts.windAtSunrise
      out.push({ cat: c, text: `Glassy at sunrise ${clock(d.sunrise)} (wind ${w === null ? '—' : speed(w.speedMps)}${w?.relation == null ? '' : `, ${w.relation === 'cross' ? 'cross-shore' : w.relation}`})` })
    }
    if (c === 'tide') {
      const low = d.facts.lowNearSunrise ?? d.facts.lowNearSunset
      const ref = d.facts.lowNearSunrise !== null ? d.sunrise : d.sunset
      const min = low === null || ref === null ? null : Math.round((low.getTime() - ref.getTime()) / 60_000)
      out.push({ cat: c, text: `Low tide ${clock(low)}${min === null ? '' : `, ${Math.abs(min)} min ${min < 0 ? 'before' : 'after'} ${d.facts.lowNearSunrise !== null ? 'sunrise' : 'sunset'}`}` })
    }
    if (c === 'moon') out.push({ cat: c, text: `${d.moon.named === 'full' ? 'Full' : 'New'} moon${d.marks.includes('supermoon') ? ', a supermoon' : d.moon.named === 'new' ? ' · a dark night' : ''}` })
  }
  /* No grid mark for these; said in the list when the day has them. */
  if (d.marks.includes('milky')) out.push({ cat: null, text: 'One of the best Milky Way nights of the month' })
  if (d.facts.meteor !== null) out.push({ cat: null, text: `${d.facts.meteor} peak` })
  if (out.length === 0) out.push({ cat: null, text: d.forecast ? `Nothing marked · sunrise ${clock(d.sunrise)} · sunset ${clock(d.sunset)}` : d.past ? `Sunrise ${clock(d.sunrise)} · sunset ${clock(d.sunset)}` : `Past the forecast · sunrise ${clock(d.sunrise)} · sunset ${clock(d.sunset)}` })
  return out
}

export { LOW_NEAR_SUNRISE_MIN }
