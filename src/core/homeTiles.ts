/*
 * THE HOME'S TILES AND ITS ONE MOMENT (Batch SIMPLE-2, Section 2; boards
 * Home_P_Surf, Home_P_Shoot, Home_P_Fish). Pure: no fetching, no clock of
 * its own, no model. Every window here is one the app already computes
 * (the sky call, the glassy rule, the calm-water run, the surf call's first
 * Fun hour, the moon's moments); this only says which tiles in which order,
 * and which of those windows, if any, is worth the gold card at the top.
 *
 *   Surf          Surf · Tide · Wind · Sky · Fish · Drone
 *   Shoot         Sky · Drone · Wind · Tide · Surf · Fish
 *   Fish          Fish · Tide · Wind · Water · Sky · Surf   (Water, not Drone)
 *   Drone         the Surf order with Drone second
 *   Just weather  the Shoot order
 *   not asked     the Surf order
 */
import type { Activity } from './homeDay.ts'
import { isGlassy, windToBeach } from './coastFacing.ts'
import { compassPoint } from './field.ts'
import { formatClock } from './timezone.ts'
import { spanWords } from './homeDay.ts'
import type { BigMoonriseMoment, MoonMoment } from './moonNights.ts'
import { EVENT_LINGER_MS } from './skyCall.ts'

export type Persona = Activity
export type TileKind = 'surf' | 'tide' | 'wind' | 'sky' | 'fish' | 'drone' | 'water'

const SURF_ORDER: readonly TileKind[] = ['surf', 'tide', 'wind', 'sky', 'fish', 'drone']
const SHOOT_ORDER: readonly TileKind[] = ['sky', 'drone', 'wind', 'tide', 'surf', 'fish']
const FISH_ORDER: readonly TileKind[] = ['fish', 'tide', 'wind', 'water', 'sky', 'surf']

/** The six tiles, in the persona's order. */
export function tileOrder(p: Persona | null): TileKind[] {
  if (p === 'shoot' || p === 'weather') return [...SHOOT_ORDER]
  if (p === 'fish') return [...FISH_ORDER]
  if (p === 'drone') {
    const rest = SURF_ORDER.filter((k) => k !== 'surf' && k !== 'drone')
    return ['surf', 'drone', ...rest]
  }
  return [...SURF_ORDER]
}

/* ------------------------------------------------------------ moments */

export type MomentKind = 'sky' | 'glassy' | 'fish' | 'swell' | 'moonrise' | 'rain' | 'fog'

/** Which page the gold card opens. */
/** 'sky-night': the Sky page opened on its Night tab (the moonrise moment, Batch SIMPLE-2). */
/** 'weather': the Weather page (rain and fog, Batch SIMPLE-3, Sections 1 and 1b). */
export type MomentTarget = 'sky' | 'sky-night' | 'surf' | 'fish' | 'weather'

export interface Moment {
  kind: MomentKind
  /** When it starts (or the event). */
  at: Date
  /** The small gold line ("Glassy · 6–8 AM"). */
  eyebrow: string
  /** The one line under it. */
  line: string
  target: MomentTarget
  /** Shown whatever the persona's rank (a Supermoon, src/core/moonMoment.ts). */
  always?: boolean
  /** Batch SIMPLE-3, Section 0.6: when its window ends; from then the card is gone (pickMoment with a clock). Absent: it stands until the builder drops it. */
  until?: Date
}

/** How far ahead each moment counts (Batch SIMPLE-2, Section 2.3). */
export const MOMENT_AHEAD_MS: Record<MomentKind, number> = {
  sky: 3 * 3_600_000,
  glassy: 12 * 3_600_000,
  fish: 2 * 3_600_000,
  swell: 24 * 3_600_000,
  /* "today": the builder checks the local date. */
  moonrise: 24 * 3_600_000,
  /* Batch SIMPLE-3, Section 1b: "Rain in 20 min", within the hour. */
  rain: 3_600_000,
  /* Batch SIMPLE-3, Section 1.2: fog now, or a likely window starting within 3 h. */
  fog: 3 * 3_600_000,
}

