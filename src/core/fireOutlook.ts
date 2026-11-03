/*
 * SKY FIRE, ONE SOURCE OF TRUTH (Batch G, Section 1, after the second miss:
 * 2 Nov sunrise, high cirrus over a clear low horizon, called "Fire unlikely:
 * a lid of cloud" while the colour clock under it showed the cirrus lit).
 *
 * The verdict and the colour clock are now the same arithmetic. For each
 * model and each layer:
 *
 *   canvas     the layer over you, CANVAS_MIN or more at 0-50 km. Thin high
 *              cirrus is the canvas at any amount up to 100%: it is the thing
 *              that lights, not a lid. (Bug 1: high cloud over 90% was read
 *              as "a lid of cloud".)
 *   the light  the colour clock's strip for that layer (skyColour.ts): the
 *              sun's elevation each minute with refraction and the Earth's
 *              curve, the cloud's own horizon, the air the light came through.
 *   gap        THE REAL RAY (bug 2): from the lit cloud toward the sun, walked
 *              (skyColour.ts rayWalk), and cloud counted only where the ray
 *              is inside that cloud's layer, LAYER_BAND_M. A low deck 200 km
 *              out does not block the light reaching 8 km cirrus once the ray
 *              passes above it. Each layer the ray crosses lets through
 *              (1 - its mean cover there); partial cover is a partial gap.
 *              The low and mid layers count their own deck running on (that
 *              is what makes a lid of them); thin cirrus never counts.
 *   not hidden no thicker deck below it right over you (BLOCKED_AT): you
 *              cannot see cirrus through an overcast at 800 ft.
 *
 * A layer fires for a model when it is a canvas, not hidden, and some minute
 * of its glow gets through at least GAP_PARTIAL. The colour clock is the
 * same thing for the models' mean cover (the "sky" read), so when the clock
 * shows a layer lit and most models do not, the line says that (bug 3).
 * Agreement is said per layer, "4 of 5 see lit cirrus" (bug 4).
 *
 * STATIONS (bug 5). The nearest station's report within STATION_HOURS of the
 * event: a deck below 6,500 ft is the low cover right over you, and its base
 * is the low deck's height. "Clear below 12,000 ft" is the low gap OPEN: the
 * low layer is not counted against the light.
 *
 * Heights are the layers' typical ones (skyFire.ts DECK_HEIGHT_M) unless a
 * station gives the low base: the forecast asked for has cover by layer, not
 * pressure-level cloud, so tops and bases are LAYER_BAND_M.
 */
import { getPosition } from 'suncalc'
import type { LatLon } from './geo.ts'
import { lowestDeck, type MetarSky } from './metar.ts'
import { BLOCKED_AT, CANVAS_MIN, DECK_HEIGHT_M, EARTH_RADIUS_KM, MODEL_LABEL, PATH_KM, type FireModel, type ModelPath } from './skyFire.ts'
import {
  DEEPEST_MIN_BRIGHTNESS,
  GAP_OPEN,
  GAP_PARTIAL,
  geometricFromApparent,
  glows,
  LAYER_WORD,
  rayWalk,
  reachKm,
  strip,
  stripTimes,
  type Layer,
  type Strip,
  type StripTimes,
} from './skyColour.ts'

export const LAYERS: readonly Layer[] = ['high', 'mid', 'low']

/** Where each layer's cloud is, metres: bottom and top. The low layer's bottom is the ground, its base unknown. */
export const LAYER_BAND_M: Record<Layer, readonly [number, number]> = { low: [0, 2000], mid: [2000, 6000], high: [6000, 12000] }

/** A station's report counts within this many hours of the event. */
export const STATION_HOURS = 2

/** Cover a METAR amount stands for, per cent. */
const AMOUNT_COVER = { FEW: 20, SCT: 45, BKN: 75, OVC: 100, VV: 100 } as const

export interface StationReport {
  sky: MetarSky
  at: Date
}

export interface StationRead {
  station: string
  at: Date
  /** Low cloud right over the station, per cent, from its layers under 6,500 ft. */
  lowOverhead: number
  /** The lowest broken or overcast deck under 6,500 ft, metres. */
  lowBaseM: number | null
  /** Nothing under 6,500 ft: the low gap is open. */
  lowClear: boolean
}

