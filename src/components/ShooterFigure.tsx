import { SHOT_TYPE_LABEL, type ShotType } from '../core/shotType.ts'
import { wideFrameWord } from '../lib/framingCopy.ts'
import { BLOCKED_WORD } from '../lib/sightlineCopy.ts'
import type { PositionOrigin } from '../lib/plan.ts'
import type { FramingWarning } from '../core/fov.ts'
import type { Classification } from '../core/lighting.ts'
import type { SiteWarning } from '../core/siting.ts'
import type { Platform } from '../core/platformFilter.ts'

interface ShooterFigureProps {
  number: number
  /**
   * The focal length the field of view was computed from, and the name of the
   * optic it belongs to.
   *
   * THE NAME IS NOT OPTIONAL. The plate used to read "28" on its own. "28 on
   * what? A focal length with no camera is the same ambiguity that let the
   * Sigma stand in for my drone in the first place." Shortened in
   * core/opticTag.ts so it fits beside the number.
   */
  focalLength: number
  opticName: string
  /**
   * The short tag to print, or null when every plate on this map would carry
   * the same one and it therefore distinguishes nothing. See core/mapLabel.ts.
   *
   * The full `opticName` is still required and still goes in the aria-label:
   * a screen reader reads one position at a time, so "28 millimetres" with no
   * optic is as ambiguous for it as it was on screen.
   */
  opticTag: string | null
  /**
   * The lighting class, or null when the shot type has none.
   *
   * Null for a top-down and a 360. The label says the shot type instead, so a
   * screen reader is told "360" rather than being told a direction the camera
   * is not pointing.
   */
  classification: Classification | null
  shotType: ShotType
  /** Ground problems from OSM. Magenta, because that is the hazard color. */
  warnings: SiteWarning[]
  /**
   * Standoff and framing problems. NOT all the same treatment any more: see
   * FRAMING_SEVERITY. beyond-standoff is a hazard; a wide frame is a note.
   */
  framingWarnings: FramingWarning[]
  /**
   * How many times wider than the subject the frame is, or null when the
   * shooter has not said how big the subject is.
   *
   * The flag prints this number rather than the word "wide", because the
   * number is a measurement and the word was a verdict.
   */
  frameSubjectRatio: number | null
  /**
   * How many marked obstructions stand between this position and the subject.
   *
   * A HAZARD, and it outranks the framing note: a position you cannot see the
   * subject from does not work, whatever the frame is doing. Zero means
   * nothing is MARKED in the way and draws nothing at all; it is never a
   * statement that the way is clear. See src/core/siteMark.ts.
   */
  blockedCount: number
  platform: Platform
  /** Feet above ground, air positions only. */
  altitudeFeet: number
  moved: boolean
  /** Suggested or placed by hand. Emphasis only; it changes no arithmetic. */
  origin: PositionOrigin
  selected: boolean
  onSelect: () => void
}

const WARNING_LABEL: Record<SiteWarning, string> = {
  'in-water': 'in water',
  'in-roadway': 'in roadway',
  'over-structure': 'over people',
}

const FRAMING_LABEL: Record<FramingWarning, string> = {
  'frame-wider-than-subject': 'frame much wider than the subject',
  'beyond-standoff': 'too far',
}

/**
 * WHICH OF THESE IS RED.
 *
 * WHAT WAS REPORTED. All three positions of a drone shoot carrying a red WIDE
 * badge. "A warning that fires on everything is not a warning, it is wallpaper,
 * and it trains me to ignore the one time it matters." And: "Red is for
 * something being wrong. A wide frame is a choice."
 *
 * So a wide frame reads as a readout, in the same plate colour as the focal
 * length, and the magenta is kept for the two things that genuinely are wrong:
 * standing in a river, and standing further out than the shot can carry.
 */
const FRAMING_SEVERITY: Record<FramingWarning, 'hazard' | 'note'> = {
  'frame-wider-than-subject': 'note',
  'beyond-standoff': 'hazard',
}

/*
 * ONE WORD FOR THE MAP, because a bare "!" tells the next person holding the
 * phone nothing.
 *
 * The marker used to print the full phrase, and six positions back from a
 * generate put three overlapping red paragraphs across the imagery they were
 * about, so it was cut to an exclamation mark. That fixed the overlap and lost
 * the meaning: "something is wrong with this one" is not the same as knowing a
 * position is standing in a river.
 *
 * One word each is short enough not to bring the paragraphs back and specific
 * enough to act on. The full phrase is still on the card and still in the
 * marker's aria-label, so this adds a reading rather than replacing one.
 */
const WARNING_WORD: Record<SiteWarning, string> = {
  'in-water': 'water',
  'in-roadway': 'road',
  'over-structure': 'people',
}

const FRAMING_WORD: Record<FramingWarning, string> = {
  /* Replaced by the measured multiple when there is one. See wideFrameWord. */
  'frame-wider-than-subject': 'wide',
  'beyond-standoff': 'far',
}

/**
 * A geometric mark, not a drawing of a person. A filled disc carries the
 * number; the field of view cone on the map does the work of showing which way
 * the camera is pointing, so the mark itself does not need to.
 *
 * The focal length sits on a solid plate underneath at full opacity, because it
 * is a numeric readout and has to survive direct sunlight. On an air position the
 * altitude rides on that SAME plate, as one readout: it used to be a separately
 * coloured span that read as a second floating thing next to the marker rather
 * than part of it.
 */
