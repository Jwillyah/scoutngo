/*
 * WHICH LAYER IS IT, REALLY (Batch J, Section 1, after truth case #5: the
 * 2 Nov sunset fired off a mid-level altocumulus deck the app called "lit
 * high cirrus").
 *
 * The models split cloud into low / mid / high by their own levels, and on
 * 2 Nov three of them put the deck in "high". The words now come from the
 * best height anyone measured, in this order of trust:
 *
 *   1. a PIREP's base (and top): a pilot flew through it
 *   2. a sounding within SOUNDING_HOURS and SOUNDING_KM: its moist layer
 *   3. GOES-East's cloud top (band 13's temperature on the forecast's
 *      temperature profile): a TOP, so it names a layer only when no base is
 *      known, and it may be a thinner layer above the deck
 *   4. the forecast's pressure-level humidity: its moist layer
 *   5. the models' own low / mid / high split
 *
 * THE CEILOMETER'S LIMIT. An automated station sees cloud only to 12,000 ft.
 * "BKN120" is a deck at 12,000 ft OR HIGHER, and "CLR" is clear below
 * 12,000 ft only; never an exact height, never a clear sky. A station's base
 * under that limit is measured, and it beats every source but a pilot's.
 *
 * Names by base: under 6,500 ft low, 6,500-20,000 mid, over 20,000 high.
 */
import type { Amount, MetarSky } from './metar.ts'
import type { Layer } from './skyColour.ts'

export const LOW_TOP_FT = 6500
export const MID_TOP_FT = 20000
export const CEILOMETER_FT = 12000
/** A layer is moist (cloud) at this relative humidity or more: over water above freezing, over ice below. */
export const MOIST_PCT = 90
/*
 * A forecast's grid box is tens of kilometres across and its levels 100 hPa
 * apart, so a deck a few hundred metres thick reads under saturation: on
 * 2 Nov at 5 PM the forecast's 700 hPa was 86% under a deck the stations put
 * at 10,000-11,000 ft. Its moist layers are read at MODEL_MOIST_PCT.
 */
export const MODEL_MOIST_PCT = 85
/** A sounding counts within this many hours of the event and this far from the venue. */
export const SOUNDING_HOURS = 6
export const SOUNDING_KM = 200
/** A pilot report counts within this many hours and this far. */
export const PIREP_HOURS = 3
export const PIREP_KM = 100
const M_PER_FT = 0.3048

export const layerOfFt = (ft: number): Layer => (ft < LOW_TOP_FT ? 'low' : ft <= MID_TOP_FT ? 'mid' : 'high')
const NAME: Record<Layer, string> = { low: 'low deck', mid: 'mid deck', high: 'high cloud' }

const thousands = (ft: number) => `${(Math.round(ft / 100) * 100).toLocaleString('en-US')} ft`
const k = (ft: number) => `${Math.round(ft / 1000)}k`

/* ------------------------------------------------------------- the station */

export interface StationDeck {
  station: string
  amount: Amount
  baseFt: number
  /** At the ceilometer's limit: the deck is there or higher. */
  atLeast: boolean
}

/** The lowest broken or overcast deck a station reports, with the ceilometer's limit said. */
export function stationDeck(sky: MetarSky): StationDeck | null {
  const g = sky.groups.find((x) => x.amount === 'BKN' || x.amount === 'OVC')
  if (g === undefined) return null
  return { station: sky.station, amount: g.amount, baseFt: g.baseFt, atLeast: g.baseFt === CEILOMETER_FT }
}

/** "clear below 12,000 ft" is not a clear sky: what a CLR can say. */
export const clearMeans = (sky: MetarSky): 'clear below 12,000 ft' | 'no cloud' | null => (sky.groups.length > 0 ? null : sky.clear ? 'clear below 12,000 ft' : null)

/* ------------------------------------------------------------------ PIREPs */

export interface PirepSky {
  amount: Amount | 'SKC'
  baseFt: number | null
  topFt: number | null
}

/**
 * The sky groups of a pilot report's /SK field: "BKN040-TOP070",
 * "OVC015-TOP035/SCT100", "040BKN070", "BKN-OVC 120-TOP140", "SKC". Heights
 * in hundreds of feet, as reported. Null without a /SK field.
 */
export function parsePirepSky(report: string): PirepSky[] | null {
  const field = /\/SK\s+(.*?)(?=\/(?:TM|FL|TP|TB|IC|RM|TA|WX|WV|OV)\b|$)/.exec(report)?.[1]
  if (field === undefined) return null
  const out: PirepSky[] = []
  for (const part of field.split(/[/;]/)) {
    const s = part.trim().toUpperCase()
    if (s === '') continue
    if (/^(SKC|CLR)/.test(s)) {
      out.push({ amount: 'SKC', baseFt: null, topFt: null })
      continue
    }
    const old = /^(\d{3})\s*(FEW|SCT|BKN|OVC)\s*(\d{3})?/.exec(s)
    const amounts = s.match(/FEW|SCT|BKN|OVC/g)
    if (amounts === null) continue
    const amount = (old?.[2] ?? amounts[amounts.length - 1]) as Amount
    const base = old?.[1] ?? /(?:FEW|SCT|BKN|OVC)\s*(\d{3})/.exec(s)?.[1]
    const top = /TOP\s*(\d{3})/.exec(s)?.[1] ?? old?.[3]
    out.push({ amount, baseFt: base === undefined ? null : Number(base) * 100, topFt: top === undefined ? null : Number(top) * 100 })
  }
  return out.length === 0 ? null : out
}

