/*
 * THE TODAY BRIEFING, AS ARITHMETIC (Batch H, Section 2).
 *
 * Open the app and know in three seconds what is worth shooting today,
 * tonight and this week. Every number here comes from code: the Sky fire
 * verdict (src/core/fireOutlook.ts), suncalc, NOAA's tide extremes, Open-
 * Meteo's sea and wind. Nothing is the model's; the mockup's numbers were
 * samples.
 *
 * THE CALL. Go, Maybe or Skip, from the Sky fire verdict, with an accuracy
 * bar (item 4): no Go without a lit canvas (the colour clock has a glow) AND
 * a nowcast within CONFIRM_WITHIN_MS of the event that does not close the
 * gap. A station sees only straight up, so what it can confirm depends on
 * the lit layer: under lit mid or high cloud, no overcast low deck over you
 * (a low lid under the canvas); when the lit canvas IS the low deck, as on
 * 29 Oct (KORF OVC034 and it fired), no deck under LOW_LID_M (scud or fog
 * under it, as on 11 Oct's OVC008). The satellite look toward the sun
 * (GOES) is not in yet: Batch H's report says so. A
 * forecast that says "likely" a day out is a Maybe until then, said so.
 * Unlikely is Skip, with its reason. No verdict at all is no call: a dash and
 * "the forecast did not say", never a guess.
 *
 * THE 3-STEP SCALES, less to more, left to right: Flat · Some color · Big
 * color; Flat · Fun · Firing; Offshore · Cross · Onshore (how much the wind
 * works against the water); Low · Mid · High; Light wind · Breezy · Too
 * windy. Never "safe", never "clear".
 */
import { getMoonIllumination, getPosition, getTimes } from 'suncalc'
import { windToBeach, type WindToBeach } from './coastFacing.ts'
import { lookWindow, type FireVerdict } from './fireOutlook.ts'
import type { SatRead } from './goesNowcast.ts'
import { layerWords, type DeckTruth } from './layerTruth.ts'
import type { GapRead } from './gapWatch.ts'
import { underLitWindow } from './underLight.ts'
import { LAYER_WORD } from './skyColour.ts'
import { sizeWords } from './surfShoot.ts'
import type { SurfShape } from './surf.ts'
import { curveFromExtremes, levelAt, type TideExtreme } from './tide.ts'

export type Call = 'Go' | 'Maybe' | 'Skip'
export type Kind = 'sunrise' | 'sunset'

export const CONFIRM_WITHIN_MS = 60 * 60_000
/** A station's low deck at this cover or more over you is overcast: the gap is not confirmed. */
export const OVERCAST_PCT = 88
/** Under the lit low deck, a station's deck below this is a lid (about 2,000 ft). */
export const LOW_LID_M = 600
/** Be set up this long before the colour starts. */
export const SET_UP_BEFORE_MS = 10 * 60_000
const MS_TO_KT = 3600 / 1852

export interface CallRead {
  kind: Kind
  event: Date
  /** Null: no verdict, so no call. */
  call: Call | null
  /** One line why, in words. */
  why: string
  /** The nowcast confirmed the gap within the hour (the only way to a Go). */
  confirmed: boolean
  colorFrom: Date | null
  colorTo: Date | null
  setUp: Date | null
  /** The station whose report made the call, when the stations made it (Batch J, Section 6). */
  by?: string | null
  /** The deepest colour, when the reported deck's under-lighting sets it (Batch J, Section 3). */
  peak?: Date | null
  /** "Gap to the WSW: open · Henderson scattered, Roxboro clear", when the gap watch spoke (Batch J). */
  gapLine?: string | null
  /** Models agreeing that it fires, for the week's certainty dots. */
  agree: number
  of: number
}

const firing = (v: FireVerdict) => [...v.perLayer].sort((a, b) => b.agree - a.agree)[0]

/**
 * The call for one sunrise or sunset. `now` decides whether the nowcast can
 * count; `sat` is the satellite's look toward the sun in the nowcast window
 * (src/core/goesNowcast.ts), which overrides the models where infrared can
 * speak: deep cloud all the way to the sun is a Skip; a high or mid canvas
 * the satellite does not see is no Go; and a canvas the satellite sees, with
 * a station clear underneath within the hour, is a Go even when the models
 * had a lid (2 Nov). Low cloud is the stations' alone: infrared does not see
 * it at night.
 */
