/*
 * THE SKY NOW, AND WHEN THE STATION SEES WHAT THE MODELS DO NOT (Batch NOW,
 * Section 1). Arithmetic and words only; the Sky page asks.
 *
 * NOW. Between sunrise + NOW_AFTER_SUNRISE_MIN and sunset - NOW_BEFORE_SUNSET_MIN
 * the Sky page opens on Now: the cloud over you said from the station's
 * report (each deck's amount and base: "broken deck at 10k") and, above its
 * ceilometer's 12,000 ft, the forecast's high layer ("thin cirrus above,
 * forecast"); then whether it is worth a look and why, from those facts and
 * the sun's height:
 *
 *   texture      scattered or broken cloud under 20,000 ft with gaps: a sky
 *                with shape
 *   rays         broken low or mid cloud with the sun 0-20° up behind it
 *   iridescence  thin high cloud (30-70%) with the sun up: look near the sun
 *   halo         a thin high veil (60% or more) over little else, sun up
 *   nothing      clear, or an overcast that flattens it
 *
 * STATION OVER MODELS (12 Nov 9:40 AM: KNTU reported broken decks at 10,000
 * and 25,000 ft while the sunset's call said "no clouds to catch the light";
 * measurements/2026-11-12-sunset-stages.md). When a fresh report has a deck
 * (broken or overcast) in a layer the models' mean has under MODELS_CLEAR at
 * the event, the page says so, and the call is one step less sure: a Go or
 * a Skip becomes a Maybe. The page reads the station again every 10 minutes
 * while it is open, so the line goes when the station or the models move.
 */
import type { CallRead } from './briefing.ts'
import type { FireVerdict } from './fireOutlook.ts'
import type { CloudGroup, MetarSky } from './metar.ts'
import { skyCell } from './statStrip.ts'

export const NOW_AFTER_SUNRISE_MIN = 30
export const NOW_BEFORE_SUNSET_MIN = 90
/** The models' mean cover at the event under this, per cent: they clear it. */
export const MODELS_CLEAR = 25
/** A station's report counts this long. */
export const STATION_FRESH_MS = 75 * 60_000

export type SkyTab = 'now' | 'sunset' | 'sunrise'

/** Now, between the morning's light and the evening's: the page opens there. */
export function opensOnNow(now: Date, sunrise: Date | null, sunset: Date | null): boolean {
  if (sunrise === null || sunset === null) return false
  const t = now.getTime()
  return t >= sunrise.getTime() + NOW_AFTER_SUNRISE_MIN * 60_000 && t <= sunset.getTime() - NOW_BEFORE_SUNSET_MIN * 60_000
}

type Layer = 'low' | 'mid' | 'high'
const layerOf = (baseFt: number): Layer => (baseFt < 6500 ? 'low' : baseFt < 20_000 ? 'mid' : 'high')
const AMOUNT: Record<CloudGroup['amount'], string> = { FEW: 'a few clouds', SCT: 'scattered cloud', BKN: 'broken deck', OVC: 'overcast deck', VV: 'sky hidden' }
const k = (ft: number) => `${Math.round(ft / 1000)}k`

export interface SkyNowRead {
  /** "broken deck at 10k, broken deck at 25k · thin cirrus above (forecast)". */
  clouds: string
  /** Where it came from: "KNTU 9:56 AM", "forecast". */
  source: 'station' | 'forecast' | null
  worth: { kind: 'texture' | 'rays' | 'iridescence' | 'halo'; line: string }[]
  /** When nothing is: why. */
  nothing: string | null
}

/**
 * The sky now. `station`: a fresh report, or null. `model`: the forecast's
 * layers now, per cent. `sunDeg`: the sun's height; `sunPoint`: its compass
 * point.
 */
