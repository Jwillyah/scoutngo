/*
 * THE MENU'S FOUR LIVE CARDS (Batch H, Section 3), as arithmetic. Each card's
 * value, its line, its colour and its mini chart come from the briefing's
 * days (src/lib/useBriefing.ts), which come from code: never the model.
 *
 *   Today   Go / Maybe / Skip and its event; "Be set up 4:40 · color 4:50
 *           to 5:20", or on a Skip the next chance in the week
 *   Sky     Fire / Maybe / No for the next sunrise or sunset, "likely 5:04",
 *           "2 of 5 models" or the reason; its colour-clock strip with the
 *           peak marked; a low deck is a grey bar (no rain streaks: the
 *           forecast it reads has no rain in it, so none are drawn)
 *   Water   the day's surf, "fun · offshore · low 5:05", hourly bars, the
 *           hour now white, clean hours bright
 *   Drone   the wind at 400 ft now, against the aircraft's rating: hourly
 *           bars, a dashed line at the limit, bars past it amber or orange
 *
 * Tone, from the call, never the model: good (warm), maybe (blue-grey), bad
 * (slate); a drone too windy is rust. Never red.
 */
import { droneTag, kt, type CallRead } from './briefing.ts'
import type { FireVerdict } from './fireOutlook.ts'
import { lightHex } from './skyColour.ts'

export type Tone = 'good' | 'maybe' | 'bad' | 'rust'

export interface CardDay {
  index: number
  events: { sunrise: Date | null; sunset: Date | null }
  verdicts: { sunrise: FireVerdict | null; sunset: FireVerdict | null }
  reads: { sunrise: CallRead | null; sunset: CallRead | null }
  call: CallRead | null
  surf: { at: Date; faceFt: number; clean: boolean }[]
  surfTag: string | null
  surfClean: boolean
  windTag: string | null
  wind: { at: Date; mps: number | null; highMps: number | null }[]
  tide: { next: { at: Date; kind: 'high' | 'low' } | null; marks: { at: Date; kind: 'high' | 'low' }[] } | null
}

export interface CardRead {
  value: string
  sub: string
  line: string | null
  tone: Tone
}

const KIND = { sunrise: 'sunrise', sunset: 'sunset' } as const
const weekday = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(d)

export function todayCard(days: readonly CardDay[], clock: (d: Date) => string, timeZone: string): CardRead {
  const read = days[0]?.call ?? null
  if (read === null || read.call === null) return { value: '—', sub: read === null ? 'nothing left today' : 'the forecast did not say', line: nextChance(days, timeZone), tone: 'bad' }
  const sub = `${KIND[read.kind]} ${clock(read.event)}`
  if (read.call === 'Skip') return { value: 'Skip', sub, line: nextChance(days, timeZone), tone: 'bad' }
  const line = read.setUp === null || read.colorFrom === null || read.colorTo === null ? null : `Be set up ${clock(read.setUp)} · color ${clock(read.colorFrom)} to ${clock(read.colorTo)}`
  return { value: read.call, sub, line, tone: read.call === 'Go' ? 'good' : 'maybe' }
}

/** "Next chance: Wed sunrise, Maybe", the first Go or Maybe after today. */
export function nextChance(days: readonly CardDay[], timeZone: string): string | null {
  for (const d of days.slice(1)) {
    for (const r of [d.reads.sunrise, d.reads.sunset]) {
      if (r !== null && (r.call === 'Go' || r.call === 'Maybe')) return `Next chance: ${weekday(r.event, timeZone)} ${KIND[r.kind]}, ${r.call}`
    }
  }
  return null
}

export interface SkyCardRead extends CardRead {
  /** The colour clock's strip, one hex per minute (null where unlit), and where its peak sits, 0-1. */
  strip: (string | null)[]
  peak: number | null
  lowDeck: boolean
}

/** The next sunrise or sunset still to come (or in its first half hour), today or tomorrow. */
export function nextEvent(days: readonly CardDay[], now: Date): { day: CardDay; kind: 'sunrise' | 'sunset'; at: Date } | null {
  const all = days.slice(0, 2).flatMap((d) => (['sunrise', 'sunset'] as const).map((kind) => ({ day: d, kind, at: d.events[kind] }))).filter((e): e is { day: CardDay; kind: 'sunrise' | 'sunset'; at: Date } => e.at !== null && e.at.getTime() > now.getTime() - 30 * 60_000)
  return all.sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null
}

