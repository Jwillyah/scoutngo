import { useState } from 'react'
import type { FramingWarning } from '../core/fov.ts'
import type { SiteWarning } from '../core/siting.ts'
import { fetchGroundView, type GroundView } from '../lib/groundView.ts'
import { FAA_CEILING_FEET } from '../lib/parsePlan.ts'
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

const METRES_TO_FEET = 3.28084

/** Both units on one line. The kit is metric, the airspace rules are not. */
const distance = (metres: number) =>
  `${Math.round(metres)}m · ${Math.round(metres * METRES_TO_FEET)}ft`

const WARNING_COPY: Record<SiteWarning, string> = {
  'in-water': 'This position is in water. Nobody can stand here.',
  'in-roadway': 'This position is in a roadway. Check access before committing.',
  'over-structure': 'This drone path crosses buildings or a gathering area. The Air 3S is too heavy for FAA Category 1 flight over people.',
}

/**
 * Framing problems get the same magenta treatment as the site ones, because they
 * are the same kind of fact: something is wrong with this position and only the
 * shooter can decide what to do about it. Nothing is moved automatically.
 */
const FRAMING_COPY: Record<FramingWarning, string> = {
  'frame-too-wide':
    'At this distance the frame is wider than the event. The subject will be a speck. Move in, or go longer.',
  'beyond-standoff':
    'Further out than this focal length can carry. Haze and lack of separation will cost more than the extra reach buys.',
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
  const {
    position,
    fov,
    lighting,
    cameraBearing,
    subjectRangeMeters,
    frameWidthMeters,
    standoff,
    framingWarnings,
    warnings,
  } = planned

  return (
    <aside className={`card card--${lighting.classification}`} aria-label={`Position ${position.number}`}>
      <div className="card__head">
        <span className="card__number num">
          {position.number}
          {position.moved ? <span className="card__moved">moved</span> : null}
        </span>
        <div className="card__headings">
          <h2 className="card__title">{position.shot}</h2>
          {/*
            * Focal length only. Which body the lens goes on is a decision made on
            * the day, and "Sony a7III, Sony 200-600" was restating the kit bag
            * rather than saying anything about this position.
            */}
          <p className="card__lens num">{position.focalLength}mm</p>
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

      {framingWarnings.map((warning) => (
        <p className="card__warn" key={warning}>
          {FRAMING_COPY[warning]}
        </p>
      ))}

      <p className={`card__lighting card__lighting--${lighting.classification}`}>
        <span className="card__lighting-tag">{lighting.classification}</span>
        <span className="card__lighting-copy">{LIGHTING_COPY[lighting.classification]}</span>
      </p>

      {position.platform !== 'air' ? null : (
        <p className="card__air">
          <span className="card__air-tag">Drone</span>
          <span className="num">{position.altitudeFeet} ft AGL</span>
          <span className="card__air-note">
            FAA ceiling is {FAA_CEILING_FEET} ft above ground level.
          </span>
        </p>
      )}

      <dl className="card__stats">
        <div className="card__stat">
          <dt>Range</dt>
          <dd className="num">{distance(subjectRangeMeters)}</dd>
        </div>
        <div className="card__stat">
          {/*
            * The number that says whether the standoff is sane: how much ground
            * is across the frame at the subject. 2 * range * tan(hFOV / 2).
            */}
          <dt>Frame width</dt>
          <dd className="num">{distance(frameWidthMeters)}</dd>
        </div>
        <div className="card__stat">
          <dt>Usable to</dt>
          <dd className="num">{Math.round(standoff.maxMeters)}m</dd>
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
      </dl>

      {/*
        * Why this vantage. The model's judgement, in its own words, capped at 15
        * words by the parser. Nothing is computed from it.
        */}
      {position.angleRationale === '' ? null : (
        <p className="card__why">{position.angleRationale}</p>
      )}

      {position.risk === '' ? null : <p className="card__note">{position.risk}</p>}

      {position.platform === 'air' ? null : <GroundViewPanel planned={planned} />}
    </aside>
  )
}
