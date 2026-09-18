import { useEffect, useRef, useState } from 'react'
import { compassPoint, lightingChange, walkTo } from '../core/field.ts'
import type { FramingWarning } from '../core/fov.ts'
import type { Classification, LightingResult } from '../core/lighting.ts'
import type { SiteWarning } from '../core/siting.ts'
import { feetToMetres, type TideState } from '../core/tide.ts'
import type { GeoState } from '../lib/useGeolocation.ts'
import { fetchGroundView, type GroundView } from '../lib/groundView.ts'
import type { PlannedPosition } from '../lib/plan.ts'

interface FieldCardProps {
  planned: PlannedPosition
  /** Lighting recomputed from the CURRENT clock, not the scrubbed one. */
  lightingNow: LightingResult
  /** Tide at the current clock. Null inland or outside the predicted day. */
  tideNow: TideState | null
  gps: GeoState
  /** Only the visible card fetches its photo. */
  active: boolean
  index: number
  total: number
}

const LIGHTING_COPY: Record<Classification, string> = {
  backlit: 'Into the sun',
  'front-lit': 'Sun behind you',
  'side-lit': 'Sun across',
}

const WARNING_COPY: Record<SiteWarning, string> = {
  'in-water': 'In water',
  'in-roadway': 'In a roadway',
  'over-structure': 'Path crosses people',
}

const FRAMING_COPY: Record<FramingWarning, string> = {
  'frame-too-wide': 'Frame too wide',
  'beyond-standoff': 'Too far out',
}

/**
 * One position, full screen, read only.
 *
 * READ AT ARM'S LENGTH, IN SUN, WHILE FLYING A DRONE. That is the whole design
 * constraint. The shot in plain words is the largest thing here, then where to
 * point, then how far to walk. Everything else is support and is deliberately
 * smaller.
 *
 * Nothing on this card can be dragged, edited or scrubbed. The numbers come from
 * the same core the map uses, recomputed at the current moment rather than at
 * whatever time the scrubber was left on.
 */
export function FieldCard({
  planned,
  lightingNow,
  tideNow,
  gps,
  active,
  index,
  total,
}: FieldCardProps) {
  const { position, fov, cameraBearing, subjectRangeMeters, warnings, framingWarnings } = planned
  const [view, setView] = useState<GroundView>({ status: 'idle' })
  const requested = useRef(false)

  /*
   * Only the card on screen fetches. Six positions eagerly fetching six Street
   * View images on entry would be slow and would send six coordinates when the
   * shooter may only ever look at one.
   *
   * State is set from the promise callback only, never synchronously inside the
   * effect. "Still idle while visible" IS the loading state, derived at render,
   * so there is no extra render just to say so.
   */
  useEffect(() => {
    if (!active || requested.current) return
    requested.current = true
    fetchGroundView(position.at, cameraBearing, fov.hFOV).then(setView)
  }, [active, position.at, cameraBearing, fov.hFOV])

  const shift = lightingChange(planned.lighting.classification, lightingNow.classification)
  const walk = gps.status === 'ok' ? walkTo(gps.at, position.at) : null

  return (
    <article className="fc" aria-label={`Position ${position.number} of ${total}`}>
      <header className="fc__head">
        <span className="fc__num num">{position.number}</span>
        <span className="fc__of num">
          {index + 1} / {total}
        </span>
        {position.platform === 'air' ? (
          <span className="fc__air num">DRONE {position.altitudeFeet}ft</span>
        ) : null}
      </header>

      {/* The largest thing on the screen. */}
      <h2 className="fc__shot">{position.shot}</h2>

      {[...warnings.map((w) => WARNING_COPY[w]), ...framingWarnings.map((w) => FRAMING_COPY[w])]
        .map((text) => (
          <p className="fc__warn" key={text}>
            {text}
          </p>
        ))}

      {/* Where to point. Static bearing: no needle, no permission, no drift. */}
      <section className="fc__block">
        <p className="fc__label">Point the camera</p>
        <p className="fc__aim num">
          {Math.round(cameraBearing)}° {compassPoint(cameraBearing)}
        </p>
      </section>

      {/* Where to walk, from the phone's own fix. */}
      <section className="fc__block">
        <p className="fc__label">Walk to here</p>
        {walk === null ? (
          <p className="fc__gps">
            {gps.status === 'locating'
              ? 'Getting a GPS fix…'
              : gps.status === 'denied'
                ? 'Location is off. Allow it to get a walk-to distance.'
                : gps.status === 'unsupported'
                  ? 'This browser has no location service.'
                  : gps.status === 'error'
                    ? gps.message
                    : ''}
          </p>
        ) : walk.arrived ? (
          <p className="fc__walk num">You are here</p>
        ) : (
          <p className="fc__walk num">
            {Math.round(walk.meters)}m · {Math.round(walk.bearing)}° {walk.compass}
          </p>
        )}
      </section>

      <dl className="fc__stats">
        <div>
          <dt>Lens</dt>
          <dd className="num">{position.focalLength}mm</dd>
        </div>
        <div>
          <dt>Range</dt>
          <dd className="num">{Math.round(subjectRangeMeters)}m</dd>
        </div>
      </dl>

      {/*
        * Light gets a full width row of its own. In a third of a 390px screen
        * "Sun behind you" wrapped onto three lines at this type size, which is
        * the opposite of readable at arm's length.
        */}
      <section className="fc__block">
        <p className="fc__label">Light now</p>
        <p className={`fc__light fc__light--${lightingNow.classification}`}>
          {LIGHTING_COPY[lightingNow.classification]}
        </p>
      </section>

      {/*
        * THE LINE THAT EARNS THIS MODE. A plan made at one moment is shot at
        * another, and the sun does not wait. Silent when nothing has moved.
        */}
      {shift === null ? null : (
        <p className="fc__shift">
          Planned {shift.planned}, now {shift.now}
        </p>
      )}

      <p className="fc__cond num">
        Sun {Math.round(lightingNow.delta)}° off the lens
        {tideNow === null
          ? ''
          : ` · tide ${tideNow.feet.toFixed(1)}ft (${feetToMetres(tideNow.feet).toFixed(1)}m) ${
              tideNow.direction === 'slack' ? 'slack' : tideNow.direction
            }`}
      </p>

      <div className="fc__ground">
        {view.status === 'ok' ? (
          <img
            className="fc__img"
            src={view.image}
            alt={`Street View looking ${Math.round(cameraBearing)} degrees from position ${position.number}`}
          />
        ) : (
          <p className="fc__gps">
            {view.status === 'idle' || view.status === 'loading'
              ? active
                ? 'Loading ground view…'
                : ''
              : view.message}
          </p>
        )}
      </div>

      {position.risk === '' ? null : <p className="fc__risk">{position.risk}</p>}
    </article>
  )
}