/** Which moment wins, per persona; the first that exists is the card. */
/*
 * Batch SIMPLE-3: rain coming ("Rain in 20 min") ranks for Surf, Shoot and
 * Drone only (Section 1b.2) and straight after the persona's own first
 * moment; fog for everyone, after rain. A Supermoon outranks all (`always`).
 */
export const MOMENT_RANK: Record<Persona, readonly MomentKind[]> = {
  surf: ['glassy', 'rain', 'fog', 'swell', 'sky', 'fish', 'moonrise'],
  shoot: ['sky', 'rain', 'fog', 'moonrise', 'glassy', 'swell', 'fish'],
  weather: ['sky', 'fog', 'moonrise', 'glassy', 'swell', 'fish'],
  fish: ['fish', 'fog', 'glassy', 'moonrise', 'sky', 'swell'],
  drone: ['sky', 'rain', 'fog', 'glassy', 'moonrise', 'swell', 'fish'],
}

/** The one moment for the top, or null: nothing worth it, and the top stays empty. */
export function pickMoment(found: readonly (Moment | null)[], persona: Persona | null, now: Date | null = null): Moment | null {
  const rank = MOMENT_RANK[persona ?? 'surf']
  /* Batch SIMPLE-3, Section 0.6: a card whose window has ended is gone, whatever kept it. */
  const have = found.filter((m): m is Moment => m !== null && (now === null || m.until === undefined || m.until.getTime() > now.getTime()))
  const always = have.filter((m) => m.always === true).sort((a, b) => a.at.getTime() - b.at.getTime())[0]
  if (always !== undefined) return always
  for (const k of rank) {
    const m = have.filter((x) => x.kind === k).sort((a, b) => a.at.getTime() - b.at.getTime())[0]
    if (m !== undefined) return m
  }
  return null
}

