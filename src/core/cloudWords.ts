/*
 * THE CLOUD PILL IN PLAIN WORDS (Batch Map, Section 0; board MapChrome:
 * "Cloud: None", not "CLR fcst 0·0·0"). The most of the three layers the
 * forecast gives, said as a word; a station's lowest group said the same
 * way. The card under the pill still has the three layers in full.
 */
import type { MetarSky } from './metar.ts'

/* Batch Beach, Section 5: one word list on the pills, "Clear" (a sky with no cloud), not "None". Never a word about hazards. */
export type CloudWord = 'Clear' | 'A few' | 'Some' | 'Mostly' | 'Overcast'

/** The most cover of the layers (percent, 0-100), as a word. */
export function cloudWord(layers: { low: number | null; mid: number | null; high: number | null }): CloudWord | null {
  const known = [layers.low, layers.mid, layers.high].filter((v): v is number => v !== null && Number.isFinite(v))
  if (known.length === 0) return null
  const most = Math.max(...known)
  if (most < 10) return 'Clear'
  if (most < 30) return 'A few'
  if (most < 60) return 'Some'
  if (most < 90) return 'Mostly'
  return 'Overcast'
}

const STATION: Record<string, CloudWord> = { FEW: 'A few', SCT: 'Some', BKN: 'Mostly', OVC: 'Overcast', VV: 'Overcast' }

/** A station's sky as the same word: its most-covering group. */
export function stationCloudWord(sky: MetarSky): CloudWord | null {
  if (sky.groups.length === 0) return sky.clear ? 'Clear' : null
  const order: CloudWord[] = ['Clear', 'A few', 'Some', 'Mostly', 'Overcast']
  return sky.groups.map((g) => STATION[g.amount] ?? 'Some').reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a))
}