/* --------------------------------------------------- humidity: soundings, models */

export interface Level {
  heightM: number
  tempC: number
  /** Relative humidity over water, per cent, as soundings and models give it. */
  rhPct: number
}

/** Saturation vapour pressure over water and over ice, hPa (Magnus; WMO 2008 constants). */
const esWater = (t: number) => 6.112 * Math.exp((17.62 * t) / (243.12 + t))
const esIce = (t: number) => 6.112 * Math.exp((22.46 * t) / (272.62 + t))

/** Relative humidity over ice below freezing, over water above: the one cloud forms at. */
export const rhForCloud = (l: Level): number => (l.tempC >= 0 ? l.rhPct : (l.rhPct * esWater(l.tempC)) / esIce(l.tempC))

/** RH from temperature and dew point, over water. */
export const rhFromDew = (tempC: number, dewC: number): number => (100 * esWater(dewC)) / esWater(tempC)

export interface MoistLayer {
  baseM: number
  topM: number
}

/** The moist runs of a profile, each edge where the humidity crosses MOIST_PCT, straight between levels. */
export function moistLayers(levels: readonly Level[], threshold = MOIST_PCT): MoistLayer[] {
  const ls = [...levels].filter((l) => Number.isFinite(l.heightM) && Number.isFinite(l.tempC) && Number.isFinite(l.rhPct)).sort((a, b) => a.heightM - b.heightM)
  const out: MoistLayer[] = []
  let base: number | null = null
  for (let i = 0; i < ls.length; i += 1) {
    const rh = rhForCloud(ls[i])
    const moist = rh >= threshold
    const prev = i === 0 ? null : ls[i - 1]
    const cross = () => {
      if (prev === null) return ls[i].heightM
      const a = rhForCloud(prev)
      return prev.heightM + ((threshold - a) / (rh - a)) * (ls[i].heightM - prev.heightM)
    }
    if (moist && base === null) base = cross()
    if (!moist && base !== null) {
      out.push({ baseM: base, topM: cross() })
      base = null
    }
  }
  if (base !== null) out.push({ baseM: base, topM: ls[ls.length - 1].heightM })
  return out
}

/* ------------------------------------------------------------ the satellite */

export type Phase = 'water' | 'mixed' | 'ice'

/**
 * A cloud top's height from its infrared temperature: the lowest height the
 * profile is that cold, straight between levels. Null when the profile is
 * never that cold (the top is warmer than the air anywhere asked: low cloud
 * or the ground).
 */
export function topFromTemperature(btC: number, levels: readonly Level[]): number | null {
  const ls = [...levels].sort((a, b) => a.heightM - b.heightM)
  for (let i = 1; i < ls.length; i += 1) {
    const a = ls[i - 1]
    const b = ls[i]
    if (b.tempC <= btC && a.tempC > btC) return a.heightM + ((a.tempC - btC) / (a.tempC - b.tempC)) * (b.heightM - a.heightM)
  }
  return null
}

/** Water above -10 °C, ice below -25 °C, mixed between (a top's temperature alone). */
export const phaseOf = (btC: number): Phase => (btC >= -10 ? 'water' : btC <= -25 ? 'ice' : 'mixed')

/* ---------------------------------------------------------- the truth, said */

export type HeightSource = 'pirep' | 'station' | 'sounding' | 'satellite' | 'model-rh' | 'model-split'

export interface DeckTruth {
  layer: Layer
  /** The base, feet, or null. With `atLeast`, a lower bound. */
  baseFt: number | null
  atLeast: boolean
  topFt: number | null
  /** Where the height that names it came from. */
  source: HeightSource
  /** "mid deck (12k or higher)", "low deck (3,400 ft)". */
  words: string
  /** For a narrow label: "mid deck ≥12k", "low deck 3k". */
  short: string
  /** Each source that spoke, in words, for the Why. */
  notes: string[]
}

export interface TruthIn {
  station?: StationDeck | null
  pirep?: { base: number | null; top: number | null; amount: string; from: string } | null
  sounding?: { layers: MoistLayer[]; from: string } | null
  satTop?: { btC: number; topM: number | null } | null
  modelRh?: MoistLayer[] | null
  /** The models' own layer for the canvas over you, when nothing else speaks. */
  modelLayer?: Layer | null
}

/** Levels 100 hPa apart put a layer's edges this far off, either way. */
const EDGE_SLACK_M = 500
/** The moist layer that holds a height (within the slack), else the lowest above it. */
function layerAt(layers: readonly MoistLayer[], ft: number): MoistLayer | null {
  const m = ft * M_PER_FT
  return layers.find((l) => l.baseM - EDGE_SLACK_M <= m && l.topM + EDGE_SLACK_M >= m) ?? layers.find((l) => l.baseM >= m) ?? null
}

