/*
 * A CLOUD LAYER IS NAMED FROM ITS HEIGHT, AND SAID IN THE SHOOTER'S UNITS
 * (Batch SIMPLE-3, Section 3.3).
 *
 * 23 Nov the Color detail read "high cirrus 8 km" over a deck at 8,000 ft.
 * Two things were wrong at once. The word was the models' band ("high", their
 * pressure levels), not the height; and the height was the models' TYPICAL
 * height for that band (src/core/clouds.ts, 8,000 m), in kilometres, beside a
 * station that reports in feet. "8 km" next to a deck at "8k" reads as the
 * same number and is three times higher.
 *
 * ONE RULE FOR THE NAME, the one layerTruth.ts already names decks by
 * (layerOfFt): under 6,500 ft low, 6,500-20,000 mid, over 20,000 high. This
 * file does not hold a second copy of those numbers.
 *
 * US UNITS. Heights in ft, distances in mi when the shooter reads feet (the
 * app's default, src/lib/units.ts DEFAULT_UNITS); m and km otherwise. Core
 * cannot read the setting (src/lib/units.ts: core computes, lib presents), so
 * every function here takes `miles` from its caller.
 */
import { compassPoint } from './field.ts'
import { layerOfFt, LOW_TOP_FT, MID_TOP_FT, type DeckTruth } from './layerTruth.ts'
import type { Layer } from './skyColour.ts'

export const M_PER_FT = 0.3048
export const KM_PER_MI = 1.609344

/** What a layer is called. Never a cloud type: a height says low, mid or high, not cirrus. */
export const CLOUD_LAYER_NAME: Record<Layer, string> = { low: 'low deck', mid: 'mid deck', high: 'high cloud' }

/** The layer a base at this height is in (layerTruth.ts layerOfFt, the one rule). */
export const cloudLayerOfFt = (ft: number): Layer => layerOfFt(ft)

/** "mid deck" for a base at 8,000 ft. */
export const cloudLayerName = (ft: number): string => CLOUD_LAYER_NAME[cloudLayerOfFt(ft)]

/** The bounds, for a legend: "low under 6,500 ft · mid 6,500–20,000 ft · high over 20,000 ft". */
export const CLOUD_LAYER_BOUNDS_FT = { lowTop: LOW_TOP_FT, midTop: MID_TOP_FT } as const

/**
 * A cloud height: "8,000 ft" (to the 100 ft) for a shooter in feet, "2.4 km"
 * or "800 m" otherwise. A dash when the height is not known, never a zero.
 */
export function cloudHeightWords(metres: number | null, miles: boolean): string {
  if (metres === null || !Number.isFinite(metres) || metres < 0) return '—'
  if (miles) return `${(Math.round(metres / M_PER_FT / 100) * 100).toLocaleString('en-US')} ft`
  if (metres < 1000) return `${Math.round(metres / 50) * 50} m`
  return `${(metres / 1000).toFixed(1)} km`
}

export interface CloudLayerLabel {
  /** "mid deck": from the height, never from the models' band alone. */
  name: string
  /** "8,000 ft", "about 26,000 ft", "12,000 ft or higher". */
  height: string
  /** A station, pilot, sounding or satellite put the height there; false: a forecast's (its humidity, or its band's typical height). */
  measured: boolean
  /** "mid deck · 8,000 ft". */
  words: string
}

/**
 * The label for one of the models' layers: named from the best height there
 * is. A measured deck over you (src/core/layerTruth.ts deckTruth) speaks for
 * the models' mid or high (or their low, for a low deck), with its own
 * height; otherwise the layer's typical height (src/core/clouds.ts) names it,
 * with "about" in front, because no one measured it.
 */
export function cloudLayerLabel(i: { layer: Layer; typicalHeightM: number; truth?: DeckTruth | null; miles: boolean }): CloudLayerLabel {
  const t = i.truth ?? null
  const speaks = t !== null && t.source !== 'model-split' && t.baseFt !== null && (i.layer === 'low') === (t.layer === 'low')
  if (speaks) {
    const baseFt = t.baseFt as number
    const height = `${cloudHeightWords(baseFt * M_PER_FT, i.miles)}${t.atLeast ? ' or higher' : ''}`
    const name = cloudLayerName(baseFt)
    const measured = t.source !== 'model-rh'
    return { name, height: measured ? height : `about ${height}`, measured, words: `${name} · ${measured ? height : `about ${height}`}` }
  }
  const name = cloudLayerName(i.typicalHeightM / M_PER_FT)
  const height = `about ${cloudHeightWords(i.typicalHeightM, i.miles)}`
  return { name, height, measured: false, words: `${name} · ${height}` }
}

/* --------------------------------------------------------- how far, which way */

/** "8 mi NE" or "13 km NE", whole units, at least 1; "here" under a kilometre. */
export function distanceToward(km: number, bearingDeg: number, miles: boolean): string {
  if (!Number.isFinite(km)) return '—'
  if (km < 1) return 'here'
  const n = miles ? km / KM_PER_MI : km
  return `${Math.max(1, Math.round(n))} ${miles ? 'mi' : 'km'} ${compassPoint(bearingDeg)}`
}

/** "8 mi" or "13 km", whole units, at least 1. */
export function distanceWords(km: number, miles: boolean): string {
  if (!Number.isFinite(km)) return '—'
  const n = miles ? km / KM_PER_MI : km
  return `${Math.max(1, Math.round(n))} ${miles ? 'mi' : 'km'}`
}
