import { Receipt } from '../lib/numerals.tsx'
import { useEffect, useRef, useState } from 'react'
import { awayLabel, compassPoint, lightingChange, walkTo } from '../core/field.ts'
import { cameraBearingOf } from '../core/shotType.ts'
import type { FramingWarning } from '../core/fov.ts'
import { classificationOf, type LightingRead } from '../core/lighting.ts'
import type { SiteWarning } from '../core/siting.ts'
import { feetToMetres, type TideState } from '../core/tide.ts'
import type { GeoState } from '../lib/useGeolocation.ts'
import { fetchGroundView, type GroundView } from '../lib/groundView.ts'
import { lightLine } from '../lib/lightCopy.ts'
import type { PlannedPosition } from '../lib/plan.ts'

interface FieldCardProps {
  planned: PlannedPosition
  /** Lighting recomputed from the CURRENT clock, not the scrubbed one. */
  /**
   * What is true about the light RIGHT NOW, recomputed from the position's own
   * aim. A framed read carries a class; a top-down and a 360 do not have one.
   */
  readNow: LightingRead
  /** Tide at the current clock. Null inland or outside the predicted day. */
  tideNow: TideState | null
  gps: GeoState
  /**
   * The ground view from the field pack, when one was prepared for this plan.
   * Present means no network is needed; absent falls back to a lazy fetch.
   */
  cachedImage?: string
  /** Only the visible card fetches its photo. */
  active: boolean
  index: number
  total: number
}

/**
 * Where the sun is, for a read that has no lens to measure against.
 *
 * A top-down knows the shadow bearing, which is the sun's azimuth plus 180, so
 * it is turned back rather than recomputed from scratch. A 360 carries the
 * azimuth directly.
 */
function sunBearingOf(read: LightingRead): number {
  if (read.shotType === 'orbit') return read.sunBearing
  if (read.shotType === 'top-down') return (read.shadowBearing + 180) % 360
  return read.lighting.cameraBearing
}

const WARNING_COPY: Record<SiteWarning, string> = {
  'in-water': 'In water',
  'in-roadway': 'In a roadway',
  'over-structure': 'Path crosses people',
}

const FRAMING_COPY: Record<FramingWarning, string> = {
  'frame-wider-than-subject': 'The frame is much wider than the subject.',
  'beyond-standoff': 'Too far out',
}

/*
 * Same split as the plan screen: beyond-standoff is a hazard, a wide frame is
 * a note. See the note in src/core/fov.ts for why.
 */