/**
 * The canvas over you, named from the best height. The station says a deck
 * IS there (and its base, or "12k or higher"); the other sources say how
 * high when the station cannot.
 */
export function deckTruth(t: TruthIn): DeckTruth | null {
  const notes: string[] = []
  const st = t.station ?? null
  if (st !== null) notes.push(st.atLeast ? `${st.station} ${st.amount}${String(st.baseFt / 100).padStart(3, '0')}: a deck at ${k(st.baseFt)} or higher (the ceilometer sees to 12,000 ft)` : `${st.station}: ${st.amount === 'OVC' ? 'overcast' : 'broken'} at ${thousands(st.baseFt)}`)
  const minFt = st === null ? 0 : st.baseFt
  let base: { ft: number; source: HeightSource } | null = null
  let top: number | null = null

  if (t.pirep != null && t.pirep.base !== null) {
    base = { ft: t.pirep.base, source: 'pirep' }
    top = t.pirep.top
    notes.push(`pilot (${t.pirep.from}): ${t.pirep.amount} base ${thousands(t.pirep.base)}${t.pirep.top === null ? '' : `, top ${thousands(t.pirep.top)}`}`)
  }
  if (st !== null && !st.atLeast && base === null) base = { ft: st.baseFt, source: 'station' }
  if (t.sounding != null && t.sounding.layers.length > 0) {
    const l = st === null ? t.sounding.layers[0] : layerAt(t.sounding.layers, st.baseFt)
    if (l !== null) {
      notes.push(`sounding (${t.sounding.from}): moist ${thousands(l.baseM / M_PER_FT)}–${thousands(l.topM / M_PER_FT)}`)
      if (base === null) base = { ft: Math.max(minFt, l.baseM / M_PER_FT), source: 'sounding' }
      top ??= l.topM / M_PER_FT
    }
  }
  if (t.satTop != null) {
    if (t.satTop.topM === null) notes.push(`satellite: top ${Math.round(t.satTop.btC)} °C, warmer than the air aloft (low cloud or none)`)
    else {
      const ft = t.satTop.topM / M_PER_FT
      const above = base !== null && ft - base.ft > 8000
      notes.push(`satellite: top about ${thousands(ft)} (${Math.round(t.satTop.btC)} °C, ${phaseOf(t.satTop.btC)})${above ? ', likely a higher layer over the deck' : ''}`)
      top ??= ft
    }
  }
  if (t.modelRh != null && t.modelRh.length > 0) {
    const l = st === null ? t.modelRh[0] : layerAt(t.modelRh, st.baseFt)
    if (l !== null) {
      notes.push(`forecast humidity: moist ${thousands(l.baseM / M_PER_FT)}–${thousands(l.topM / M_PER_FT)}`)
      if (base === null) base = { ft: Math.max(minFt, l.baseM / M_PER_FT), source: 'model-rh' }
      top ??= l.topM / M_PER_FT
    }
  }
  if (base === null && st !== null) base = { ft: st.baseFt, source: 'station' }
  if (base === null && t.satTop?.topM != null && t.satTop.topM / M_PER_FT < LOW_TOP_FT) base = { ft: t.satTop.topM / M_PER_FT, source: 'satellite' }

  if (base === null) {
    if (t.modelLayer == null) return null
    return { layer: t.modelLayer, baseFt: null, atLeast: false, topFt: top, source: 'model-split', words: NAME[t.modelLayer].replace('high cloud', 'high cirrus'), short: NAME[t.modelLayer].replace('high cloud', 'high cirrus'), notes: [...notes, 'the models’ own split'] }
  }
  const layer = layerOfFt(base.ft)
  const atLeast = st !== null && st.atLeast && (base.source === 'station' || base.source === 'model-rh' || base.source === 'sounding')
  const phrase = st !== null && st.atLeast && base.source !== 'pirep' ? `${k(st.baseFt)} or higher` : base.source === 'station' || base.source === 'pirep' ? thousands(base.ft) : `about ${thousands(base.ft)}`
  return { layer, baseFt: base.ft, atLeast, topFt: top, source: base.source, words: `${NAME[layer]} (${phrase})`, short: `${NAME[layer]} ${st !== null && st.atLeast && base.source !== 'pirep' ? `≥${k(st.baseFt)}` : k(base.ft)}`, notes }
}

/**
 * The words for a layer the models call lit, given the truth over you: the
 * models' mid or high is the station's deck when that deck is above the low
 * layer (2 Nov: their "high cirrus" was a deck at 12k or higher).
 */
export function layerWords(layer: Layer, truth: DeckTruth | null, fallback: Record<Layer, string>, short = false): string {
  if (truth === null || truth.source === 'model-split') return fallback[layer]
  if ((layer === 'low') === (truth.layer === 'low')) return short ? truth.short : truth.words
  return fallback[layer]
}
