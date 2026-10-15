import type { PlannedPosition } from './plan.ts'

/**
 * WHAT THE FRAME DOES FROM HERE, SAID AS A MEASUREMENT.
 *
 * WHAT THIS REPLACED. "At this distance the frame is wider than the event. The
 * subject will be a speck. Move in, or go longer." Three sentences, of which
 * the app could support none: it had not been told how big the subject was, so
 * it was comparing the frame against a flat 60 m and presenting the result as a
 * fact about a building. The shooter's words: "'At 28mm from here you frame
 * about 90 m across' is true. 'The subject will be a speck' is not something
 * you can know."
 *
 * So this module states the frame width and stops. If a subject size has been
 * entered, it also states the multiple, which is still a measurement: two
 * numbers the shooter gave and a division. Nothing here says what the picture
 * will look like.
 *
 * It is a module of its own, and not a string in the card, so the sentences can
 * be asserted without rendering anything. A claim that can only be checked by
 * looking at a phone is a claim that drifts.
 */

/** Metres, rounded the way the rest of the app rounds a distance. */
const metres = (value: number): string => `${Math.round(value)} m`

/**
 * The always-true line: focal length, and what it frames from this distance.
 *
 * On every position, flagged or not, because the measurement is the useful part
 * and the shooter asked for it directly.
 */
export function frameLine(planned: PlannedPosition): string {
  return `At ${planned.focalLength}mm from here you frame ${metres(planned.frameWidthMeters)} across.`
}

/**
 * The comparison, when and only when the shooter has said how big the subject
 * is and the frame is more than WIDE_FRAME_RATIO times it.
 *
 * Null otherwise, which is most of the time, which is the point: a flag on
 * every position is wallpaper.
 */
export function wideFrameLine(planned: PlannedPosition): string | null {
  const { frameSubjectRatio: ratio, subjectMeters } = planned
  if (ratio === null || subjectMeters === null) return null
  if (!planned.framingWarnings.includes('frame-wider-than-subject')) return null
  return `That is about ${ratio.toFixed(1)} times the ${metres(subjectMeters)} subject you set.`
}

/**
 * The map flag: the multiple itself.
 *
 * "WIDE" was a verdict in one word, and it sat on all three positions of a
 * drone shoot in hazard red. "4.2x" is the measurement, and it only appears
 * where there is a subject size to measure against.
 */
export function wideFrameWord(ratio: number | null): string | null {
  return ratio === null ? null : `${ratio.toFixed(1)}x wide`
}