/** What was measured before the event (Batch J): the deck over you, named by its real height. */
export interface CallObs {
  /** Where the sun is worked out from. */
  venue: { lat: number; lon: number }
  truth?: DeckTruth | null
  /** The gap toward the sun (src/core/gapWatch.ts). */
  gap?: GapRead | null
}

const venueOf = (o: CallObs | null) => o?.venue ?? { lat: 0, lon: 0 }

export function eventCall(v: FireVerdict | null, kind: Kind, event: Date, now: Date, sat: SatRead | null = null, obs: CallObs | null = null): CallRead {
  const base = { kind, event, confirmed: false, colorFrom: null, colorTo: null, setUp: null, agree: 0, of: 0, gapLine: obs?.gap?.state == null ? null : obs.gap.line }
  const near = Math.abs(event.getTime() - now.getTime()) <= CONFIRM_WITHIN_MS
  if (sat !== null && sat.blocked) return { ...base, agree: v?.agree ?? 0, of: v?.of ?? 0, call: 'Skip', why: `${sat.line}.` }
  if (sat !== null && near && sat.canvas && v?.station?.lowClear === true && (v === null || v.word === 'unlikely')) {
    return { ...base, agree: v?.agree ?? 0, of: v?.of ?? 0, confirmed: true, call: 'Go', why: `Nowcast over the models: ${sat.line.replace(/^The /, 'the ')}, and ${v.station.station} reports nothing under 6,500 ft.` }
  }
  /*
   * OBSERVED OVER MODELLED (Batch J, Section 2: 2 Nov sunset). Within the
   * hour, a deck a station reports over you and the gap toward the sun open
   * by the stations along the line (or the satellite) is a Go, whatever the
   * models placed: the models had that deck wrong, the stations did not. A
   * shut gap under a reported deck is a Skip: nothing gets under it.
   */
  const gap = obs?.gap ?? null
  const truth = obs?.truth ?? null
  const w0 = v === null ? null : lookWindow(v)
  const timing0 = { colorFrom: w0?.from ?? null, colorTo: w0?.to ?? null, setUp: w0 === null ? null : new Date(w0.from.getTime() - SET_UP_BEFORE_MS), agree: v?.agree ?? 0, of: v?.of ?? 0 }
  if (near && truth?.measured === true && gap?.state === 'open') {
    /* Section 3: lit from underneath through the gap, so earlier than the colour clock's glow. */
    const u = truth.baseFt === null ? null : underLitWindow(kind, event, truth.baseFt * 0.3048, gap.slotEdgeKm, (t) => getPosition(t, venueOf(obs).lat, venueOf(obs).lon).altitude)
    const timing = u === null ? timing0 : { ...timing0, colorFrom: u.from, colorTo: u.to, peak: u.peak, setUp: new Date(u.from.getTime() - SET_UP_BEFORE_MS) }
    return { ...base, ...timing, by: truth.station, confirmed: true, call: 'Go', why: `Stations see a ${truth.short} over you and the gap toward the sun open.` }
  }
  if (near && truth?.measured === true && gap?.state === 'shut') {
    return { ...base, ...timing0, by: truth.station, call: 'Skip', why: `A ${truth.words} over you, and the gap toward the sun shut: the light cannot get under it.` }
  }
  if (v === null) return { ...base, call: null, why: 'The forecast did not say.' }
  const w = lookWindow(v)
  const top = firing(v)
  const lit = top !== undefined && top.agree > 0 ? `${top.agree} of ${top.of} models see lit ${layerWords(top.layer, obs?.truth ?? null, LAYER_WORD)}` : null
  const timing = { colorFrom: w?.from ?? null, colorTo: w?.to ?? null, setUp: w === null ? null : new Date(w.from.getTime() - SET_UP_BEFORE_MS), agree: v.agree, of: v.of }
  if (v.word === 'unlikely') return { ...base, ...timing, call: 'Skip', why: `${v.line.replace(/^Fire unlikely: /, '').replace(/^./, (c) => c.toUpperCase())}.` }
  const st = v.station
  const gapHolds = st === null ? false : w?.layer === 'low' ? st.lowBaseM === null || st.lowBaseM >= LOW_LID_M : st.lowOverhead < OVERCAST_PCT
  /* A high or mid canvas the satellite does not see over you is not confirmed. */
  const satAgrees = sat === null || w?.layer === 'low' || sat.canvas
  const confirmed = near && w !== null && gapHolds && satAgrees
  if (v.word === 'likely' && confirmed) return { ...base, ...timing, by: v.station?.station ?? null, confirmed, call: 'Go', why: `${lit ?? 'The models see a lit layer'}; ${v.station?.station ?? 'the station'} shows nothing under the light${sat !== null && sat.canvas ? '; the satellite sees the high cloud' : ''}.` }
  if (v.word === 'likely' && !satAgrees) return { ...base, ...timing, call: 'Maybe', why: `Likely by the models, but ${sat?.line.replace(/^The /, 'the ') ?? ''}.` }
  if (v.word === 'likely') return { ...base, ...timing, call: 'Maybe', why: `Likely: ${lit ?? 'the models see a lit layer'}. Final call within the hour, from the stations.` }
  return { ...base, ...timing, call: 'Maybe', why: `Possible: ${lit ?? 'some models see a lit layer'}.` }
}