/** What a station's report says for the event, or null when it is more than STATION_HOURS away. */
export function stationRead(r: StationReport | null | undefined, event: Date): StationRead | null {
  if (r == null || Math.abs(r.at.getTime() - event.getTime()) > STATION_HOURS * 3_600_000) return null
  const low = r.sky.groups.filter((g) => g.baseFt < 6500)
  const deck = lowestDeck(r.sky)
  return {
    station: r.sky.station,
    at: r.at,
    lowOverhead: low.length === 0 ? 0 : Math.max(...low.map((g) => AMOUNT_COVER[g.amount])),
    lowBaseM: deck === null || deck.baseFt >= 6500 ? null : deck.baseFt * 0.3048,
    lowClear: low.length === 0,
  }
}

export interface FireContext {
  event: Date
  kind: 'sunrise' | 'sunset'
  venue: LatLon
  /** Aerosol optical depth at 550 nm; null is a clean-air 0.1, said as assumed. */
  aod?: number | null
  station?: StationReport | null
  /** Suncalc's apparent altitude, degrees; injected for tests. */
  sunAltitudeDeg?: (t: Date) => number
}

/** Cover of one layer at a distance along the sun's line, straight between samples; null past the last one. */
export function coverAlong(p: ModelPath, layer: Layer, km: number): number | null {
  if (km < 0 || km > PATH_KM[PATH_KM.length - 1]) return null
  for (let i = 0; i < PATH_KM.length - 1; i += 1) {
    if (km > PATH_KM[i + 1]) continue
    const a = p.samples[i]?.[layer] ?? null
    const b = p.samples[i + 1]?.[layer] ?? null
    if (a === null || b === null) return a ?? b
    return a + ((b - a) * (km - PATH_KM[i])) / (PATH_KM[i + 1] - PATH_KM[i])
  }
  return p.samples[PATH_KM.length - 1]?.[layer] ?? null
}

export interface Through {
  /** Share of the light that gets past, 0-1. */
  open: number
  /** The layer that takes the most, with its mean cover where the ray crosses it. */
  worst: { layer: Layer; cover: number; fromKm: number; toKm: number } | null
  /** Some of the ray's way through cloud layers is past the last sample: not asked. */
  pastPath: boolean
}

/**
 * The ray from a cloud at `reach` km toward the sun and heightM up, the sun
 * at `elevationDeg` (geometric, at the cloud): how much of the light the low
 * and mid layers along it let through (the cloud's own deck included).
 */
export function throughCloud(p: ModelPath, reach: number, heightM: number, elevationDeg: number, lowClear = false, band: Record<Layer, readonly [number, number]> = LAYER_BAND_M): Through {
  const walk = rayWalk(elevationDeg, heightM)
  let open = 1
  let worst: Through['worst'] = null
  let pastPath = false
  for (const m of LAYERS) {
    /* Thin cirrus is a canvas, not a wall: it never counts against the light (bug 1's other half). */
    if (m === 'high') continue
    if (m === 'low' && lowClear) continue
    const [lo, hi] = band[m]
    const covers: number[] = []
    let from = Infinity
    let to = -Infinity
    for (const s of walk) {
      if (s.km < 1 || s.z < lo || s.z > hi) continue
      const km = reach + s.km
      const c = coverAlong(p, m, km)
      if (c === null) {
        pastPath = true
        continue
      }
      covers.push(c)
      from = Math.min(from, km)
      to = Math.max(to, km)
    }
    if (covers.length === 0) continue
    const mean = covers.reduce((a, b) => a + b, 0) / covers.length
    open *= 1 - mean / 100
    if (worst === null || mean > worst.cover) worst = { layer: m, cover: mean, fromKm: from, toKm: to }
  }
  return { open, worst, pastPath }
}

export type FireWhy = 'none' | 'lid' | 'no-gap' | 'not-lit'
export const WHY_WORDS: Record<FireWhy, string> = {
  none: 'no clouds to catch the light',
  lid: 'a lid of cloud',
  'no-gap': 'no gap toward the sun',
  'not-lit': 'no cloud lit in this hour',
}

export interface LayerRead {
  layer: Layer
  heightM: number
  /** Over you and toward the sun, 0-50 km, per cent. */
  cover: number | null
  canvas: boolean
  reachKm: number | null
  strip: Strip | null
  times: StripTimes | null
  /** The best share of the light that gets through over the minutes it glows; null without a glow. */
  open: number | null
  gap: 'open' | 'partial' | 'closed' | null
  /** What takes the light at that minute. */
  gapBy: Through['worst']
  pastPath: boolean
  /** The station that said the low gap is open, when one did. */
  openBy: string | null
  /** The layers under it, right over you, per cent (null where the forecast did not say). */
  under: { layer: Layer; cover: number | null }[]
  /** A thicker deck under it, right over you. */
  hiddenBy: { layer: Layer; cover: number } | null
  fires: boolean
  why: FireWhy | null
}