const clock = (d: Date, timeZone: string) => formatClock(d, timeZone).replace(/:00 /, ' ')
/** "1 h 10 m", "25 m"; under a minute "now" (Batch SIMPLE-3, Section 0.6: never "0 m"). */
export function leadWords(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 1) return 'now'
  if (m < 60) return `${m} m`
  return m % 60 === 0 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 60)} h ${m % 60} m`
}

/**
 * SKY: a Likely call (the one sky call's Go) for an event within 3 h, or
 * its colour on now. From src/core/skyCall.ts, never a second opinion.
 */
export function skyMoment(c: { kind: 'sunrise' | 'sunset'; event: Date; call: 'Go' | 'Maybe' | 'Skip' | null; from: Date | null; to?: Date | null; lookDeg: number } | null, now: Date, timeZone: string): Moment | null {
  if (c === null || c.call !== 'Go') return null
  const start = c.from ?? c.event
  const lead = c.event.getTime() - now.getTime()
  if (lead > MOMENT_AHEAD_MS.sky) return null
  /* Batch SIMPLE-3, Section 0.6: the card ends with the colour (src/core/skyCall.ts colourOver: its window's end, or 20 min after the event). */
  const until = new Date(Math.max(c.event.getTime() + EVENT_LINGER_MS, c.to?.getTime() ?? 0))
  if (now.getTime() >= until.getTime()) return null
  /* Inside the window, past the event, or under a minute to it: on now, never "Coming up · 0 m". */
  const on = now.getTime() >= start.getTime() || lead < 60_000
  const name = c.kind === 'sunset' ? 'Sunset' : 'Sunrise'
  return {
    kind: 'sky',
    at: c.event,
    eyebrow: on ? 'Color on now' : `Coming up · ${leadWords(lead)}`,
    line: `${name} color likely ${clock(c.event, timeZone)} · look ${compassPoint(c.lookDeg)}`,
    target: 'sky',
    until,
  }
}

/**
 * CLEAN (Batch SIMPLE-3, Section 0.3): the one surf window (src/lib/surfTapIn.ts
 * surfWindow: the next clean daylight stretch with surf, from the one series)
 * when it starts within 12 h, said in the Surf page's own word and its own
 * times, with the call's size for its first hour. Replaces the glassy rule
 * over the briefing's wind on the home (23 Nov 11:07 AM: "1–3 ft until 5 PM"
 * on the card, "clean 10a–11p" on the chart, "11a–11p" on the Best row).
 */
export function cleanMoment(w: { from: Date; to: Date; words: string; size: string | null } | null, now: Date, timeZone: string): Moment | null {
  if (w === null || w.to.getTime() <= now.getTime()) return null
  if (w.from.getTime() - now.getTime() > MOMENT_AHEAD_MS.glassy) return null
  const on = w.from.getTime() <= now.getTime()
  return {
    kind: 'glassy',
    at: on ? now : w.from,
    eyebrow: on ? `Clean now · until ${clock(w.to, timeZone)}` : `Clean · ${w.words}`,
    line: w.size ?? 'clean water',
    target: 'surf',
    until: w.to,
  }
}

/**
 * GLASSY: the next daylight run of glassy water (src/core/coastFacing.ts
 * isGlassy: under 5 kt, or offshore) starting within 12 h, at a beach (a
 * facing). The wind is the forecast's by the hour.
 */
export function glassyMoment(i: { hours: readonly { at: Date; mps: number | null; fromDeg: number | null }[]; facing: number | null; daylight: (t: Date) => boolean; now: Date; timeZone: string; sizeAt?: (t: Date) => string | null }): Moment | null {
  if (i.facing === null) return null
  const facing = i.facing
  const glassy = (h: { mps: number | null; fromDeg: number | null }) => h.mps !== null && isGlassy(h.mps, h.fromDeg === null ? null : windToBeach(h.fromDeg, facing))
  const ahead = [...i.hours].filter((h) => h.at.getTime() + 1_800_000 > i.now.getTime() && h.at.getTime() <= i.now.getTime() + MOMENT_AHEAD_MS.glassy && i.daylight(h.at)).sort((a, b) => a.at.getTime() - b.at.getTime())
  const first = ahead.findIndex(glassy)
  if (first < 0) return null
  let last = first
  while (last + 1 < ahead.length && glassy(ahead[last + 1]) && ahead[last + 1].at.getTime() - ahead[last].at.getTime() <= 5_400_000) last += 1
  /* The hours are stamped at their half past: the run is from the hour's start to the last hour's end. */
  const from = new Date(Math.max(i.now.getTime(), ahead[first].at.getTime() - 1_800_000))
  const to = new Date(ahead[last].at.getTime() + 1_800_000)
  const on = from.getTime() <= i.now.getTime()
  const size = i.sizeAt?.(from) ?? null
  const w = ahead[first]
  const side = w.fromDeg === null ? null : windToBeach(w.fromDeg, facing)
  const wind = w.mps !== null && w.mps < 2.6 ? 'light wind' : side === 'offshore' ? 'offshore' : 'light wind'
  return {
    kind: 'glassy',
    at: from,
    eyebrow: on ? `Glassy now · until ${clock(to, i.timeZone)}` : `Glassy · ${spanWords(from, to, i.timeZone)}`,
    line: [size, wind].filter((x) => x !== null).join(', '),
    target: 'surf',
  }
}

/**
 * FISH: the old home's calm-water run (wind under 10 kt for 3 h or more,
 * src/components/Home.tsx windowRows) when it starts within 2 h, with the
 * tide's next turn. No bite window is invented: the run is the wind's.
 */
export function fishMoment(run: { from: Date; to: Date } | null, turn: { kind: 'high' | 'low'; at: Date } | null, now: Date, timeZone: string): Moment | null {
  if (run === null) return null
  const lead = run.from.getTime() - now.getTime()
  if (lead < 0 || lead > MOMENT_AHEAD_MS.fish) return null
  return {
    kind: 'fish',
    at: run.from,
    eyebrow: `Calm water · from ${clock(run.from, timeZone)}`,
    line: `${spanWords(run.from, run.to, timeZone)}${turn === null ? '' : ` · ${turn.kind} tide ${clock(turn.at, timeZone)}`}`,
    target: 'fish',
    until: run.to,
  }
}

/**
 * SWELL: the surf call's first Fun-or-better hour still to come within 24 h,
 * when it is not on now (src/core/homeCards.ts firstFun over the one surf
 * series).
 */
export function swellMoment(fun: Date | 'now' | null, words: string | null, now: Date, timeZone: string): Moment | null {
  if (fun === null || fun === 'now') return null
  if (fun.getTime() - now.getTime() > MOMENT_AHEAD_MS.swell) return null
  return {
    kind: 'swell',
    at: fun,
    eyebrow: `Surf picks up · ${clock(fun, timeZone)}`,
    line: words === null ? 'Fun or better from then' : `${words} from then`,
    target: 'surf',
    until: fun,
  }
}

/** MOONRISE: a Big moonrise (src/core/moonNights.ts moonMoments) on today's date. */
export function moonriseMoment(moments: readonly MoonMoment[], today: string, timeZone: string): Moment | null {
  const m = moments.find((x): x is BigMoonriseMoment => x.kind === 'big-moonrise' && x.date === today)
  if (m === undefined) return null
  return {
    kind: 'moonrise',
    at: m.moonrise.at,
    eyebrow: `Big moonrise · ${clock(m.moonrise.at, timeZone)}`,
    line: `${Math.round(m.lit * 100)}% lit · rises ${m.moonrise.compass}`,
    target: 'sky-night',
    /* Batch SIMPLE-3, Section 0.6: over with the rising, as the colour is 20 min after its event. */
    until: new Date(m.moonrise.at.getTime() + EVENT_LINGER_MS),
  }
}

/**
 * RAIN (Batch SIMPLE-3, Section 1b.2): rain due to start within the hour, by
 * the rain nowcast (src/core/rainNow.ts, src/lib/useFogRain.ts). "Rain in 20
 * min" / "Light · from 2:15 PM". Raining now is the weather tile's strip, not
 * a card. Gone once it has started.
 */
export function rainMoment(r: { state: string; startsAt: Date | null; intensity: string | null } | null, now: Date, timeZone: string): Moment | null {
  if (r === null || r.state !== 'starting' || r.startsAt === null) return null
  const lead = r.startsAt.getTime() - now.getTime()
  if (lead <= 0 || lead > MOMENT_AHEAD_MS.rain) return null
  const how = r.intensity === null ? 'Rain' : r.intensity.charAt(0).toUpperCase() + r.intensity.slice(1)
  return {
    kind: 'rain',
    at: r.startsAt,
    eyebrow: `Rain in ${leadWords(lead)}`,
    line: `${how} · from ${clock(r.startsAt, timeZone)}`,
    target: 'weather',
    until: r.startsAt,
  }
}

/**
 * FOG (Batch SIMPLE-3, Section 1.2): high fog now, or a likely window
 * starting within 3 h (src/core/fogRisk.ts fogLine), said in the fog's own
 * phrase. Moderate fog stays a line on the weather tile, not a card.
 */
export function fogMoment(f: { line: string | null; now: { level: string | null }; windows: readonly { from: Date; to: Date; level: string }[] } | null, now: Date): Moment | null {
  if (f === null || f.line === null) return null
  if (f.now.level === 'high') {
    const w = f.windows.find((x) => x.from.getTime() <= now.getTime() + 3_600_000)
    return { kind: 'fog', at: now, eyebrow: 'Fog now', line: f.line, target: 'weather', until: w?.to ?? new Date(now.getTime() + 3_600_000) }
  }
  const next = f.windows.find((x) => x.level === 'high' && x.from.getTime() > now.getTime() && x.from.getTime() - now.getTime() <= MOMENT_AHEAD_MS.fog)
  if (next === undefined) return null
  return { kind: 'fog', at: next.from, eyebrow: `Fog in ${leadWords(next.from.getTime() - now.getTime())}`, line: f.line, target: 'weather', until: next.to }
}