/** The day's call: the better of its sunrise and sunset still to come (Go over Maybe over Skip), else the first. */
const RANK: Record<Call, number> = { Go: 3, Maybe: 2, Skip: 1 }
export function dayCall(reads: readonly CallRead[]): CallRead | null {
  if (reads.length === 0) return null
  return [...reads].sort((a, b) => (RANK[b.call ?? 'Skip'] ?? 0) - (RANK[a.call ?? 'Skip'] ?? 0) || (b.call === null ? -1 : 0) - (a.call === null ? -1 : 0) || a.event.getTime() - b.event.getTime())[0]
}

/* ------------------------------------------------------------------ light */

export type StepName = 'Clear' | 'Golden' | 'Color' | 'Peak' | 'Glow' | 'Dark'
export interface LightStep {
  name: StepName
  at: Date | null
}
export type ColorTag = 'Flat' | 'Some color' | 'Big color'

/**
 * The six steps of the light round one event, in the order they happen:
 * at sunset Clear (an hour before golden), Golden (sun 6° up), Color (the
 * glow starts, else sunset), Peak (the deepest glow; none when nothing
 * glows), Glow (civil dusk, sun 6° down), Dark (nautical dusk, 12° down);
 * at sunrise the same six backwards in time.
 */
export function lightSteps(kind: Kind, event: Date, lat: number, lon: number, v: FireVerdict | null, under: { from: Date; to: Date; peak: Date } | null = null): LightStep[] {
  const t = getTimes(event, lat, lon)
  const ok = (d: Date | null | undefined) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null)
  /* A reported deck lit from under through the gap (Batch J) times the colour; else the colour clock's glow. */
  const w = under ?? (v === null ? null : lookWindow(v))
  const lead = v?.sky.layers.find((l) => l.fires && l.times?.deepest != null)
  const peak = under?.peak ?? lead?.times?.deepest ?? null
  if (kind === 'sunset') {
    const golden = ok(t.goldenHour)
    return [
      { name: 'Clear', at: golden === null ? null : new Date(golden.getTime() - 3_600_000) },
      { name: 'Golden', at: golden },
      { name: 'Color', at: w?.from ?? ok(t.sunset) },
      { name: 'Peak', at: peak },
      { name: 'Glow', at: ok(t.dusk) },
      { name: 'Dark', at: ok(t.nauticalDusk) },
    ]
  }
  const golden = ok(t.goldenHourEnd)
  return [
    { name: 'Dark', at: ok(t.nauticalDawn) },
    { name: 'Glow', at: ok(t.dawn) },
    { name: 'Peak', at: peak },
    { name: 'Color', at: w?.to ?? ok(t.sunrise) },
    { name: 'Golden', at: golden },
    { name: 'Clear', at: golden === null ? null : new Date(golden.getTime() + 3_600_000) },
  ]
}

