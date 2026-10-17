/*
 * ONE LINE ON WHAT THE SKY IS DOING, HEDGED, NEVER A SCORE.
 *
 * SEPARATE FROM cloudVerdict, WHICH ANSWERS A DIFFERENT QUESTION. That one
 * answers "can this position see the sun" for a planned shot, in the terms a
 * sightline needs. This answers "what is the sky doing out there" for somebody
 * at a windscreen deciding whether to turn off the road, which wants the thing
 * that actually decides a sunset: whether there is a gap between the cloud base
 * and the horizon for the light to come through.
 *
 * THE SLOT IS THE WHOLE POINT. A sky with thick mid cloud and nothing low is
 * the best sunset there is, and a sky with thick low cloud is the worst, and
 * a single "cloud: 80%" cannot tell them apart. So the layers are read
 * separately and the sentence names the arrangement.
 *
 * WHY EVERY SENTENCE HEDGES. This is a model's grid forecast for a point tens
 * of kilometres away, read minutes before the thing happens. It is worth
 * saying and it is not worth trusting, and the wording carries that rather
 * than leaving it to a disclaimer somewhere else. There is no score, no
 * percentage out of ten, and no word for whether to go.
 */

import { HIGH_CLOUD_DIFFUSES, LOW_CLOUD_BLOCKS, LOW_CLOUD_BROKEN, type SightlineCloud } from './cloud.ts'

/**
 * How much low cloud still counts as a slot.
 *
 * Below the "broken" threshold, so a slot is a genuine absence of low cloud
 * rather than a thin patch of it. Being wrong in this direction sends somebody
 * to a beach to watch a grey bank, which is the failure worth avoiding.
 */
export const SLOT_LOW_MAX = LOW_CLOUD_BROKEN

/**
 * WHETHER THERE IS A GAP AT THE HORIZON.
 *
 * Read from the FARTHEST samples, because those are the ones in the direction
 * the low sun actually comes from. The near samples are the sky overhead,
 * which is what you can already see out of the window.
 */
export function hasHorizonSlot(cloud: SightlineCloud): boolean {
  const far = cloud.samples
    .filter((s) => s.distanceKm >= 40)
    .map((s) => s.low)
    .filter((low): low is number => low !== null)
  if (far.length === 0) return false
  const worstFar = Math.max(...far)
  return worstFar < SLOT_LOW_MAX
}

/**
 * The line.
 *
 * NULL IN, SENTENCE OUT. A missing forecast is a sentence of its own and never
 * an empty string: on this screen a blank line would be read as a clear sky,
 * which is the one reading it must never produce. A dash and "the forecast did
 * not say" beats a zero every time.
 */
export function skyLine(cloud: SightlineCloud | null): string {
  if (cloud === null || cloud.worstLow === null) {
    return 'The forecast did not say what the cloud is doing out there.'
  }

  const low = cloud.worstLow
  const mid = cloud.meanMid ?? 0
  const high = cloud.meanHigh ?? 0
  const thickAbove = mid >= HIGH_CLOUD_DIFFUSES || high >= HIGH_CLOUD_DIFFUSES
  const slot = hasHorizonSlot(cloud)

  if (low >= LOW_CLOUD_BLOCKS) {
    /*
     * Named as cloud rather than as a lost shot. Solid low cloud is also the
     * sky that occasionally breaks in the last four minutes, and this screen
     * is not in a position to tell somebody not to bother.
     */
    return 'Looks like thick low cloud that way, down to the horizon.'
  }

  if (low >= LOW_CLOUD_BROKEN) {
    return thickAbove
      ? 'Looks like broken low cloud under heavier cloud above. The light may come and go.'
      : 'Looks like broken low cloud that way. The light may come and go.'
  }

  /* Little low cloud. The arrangement above is what decides the colour. */
  if (thickAbove) {
    const layer = mid >= high ? 'mid' : 'high'
    return slot
      ? `Looks like thick ${layer} cloud with a clear slot at the horizon.`
      : `Looks like thick ${layer} cloud, and little low cloud under it.`
  }

  return slot
    ? 'Looks like little cloud that way, with a clear horizon.'
    : 'Looks like little cloud that way.'
}
