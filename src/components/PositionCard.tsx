import { useState } from 'react'
import type { SiteWarning } from '../core/siting.ts'
import { fetchGroundView, type GroundView } from '../lib/groundView.ts'
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

const WARNING_COPY: Record<SiteWarning, string> = {
  'in-water': 'This position is in water. Nobody can stand here.',
  'in-roadway': 'This position is in a roadway. Check access before committing.',
}

/**
 * Real Street View imagery, or an honest statement that there is none.
 * Never a generated picture: see the note in lib/groundView.ts.
 */
function GroundViewPanel({ planned }: { planned: PlannedPosition }) {
  const [view, setView] = useState<GroundView>({ status: 'idle' })

  const load = () => {
    setView({ status: 'loading' })
    fetchGroundView(planned.position.at, planned.cameraBearing, planned.fov.hFOV).then(setView)
  }

  if (view.status === 'idle') {
    return (
      <button type="button" className="btn btn--small" onClick={load}>
        Ground view
      </button>
    )
  }

  return (
    <div className="ground">
      {view.status === 'loading' ? <p className="ground__note">Loading ground view…</p> : null}

      {view.status === 'ok' ? (
        <>
          <img
            className="ground__img"
            src={view.image}
            alt={`Street View looking ${deg(planned.cameraBearing)} from position ${planned.position.number}`}
          />
          <p className="ground__note">
            Google Street View, aimed at {deg(planned.cameraBearing)} with a{' '}
            {deg(planned.fov.hFOV)} field of view. Imagery may be years old.
          </p>
        </>
      ) : null}

      {view.status === 'no-key' || view.status === 'no-coverage' || view.status === 'error' ? (
        <p className="ground__note">{view.message}</p>
      ) : null}
    </div>
  )
}

/**
 * The card behind a figure. Every number on it was computed by src/core/ from
 * the position's coordinates. The shot text is the only part a model will ever
 * supply, and it says nothing about light.
 */
export function PositionCard({ planned, onClose }: PositionCardProps) {
  const { position, lens, body, fov, lighting, cameraBearing, rangeMeters, warnings } = planned

  return (
    <aside className={`card card--${lighting.classification}`} aria-label={`Position ${position.number}`}>
      <div className="card__head">
        <span className="card__number num">
          {position.number}
          {position.moved ? <span className="card__moved">moved</span> : null}
        </span>
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

      {warnings.map((warning) => (
        <p className="card__warn" key={warning}>
          {WARNING_COPY[warning]}
        </p>
      ))}

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

      {position.risk === '' ? null : <p className="card__note">{position.risk}</p>}

      <GroundViewPanel planned={planned} />
    </aside>
  )
}
