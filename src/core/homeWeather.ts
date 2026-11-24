import { getTimes } from 'suncalc'
import type { SkyIcon } from './homeDay.ts'
import type { RainNow } from './rainNow.ts'
import { formatShortClock, formatShortHour, wallClock } from './timezone.ts'

/*
 * THE HOME'S WEATHER TILE, WORKED OUT (Batch SIMPLE-3, Sections 2.2, 2.5
 * and 1b). Pure: the hours, the clock and the spot in; what the tile draws
 * out. src/components/TileHome.tsx draws it.
 *
 * THE STRIP. The next STRIP_HOURS (48) hours from this one, each a slot of
 * one fixed width (6 on show, the rest a sideways scroll, never squashed:
 * "Now6p7p…" ran together on 23 Nov). The first is "Now"; the first hour of
 * a new day says the day ("Wed") in place of "12a". The sunrise and sunset
 * in the span each get a slot of their own between the hours they fall in,
 * at their own time, the way the Weather page puts them in its hours. Rain
 * is said under the icon only at RAIN_SHOW_PCT (20%) or more: a "10%" on
 * every hour would be noise.
 *
 * THE LINE. One short phrase: the sky in a word, and on a fast-cloud day
 * (src/core/skyWord.ts cloudRange: rows at 20 kt or more swinging 30% or
 * more) "clouds moving fast" after the word for where the range sits, never
 * the "0–100%" the range used to print.
 *
 * THE RAIN STRIP. When it is raining now or rain is due within two hours
 * (src/core/rainNow.ts), the next two hours in 15-minute bars take the
 * line's place, with the rain's own phrase.
 */

export const STRIP_HOURS = 48
export const RAIN_SHOW_PCT = 20
const HOUR = 3_600_000

export interface StripSlot {
  kind: 'hour' | 'sun'
  /** The hour's start, or the sunrise or sunset itself, ms. */
  at: number
  /** The first hour of a day after today's: its weekday is its label. */
  dayBreak: boolean
  icon: SkyIcon | null
  tC: number | null
  /** The chance of rain, %, only when RAIN_SHOW_PCT or more; else null. */
  rainPct: number | null
  sun: 'sunrise' | 'sunset' | null
}

export interface StripIn {
  now: Date
  timeZone: string
  lat: number
  lon: number
  /** The hour's sky, temperature and chance of rain (%), read at `t` (the hour's half past, or now for the first). */
  hour: (t: Date, first: boolean) => { icon: SkyIcon | null; tC: number | null; rainPct: number | null }
  hours?: number
}

const weekday = (at: Date, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(at)

/** The strip's slots: the hours from this one on, the sunrises and sunsets among them in time order. */
export function weatherStrip(i: StripIn): StripSlot[] {
  const n = i.hours ?? STRIP_HOURS
  const start = Math.floor(i.now.getTime() / HOUR) * HOUR
  const end = start + n * HOUR
  const hours: StripSlot[] = Array.from({ length: n }, (_, k) => {
    const at = start + k * HOUR
    const first = k === 0
    const v = i.hour(first ? i.now : new Date(at + HOUR / 2), first)
    const wall = wallClock(new Date(at), i.timeZone)
    return {
      kind: 'hour',
      at,
      dayBreak: !first && wall !== null && wall.hour === 0,
      icon: v.icon,
      tC: v.tC,
      rainPct: v.rainPct !== null && Number.isFinite(v.rainPct) && v.rainPct >= RAIN_SHOW_PCT ? Math.round(v.rainPct) : null,
      sun: null,
    }
  })
  const suns: StripSlot[] = []
  for (let d = -1; d <= Math.ceil(n / 24) + 1; d += 1) {
    const t = getTimes(new Date(start + d * 86_400_000 + 12 * HOUR), i.lat, i.lon)
    for (const [kind, e] of [['sunrise', t.sunrise], ['sunset', t.sunset]] as const) {
      if (!(e instanceof Date) || Number.isNaN(e.getTime())) continue
      const ms = e.getTime()
      if (ms <= i.now.getTime() || ms >= end || suns.some((s) => Math.abs(s.at - ms) < HOUR)) continue
      suns.push({ kind: 'sun', at: ms, dayBreak: false, icon: null, tC: null, rainPct: null, sun: kind })
    }
  }
  return [...hours, ...suns].sort((a, b) => a.at - b.at || (a.kind === 'hour' ? -1 : 1))
}

/** What a slot says on top: "Now" for the first shown, the weekday at a day break, the hour ("5p"), or a sunrise or sunset's own time ("4:49p"). */
export function slotLabel(s: StripSlot, first: boolean, timeZone: string): string {
  if (s.kind === 'sun') return formatShortClock(new Date(s.at), timeZone)
  if (first) return 'Now'
  if (s.dayBreak) return weekday(new Date(s.at), timeZone)
  return formatShortHour(new Date(s.at), timeZone)
}

/** The slots still to show at `now`: a kept strip's passed hours dropped, so the first is this hour. */
export function stripFrom(slots: readonly StripSlot[], now: Date): StripSlot[] {
  const start = Math.floor(now.getTime() / HOUR) * HOUR
  return slots.filter((s) => (s.kind === 'hour' ? s.at >= start : s.at > now.getTime()))
}

/* ------------------------------------------------------------- the line */

/** "Partly cloudy · clouds moving fast" on a fast-cloud day; else the sky's one word. Null when neither is known. */
export function skyPhrase(word: string | null, fast: { lo: number; hi: number } | null): string | null {
  if (fast === null) return word
  const mid = (fast.lo + fast.hi) / 2
  const where = mid < 25 ? 'Mostly clear' : mid > 75 ? 'Mostly cloudy' : 'Partly cloudy'
  return `${where} · clouds moving fast`
}

/* ------------------------------------------------------------- the rain strip */

/** The 2-hour rain strip replaces the line when it is raining now or rain is due within two hours. */
export function rainStripShown(r: RainNow | null, now: Date): boolean {
  if (r === null) return false
  if (r.state === 'raining') return true
  if (r.state === 'starting' && r.startsAt !== null && r.startsAt.getTime() - now.getTime() <= 2 * HOUR) return true
  return r.bars.some((b) => b.mm !== null && b.mm > 0)
}

/* ------------------------------------------------------------- the sky tile's cloud band */

/** The cover in a word for the Sky tile's band: "overcast", "cloudy", "some cloud", "little cloud". */
export function coverWord(pct: number): string {
  return pct >= 88 ? 'overcast' : pct >= 60 ? 'cloudy' : pct >= 25 ? 'some cloud' : 'little cloud'
}

/**
 * The Sky tile's band (Home_Visual): the cloud now and, by the event, the
 * first hour it changes: "overcast now · clears 4p" (60% or more now, an
 * hour under 40% later), "little cloud now · clouds 4p" (under 40% now, an
 * hour at 70% or more later). `later` are the hours from now to the event.
 * Null without the cover now.
 */
export function cloudBandWords(nowPct: number | null, later: readonly { at: Date; pct: number | null }[], timeZone: string): string | null {
  if (nowPct === null || !Number.isFinite(nowPct)) return null
  const head = `${coverWord(nowPct)} now`
  const turn = nowPct >= 60 ? later.find((h) => h.pct !== null && h.pct < 40) : nowPct < 40 ? later.find((h) => h.pct !== null && h.pct >= 70) : undefined
  if (turn === undefined) return head
  return `${head} · ${nowPct >= 60 ? 'clears' : 'clouds'} ${formatShortHour(turn.at, timeZone)}`
}