export function skyCard(days: readonly CardDay[], now: Date, clock: (d: Date) => string): SkyCardRead {
  const next = nextEvent(days, now)
  const v = next === null ? null : next.day.verdicts[next.kind]
  if (next === null || v === null) return { value: '—', sub: 'the forecast did not say', line: null, tone: 'bad', strip: [], peak: null, lowDeck: false }
  const lead = v.sky.layers.find((l) => l.fires) ?? v.sky.layers.find((l) => l.canvas) ?? null
  const minutes = lead?.strip?.minutes ?? []
  const strip = minutes.map((m) => (m.light === null || (m.open ?? 1) < 0.3 ? null : lightHex(m.light)))
  const deepest = lead?.times?.deepest ?? null
  const peak = deepest === null || minutes.length < 2 ? null : (deepest.getTime() - minutes[0].at.getTime()) / (minutes[minutes.length - 1].at.getTime() - minutes[0].at.getTime())
  const lowDeck = v.word === 'unlikely' && v.why === 'lid'
  if (v.word === 'likely') return { value: 'Fire', sub: `likely ${clock(deepest ?? next.at)}`, line: `${KIND[next.kind]} ${clock(next.at)}`, tone: 'good', strip, peak, lowDeck }
  if (v.word === 'possible') return { value: 'Maybe', sub: `${v.agree} of ${v.of} models`, line: `${KIND[next.kind]} ${clock(next.at)}`, tone: 'maybe', strip, peak, lowDeck }
  return { value: 'No', sub: lowDeck ? 'low deck' : v.why === 'none' ? 'no clouds to light' : v.why === 'no-gap' ? 'no gap for the light' : 'nothing lit', line: `${KIND[next.kind]} ${clock(next.at)}`, tone: 'bad', strip, peak, lowDeck }
}

/** Sky fire's tab within 3 h of a sunrise or sunset, else Now. */
export function skyTabFor(days: readonly CardDay[], now: Date): 'fire' | 'now' {
  const near = days.slice(0, 2).some((d) => [d.events.sunrise, d.events.sunset].some((e) => e !== null && Math.abs(e.getTime() - now.getTime()) <= 3 * 3_600_000))
  return near ? 'fire' : 'now'
}

export interface WaterCardRead extends CardRead {
  bars: { h: number; now: boolean; clean: boolean }[]
}

export function waterCard(day: CardDay | null, now: Date, clock: (d: Date) => string): WaterCardRead {
  if (day === null || day.surf.length === 0) return { value: '—', sub: 'no sea forecast', line: null, tone: 'bad', bars: [] }
  const fts = day.surf.map((b) => b.faceFt)
  const lo = Math.round(Math.min(...fts))
  const hi = Math.round(Math.max(...fts))
  const value = lo === hi ? `${hi} ft` : `${lo}-${hi} ft`
  const size = day.surfTag === 'Flat' ? 'flat' : day.surfTag === 'Firing' ? 'firing' : hi < 2 ? 'small' : 'fun'
  const wind = day.windTag === 'Offshore' ? 'offshore' : day.windTag === 'Onshore' ? 'onshore' : day.windTag === 'Cross' ? 'cross-shore' : null
  const low = day.tide?.marks.find((m) => m.kind === 'low' && m.at > now) ?? null
  const words = day.windTag === 'Onshore' ? ['messy', wind] : [size, wind]
  const sub = [...words.filter((w): w is string => w !== null), ...(low === null ? [] : [`low ${clock(low.at)}`])].join(' · ')
  const max = Math.max(1, ...fts)
  const bars = day.surf.map((b) => ({ h: b.faceFt / max, now: Math.abs(b.at.getTime() - now.getTime()) < 1_800_000, clean: b.clean }))
  const tone: Tone = day.windTag === 'Onshore' || day.surfTag === 'Flat' ? 'bad' : day.surfClean ? 'good' : 'maybe'
  return { value, sub, line: null, tone, bars }
}

export interface DroneCardRead extends CardRead {
  bars: { h: number; now: boolean; over: 'no' | 'near' | 'over' }[]
  /** Where the limit's dashed line sits, 0-1 of the chart's height; null without a rating. */
  limit: number | null
}

export function droneCard(day: CardDay | null, limitMps: number | null, now: Date, unit: (mps: number) => string): DroneCardRead {
  const hours = day?.wind.filter((w) => w.highMps !== null) ?? []
  if (hours.length === 0) return { value: '—', sub: 'wind at 400 ft not forecast', line: null, tone: 'bad', bars: [], limit: null }
  const nowHour = hours.reduce((a, b) => (Math.abs(b.at.getTime() - now.getTime()) < Math.abs(a.at.getTime() - now.getTime()) ? b : a))
  const tag = droneTag(nowHour.highMps, limitMps)
  const top = Math.max(limitMps ?? 0, ...hours.map((h) => h.highMps ?? 0)) * 1.15
  const bars = hours.map((h) => {
    const r = limitMps === null ? 0 : (h.highMps ?? 0) / limitMps
    return { h: (h.highMps ?? 0) / top, now: h === nowHour, over: (r >= 1 ? 'over' : r >= 0.85 ? 'near' : 'no') as 'no' | 'near' | 'over' }
  })
  const tone: Tone = tag === 'Too windy' ? 'rust' : tag === 'Breezy' ? 'maybe' : 'good'
  return { value: unit(nowHour.highMps ?? 0), sub: tag === null ? 'no rating for this aircraft' : tag.toLowerCase(), line: null, tone, bars, limit: limitMps === null ? null : limitMps / top }
}

export { kt }
