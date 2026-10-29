import type { CalendarDay, DayMark } from '../core/calendarMonth.ts'
import { formatWind, type WindUnit } from './units.ts'

/** The day in words: "Sunrise 7:23 · low tide 7:51 · offshore 4 kt · glass likely". */
export function dayWords(d: CalendarDay, clock: (t: Date | null) => string, windUnit: WindUnit): string {
  const parts: string[] = []
  const has = (m: DayMark) => d.marks.includes(m)
  const morning = has('glass-rise') || has('colour-rise') || has('tide-rise') || has('surf')
  const evening = has('glass-set') || has('colour-set') || has('tide-set')
  if (morning || !evening) {
    parts.push(`Sunrise ${clock(d.sunrise)}`)
    if (d.facts.lowNearSunrise !== null) parts.push(`low tide ${clock(d.facts.lowNearSunrise)}`)
    const w = d.facts.windAtSunrise
    if (d.forecast && w !== null) parts.push(`${w.relation === 'offshore' ? 'offshore' : w.relation === 'onshore' ? 'onshore' : 'wind'} ${formatWind(w.speedMps, windUnit)}`)
    if (has('glass-rise')) parts.push('glass likely')
    if (has('colour-rise')) parts.push('colour likely')
    if (has('surf') && d.facts.surfFt !== null) parts.push(`surf ${Math.round(d.facts.surfFt)} ft`)
  }
  if (evening) {
    parts.push(`Sunset ${clock(d.sunset)}`)
    if (d.facts.lowNearSunset !== null) parts.push(`low tide ${clock(d.facts.lowNearSunset)}`)
    if (has('glass-set')) parts.push('glass likely')
    if (has('colour-set')) parts.push('colour likely')
  }
  if (has('moon-by-sun')) parts.push(`moonrise ${clock(d.facts.moonrise)}`)
  if (has('milky')) parts.push('a Milky Way night')
  if (d.facts.meteor !== null) parts.push(`${d.facts.meteor} peak`)
  if (d.moon.named !== null) parts.push(`${d.moon.named} moon${has('supermoon') ? ', a supermoon' : ''}`)
  if (!d.forecast && !d.past) parts.push('no forecast yet')
  return parts.join(' · ')
}
