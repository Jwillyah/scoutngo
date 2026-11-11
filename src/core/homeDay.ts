/*
 * THE NEW HOME'S ARITHMETIC (Batch M, Section 3). Everything the home says
 * in words is worked out here from the forecast the phone already holds:
 * the sky in a word, the rain line, the six steps of the hourly strip, and
 * the best windows across what the user does. Facts, never advice (rule
 * 28): "Rain from 3 PM", never "bring a jacket"; nothing is ever "clear" in
 * the sense of safe, and the sky word for WMO code 0 is "Sunny" by day and
 * "Clear sky" at night only as a description of cloud.
 */
import { getTimes } from 'suncalc'
import { formatClock, formatShortHour } from './timezone.ts'
import { surfOn, surfTag, type SurfShape } from './surf.ts'
import { rangeEnds } from './surfRange.ts'

const HOUR = 3_600_000

/* ------------------------------------------------------------ the sky word */

export type SkyIcon = 'sun' | 'moon' | 'partly' | 'partly-night' | 'cloud' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

/** The forecast's WMO weather code in a word and an icon. Null code: a dash. */
export function conditionOf(code: number | null, day: boolean): { word: string; icon: SkyIcon } | null {
  if (code === null || !Number.isFinite(code)) return null
  if (code === 0) return day ? { word: 'Sunny', icon: 'sun' } : { word: 'No cloud', icon: 'moon' }
  if (code === 1) return day ? { word: 'Mostly sunny', icon: 'partly' } : { word: 'Few clouds', icon: 'partly-night' }
  if (code === 2) return { word: 'Partly cloudy', icon: day ? 'partly' : 'partly-night' }
  if (code === 3) return { word: 'Cloudy', icon: 'cloud' }
  if (code === 45 || code === 48) return { word: 'Fog', icon: 'fog' }
  if (code >= 51 && code <= 57) return { word: 'Drizzle', icon: 'drizzle' }
  if (code === 66 || code === 67) return { word: 'Freezing rain', icon: 'rain' }
  if (code >= 61 && code <= 65) return { word: code === 65 ? 'Heavy rain' : 'Rain', icon: 'rain' }
  if (code >= 71 && code <= 77) return { word: 'Snow', icon: 'snow' }
  if (code >= 80 && code <= 82) return { word: 'Showers', icon: 'rain' }
  if (code === 85 || code === 86) return { word: 'Snow showers', icon: 'snow' }
  if (code >= 95) return { word: 'Thunderstorms', icon: 'storm' }
  return null
}

/* ------------------------------------------------------------ the rain line */

/** An hour wetter than this is rain; less is a trace the models scatter everywhere. */
export const RAIN_MM = 0.2
export const RAIN_AHEAD_H = 6

export interface RainHour {
  at: Date
  mm: number | null
}

/** "No rain next 6 h", "Rain from 3 PM", "Rain now", or null when the forecast does not say. */
export function rainLine(hours: readonly RainHour[], now: Date, timeZone: string): string | null {
  const ahead = hours.filter((h) => h.at.getTime() + HOUR > now.getTime() && h.at.getTime() < now.getTime() + RAIN_AHEAD_H * HOUR)
  if (ahead.length === 0 || ahead.every((h) => h.mm === null)) return null
  const wet = ahead.find((h) => h.mm !== null && h.mm >= RAIN_MM)
  if (wet === undefined) return ahead.some((h) => h.mm === null) ? null : `No rain next ${RAIN_AHEAD_H} h`
  if (wet.at.getTime() <= now.getTime()) return 'Rain now'
  return `Rain from ${hourWord(wet.at, timeZone)}`
}

/* ---------------------------------------------------------- the hourly strip */

export interface StripStep {
  at: Date
  /** 'hour' a forecast hour; 'sunrise' / 'sunset' the event itself, at its minute. */
  kind: 'hour' | 'sunrise' | 'sunset'
  label: string
}

/**
 * Six steps from now, two hours apart, with the day's sunrise or sunset in
 * place of the step nearest it when it falls inside the span: "Now, 11a,
 * 1p, 3p, Sunset 4:59, 7p".
 */
