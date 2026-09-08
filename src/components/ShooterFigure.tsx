import type { Classification } from '../core/lighting.ts'
import type { SiteWarning } from '../core/siting.ts'

interface ShooterFigureProps {
  number: number
  focalLength: number
  classification: Classification
  /** Ground problems from OSM. Magenta, because that is the hazard color. */
  warnings: SiteWarning[]
  moved: boolean
  selected: boolean
  onSelect: () => void
}

const WARNING_LABEL: Record<SiteWarning, string> = {
  'in-water': 'in water',
  'in-roadway': 'in roadway',
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
  moved,
  selected,
  onSelect,
}: ShooterFigureProps) {
  const warning = warnings[0]

  return (
    <button
      type="button"
      className={[
        'shooter',
        selected ? 'shooter--selected' : '',
        warning !== undefined ? 'shooter--warned' : '',
      ]
        .filter((c) => c !== '')
        .join(' ')}
      onClick={onSelect}
      aria-label={[
        `Position ${number}`,
        `${focalLength} millimetres`,
        classification,
        moved ? 'moved by hand' : '',
        warning === undefined ? '' : WARNING_LABEL[warning],
      ]
        .filter((part) => part !== '')
        .join(', ')}
    >
      <span className="shooter__disc">
        <span className="shooter__number num">{number}</span>
        {/* A camera silhouette, small, only to say what the disc represents. */}
        <svg className="shooter__cam" viewBox="0 0 16 10" aria-hidden="true">
          <path d="M1 3h3l1.2-1.6h5.6L12 3h3v6H1z" />
          <circle className="shooter__cam-lens" cx="8" cy="6" r="2.1" />
        </svg>
      </span>

      {warning === undefined ? null : (
        <span className="shooter__warn">{WARNING_LABEL[warning]}</span>
      )}

      <span className="shooter__focal num">
        {focalLength}
        {moved ? <span className="shooter__moved" aria-hidden="true" /> : null}
      </span>
    </button>
  )
}
