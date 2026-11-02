/*
 * ONE BUOY, IN ONE LINE AND ITS PARTS (Batch H, Section 1.6): where it is,
 * when it read, the whole sea (height, period, the direction it comes from),
 * and, when NDBC's spectral file has them, the swell and the wind waves
 * apart. Only what the file has: a missing part is left out, never filled.
 */
import type { BuoyReading } from './buoy.ts'
import { compass, metresToFeet } from './tideWords.ts'

type Ok = Extract<BuoyReading, { status: 'ok' }>

const ft = (m: number) => `${metresToFeet(m).toFixed(1)} ft`
const part = (m: number | null, s: number | null, from: string | null) =>
  m === null ? null : `${ft(m)}${s === null ? '' : ` ${Math.round(s)} s`}${from === null ? '' : ` ${from}`}`

/** "Cape Henry, VA · 44099 · 23 km". */
export function buoyName(b: Ok): string {
  const name = b.buoy.name.replace(/\s*\(\d+\)\s*$/, '').trim()
  return `${name === '' ? 'Buoy' : name} · ${b.buoy.id} · ${Math.round(b.buoy.km)} km`
}

/** "2.3 ft · 8 s · from ESE". */
export function buoySea(b: Ok): string {
  return [ft(b.waveM), b.periodS === null ? null : `${Math.round(b.periodS)} s`, b.fromDeg === null ? null : `from ${compass(b.fromDeg)}`].filter((x) => x !== null).join(' · ')
}

/** "swell 0.3 ft 11 s E · wind waves 2.3 ft 8 s ESE", or null when the file split nothing. */
export function buoySplit(b: Ok): string | null {
  if (b.split === null) return null
  const swell = part(b.split.swellM, b.split.swellS, b.split.swellFrom)
  const wind = part(b.split.windWaveM, b.split.windWaveS, b.split.windWaveFrom)
  const out = [swell === null ? null : `swell ${swell}`, wind === null ? null : `wind waves ${wind}`].filter((x) => x !== null)
  return out.length === 0 ? null : out.join(' · ')
}
