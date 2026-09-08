import type { PlannedPosition } from '../lib/plan.ts'

interface PositionCardProps {
  planned: PlannedPosition
  onClose: () => void
}

const LIGHTING_COPY: Record<string, string> = {
  backlit: 'Shooting into the sun',
  'front-lit': 'Sun behind the camera',
  'side-lit': 'Sun across the frame',
}

const deg = (n: number) => `${n.toFixed(1)}°`

/**
 * The card behind a figure. Every number on it was computed by src/core/ from
 * the position's coordinates. The shot text is the only part a model will ever
 * supply, and it says nothing about light.
 */
export function PositionCard({ planned, onClose }: PositionCardProps) {
  const { position, lens, body, fov, lighting, cameraBearing, rangeMeters } = planned

  return (
    <aside className={`card card--${lighting.classification}`} aria-label={`Position ${position.number}`}>
      <div className="card__head">
        <span className="card__number num">{position.number}</span>
        <div className="card__headings">
          <h2 className="card__title">{position.shot}</h2>
          <p className="card__lens">
            {body.name}, {lens.name}
          </p>
        </div>
        <button type="button" className="card__close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <p className={`card__lighting card__lighting--${lighting.classification}`}>
        <span className="card__lighting-tag">{lighting.classification}</span>
        <span className="card__lighting-copy">{LIGHTING_COPY[lighting.classification]}</span>
      </p>

      <dl className="card__stats">
        <div className="card__stat">
          <dt>Focal</dt>
          <dd className="num">{position.focalLength}mm</dd>
        </div>
        <div className="card__stat">
          <dt>Camera bearing</dt>
          <dd className="num">{deg(cameraBearing)}</dd>
        </div>
        <div className="card__stat">
          <dt>Sun delta</dt>
          <dd className="num">{deg(lighting.delta)}</dd>
        </div>
        <div className="card__stat">
          <dt>FOV h</dt>
          <dd className="num">{deg(fov.hFOV)}</dd>
        </div>
        <div className="card__stat">
          <dt>FOV v</dt>
          <dd className="num">{deg(fov.vFOV)}</dd>
        </div>
        <div className="card__stat">
          <dt>Range</dt>
          <dd className="num">{Math.round(rangeMeters)}m</dd>
        </div>
      </dl>

      <p className="card__note">{position.note}</p>
    </aside>
  )
}