const FRAMING_SEVERITY: Record<FramingWarning, 'hazard' | 'note'> = {
  'frame-wider-than-subject': 'note',
  'beyond-standoff': 'hazard',
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
  readNow,
  tideNow,
  gps,
  cachedImage,
  active,
  index,
  total,
}: FieldCardProps) {
  const { position, fov, subjectRangeMeters, warnings, framingWarnings } = planned
  /*
   * STREET VIEW NEEDS A DIRECTION TO LOOK, so only a framed position has one.
   * Null for a top-down and a 360, and the fetch below does not run.
   */
  const cameraBearing = cameraBearingOf(planned.aim)
  const [view, setView] = useState<GroundView>(() =>
    cachedImage === undefined
      ? { status: 'idle' }
      : { status: 'ok', image: cachedImage },
  )
  const requested = useRef(cachedImage !== undefined)

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
    // A packed image is already in state, so nothing is fetched.
    if (!active || requested.current || cameraBearing === null) return
    requested.current = true
    fetchGroundView(position.at, cameraBearing, fov.hFOV).then(setView)
  }, [active, position.at, cameraBearing, fov.hFOV])

  /*
   * A LIGHTING SHIFT ONLY EXISTS WHERE A CLASS DOES. classificationOf returns
   * null for a top-down and a 360, and lightingChange is only asked when both
   * sides have one, so nothing compares a class against an absent one.
   */
  const now = lightLine(readNow)
  const plannedClass = classificationOf(planned.read)
  const nowClass = classificationOf(readNow)
  const shift =
    plannedClass === null || nowClass === null ? null : lightingChange(plannedClass, nowClass)
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

      {[
        ...warnings.map((w) => ({ text: WARNING_COPY[w], severity: 'hazard' as const })),
        ...framingWarnings.map((w) => ({
          text: FRAMING_COPY[w],
          severity: FRAMING_SEVERITY[w],
        })),
      ].map(({ text, severity }) => (
        <p className={severity === 'hazard' ? 'fc__warn' : 'fc__note'} key={text}>
          {text}
        </p>
      ))}

      {/*
        * Where to point. Static bearing: no needle, no permission, no drift.
        *
        * ONLY WHERE THERE IS A DIRECTION TO POINT. A top-down points at the
        * ground and a 360 points everywhere, so instead of a bearing they get
        * the sentence that says what the camera is doing. Printing "0 degrees
        * N" over a nadir shot would be an instruction to do the wrong thing.
        */}
      <section className="fc__block">
        <p className="fc__label">Point the camera</p>
        {cameraBearing === null ? (
          <p className="fc__aimnone">
            {planned.aim.shotType === 'top-down'
              ? 'Straight down.'
              : 'Everywhere. It is a 360.'}
            {planned.aim.shotType === 'top-down' ? (
              <Receipt kind="bearing">
                {' '}
                Frame turned to {Math.round(planned.position.yawDegrees)}°.
              </Receipt>
            ) : null}
          </p>
        ) : (
          <p className="fc__aim num">
            {/*
              * THE WORD SURVIVES, THE DEGREES DO NOT. "WSW" is what you turn
              * the camera to while holding it; the 254 is the receipt for it.
              * Dropping both would leave this block saying "Point the camera"
              * and nothing else, which is the failure the quiet switch has to
              * avoid.
              */}
            <Receipt kind="bearing">{Math.round(cameraBearing)}° </Receipt>
            {compassPoint(cameraBearing)}
          </p>
        )}
      </section>

      {/*
        * Where to walk, from the phone's own fix.
        *
        * ONLY WHILE WALKING IS THE QUESTION. Opening this at home showed
        * "9011m" and a compass bearing, which is true and useless: a straight
        * line across a county, through buildings and a river. Past
        * TOO_FAR_TO_WALK_METERS the card says how far away you are and stops
        * talking, because a bearing you cannot act on is noise beside the
        * numbers you can.
        */}
      <section className="fc__block">
        <p className="fc__label">{walk?.farAway === true ? 'Distance' : 'Walk to here'}</p>
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
        ) : walk.farAway ? (
          <p className="fc__walk num">You are {awayLabel(walk.meters)} away</p>
        ) : (
          <p className="fc__walk num">
            {/* The distance is the thing you act on and always stays. */}
            {Math.round(walk.meters)}m ·{' '}
            <Receipt kind="bearing">{Math.round(walk.bearing)}° </Receipt>
            {walk.compass}
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
        {/*
          * ONE OF THREE READS, chosen by the shot type. A framed position gets
          * the classification it always got; a top-down gets shadow direction
          * and length, which is the whole read on a nadir shot; a 360 gets
          * where the sun sits on the ring. Worded in src/lib/lightCopy.ts.
          */}
        <p className={`fc__light fc__light--${now.tone}`}>{now.word}</p>
        {now.hasClass ? null : <p className="fc__lightwhy">{now.phrase}</p>}
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
        {/* "Off the lens" needs a lens direction, so only a framed shot has it. */}
        {readNow.shotType === 'framed'
          ? `Sun ${Math.round(readNow.lighting.delta)}° off the lens`
          : `Sun ${Math.round(sunBearingOf(readNow))}°`}
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
            alt={`Street View looking ${Math.round(cameraBearing ?? 0)} degrees from position ${position.number}`}
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
