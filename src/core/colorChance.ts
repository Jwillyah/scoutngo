/*
 * WILL THE SKY TAKE COLOUR AT SUNRISE OR SUNSET, from the three cloud layers.
 *
 * The working rule photographers use, written down so it is the same every
 * time: colour needs cloud HIGH ENOUGH to stay lit after the sun has gone
 * below the ground (mid and high), and a gap LOW DOWN for the light to reach
 * it (little low cloud). Thick low cloud takes the light away; a sky with
 * nothing in it has nothing to light.
 *
 * A JUDGEMENT ABOUT LIGHT, NOT A FORECAST OF ONE. The thresholds are named so
 * they can be argued with, and the line says which layer decided it. With the
 * low layer unknown there is no answer, because low cloud is what blocks the
 * light; that is said, not guessed.
 */
import { LOW_CLOUD_BLOCKS, LOW_CLOUD_BROKEN } from './cloud.ts'

/** Mid or high cover from which there is something up there to catch colour. */
export const CANVAS_MIN = 20
/** Above this the upper cloud is a lid more often than a canvas. */
export const CANVAS_MAX = 80

export type ColorChance = 'good' | 'some' | 'poor' | 'unknown'

export interface ColorRead {
  chance: ColorChance
  /** One sentence: which layer decided it. */
  why: string
}

export function colorChance(layers: { low: number | null; mid: number | null; high: number | null }): ColorRead {
  const { low, mid, high } = layers
  if (low === null) return { chance: 'unknown', why: 'The forecast did not say how much low cloud, and that is the layer that blocks the light.' }
  if (low >= LOW_CLOUD_BLOCKS) return { chance: 'poor', why: `Low cloud at ${Math.round(low)}% is likely to block the light.` }
  if (mid === null && high === null) return { chance: 'unknown', why: 'The forecast did not say how much mid or high cloud there is to catch the light.' }
  const canvas = Math.max(mid ?? 0, high ?? 0)
  if (canvas < CANVAS_MIN) return { chance: 'poor', why: `Little mid or high cloud (${Math.round(canvas)}%) to catch the light.` }
  if (canvas > CANVAS_MAX) return { chance: 'some', why: `Mid or high cloud at ${Math.round(canvas)}% may be too thick to light through.` }
  if (low >= LOW_CLOUD_BROKEN) return { chance: 'some', why: `Mid or high cloud to catch it, but ${Math.round(low)}% low cloud may get in the way.` }
  return { chance: 'good', why: `Mid or high cloud at ${Math.round(canvas)}% to catch the light, and little low cloud to block it.` }
}

export const COLOR_WORDS: Record<ColorChance, string> = {
  good: 'Color chance: good',
  some: 'Color chance: some',
  poor: 'Color chance: poor',
  unknown: 'Color chance: not known',
}