export interface ModelRead {
  model: FireModel | 'sky'
  layers: LayerRead[]
  fires: boolean
}

const mean = (xs: (number | null | undefined)[]): number | null => {
  const v = xs.filter((x): x is number => typeof x === 'number')
  return v.length === 0 ? null : v.reduce((a, b) => a + b, 0) / v.length
}

/** The path with what the station saw right over you put in place of the forecast's low cloud there. */
function withStation(p: ModelPath, st: StationRead | null): ModelPath {
  if (st === null) return p
  return { ...p, samples: p.samples.map((s, i) => (PATH_KM[i] === 0 ? { ...s, low: st.lowOverhead } : s)) }
}

/** One model, every layer: the colour clock's strips and the checks, from one walk of the light. */
export function readModel(raw: ModelPath, ctx: FireContext, model: FireModel | 'sky' = raw.model): ModelRead {
  const st = stationRead(ctx.station, ctx.event)
  const p = withStation(raw, st)
  const alt = ctx.sunAltitudeDeg ?? ((t: Date) => getPosition(t, ctx.venue.lat, ctx.venue.lon).altitude)
  const aod = ctx.aod ?? 0.1
  const band: Record<Layer, readonly [number, number]> = st?.lowBaseM == null ? LAYER_BAND_M : { ...LAYER_BAND_M, low: [0, Math.max(LAYER_BAND_M.low[1], st.lowBaseM + 500)] }
  const layers = LAYERS.map((layer): LayerRead => {
    const heightM = layer === 'low' && st?.lowBaseM != null ? st.lowBaseM : DECK_HEIGHT_M[layer]
    const cover = mean([0, 1, 2].map((i) => p.samples[i]?.[layer]))
    const reach = reachKm(p, layer, heightM)
    const canvas = cover !== null && cover >= CANVAS_MIN && reach !== null
    /* Hidden: a lower layer right over you at BLOCKED_AT or more. */
    const below = LAYERS.slice(LAYERS.indexOf(layer) + 1)
    const under = below.map((m) => ({ layer: m, cover: p.samples[0]?.[m] ?? null }))
    const hider = under.find((x) => x.cover !== null && x.cover >= BLOCKED_AT)
    const hiddenBy = hider === undefined ? null : { layer: hider.layer, cover: hider.cover as number }
    if (!canvas || reach === null) {
      return { layer, heightM, cover, canvas: false, reachKm: reach, strip: null, times: null, open: null, gap: null, gapBy: null, pastPath: false, openBy: null, under, hiddenBy, fires: false, why: 'none' }
    }
    const lowClear = st?.lowClear === true
    const s = strip({ layer, heightM, reachKm: reach }, ctx.event, alt, aod, (e) => throughCloud(p, reach, heightM, e, lowClear, band).open)
    /* The glow, before asking what gets through: its best minute decides the gap. */
    let best: { open: number; e: Date } | null = null
    for (const m of s.minutes) {
      if (!glows(m.light) || m.light === null || m.light.brightness < DEEPEST_MIN_BRIGHTNESS || m.open == null) continue
      if (best === null || m.open > best.open) best = { open: m.open, e: m.at }
    }
    const liftDeg = ((reach / EARTH_RADIUS_KM) * 180) / Math.PI
    const atBest = best === null ? null : throughCloud(p, reach, heightM, geoAt(alt, best.e) + liftDeg, lowClear, band)
    const open = best?.open ?? null
    const gap = open === null ? null : open >= GAP_OPEN ? 'open' : open >= GAP_PARTIAL ? 'partial' : 'closed'
    const times = stripTimes(s)
    const fires = hiddenBy === null && (gap === 'open' || gap === 'partial')
    const why: FireWhy | null = fires
      ? null
      : hiddenBy !== null
        ? 'lid'
        : gap === null
          ? 'not-lit'
          : atBest?.worst?.layer === layer
            ? 'lid'
            : 'no-gap'
    return { layer, heightM, cover, canvas, reachKm: reach, strip: s, times, open, gap, gapBy: atBest?.worst ?? null, pastPath: atBest?.pastPath ?? false, openBy: lowClear && st !== null ? st.station : null, under, hiddenBy, fires, why }
  })
  return { model, layers, fires: layers.some((l) => l.fires) }
}

