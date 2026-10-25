/*
 * THE YEAR'S SUN AT ONE PLACE: where it rises and sets at the solstices and
 * equinoxes, and today, as bearings for a compass picture.
 *
 * The four days are FOUND, not looked up: every day of the year is sampled at
 * noon and the solstices are the days the sunrise bearing is furthest north
 * and furthest south, the equinoxes the days it is nearest due east. Sunrise
 * and sunset bearings come from getSunArc, the same as the map's rays, so a
 * line on this picture and a ray on the map agree.
 */
import { getSunArc } from './sun.ts'

export type SeasonDay = 'june-solstice' | 'december-solstice' | 'march-equinox' | 'september-equinox' | 'today'

export interface SeasonLine {
  day: SeasonDay
  date: Date
  sunrise: number | null
  sunset: number | null
}

const DAY = 86_400_000

export function seasonLines(year: number, lat: number, lon: number, today: Date): SeasonLine[] {
  const days: { date: Date; rise: number | null; set: number | null }[] = []
  for (let t = Date.UTC(year, 0, 1, 12); t < Date.UTC(year + 1, 0, 1); t += DAY) {
    const date = new Date(t)
    const arc = getSunArc(date, lat, lon)
    days.push({ date, rise: arc.sunrise?.azimuth ?? null, set: arc.sunset?.azimuth ?? null })
  }
  const withRise = days.filter((d): d is { date: Date; rise: number; set: number | null } => d.rise !== null)
  const line = (day: SeasonDay, d: { date: Date; rise: number | null; set: number | null }): SeasonLine => ({
    day,
    date: d.date,
    sunrise: d.rise,
    sunset: d.set,
  })
  const out: SeasonLine[] = []
  if (withRise.length > 0) {
    /* Furthest north (smallest bearing) in the north's summer; the other way in winter. */
    const north = withRise.reduce((a, b) => (b.rise < a.rise ? b : a))
    const south = withRise.reduce((a, b) => (b.rise > a.rise ? b : a))
    const firstHalf = withRise.filter((d) => d.date.getUTCMonth() < 6)
    const secondHalf = withRise.filter((d) => d.date.getUTCMonth() >= 6)
    const nearestEast = (list: typeof withRise) => list.reduce((a, b) => (Math.abs(b.rise - 90) < Math.abs(a.rise - 90) ? b : a))
    const [june, december] = lat >= 0 ? [north, south] : [south, north]
    out.push(line('june-solstice', june), line('december-solstice', december))
    if (firstHalf.length > 0) out.push(line('march-equinox', nearestEast(firstHalf)))
    if (secondHalf.length > 0) out.push(line('september-equinox', nearestEast(secondHalf)))
  }
  const arc = getSunArc(today, lat, lon)
  out.push({ day: 'today', date: today, sunrise: arc.sunrise?.azimuth ?? null, sunset: arc.sunset?.azimuth ?? null })
  return out
}

export const SEASON_NAME: Record<SeasonDay, string> = {
  'june-solstice': 'June solstice',
  'december-solstice': 'December solstice',
  'march-equinox': 'March equinox',
  'september-equinox': 'September equinox',
  today: 'Today',
}