export function colorTag(v: FireVerdict | null): ColorTag | null {
  if (v === null) return null
  return v.word === 'likely' ? 'Big color' : v.word === 'possible' ? 'Some color' : 'Flat'
}

/* ------------------------------------------------------------------- surf */

export type SurfTag = 'Flat' | 'Fun' | 'Firing'
export interface SurfBar {
  at: Date
  faceFt: number
  /** Offshore or light wind at that hour (shape 'Clean'): drawn bright. */
  clean: boolean
  /** The wind's shape on the water at that hour (src/core/surf.ts surfShape); null with no wind forecast. */
  shape: SurfShape | null
}

/*
 * THE SURF TAG SCALE, the one place it is decided (Batch M, Section 4: 0-1 ft,
 * ankle to knee, was tagged Fun on 8 Nov).
 *
 *   Flat     faces under SURF_FUN_FT, 1.5 ft: under knee high.
 *   Fun      SURF_FUN_FT to SURF_FIRING_FT (1.5 to 4 ft), clean or light wind.
 *   Firing   SURF_FIRING_FT, 4 ft, and up, and clean.
 *   Messy onshore drops one step: Firing to Fun, Fun to Flat.
 *
 * Clean and messy are surfShape's (src/core/surf.ts), the Surf page's own:
 * Clean is light wind under GLASSY_MPS (5 kt) or offshore; Messy is onshore at
 * MESSY_ONSHORE_MPS (10 kt) or more. Between (Bumpy), or with no wind
 * forecast, the size stands but is never called Firing on a guess.
 */
export const SURF_FUN_FT = 1.5
export const SURF_FIRING_FT = 4

export function surfTag(faceFt: number, shape: SurfShape | null): SurfTag {
  const size = faceFt < SURF_FUN_FT ? 0 : faceFt < SURF_FIRING_FT ? 1 : 2
  const step = shape === 'Messy' ? Math.max(0, size - 1) : shape === 'Clean' ? size : Math.min(size, 1)
  return (['Flat', 'Fun', 'Firing'] as const)[step]
}

/** "2-3 ft, waist to chest, 9 s": the day's faces low to high, in words by the biggest, its period. */
export function surfLine(bars: readonly SurfBar[], periodAtMax: number | null): string | null {
  if (bars.length === 0) return null
  const lo = Math.min(...bars.map((b) => b.faceFt))
  const hi = Math.max(...bars.map((b) => b.faceFt))
  const range = Math.round(lo) === Math.round(hi) ? `${Math.round(hi)} ft` : `${Math.round(lo)}-${Math.round(hi)} ft`
  return `${range}, ${sizeWords(hi)}${periodAtMax === null ? '' : `, ${Math.round(periodAtMax)} s`}`
}

/* ------------------------------------------------------------------- wind */

export interface WindHourIn {
  at: Date
  mps: number | null
  gustMps: number | null
  fromDeg: number | null
  /** At 120 m, about 400 ft, for the drone. */
  highMps: number | null
}
export type WindTag = 'Offshore' | 'Cross' | 'Onshore'
export const WIND_TAG: Record<WindToBeach, WindTag> = { offshore: 'Offshore', cross: 'Cross', onshore: 'Onshore' }

export const kt = (mps: number | null): number | null => (mps === null ? null : mps * MS_TO_KT)

/** Amber at 12 kt, orange at 18 (the week grid); never red. */
export function windLevel(knots: number | null): 'calm' | 'amber' | 'orange' {
  if (knots === null || knots < 12) return 'calm'
  return knots < 18 ? 'amber' : 'orange'
}

export function windTag(fromDeg: number | null, facing: number | null): WindTag | null {
  if (fromDeg === null || facing === null) return null
  return WIND_TAG[windToBeach(fromDeg, facing)]
}

/* ------------------------------------------------------------------- tide */