/* The geometric elevation of the sun at the observer (skyColour.ts convention). */
const geoAt = (alt: (t: Date) => number, t: Date) => geometricFromApparent(alt(t))

/** The five named models' mean cover, sample by sample: the sky the colour clock draws. */
export function meanPath(paths: readonly ModelPath[]): ModelPath | null {
  const named = paths.filter((p) => p.model !== 'best_match')
  const use = named.length > 0 ? named : paths
  if (use.length === 0) return null
  return {
    model: use[0].model,
    samples: PATH_KM.map((_, i) => ({
      low: mean(use.map((p) => p.samples[i]?.low)),
      mid: mean(use.map((p) => p.samples[i]?.mid)),
      high: mean(use.map((p) => p.samples[i]?.high)),
    })),
  }
}

export type FireWord = 'likely' | 'possible' | 'unlikely'

export interface FireVerdict {
  word: FireWord
  /** "Fire possible", or "Fire unlikely: a lid of cloud". */
  line: string
  /** Of the five named models with figures, how many fire. */
  agree: number
  of: number
  /** Per layer, how many of the five see it lit: "4 of 5 see lit high cirrus". */
  perLayer: { layer: Layer; agree: number; of: number }[]
  models: ModelRead[]
  /** The models' mean: what the colour clock draws. */
  sky: ModelRead
  why: FireWhy | null
  station: StationRead | null
}

/** The reason the sky read gives no fire: a lid before a gap before light, and nothing to light last. */
function reason(r: ModelRead): FireWhy {
  const order: FireWhy[] = ['lid', 'no-gap', 'not-lit']
  const whys = r.layers.filter((l) => l.canvas).map((l) => l.why)
  return order.find((w) => whys.includes(w)) ?? 'none'
}

/**
 * The verdict across models: likely when at least 3 in 5 named models fire;
 * possible when 2 do, or best_match does; else unlikely, with the reason.
 * When the colour clock's sky fires and the verdict is unlikely, the reason
 * is that most models do not see it.
 */
export function fireVerdict(paths: readonly ModelPath[], ctx: FireContext): FireVerdict | null {
  const models = paths.map((p) => readModel(p, ctx))
  const named = models.filter((m, i) => m.model !== 'best_match' && paths[i].samples.some((s) => s.low !== null || s.mid !== null || s.high !== null))
  const best = models.find((m) => m.model === 'best_match') ?? models[0]
  const mp = meanPath(paths)
  if (best === undefined || named.length === 0 || mp === null) return null
  const sky = readModel(mp, ctx, 'sky')
  const agree = named.filter((m) => m.fires).length
  const of = named.length
  const word: FireWord = agree / of >= 0.6 ? 'likely' : agree >= 2 || best.fires ? 'possible' : 'unlikely'
  const perLayer = LAYERS.map((layer) => ({ layer, agree: named.filter((m) => m.layers.find((l) => l.layer === layer)?.fires === true).length, of }))
  const skyLayer = sky.layers.find((l) => l.fires)
  const why: FireWhy | null = word !== 'unlikely' ? null : skyLayer !== undefined ? null : reason(sky)
  const line =
    word !== 'unlikely'
      ? `Fire ${word}`
      : skyLayer !== undefined
        ? `Fire unlikely: only ${perLayer.find((x) => x.layer === skyLayer.layer)?.agree ?? 0} of ${of} models see lit ${LAYER_WORD[skyLayer.layer]}`
        : `Fire unlikely: ${WHY_WORDS[why ?? 'none']}`
  return { word, line, agree, of, perLayer, models, sky, why, station: stationRead(ctx.station, ctx.event) }
}

/** "4 of 5 see lit high cirrus · 1 of 5 lit low deck": the layers any model sees lit. */
/** A layer's name: the models' split by default, the measured deck's when one is known (src/core/layerTruth.ts). */
export type LayerName = (l: Layer) => string
const SPLIT_NAME: LayerName = (l) => LAYER_WORD[l]