export function stripSteps(now: Date, lat: number, lon: number, timeZone: string, n = 6, stepH = 2): StripStep[] {
  const top = new Date(Math.floor(now.getTime() / HOUR) * HOUR)
  const steps: StripStep[] = Array.from({ length: n }, (_, i) => {
    const at = new Date(top.getTime() + i * stepH * HOUR)
    return { at, kind: 'hour' as const, label: i === 0 ? 'Now' : formatShortHour(at, timeZone) }
  })
  const end = steps[steps.length - 1].at.getTime() + HOUR
  for (const day of [0, 1]) {
    const t = getTimes(new Date(now.getTime() + day * 24 * HOUR), lat, lon)
    for (const kind of ['sunrise', 'sunset'] as const) {
      const e = t[kind]
      if (!(e instanceof Date) || Number.isNaN(e.getTime()) || e.getTime() <= now.getTime() || e.getTime() > end) continue
      let near = 1
      for (let i = 1; i < steps.length; i += 1) if (Math.abs(steps[i].at.getTime() - e.getTime()) < Math.abs(steps[near].at.getTime() - e.getTime())) near = i
      if (steps[near].kind !== 'hour') continue
      steps[near] = { at: e, kind, label: formatClock(e, timeZone).replace(/ [AP]M$/, '') }
    }
  }
  return steps
}

/* ---------------------------------------------------------- the best windows */

export type Activity = 'surf' | 'shoot' | 'drone' | 'fish' | 'weather'
export const ACTIVITIES: readonly Activity[] = ['surf', 'shoot', 'drone', 'fish', 'weather']

export interface SpanHour<T> {
  at: Date
  value: T
}

/** The longest run of consecutive hours passing `ok`, at least `minH` long; its first hour and the hour after its last. */
export function bestRun<T>(hours: readonly SpanHour<T>[], ok: (v: T) => boolean, minH = 2): { from: Date; to: Date; values: T[] } | null {
  const sorted = [...hours].sort((a, b) => a.at.getTime() - b.at.getTime())
  let best: { from: Date; to: Date; values: T[] } | null = null
  let run: SpanHour<T>[] = []
  const close = () => {
    if (run.length >= minH && (best === null || run.length > best.values.length)) best = { from: run[0].at, to: new Date(run[run.length - 1].at.getTime() + HOUR), values: run.map((r) => r.value) }
    run = []
  }
  for (const h of sorted) {
    if (run.length > 0 && h.at.getTime() - run[run.length - 1].at.getTime() > HOUR * 1.5) close()
    if (ok(h.value)) run.push(h)
    else close()
  }
  close()
  return best
}

/** "8–11 AM", "10 AM–1 PM", "4:22–4:59 PM": a span the short way. */
export function spanWords(from: Date, to: Date, timeZone: string): string {
  const a = formatClock(from, timeZone).replace(/:00 /, ' ')
  const b = formatClock(to, timeZone).replace(/:00 /, ' ')
  const [aT, aM] = a.split(' ')
  const [bT, bM] = b.split(' ')
  if (aM !== undefined && aM === bM) return `${aT}–${bT} ${bM}`
  return `${a}–${b}`
}

function hourWord(at: Date, timeZone: string): string {
  return formatClock(at, timeZone).replace(/:00 /, ' ')
}

export interface WindowRow {
  activity: Activity
  /** Bold: "Surf 8–11 AM". */
  head: string
  /** "2 ft, offshore". */
  reason: string
  /** Batch Flow, Section 3: when it starts, for the home's "Next:" line. */
  from?: Date
}

/** Up to three rows, in the order the user's activities were picked; the first that qualify. */
export function bestWindows(picked: readonly Activity[], rows: Partial<Record<Activity, WindowRow | null>>, max = 3): WindowRow[] {
  return picked.flatMap((a) => (rows[a] == null ? [] : [rows[a] as WindowRow])).slice(0, max)
}

/** When nothing qualifies: "Nothing standout today · Tue sunset looks good", or the first half alone. */
export function nothingLine(day: 'today' | 'tomorrow', nextGood: { day: string; what: string } | null): string {
  return `Nothing standout ${day}${nextGood === null ? '' : ` · ${nextGood.day} ${nextGood.what} looks good`}`
}

/*
 * A WEEK DAY'S SURF (Batch QA, Section 0B; field 10 Nov: "Best this week: Wed
 * surf · Fri surf" and "Surf" on every day while the swell faded). Days 1-3
 * say "Surf" only when the day's peak hour is Fun or Firing on the one scale
 * (src/core/surf.ts surfTag), else the day's range; days 4-7 (index 3 and
 * on) never say Fun: the range and the odds, the share of the day's hours the
 * scale calls Fun or better. Facts, never a promise.
 */
