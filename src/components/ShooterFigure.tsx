import { SHOT_TYPE_LABEL, type ShotType } from '../core/shotType.ts'
import type { PositionOrigin } from '../lib/plan.ts'
import type { FramingWarning } from '../core/fov.ts'
import type { Classification } from '../core/lighting.ts'
import type { SiteWarning } from '../core/siting.ts'
import type { Platform } from '../lib/parsePlan.ts'

interface ShooterFigureProps {
  number: number
  focalLength: number
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
  /** Standoff and framing problems. Same magenta, same treatment. */
  framingWarnings: FramingWarning[]
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
  'frame-too-wide': 'frame too wide',
  'beyond-standoff': 'too far',
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
  classification,
  shotType,
  warnings,
  framingWarnings,
  platform,
  altitudeFeet,
  moved,
  selected,
  origin,
  onSelect,
}: ShooterFigureProps) {
  /* Site and framing problems are the same kind of flag and share one slot. */
  const warningLabel =
    warnings.length > 0
      ? WARNING_LABEL[warnings[0]]
      : framingWarnings.length > 0
        ? FRAMING_LABEL[framingWarnings[0]]
        : undefined
  const air = platform === 'air'

  return (
    <button
      type="button"
      className={[
        'shooter',
        air ? 'shooter--air' : '',
        selected ? 'shooter--selected' : '',
        origin === 'manual' ? 'shooter--manual' : '',
        warningLabel !== undefined ? 'shooter--warned' : '',
      ]
        .filter((c) => c !== '')
        .join(' ')}
      onClick={onSelect}
      aria-label={[
        `Position ${number}`,
        `${focalLength} millimetres`,
        air ? `drone at ${altitudeFeet} feet` : 'ground',
        classification ?? SHOT_TYPE_LABEL[shotType],
        origin === 'manual' ? 'placed by hand' : 'suggested',
        moved ? 'moved by hand' : '',
        warningLabel ?? '',
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
        * A FLAG, NOT A BANNER.
        *
        * This used to print the warning text on the map beside the marker. With
        * six positions back from a generate, three of them flagged, the map
        * carried three red paragraphs overlapping each other and the imagery
        * they were about. The text is the card's job; out here all that is
        * needed is "something is wrong with this one".
        *
        * The words are still on the marker for a screen reader, in aria-label
        * above, so nothing is lost to anyone who cannot see the flag.
        */}
      {warningLabel === undefined ? null : (
        <span className="shooter__flag" aria-hidden="true">
          !
        </span>
      )}

      {/* One plate, one readout: focal length, then altitude for an air position. */}
      <span className="shooter__focal num">
        {focalLength}
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
    </button>
  )
}
