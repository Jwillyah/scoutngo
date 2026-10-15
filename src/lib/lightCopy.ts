import {
  NO_CLASS_REASON,
  type Classification,
  type LightingRead,
  type ShadowLength,
} from '../core/lighting.ts'
import { compassPoint } from '../core/field.ts'

/**
 * HOW A LIGHTING READ IS WORDED, in one place.
 *
 * Three surfaces show this: the position card, the shot list, and the field
 * card. Before shot types there was one word to show and each of them had its
 * own little map of it. Now there are three different KINDS of read, and three
 * copies of that switch would be three chances to print a lighting class over
 * a nadir shot.
 *
 * The arithmetic is all in src/core/lighting.ts. Nothing here computes
 * anything; it only chooses words for what core already decided.
 */

export interface LightLine {
  /** A mark, as the card already used for the three classifications. */
  icon: string
  /** The headline. A classification word, or what is true instead. */
  word: string
  /** The line underneath. For a type with no class, it says WHY there is none. */
  phrase: string
  /**
   * A token for styling. The classification for a framed shot, and the shot
   * type otherwise, so a 360 cannot pick up a backlit colour.
   */
  tone: Classification | 'top-down' | 'orbit'
  /** False for a top-down and a 360. Lets a caller suppress a class-only row. */
  hasClass: boolean
}

const CLASSIFIED: Record<Classification, { icon: string; word: string; phrase: string }> = {
  backlit: { icon: '○', word: 'Backlit', phrase: 'Shooting into the sun' },
  'front-lit': { icon: '●', word: 'Front-lit', phrase: 'Sun behind the camera' },
  'side-lit': { icon: '◐', word: 'Side-lit', phrase: 'Sun across the frame' },
}

/** How a shadow length band reads. The ratio is also shown, next to it. */
export const SHADOW_LENGTH_WORD: Record<ShadowLength, string> = {
  none: 'no shadows',
  short: 'short shadows',
  medium: 'medium shadows',
  long: 'long shadows',
  raking: 'raking shadows',
}

const ratio = (n: number) => (n >= 20 ? '20×+' : `${n.toFixed(1)}×`)
const deg = (n: number) => `${Math.round(n)}°`

export function lightLine(read: LightingRead): LightLine {
  switch (read.shotType) {
    case 'framed': {
      const copy = CLASSIFIED[read.lighting.classification]
      return { ...copy, tone: read.lighting.classification, hasClass: true }
    }

    /*
     * A NADIR SHOT IS ABOUT THE SHADOWS. That is the whole read: which way
     * they fall and how long they are. At a low sun it is the entire picture,
     * which is why the length band leads rather than being a footnote.
     */
    case 'top-down': {
      const length = SHADOW_LENGTH_WORD[read.shadowLength]
      const where = `${compassPoint(read.shadowBearing)} ${deg(read.shadowBearing)}`
      return {
        icon: '▦',
        word:
          read.shadowLengthRatio === null
            ? 'No shadows'
            : `Shadows ${where}, ${ratio(read.shadowLengthRatio)}`,
        phrase:
          read.shadowLengthRatio === null
            ? `${NO_CLASS_REASON['top-down']} The sun is below the horizon, so nothing is casting one.`
            : `${length}, falling ${compassPoint(read.shadowBearing)}. ${
                read.shadowAgainstFrame === null
                  ? ''
                  : read.shadowAgainstFrame <= 10
                    ? 'Running along the frame.'
                    : read.shadowAgainstFrame >= 80
                      ? 'Running across the frame.'
                      : `${deg(read.shadowAgainstFrame)} off the frame.`
              } ${NO_CLASS_REASON['top-down']}`.replace(/\s+/g, ' ').trim(),
        tone: 'top-down',
        hasClass: false,
      }
    }

    /*
     * A 360 ALWAYS HAS THE SUN IN IT. So the read is where on the horizon ring
     * it sits, how far above or below that ring it is, and whether it is low
     * enough to flare, which on a stitched sphere is a real risk rather than a
     * stylistic one.
     */
    case 'orbit': {
      const where = `${compassPoint(read.sunBearing)} ${deg(read.sunBearing)}`
      const up =
        read.sunAltitude >= 0
          ? `${deg(read.sunAltitude)} above the ring`
          : `${deg(Math.abs(read.sunAltitude))} below the ring`
      const flare =
        read.flareRisk === 'high'
          ? 'Sun is low and in frame: flare and stitch artefacts likely.'
          : read.flareRisk === 'moderate'
            ? 'Sun is lowish and in frame: watch for flare.'
            : read.sunAltitude <= 0
              ? 'Sun is under the horizon, so no direct flare.'
              : 'Sun is high enough that flare is unlikely.'
      return {
        icon: '◍',
        word: `Sun ${where}`,
        phrase: `${up}. ${flare} ${NO_CLASS_REASON.orbit}`,
        tone: 'orbit',
        hasClass: false,
      }
    }
  }
}