export type TideLevel = 'Low' | 'Mid' | 'High'
export interface TideDay {
  curve: { at: Date; feet: number }[]
  marks: TideExtreme[]
  /** Now, on Today only. */
  nowFeet: number | null
  rising: boolean | null
  level: TideLevel | null
  /** "Low 5:05": the next low still to come in the day, else the next high. */
  next: TideExtreme | null
}

/** One day's tide, hourly, from the extremes (src/core/tide.ts derives the curve and lands on each one). */
export function tideDay(extremes: readonly TideExtreme[], from: Date, to: Date, now: Date | null): TideDay {
  const sorted = [...extremes].sort((a, b) => a.at.getTime() - b.at.getTime())
  const curve = curveFromExtremes(sorted, 60).filter((s) => s.at >= from && s.at <= to)
  const marks = sorted.filter((e) => e.at >= from && e.at <= to)
  const nowFeet = now === null ? null : levelAt(curveFromExtremes(sorted, 6), now)
  const after = sorted.filter((e) => e.at > (now ?? from))
  const rising = now === null || after.length === 0 ? null : after[0].kind === 'high'
  const feet = marks.map((m) => m.feet)
  const lo = feet.length === 0 ? null : Math.min(...feet)
  const hi = feet.length === 0 ? null : Math.max(...feet)
  const level = nowFeet === null || lo === null || hi === null || hi - lo < 0.1 ? null : nowFeet < lo + (hi - lo) / 3 ? 'Low' : nowFeet > hi - (hi - lo) / 3 ? 'High' : 'Mid'
  const ahead = marks.filter((m) => m.at > (now ?? from))
  return { curve, marks, nowFeet, rising, level, next: ahead.find((m) => m.kind === 'low') ?? ahead[0] ?? null }
}

/* ------------------------------------------------------------------ drone */

export type DroneTag = 'Light wind' | 'Breezy' | 'Too windy'
/** Against the aircraft's own rating: under half is light, under 85% breezy, past that too windy. */
export const DRONE_LIGHT_RATIO = 0.5
export const DRONE_BREEZY_RATIO = 0.85
export function droneTag(highMps: number | null, limitMps: number | null): DroneTag | null {
  if (highMps === null || limitMps === null || limitMps <= 0) return null
  const r = highMps / limitMps
  return r < DRONE_LIGHT_RATIO ? 'Light wind' : r < DRONE_BREEZY_RATIO ? 'Breezy' : 'Too windy'
}

/** Which way to fly for the light: toward the sun's side of the sky at the event, in compass words. */
export function sunSide(event: Date, lat: number, lon: number, compass: (deg: number) => string): string {
  /* suncalc 2 gives degrees from north, clockwise (as the Sky fire page reads it). */
  return compass((getPosition(event, lat, lon).azimuth + 360) % 360)
}

/* ------------------------------------------------------------------- week */

/** 1-3: how sure, from how far apart the models are and how far ahead the day is. */
export function certainty(read: CallRead | null, dayIndex: number): 1 | 2 | 3 {
  if (read === null || read.of === 0) return 1
  const split = Math.abs(read.agree / read.of - 0.5) * 2
  const byModels = split >= 0.6 ? 3 : split >= 0.2 ? 2 : 1
  const cap = dayIndex <= 1 ? 3 : dayIndex <= 3 ? 2 : 1
  return Math.min(byModels, cap) as 1 | 2 | 3
}

export interface MoonDay {
  phase: number
  fraction: number
  full: boolean
}
export function moonOn(noon: Date): MoonDay {
  const m = getMoonIllumination(noon)
  return { phase: m.phase, fraction: m.fraction, full: m.fraction >= 0.97 }
}

/** The best of the week: the best call, then the most models, then the soonest. */
export function bestOfWeek(reads: readonly CallRead[]): CallRead | null {
  const scored = reads.filter((r) => r.call !== null && r.call !== 'Skip')
  if (scored.length === 0) return null
  return [...scored].sort((a, b) => RANK[b.call as Call] - RANK[a.call as Call] || b.agree / Math.max(1, b.of) - a.agree / Math.max(1, a.of) || a.event.getTime() - b.event.getTime())[0]
}
