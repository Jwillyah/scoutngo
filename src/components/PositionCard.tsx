import { useState } from 'react'
import type { SightlineCloud } from '../core/cloud.ts'
import { MIN_BEARING_RANGE_METERS } from '../core/coverage.ts'
import { feetToMetres, type TideState } from '../core/tide.ts'
import type { FramingWarning } from '../core/fov.ts'
import type { SiteWarning } from '../core/siting.ts'
import { fetchSightlineCloud, type ForecastKind } from '../lib/forecast.ts'
import { fetchGroundView, type GroundView } from '../lib/groundView.ts'
import { FAA_CEILING_FEET } from '../lib/parsePlan.ts'
import type { PlannedPosition } from '../lib/plan.ts'

interface PositionCardProps {
  planned: PlannedPosition
  /** The moment the scrubber is on, and the venue's zone. Null until resolved. */
  shootAt: Date | null
  timeZone: string | null
  /** Water level and direction at the scrubbed moment. Null away from the coast. */
  tide: TideState | null
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

type CloudState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; cloud: SightlineCloud; kind: ForecastKind; hour: string }
  | { status: 'unavailable'; reason: string }

/**
 * Cloud along this position's sightline. Opt in, per position, like ground view.
 *
 * Labelled as a FORECAST, never as a measurement, and labelled as recorded
 * weather when the date has already passed, because those are different claims.
 * The numbers come from a weather model over HTTP and the arithmetic over them
 * from src/core/cloud.ts. No language model is asked, and none would be: a guess
 * shaped like a forecast is the kind of plausible fiction this tool exists to
 * avoid.
 */
function CloudPanel({
  planned,
  shootAt,
  timeZone,
}: {
  planned: PlannedPosition
  shootAt: Date | null
  timeZone: string | null
}) {
  const [state, setState] = useState<CloudState>({ status: 'idle' })

  if (shootAt === null || timeZone === null) return null

  /*
   * A position sitting ON the subject has no bearing to look down: bearingBetween
   * of two identical points is an arbitrary number. Sampling cloud along it would
   * return five real forecasts for a direction nobody is facing, which is a
   * confident answer to a question that was never asked. Same reasoning as the
   * coverage arithmetic in src/core/coverage.ts.
   */
  if (planned.subjectRangeMeters < MIN_BEARING_RANGE_METERS) {
    return (
      <p className="cloud__note">
        This position sits on the subject, so there is no sightline to sample cloud
        along. Move it off the subject to check the sky downrange.
      </p>
    )
  }

  const load = () => {
    setState({ status: 'loading' })
    fetchSightlineCloud(
      [{ id: planned.position.id, from: planned.position.at, bearing: planned.cameraBearing }],
      shootAt,
      timeZone,
    ).then((result) => {
      if (result.status !== 'ok') {
        setState({ status: 'unavailable', reason: result.reason })
        return
      }
      const line = result.sightlines.find((s) => s.id === planned.position.id)
      if (line === undefined) {
        setState({ status: 'unavailable', reason: 'No forecast came back for this position.' })
        return
      }
      setState({ status: 'ok', cloud: line.cloud, kind: result.kind, hour: result.hour })
    })
  }

  if (state.status === 'idle') {
    return (
      <button type="button" className="btn btn--small" onClick={load}>
        Cloud along the sightline
      </button>
    )
  }

  if (state.status === 'loading') {
    return <p className="cloud__note">Checking cloud downrange…</p>
  }

  if (state.status === 'unavailable') {
    return <p className="cloud__note">{state.reason}</p>
  }

  const { cloud, kind, hour } = state

  return (
    <div className="cloud">
      <p className="cloud__head">
        <span className="cloud__label">Sightline cloud</span>
        <span className="cloud__verdict">{cloud.verdict}</span>
      </p>

      {/*
        * Low cloud on its own line, because it is the layer that decides whether
        * a low sun arrives at all. Mid and high sit underneath as context.
        */}
      <p className="cloud__low">
        <span className="cloud__low-label">Low cloud, worst</span>
        <span className="num">{Math.round(cloud.worstLow)}%</span>
        {cloud.worstLowAtKm === null ? null : (
          <span className="cloud__at num">at {cloud.worstLowAtKm}km</span>
        )}
      </p>

      <ol className="cloud__samples">
        {cloud.samples.map((sample) => (
          <li className="cloud__sample" key={sample.distanceKm}>
            <span className="cloud__km num">{sample.distanceKm}km</span>
            <span className="cloud__layer num">{Math.round(sample.low)}</span>
            <span className="cloud__layer cloud__layer--soft num">{Math.round(sample.mid)}</span>
            <span className="cloud__layer cloud__layer--soft num">{Math.round(sample.high)}</span>
          </li>
        ))}
      </ol>
      <p className="cloud__legend">
        Low · mid · high, percent, sampled along the camera bearing.
      </p>

      <p className="cloud__note">
        {kind === 'forecast'
          ? 'Forecast for'
          : 'Recorded weather for'}{' '}
        <span className="num">{hour.replace('T', ' ')}</span> venue local, from
        Open-Meteo. A forecast is a prediction, not a measurement, and cloud at 40km
        moves.
      </p>
    </div>
  )
}

/**
 * The card behind a figure. Every number on it was computed by src/core/ from
 * the position's coordinates. The shot text is the only part a model will ever
 * supply, and it says nothing about light.
 */
export function PositionCard({
  planned,
  shootAt,
  timeZone,
  tide,
  onClose,
}: PositionCardProps) {
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

      {/*
        * Tide, as a number and a direction and nothing else.
        *
        * Deliberately NOT a judgement about whether this spot is walkable. That
        * depends on mud, rip-rap and fences that nothing in this app can see, and
        * the shooter is the one who will be standing there. Computed in
        * src/core/tide.ts from NOAA predictions; never from the model.
        */}
      {tide === null ? null : (
        <p className="card__tide">
          <span className="card__tide-label">Tide</span>
          <span className="num">
            {tide.feet.toFixed(1)}ft · {feetToMetres(tide.feet).toFixed(2)}m
          </span>
          <span className="card__tide-dir">
            {tide.direction === 'slack' ? 'near slack' : tide.direction}
          </span>
        </p>
      )}

      <CloudPanel planned={planned} shootAt={shootAt} timeZone={timeZone} />

      {position.platform === 'air' ? null : <GroundViewPanel planned={planned} />}
    </aside>
  )
}
