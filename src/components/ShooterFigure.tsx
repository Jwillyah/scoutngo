import type { Classification } from '../core/lighting.ts'

interface ShooterFigureProps {
  number: number
  focalLength: number
  classification: Classification
  selected: boolean
  onSelect: () => void
}

/**
 * A shooter standing at a camera position: a person holding a camera to their
 * eye, drawn inline so it can be tinted from tokens. Accent colored, with a dark
 * edge so it holds up over bright sand and dark water alike.
 *
 * The badge number and the focal length are readouts, so they sit on a solid
 * surface at full opacity. Nothing here is translucent.
 */
export function ShooterFigure({
  number,
  focalLength,
  classification,
  selected,
  onSelect,
}: ShooterFigureProps) {
  return (
    <button
      type="button"
      className={`shooter${selected ? ' shooter--selected' : ''}`}
      onClick={onSelect}
      aria-label={`Position ${number}, ${focalLength} millimetres, ${classification}`}
    >
      <span className="shooter__badge num" aria-hidden="true">
        {number}
      </span>

      <svg className="shooter__svg" viewBox="0 0 26 28" aria-hidden="true">
        {/* Dark backing shape, drawn first, so the figure never dissolves into
            the imagery underneath it. */}
        <g className="shooter__edge">
          <circle cx="9" cy="6" r="4.6" />
          <path d="M2.6 27.5 V16.5 Q2.6 11.4 9 11.4 Q15.4 11.4 15.4 16.5 V27.5 Z" />
          <rect x="10.6" y="8.6" width="12.8" height="9.8" />
        </g>

        <g className="shooter__body">
          <circle cx="9" cy="6" r="3.4" />
          <path d="M3.8 27.5 V16.6 Q3.8 12.6 9 12.6 Q14.2 12.6 14.2 16.6 V27.5 Z" />
          {/* Camera held up at the eye. */}
          <rect x="11.8" y="9.8" width="10.4" height="7.4" />
          <rect x="13.4" y="8.2" width="3.4" height="1.8" />
        </g>

        {/* Lens bore, punched out dark so the camera reads as a camera. */}
        <circle className="shooter__lens" cx="17" cy="13.5" r="2.5" />
      </svg>

      <span className="shooter__focal num" aria-hidden="true">
        {focalLength}
      </span>
    </button>
  )
}