export function agreementLine(v: FireVerdict, name: LayerName = SPLIT_NAME): string {
  const lit = v.perLayer.filter((x) => x.agree > 0)
  if (lit.length === 0) return `None of ${v.of} models see a lit layer`
  /* Layers said by one name (the models' mid and high, both the measured deck): a model counts once. */
  const named = v.models.filter((m) => m.model !== 'best_match' && m.model !== 'sky')
  const groups: { word: string; agree: number }[] = []
  for (const x of lit) {
    const word = name(x.layer)
    if (groups.some((g) => g.word === word)) continue
    const same = LAYERS.filter((l) => name(l) === word)
    const agree = same.length === 1 ? x.agree : named.filter((m) => m.layers.some((l) => same.includes(l.layer) && l.fires)).length
    groups.push({ word, agree })
  }
  return groups.map((g, i) => `${g.agree} of ${v.of} ${i === 0 ? 'see ' : ''}lit ${g.word}`).join(' · ')
}

/** The strips the colour clock draws: the sky read's canvas layers you can see. */
export function clockStrips(v: FireVerdict): Strip[] {
  return v.sky.layers.filter((l) => l.canvas && l.hiddenBy === null && l.strip !== null).map((l) => l.strip as Strip)
}

/**
 * THE VERDICT IN ONE SENTENCE (Section 4: less text, more picture): "Fire
 * likely: 4 of 5 models see lit high cirrus, 6:01–6:11 AM." or "Fire
 * unlikely: a lid of cloud."
 */
export function verdictSentence(v: FireVerdict, clock: (d: Date) => string, name: LayerName = SPLIT_NAME): string {
  if (v.word === 'unlikely') return `${v.line}.`
  const top = [...v.perLayer].sort((a, b) => b.agree - a.agree)[0]
  const w = lookWindow(v)
  const when = w === null ? '' : `, ${clock(w.from)}–${clock(w.to)}`
  return top === undefined || top.agree === 0 ? `Fire ${v.word}${when}.` : `Fire ${v.word}: ${top.agree} of ${top.of} models see lit ${name(top.layer)}${when}.`
}

/** The layer the page speaks for: the sky's first that fires, else its first canvas, else its first. */
export function leadLayer(v: FireVerdict): LayerRead {
  return v.sky.layers.find((l) => l.fires) ?? v.sky.layers.find((l) => l.canvas) ?? v.sky.layers[0]
}

/** When to look: the earliest glow to the latest, of the sky's layers that fire. Null when none do. */
export function lookWindow(v: FireVerdict): { from: Date; to: Date; layer: Layer } | null {
  const firing = v.sky.layers.filter((l) => l.fires && l.times?.glowFrom != null && l.times.glowTo != null)
  if (firing.length === 0) return null
  const from = firing.map((l) => l.times?.glowFrom as Date).sort((a, b) => a.getTime() - b.getTime())[0]
  const to = firing.map((l) => l.times?.glowTo as Date).sort((a, b) => b.getTime() - a.getTime())[0]
  const first = firing.find((l) => l.times?.glowFrom?.getTime() === from.getTime()) ?? firing[0]
  return { from, to, layer: first.layer }
}

/** The check, said: three short lines for one layer read. */
export function checkWords(l: LayerRead, name: LayerName = SPLIT_NAME): { canvas: string; gap: string; notBlocked: string } {
  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x)}%`)
  return {
    canvas: l.canvas ? `${name(l.layer)} ${pct(l.cover)} over you, lit edge ${l.reachKm} km toward the sun` : `${name(l.layer)} ${pct(l.cover)} over you: nothing to light`,
    gap:
      l.gap === null
        ? 'no glow in this hour'
        : `${l.gap}: ${Math.round((l.open ?? 0) * 100)}% of the light gets through${l.gapBy === null ? '' : `, ${name(l.gapBy.layer)} ${Math.round(l.gapBy.cover)}% where the ray crosses it, ${Math.round(l.gapBy.fromKm)}–${Math.round(l.gapBy.toKm)} km`}${l.pastPath ? ' (past 400 km not asked)' : ''}${l.openBy === null ? '' : `; ${l.openBy} reports no low cloud: the low gap is open`}`,
    notBlocked:
      l.hiddenBy !== null
        ? `hidden by the ${name(l.hiddenBy.layer)} over you, ${Math.round(l.hiddenBy.cover)}%`
        : l.under.length === 0
          ? `the lowest deck, ${pct(l.cover)} over you: nothing under it`
          : `${l.under.map((u) => `${name(u.layer)} ${pct(u.cover)}`).join(', ')} over you, under ${BLOCKED_AT}%`,
  }
}

export { MODEL_LABEL }