export function skyNow(station: MetarSky | null, modelIn: { low: number | null; mid: number | null; high: number | null } | null, sunDeg: number, sunPoint: string): SkyNowRead {
  /* A forecast with no layer said is no forecast: never "clear". */
  const model = modelIn !== null && (modelIn.low !== null || modelIn.mid !== null || modelIn.high !== null) ? modelIn : null
  const groups = station?.groups ?? []
  const parts: string[] = []
  if (station !== null) {
    if (groups.length === 0) parts.push(station.clear ? 'nothing under 12,000 ft' : 'no cloud reported')
    else parts.push(groups.map((g) => (g.amount === 'VV' ? 'sky hidden' : `${AMOUNT[g.amount]} at ${k(g.baseFt)}`)).join(', '))
  }
  const high = model?.high ?? null
  const reportedHigh = groups.some((g) => layerOf(g.baseFt) === 'high')
  if (!reportedHigh && high !== null && high >= 10) parts.push(`${high >= 60 ? 'a high veil' : 'thin cirrus'} above${station === null ? '' : ' (forecast)'}`)
  if (station === null && model !== null) {
    /* The one sky word's (src/core/statStrip.ts skyCell), as the home and the Weather page say it. */
    const under = Math.max(model.low ?? 0, model.mid ?? 0)
    const word = skyCell({ low: model.low, mid: model.mid, high: 0 })
    if (under >= 10 && word !== null) parts.unshift(`${word.toLowerCase()} under 20,000 ft (forecast)`)
  }
  const clouds = parts.length === 0 ? (model === null ? 'the forecast did not say, and no station report in the last 75 minutes' : 'no cloud in the forecast') : parts.join(' · ')
  const source = station !== null ? 'station' : model !== null ? 'forecast' : null

  /* What is worth a look, from those facts. */
  const amountIn = (layers: Layer[]) => groups.filter((g) => layers.includes(layerOf(g.baseFt))).map((g) => g.amount)
  const underCover = station !== null ? Math.max(0, ...amountIn(['low', 'mid']).map((a) => ({ FEW: 20, SCT: 45, BKN: 75, OVC: 100, VV: 100 })[a])) : Math.max(model?.low ?? 0, model?.mid ?? 0)
  const highCover = reportedHigh ? Math.max(...amountIn(['high']).map((a) => ({ FEW: 20, SCT: 45, BKN: 75, OVC: 100, VV: 100 })[a])) : (high ?? 0)
  const up = sunDeg > 0
  const worth: SkyNowRead['worth'] = []
  const overcast = underCover >= 95
  if (!overcast && underCover >= 30) worth.push({ kind: 'texture', line: 'texture: broken cloud with gaps gives the sky shape' })
  if (up && sunDeg <= 20 && underCover >= 50 && !overcast) worth.push({ kind: 'rays', line: `rays: the sun ${Math.round(sunDeg)}° up in the ${sunPoint} behind broken cloud` })
  if (up && highCover >= 30 && highCover <= 70 && underCover < 60) worth.push({ kind: 'iridescence', line: `iridescence: thin high cloud, look near the sun (${sunPoint}), shade it with your hand` })
  if (up && highCover >= 60 && underCover < 30) worth.push({ kind: 'halo', line: 'halo: a thin high veil over the sun, look 22° out from it' })
  const nothing = worth.length > 0 ? null : station === null && model === null ? 'nothing to go on: no report, no forecast for this hour' : overcast ? 'an overcast flattens the light' : underCover < 10 && highCover < 10 ? 'a clear sky: nothing for the light to catch' : !up ? 'the sun is down' : 'thin cloud, nothing that shapes the light'
  return { clouds, source, worth, nothing }
}

/** Broken or overcast decks a fresh report has, by layer. */
function decks(sky: MetarSky): { layer: Layer; amount: 'BKN' | 'OVC' }[] {
  return sky.groups.filter((g): g is CloudGroup & { amount: 'BKN' | 'OVC' } => g.amount === 'BKN' || g.amount === 'OVC').map((g) => ({ layer: layerOf(g.baseFt), amount: g.amount }))
}

export interface StationDoubt {
  /** "Station sees broken mid and high cloud now · models clear it by 4:56 PM". */
  line: string
  layers: Layer[]
}

/** A deck the station reports now that the models' mean clears by the event; null when they agree or the report is stale. */
export function stationDoubt(v: FireVerdict | null, station: { sky: MetarSky; at: Date } | null, event: Date | null, now: Date, clock: (d: Date) => string): StationDoubt | null {
  if (v === null || station === null || event === null) return null
  const age = now.getTime() - station.at.getTime()
  if (age > STATION_FRESH_MS || age < -10 * 60_000 || event.getTime() <= now.getTime()) return null
  const cover = (l: Layer) => v.sky.layers.find((x) => x.layer === l)?.cover ?? null
  const missed = decks(station.sky).filter((d) => {
    const c = cover(d.layer)
    return c !== null && c < MODELS_CLEAR
  })
  if (missed.length === 0) return null
  const layers = [...new Set(missed.map((d) => d.layer))]
  const amount = missed.some((d) => d.amount === 'OVC') ? 'overcast' : 'broken'
  const named = layers.length === 1 ? layers[0] : `${layers.slice(0, -1).join(', ')} and ${layers[layers.length - 1]}`
  return { line: `${station.sky.station} sees ${amount} ${named} cloud now · models clear it by ${clock(event)}`, layers }
}

/** The call, one step less sure when the station disagrees: a Go or a Skip becomes a Maybe. */
export function withDoubt(read: CallRead | null, doubt: StationDoubt | null): CallRead | null {
  if (read === null || doubt === null || read.call === null || read.call === 'Maybe') return read
  return { ...read, call: 'Maybe', why: `${read.call === 'Skip' ? 'Less sure than the models' : 'Less sure'}: ${doubt.line}. ${read.why}` }
}
