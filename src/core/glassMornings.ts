/*
 * GLASS MORNINGS: low tide within LOW_NEAR_SUNRISE_MIN of sunrise, and a
 * glassy wind at sunrise (light, or offshore). Beyond the wind forecast the
 * tide and the sun are still known, so such a morning is marked "tide only"
 * rather than guessed.
 */
import { isGlassy, windToBeach } from './coastFacing.ts'

export const LOW_NEAR_SUNRISE_MIN = 90

export interface MorningInput {
  /** yyyy-mm-dd at the venue. */
  date: string
  sunrise: Date | null
}

export type MorningMark = 'glass' | 'windy' | 'tide-only' | 'none'

export interface Morning {
  date: string
  sunrise: Date | null
  low: Date | null
  /** Low tide minus sunrise, minutes; negative is before sunrise. */
  minutesFromSunrise: number | null
  mark: MorningMark
}

export function glassMornings(
  days: readonly MorningInput[],
  lows: readonly Date[],
  windAt: (at: Date) => { speedMps: number; fromDeg: number } | null,
  facing: number | null,
): Morning[] {
  return days.map((day) => {
    if (day.sunrise === null) return { date: day.date, sunrise: null, low: null, minutesFromSunrise: null, mark: 'none' }
    const s = day.sunrise.getTime()
    let low: Date | null = null
    for (const l of lows) if (Math.abs(l.getTime() - s) <= LOW_NEAR_SUNRISE_MIN * 60_000 && (low === null || Math.abs(l.getTime() - s) < Math.abs(low.getTime() - s))) low = l
    const minutesFromSunrise = low === null ? null : Math.round((low.getTime() - s) / 60_000)
    if (low === null) return { date: day.date, sunrise: day.sunrise, low, minutesFromSunrise, mark: 'none' }
    const wind = windAt(day.sunrise)
    if (wind === null) return { date: day.date, sunrise: day.sunrise, low, minutesFromSunrise, mark: 'tide-only' }
    const glassy = isGlassy(wind.speedMps, facing === null ? null : windToBeach(wind.fromDeg, facing))
    return { date: day.date, sunrise: day.sunrise, low, minutesFromSunrise, mark: glassy ? 'glass' : 'windy' }
  })
}
