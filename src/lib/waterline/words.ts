/* The waterline said in words (the Tide sheet and the map note): what it is drawn from, and how sure. */
import { borrowedLabel } from '../../core/waterline.ts'
import { formatRange, type Units } from '../units.ts'
import type { Waterline } from './useWaterline.ts'

export function waterlineLine(w: Waterline | null | 'no-offset', units: Units): string {
  if (w === 'no-offset') return 'No waterline: no tide station near here publishes the height offset it needs.'
  if (w === null) return 'Working out the waterline…'
  const width = w.widthFt === null ? '' : ` Band ${w.widthFt.toFixed(0)} ft wide.`
  return `Waterline at the time on the bar.${width} ${borrowedLabel(w.choice, formatRange(w.choice.distanceKm * 1000, units.distance))} Scan ${w.scanYear ?? 'year not named'}. Beaches move after storms; use as a guide.`
}
