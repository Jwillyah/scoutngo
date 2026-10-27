/*
 * THE TWO-PIN MEASURE, SAID. The numbers are src/core/measure.ts; this only
 * words them, in the shooter's units, with the compass point beside the degrees.
 */
import { compassPoint } from '../core/field.ts'
import { measureBetween } from '../core/measure.ts'
import type { LatLon } from '../core/geo.ts'
import { formatRange, type DistanceUnit } from './units.ts'

export function measureWords(pins: readonly LatLon[], unit: DistanceUnit): string {
  if (pins.length === 0) return 'Tap the first point, or long-press.'
  if (pins.length === 1) return 'Tap the second point.'
  const m = measureBetween(pins[0], pins[1])
  /*
   * SHORT, ONE LINE: "1,456 ft · NNW 347°". The sentence with both headings
   * ran off a 390 px screen on 27 Oct. The way back is the reverse bearing,
   * which anyone holding a compass can add 180 to.
   */
  return `${formatRange(m.meters, unit)} · ${compassPoint(m.bearing)} ${Math.round(m.bearing) % 360}°`
}
