/*
 * THE TWO-PIN MEASURE, SAID. The numbers are src/core/measure.ts; this only
 * words them, in the shooter's units, with the compass word beside the degrees.
 */
import { compassWord } from '../core/compassWords.ts'
import { measureBetween } from '../core/measure.ts'
import type { LatLon } from '../core/geo.ts'
import { formatRange, type DistanceUnit } from './units.ts'

export function measureWords(pins: readonly LatLon[], unit: DistanceUnit): string {
  if (pins.length === 0) return 'Tap the first point.'
  if (pins.length === 1) return 'Tap the second point.'
  const m = measureBetween(pins[0], pins[1])
  const deg = (b: number) => `${Math.round(b) % 360}° ${compassWord(b)}`
  return `${formatRange(m.meters, unit)}, heading ${deg(m.bearing)}. Back: ${deg(m.reverseBearing)}.`
}
