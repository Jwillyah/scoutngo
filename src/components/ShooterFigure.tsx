import type { Classification } from '../core/lighting.ts'
import type { SiteWarning } from '../core/siting.ts'
import type { Platform } from '../lib/parsePlan.ts'

interface ShooterFigureProps {
  number: number
  focalLength: number
  classification: Classification
  /** Ground problems from OSM. Magenta, because that is the hazard color. */
  warnings: SiteWarning[]
  platform: Platform
  /** Feet above ground, air positions only. */
  altitudeFeet: number
  moved: boolean
  selected: boolean
  onSelect: () => void
}

const WARNING_LABEL: Record<SiteWarning, string> = {
  'in-water': 'in water',
  'in-roadway': 'in roadway',
  'over-structure': 'over people',
}

/**
 * A geometric mark, not a drawing of a person. A filled disc carries the
 * number; the field of view cone on the map does the work of showing which way
 * the camera is pointing, so the mark itself does not need to.
 *
 * The focal length sits on a solid plate underneath at full opacity, because it
 * is a numeric readout and has to survive direct sunlight.
 */
export function ShooterFigure({
  number,
  focalLength,
  classification,
  warnings,
  platform,
  altitudeFeet,
  moved,
  selected,
  onSelect,
}: ShooterFigureProps) {
  const warning = warnings[0]
  const air = platform === 'air'

  return (
    <button
      type="button"
      className={[
        'shooter',
        air ? 'shooter--air' : '',
        selected ? 'shooter--selected' : '',
        warning !== undefined ? 'shooter--warned' : '',
      ]
        .filter((c) => c !== '')
        .join(' ')}
      onClick={onSelect}
      aria-label={[
        `Position ${number}`,
        `${focalLength} millimetres`,
        air ? `drone at ${altitudeFeet} feet` : 'ground',
        classification,
        moved ? 'moved by hand' : '',
        warning === undefined ? '' : WARNING_LABEL[warning],
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

      {warning === undefined ? null : (
        <span className="shooter__warn">{WARNING_LABEL[warning]}</span>
      )}

      <span className="shooter__focal num">
        {focalLength}
        {air ? <span className="shooter__alt">{altitudeFeet}ft</span> : null}
        {moved ? <span className="shooter__moved" aria-hidden="true" /> : null}
      </span>
    </button>
  )
}
