/*
 * THE NWS MARINE FORECAST'S PERIOD NOW (Batch QA, Section 0B; field 10 Nov
 * 7:03 AM: "NWS marine · Through 7 Am" on screen after it ended). The zone
 * forecast's periods carry a name and the text, no times: a period named
 * "Through 7 AM" or "Until 10 PM" has ended once the spot's clock passes it,
 * and the next one is said. Times read "7 AM", never "7 Am".
 */
import { wallClock } from './timezone.ts'

export interface MarinePeriodIn {
  name?: string
  detailedForecast?: string
}

/** "7 Am", "10:30 pm" -> "7 AM", "10:30 PM". */
export const fixAmPm = (s: string): string => s.replace(/\b(\d{1,2}(?::\d\d)?)\s?([ap])\.?m\.?(?![a-z])/gi, (_, t: string, a: string) => `${t} ${a.toUpperCase()}M`)

/** Minutes past midnight a "Through 7 AM" period ends at, or null for a name with no clock time. */
export function periodEndMinutes(name: string): number | null {
  const m = /^(?:through|until)\s+(\d{1,2})(?::(\d\d))?\s*([ap])\.?m\.?$/i.exec(name.trim())
  if (m === null) return null
  const h = Number(m[1]) % 12 + (m[3].toLowerCase() === 'p' ? 12 : 0)
  return h * 60 + Number(m[2] ?? 0)
}

/** The first period still running at `now` in the spot's time zone, its name and text with AM and PM put right. */
export function livePeriod(periods: readonly MarinePeriodIn[], now: Date, timeZone: string): { period: string; text: string } | null {
  const wall = wallClock(now, timeZone)
  const nowMin = wall === null ? 0 : wall.hour * 60 + wall.minute
  for (const p of periods) {
    if (p.detailedForecast === undefined) continue
    const end = periodEndMinutes(p.name ?? '')
    if (end !== null && nowMin >= end) continue
    return { period: fixAmPm(p.name ?? ''), text: fixAmPm(p.detailedForecast) }
  }
  return null
}
