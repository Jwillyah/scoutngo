import { useEffect, useState } from 'react'
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

/*
 * ONE ICON, ONE WORD, ONE PHRASE, laid over the photo.
 *
 * The glyph is how much of the subject the sun is on: a full disc front-lit, a
 * half disc side-lit, a rim backlit. It is read at a glance from the shape, and
 * the word underneath it means nobody has to.
 */
const LIGHTING: Record<string, { icon: string; word: string; phrase: string }> = {
  backlit: { icon: '○', word: 'Backlit', phrase: 'Shooting into the sun' },
  'front-lit': { icon: '●', word: 'Front-lit', phrase: 'Sun behind the camera' },
  'side-lit': { icon: '◐', word: 'Side-lit', phrase: 'Sun across the frame' },
}

const deg = (n: number) => `${n.toFixed(1)}°`

const METRES_TO_FEET = 3.28084

/** Both units on one line. The kit is metric, the airspace rules are not. */
const distance = (metres: number) =>
  `${Math.round(metres)}m · ${Math.round(metres * METRES_TO_FEET)}ft`

const feet = (metres: number) => Math.round(metres * METRES_TO_FEET).toLocaleString('en-US')

/** Rising, falling, or as near to neither as makes no difference. */
const TIDE_ARROW: Record<string, string> = { rising: '↑', falling: '↓', slack: '·' }

/** Google give "YYYY-MM". The year is the part that matters and the part to show. */
function imageryYear(date: string | undefined): string | null {
  if (date === undefined) return null
  const year = date.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : null
}

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
 * The photo slot. Real Street View imagery, or an honest statement that there
 * is none, in the same footprint either way.
 *
 * NEVER A GENERATED PICTURE: see the note in lib/groundView.ts. The entire value
 * of this tool is being right about a place the shooter has not seen, and a
 * plausible fake sightline would look exactly as convincing as a true one.
 *
 * IT LOADS WHEN THE CARD OPENS, which it did not before: it used to sit behind a
 * "Ground view" button. Opening this card is already an explicit, deliberate tap
 * on one position, and the request carries that one coordinate. The bulk case,
 * the field pack, sends EVERY position at once and stays behind its own labelled
 * press for exactly that reason.
 */