export function ShooterFigure({
  number,
  focalLength,
  opticName,
  opticTag,
  classification,
  shotType,
  warnings,
  framingWarnings,
  frameSubjectRatio,
  blockedCount,
  platform,
  altitudeFeet,
  moved,
  selected,
  origin,
  onSelect,
}: ShooterFigureProps) {
  /*
   * ONE FLAG SLOT, TWO SEVERITIES. A site problem outranks a framing one, and
   * a hazard outranks a note, so the thing shown is the worst thing true.
   */
  const framing = framingWarnings[0]
  const flag =
    blockedCount > 0
      ? {
          word: BLOCKED_WORD,
          label:
            blockedCount === 1
              ? 'one marked obstruction in the way'
              : `${blockedCount} marked obstructions in the way`,
          severity: 'hazard' as const,
        }
      : warnings.length > 0
      ? { word: WARNING_WORD[warnings[0]], label: WARNING_LABEL[warnings[0]], severity: 'hazard' as const }
      : framing === undefined
        ? null
        : {
            /*
             * The multiple, not the word: "4.2x wide" is measured, "WIDE" was
             * a verdict. The word is the fallback for a flag that has no
             * number, which beyond-standoff does not.
             */
            word:
              (framing === 'frame-wider-than-subject'
                ? wideFrameWord(frameSubjectRatio)
                : null) ?? FRAMING_WORD[framing],
            label: FRAMING_LABEL[framing],
            severity: FRAMING_SEVERITY[framing],
          }
  const air = platform === 'air'

  return (
    <button
      type="button"
      className={[
        'shooter',
        air ? 'shooter--air' : '',
        selected ? 'shooter--selected' : '',
        origin === 'manual' ? 'shooter--manual' : '',
        /*
         * The disc goes magenta for a HAZARD only. It used to go magenta for
         * anything flagged, which on a drone shoot was every position.
         */
        flag?.severity === 'hazard' ? 'shooter--warned' : '',
      ]
        .filter((c) => c !== '')
        .join(' ')}
      onClick={onSelect}
      aria-label={[
        `Position ${number}`,
        `${opticName}, ${focalLength} millimetres`,
        air ? `drone at ${altitudeFeet} feet` : 'ground',
        classification ?? SHOT_TYPE_LABEL[shotType],
        origin === 'manual' ? 'placed by hand' : 'suggested',
        moved ? 'moved by hand' : '',
        flag?.label ?? '',
      ]
        .filter((part) => part !== '')
        .join(', ')}
    >
      <span className="shooter__disc">
        <span className="shooter__number num">{number}</span>
        {/* Small silhouette, only to say what the disc represents. */}
        {air ? (
          <svg className="shooter__cam" viewBox="0 0 18 10" aria-hidden="true">
            <circle cx="3" cy="3" r="2.6" />
            <circle cx="15" cy="3" r="2.6" />
            <path d="M3 3 L9 6 L15 3 L15 5 L9 8 L3 5 Z" />
          </svg>
        ) : (
          <svg className="shooter__cam" viewBox="0 0 16 10" aria-hidden="true">
            <path d="M1 3h3l1.2-1.6h5.6L12 3h3v6H1z" />
            <circle className="shooter__cam-lens" cx="8" cy="6" r="2.1" />
          </svg>
        )}
      </span>

      {/*
        * ONE WORD, NOT A BANNER AND NOT A BARE EXCLAMATION MARK.
        *
        * This printed the full phrase once, and six positions back from a
        * generate put three overlapping red paragraphs across the imagery they
        * were about. It was cut to "!", which fixed the overlap and left a red
        * badge that means nothing to anyone who has not been told: "something
        * is wrong with this one" is not the same as knowing a position is
        * standing in a river.
        *
        * One word is short enough not to bring the paragraphs back and
        * specific enough to act on. scripts/audit-labels.mjs measures these
        * against each other and against the chrome, so the overlap that caused
        * the original retreat is now checked rather than avoided.
        *
        * The full phrase is still on the card and still in the aria-label
        * above, so this adds a reading rather than replacing one.
        */}
      {flag === null ? null : (
        <span className={`shooter__flag shooter__flag--${flag.severity}`}>{flag.word}</span>
      )}

      {/*
        * ONE PLATE, ONE READOUT: which optic, at what focal length, and for an
        * air position how high.
        *
        * THE OPTIC NAME IS THE FIX FOR "28 ON WHAT". A focal length alone does
        * not say whether the geometry under it was drawn for a lens in a hand
        * or a camera on an aircraft, and that ambiguity is exactly what let a
        * Sigma stand in for a Mavic without the screen looking wrong.
        * Shortened in core/opticTag.ts, because the full name does not fit
        * beside six markers.
        */}
      {/*
        * ONLY ON THE SELECTED ONE. Six plates in a cluster were the crowding:
        * the number and the camera glyph say which position is which, and the
        * one you tapped says what it is shooting with.
        */}
      {!selected ? null : (
      <span className="shooter__focal num">
        {opticTag === null || opticTag === '' ? null : (
          <>
            <span className="shooter__optic">{opticTag}</span>
            {/* A space, so "AIR 3S" and "70mm" do not run together. */}
            <span className="shooter__sep" aria-hidden="true">
              {' '}
            </span>
          </>
        )}
        {focalLength}mm
        {/*
          * AND WHAT IT IS ON. A bare focal length does not distinguish a drone
          * from a tripod, which is the only reason to show two of them: "70mm"
          * beside "200mm" reads as two lenses, and the thing that actually
          * differs is that one of them is in the air.
          */}
        <span className="shooter__sep" aria-hidden="true">
          ·
        </span>
        <span className="shooter__platform">{air ? 'DRONE' : 'TRIPOD'}</span>
        {air ? (
          <>
            <span className="shooter__sep" aria-hidden="true">
              ·
            </span>
            <span className="shooter__alt">{altitudeFeet}ft</span>
          </>
        ) : null}
        {moved ? <span className="shooter__moved" aria-hidden="true" /> : null}
      </span>
      )}
    </button>
  )
}