export const WEEK_SURE_DAYS = 3
export type SurfOdds = 'good odds' | 'some odds' | 'low odds'
export function weekSurf(bars: readonly { faceFt: number; shape: SurfShape | null }[], dayIndex: number): { on: boolean; words: string | null } {
  if (bars.length === 0) return { on: false, words: null }
  const lo = Math.min(...bars.map((b) => b.faceFt))
  const hi = Math.max(...bars.map((b) => b.faceFt))
  const [a, b] = rangeEnds(lo, hi)
  const range = `${a}–${b} ft`
  const onShare = bars.filter((x) => surfOn(surfTag(x.faceFt, x.shape))).length / bars.length
  if (dayIndex >= WEEK_SURE_DAYS) return { on: false, words: `${range} · ${onShare >= 0.5 ? 'good odds' : onShare > 0 ? 'some odds' : 'low odds'}` }
  const peak = bars.reduce((m, x) => (x.faceFt > m.faceFt ? x : m))
  const on = surfOn(surfTag(peak.faceFt, peak.shape))
  return { on, words: on ? null : range }
}

/** "Best this week: Mon sunset · Thu surf", or null when nothing in the week stands out. */
export function weekHeadline(best: readonly { day: string; what: string }[]): string | null {
  if (best.length === 0) return null
  return `Best this week: ${best.slice(0, 2).map((b) => `${b.day} ${b.what}`).join(' · ')}`
}

/* ------------------------------------------------------------- the cards */

export type CardKind = 'surf' | 'wind' | 'tide' | 'sky' | 'drone' | 'moon'

/**
 * Six on the home (Batch Pages, Section 1; board HomeV9): Surf · Wind · Tide
 * · Sky · Drone · Moon. The tall phone's spare height goes to them, never to
 * gaps. Sky is the old Sunset card: the time, the colour call and one reason.
 */
export const HOME_CARDS = 6

/** The cards in the picker's order: each activity's own first, then the rest; the drone only when picked or in the kit; the first HOME_CARDS shown. */
export function cardList(order: readonly Activity[], drone: boolean, max = HOME_CARDS): CardKind[] {
  const own: Record<Activity, CardKind[]> = { surf: ['surf', 'wind', 'tide'], shoot: ['sky', 'moon'], drone: ['drone', 'wind'], fish: ['wind', 'tide'], weather: ['wind', 'tide'] }
  const list: CardKind[] = []
  for (const a of order) for (const c of own[a]) if (!list.includes(c)) list.push(c)
  for (const c of ['surf', 'wind', 'tide', 'sky', 'drone', 'moon'] as const) if (!list.includes(c)) list.push(c)
  return list.filter((c) => c !== 'drone' || drone).slice(0, max)
}

/** The colour call in words (board HomeV9 / SkyPage): Go is likely, Maybe possible, Skip unlikely; no call, null. */
export function colorWords(call: 'Go' | 'Maybe' | 'Skip' | null): string | null {
  return call === 'Go' ? 'color likely' : call === 'Maybe' ? 'color possible' : call === 'Skip' ? 'color unlikely' : null
}

/** The wind to the beach in words: "cross-shore", never the bare "cross" (Batch Pages, Section 1). */
export function sideWords(tag: 'Offshore' | 'Cross' | 'Onshore'): string {
  return tag === 'Cross' ? 'cross-shore' : tag.toLowerCase()
}

/* ------------------------------------------------------------- the ground */

export type Ground = 'night' | 'storm' | 'fog' | 'rain' | 'golden' | 'cloud' | 'day'
/** Night below this sun height: civil dusk (Batch N A1: by the sun, not the clock). */
export const NIGHT_SUN_DEG = -6
/** Sunrise and sunset colours while the sun is lower than this. */
export const GOLDEN_SUN_DEG = 8

/** The home's background: night by the sun; then storms, fog, rain; then sunrise or sunset; then overcast or a day sky. */
export function groundOf(sunDeg: number, code: number | null, storms: boolean): Ground {
  if (sunDeg < NIGHT_SUN_DEG) return 'night'
  if (storms || (code !== null && code >= 95)) return 'storm'
  if (code === 45 || code === 48) return 'fog'
  if (code !== null && code >= 51) return 'rain'
  if (sunDeg < GOLDEN_SUN_DEG) return 'golden'
  if (code === 3) return 'cloud'
  return 'day'
}

/** Batch Beach, Section 6: the Sky card's strip is in colour only for a possible or likely call (Maybe, Go); grey for Unlikely (Skip) and for none. */
export const skyStripLit = (call: 'Go' | 'Maybe' | 'Skip' | null): boolean => call === 'Go' || call === 'Maybe'