function PhotoSlot({ planned }: { planned: PlannedPosition }) {
  const { at } = planned.position
  const { cameraBearing } = planned
  const { hFOV } = planned.fov
  const air = planned.position.platform === 'air'

  /*
   * Loading is the INITIAL state, not something an effect sets on the way in.
   * This component is keyed by position id at the call site, so opening a
   * different position mounts a fresh one and the state starts correct rather
   * than being corrected by a second render.
   */
  const [view, setView] = useState<GroundView>({ status: 'loading' })

  useEffect(() => {
    if (air) return
    let live = true
    fetchGroundView(at, cameraBearing, hFOV).then((next) => {
      if (live) setView(next)
    })
    return () => {
      live = false
    }
  }, [air, at, cameraBearing, hFOV])

  const year = view.status === 'ok' ? imageryYear(view.date) : null

  return (
    <div className="frame">
      {air ? (
        <p className="frame__none">
          Flown, not walked. There is no ground view for a drone position.
        </p>
      ) : null}

      {!air && view.status === 'loading' ? (
        <p className="frame__none">Loading ground view…</p>
      ) : null}

      {view.status === 'ok' ? (
        <img
          className="frame__img"
          src={view.image}
          alt={`Street View looking ${deg(cameraBearing)} from position ${planned.position.number}`}
        />
      ) : null}

      {view.status === 'no-key' || view.status === 'no-coverage' || view.status === 'error' ? (
        <p className="frame__none">{view.message}</p>
      ) : null}

      {/* Quietly, in the corners, so neither competes with the picture. */}
      <span className="frame__num num">
        {planned.position.number}
        {planned.position.moved ? <span className="frame__moved">moved</span> : null}
      </span>
      {year === null ? null : <span className="frame__year num">{year}</span>}

      <p className={`frame__light frame__light--${planned.lighting.classification}`}>
        <span className="frame__light-icon" aria-hidden="true">
          {LIGHTING[planned.lighting.classification]?.icon}
        </span>
        <span className="frame__light-word">
          {LIGHTING[planned.lighting.classification]?.word}
        </span>
        <span className="frame__light-phrase">
          {LIGHTING[planned.lighting.classification]?.phrase}
        </span>
      </p>
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
 * The card behind a figure. PHOTO FIRST.
 *
 * WHAT THIS REPLACED. A head with a number and a title, then two warning
 * paragraphs, then a lighting tag, then a seven cell grid of degrees and metres,
 * then the rationale, then the tide, then two opt-in buttons. Everything was
 * present and nothing led: the first thing the eye landed on was a field of
 * numbers, and the picture of the actual place was a button at the bottom.
 *
 * Now the place leads, then the shot in plain words, then the three numbers you
 * act on. NOTHING WAS DELETED. Every value that used to be in that grid is still
 * on this card, under "Numbers", closed by default.
 *
 * Every number here was computed by src/core/ from the position's coordinates.
 * The shot text and the rationale are the only parts a model supplies, and
 * neither says anything about light.
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
    <aside
      className={`card card--${lighting.classification}`}
      aria-label={`Position ${position.number}`}
    >
      <button type="button" className="card__close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <PhotoSlot key={position.id} planned={planned} />

      {/* The shot in plain words, and the largest text on the card. */}
      <p className="card__shot">{position.shot}</p>

      {/*
        * Hazards stay loud and stay high. A framing problem and a site problem
        * are the same kind of fact: something is wrong with this position and
        * only the shooter can decide what to do about it.
        */}
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

      {position.platform !== 'air' ? null : (
        <p className="card__air">
          <span className="card__air-tag">Drone</span>
          <span className="num">{position.altitudeFeet} ft AGL</span>
          <span className="card__air-note">
            FAA ceiling is {FAA_CEILING_FEET} ft above ground level.
          </span>
        </p>
      )}

      {/*
        * THREE NUMBERS. What to put on the camera, how far to walk, and what the
        * water is doing while you do it. Everything else is reference and lives
        * under the disclosure below.
        *
        * Tide is DELIBERATELY NOT a judgement about whether this spot is
        * walkable. That depends on mud, rip-rap and fences that nothing in this
        * app can see, and the shooter is the one who will be standing there.
        * Computed in src/core/tide.ts from NOAA predictions; never from a model.
        */}
      <dl className={`three${tide === null ? ' three--pair' : ''}`}>
        <div className="three__cell">
          <dt className="three__label">Lens</dt>
          <dd className="three__value num">{position.focalLength}mm</dd>
        </div>
        <div className="three__cell">
          <dt className="three__label">Range</dt>
          <dd className="three__value num">
            {feet(subjectRangeMeters)}
            <span className="three__unit">ft</span>
          </dd>
        </div>
        {tide === null ? null : (
          <div className="three__cell">
            <dt className="three__label">Tide</dt>
            <dd className="three__value num">
              {tide.feet.toFixed(1)}
              <span className="three__unit">ft</span>
              <span
                className={`three__arrow three__arrow--${tide.direction}`}
                aria-label={tide.direction === 'slack' ? 'near slack' : tide.direction}
              >
                {TIDE_ARROW[tide.direction]}
              </span>
            </dd>
          </div>
        )}
      </dl>

      {/*
        * Why this vantage, and what to watch out for. Quiet, against a rule,
        * because they are the model's judgement in its own words rather than
        * anything computed. Capped at 15 words by the parser.
        */}
      {position.angleRationale === '' ? null : (
        <p className="card__why">{position.angleRationale}</p>
      )}
      {position.risk === '' ? null : <p className="card__note">{position.risk}</p>}

      {/*
        * EVERYTHING ELSE, CLOSED. Not deleted, not hidden: one tap away, in the
        * same order it was always in. These are the numbers you check when you
        * are questioning the plan, not the ones you read when you are walking
        * to the spot.
        */}
      <details className="more">
        <summary className="more__summary">Numbers</summary>
        <div className="more__body">
          <dl className="card__stats">
            <div className="card__stat">
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
            <div className="card__stat">
              <dt>Range</dt>
              <dd className="num">{distance(subjectRangeMeters)}</dd>
            </div>
            {tide === null ? null : (
              <div className="card__stat">
                <dt>Tide</dt>
                <dd className="num">
                  {tide.feet.toFixed(1)}ft · {feetToMetres(tide.feet).toFixed(2)}m
                </dd>
              </div>
            )}
          </dl>

          <CloudPanel planned={planned} shootAt={shootAt} timeZone={timeZone} />
        </div>
      </details>
    </aside>
  )
}
