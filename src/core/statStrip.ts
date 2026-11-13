/*
 * THE MAP'S STAT STRIP (Batch Polish 2, Section 1): one frosted strip of four
 * equal cells over the map, one line each, one type size, in place of the
 * four two-line pills. The words say what each number is, so there is no
 * label line: "Sunrise 6:37a", "6 kt WSW", "High cloud", "Low 1:54a".
 *
 * Every cell reads at the time on the bar, never at "now" unless the bar is
 * at now; the strip says which time when it is not ("at 7:36 AM Wed").
 */
import { durationWords } from './duration.ts'
import type { GoldenNext } from './goldenNext.ts'
import { band } from './sunPath.ts'
import { formatClock, formatShortClock, type ClockHours } from './timezone.ts'

/**
 * THE NEXT USEFUL LIGHT from the time on the bar. Golden light running:
 * "Golden now · 38 m". The sun down: the next sunrise (the morning's golden
 * light starts at the horizon, src/core/sunPath.ts band()), "Sunrise 6:37a".
 * The sun up and golden light to come: "Golden 4:22p". Null when neither
 * comes in the next 36 hours (goldenNext's reach) or nothing is known.
 */
export function lightCell(next: GoldenNext | null, from: Date | null, sunAltitudeDeg: number | null, timeZone: string | null, hours?: ClockHours): string | null {
  if (next === null || from === null || timeZone === null || next.kind === 'none') return null
  if (next.kind === 'now') return `Golden now · ${durationWords(next.minutesLeft)}`
  const at = new Date(from.getTime() + next.minutesUntil * 60_000)
  const down = sunAltitudeDeg !== null && band(sunAltitudeDeg) !== 'day' && band(sunAltitudeDeg) !== 'golden'
  return `${down ? 'Sunrise' : 'Golden'} ${formatShortClock(at, timeZone, hours)}`
}

/*
 * THE SKY IN A WORD, from the forecast's three layers at the bar's time (the
 * station's report is the Sky page's: it is a reading of now, and the strip
 * follows the bar). Which layer matters: high cloud alone lets the sun
 * through and colours it; low and mid cloud take it away.
 */
/* The station's words (Batch NOW, Section 1.3): FEW Few clouds, SCT Partly cloudy, BKN Mostly cloudy, OVC Overcast; the model's layers said the same way. */
export type SkyWord = 'Clear' | 'Few clouds' | 'High cloud' | 'Partly cloudy' | 'Mostly cloudy' | 'Overcast'

export function skyCell(layers: { low: number | null; mid: number | null; high: number | null } | null): SkyWord | null {
  if (layers === null) return null
  const known = (v: number | null): v is number => v !== null && Number.isFinite(v)
  if (!known(layers.low) && !known(layers.mid) && !known(layers.high)) return null
  const low = known(layers.low) ? layers.low : 0
  const mid = known(layers.mid) ? layers.mid : 0
  const high = known(layers.high) ? layers.high : 0
  const under = Math.max(low, mid)
  if (under >= 90) return 'Overcast'
  if (under >= 60) return 'Mostly cloudy'
  if (under >= 30) return 'Partly cloudy'
  if (high >= 30) return 'High cloud'
  if (Math.max(under, high) >= 10) return 'Few clouds'
  return 'Clear'
}

/** The next turn of the tide, and which way the water is going until then: falling to a low, rising to a high. */
export function tideCell(next: { kind: 'high' | 'low'; at: Date } | null, timeZone: string | null, hours?: ClockHours): { text: string; going: 'rising' | 'falling' } | null {
  if (next === null || timeZone === null) return null
  return { text: `${next.kind === 'high' ? 'High' : 'Low'} ${formatShortClock(next.at, timeZone, hours)}`, going: next.kind === 'high' ? 'rising' : 'falling' }
}

/**
 * "at 7:36 AM Wed" when the bar is away from now, null at now. Within a
 * few minutes of now counts as now: the bar is put at now when the map opens
 * and stays there while the clock moves on under it.
 */
export const AT_NOW_MS = 5 * 60_000
export function stripWhen(at: Date | null, now: Date, timeZone: string | null, hours?: ClockHours): string | null {
  if (at === null || timeZone === null || Number.isNaN(at.getTime())) return null
  if (Math.abs(at.getTime() - now.getTime()) <= AT_NOW_MS) return null
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at)
  return `at ${formatClock(at, timeZone, hours)} ${weekday}`
}
