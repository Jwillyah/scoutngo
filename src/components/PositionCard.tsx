import { Receipt } from '../lib/numerals.tsx'
import { useEffect, useState } from 'react'
import {
  MAX_ALTITUDE_FEET,
  MIN_ALTITUDE_FEET,
  pilotSeparation,
  usesAltitude,
} from '../core/air.ts'
import type { SightlineCloud } from '../core/cloud.ts'
import { MIN_BEARING_RANGE_METERS } from '../core/coverage.ts'
import { feetToMetres, type TideState } from '../core/tide.ts'
import type { FramingWarning } from '../core/fov.ts'
import type { SiteWarning } from '../core/siting.ts'
import { fetchSightlineCloud, type ForecastKind } from '../lib/forecast.ts'
import { fetchGroundView, type GroundView } from '../lib/groundView.ts'
import type { KitProfile as KitProfileType } from '../core/kit.ts'
import { MAX_ALTITUDE_FEET as FAA_CEILING_FEET } from '../core/air.ts'
import type { LatLon } from '../core/geo.ts'
import { formatReach, metersToFeet } from '../core/reachScale.ts'
import {
  cameraBearingOf,
  PIN_ROLE,
  SHOT_TYPE_LABEL,
  SHOT_TYPES,
  type ShotType,
} from '../core/shotType.ts'
import {
  imageryAge,
  imageryNote,
  imageryYear,
  imageryYearsOld,
} from '../core/imageryAge.ts'
import { lightLine } from '../lib/lightCopy.ts'
import { focalOn, opticsFor, type OpticSelection } from '../core/optics.ts'
import { frameLine, wideFrameLine } from '../lib/framingCopy.ts'
import { blockedLine, blockerLine } from '../lib/sightlineCopy.ts'
import { groundViewAim } from '../lib/groundViewAim.ts'
import type { SiteMark } from '../core/siteMark.ts'
import type { PlannedPosition } from '../lib/plan.ts'

interface PositionCardProps {
  planned: PlannedPosition
  /** The moment the scrubber is on, and the venue's zone. Null until resolved. */
  shootAt: Date | null
  timeZone: string | null
  /** Water level and direction at the scrubbed moment. Null away from the coast. */
  tide: TideState | null
  onClose: () => void
  /** How many positions there are, so the reorder ends can be disabled. */
  count: number
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  /*
   * WHETHER ONLY THIS POSITION'S COVERAGE IS DRAWN.
   *
   * THE CONTROL WENT MISSING. It used to live in ConePicker, a disclosure
   * over the map; the shell rebuild made Layers a card of tiles and the
   * picker was never rehomed. `isolatedId` went on being threaded from App
   * through PlanMode to MapView, `onClearIsolate` went on being declared as
   * a prop, and nothing anywhere could set either -- so the feature was dead
   * with its whole wiring intact. Shape D in docs/failure-modes.md: a
   * feature that hides its own dependency, here by losing its only door.
   *
   * THE POSITION CARD IS THE RIGHT HOME. "Show only this one's coverage" is
   * a question about THIS position, and this is the card about it.
   */
  isolated: boolean
  onIsolate: (id: string | null) => void
  onMove: (id: string, delta: number) => void
  onSetOptic: (id: string, lensId: string, focalLength: number) => void
  /** The shooter's own gear. The picker lists exactly what they own. */
  kit: KitProfileType
  /** Which of that gear is packed for this shoot. Narrows the optic picker. */
  selection: OpticSelection
  /** The marked hazards, so a blocker can be named rather than numbered. */
  marks: readonly SiteMark[]
  /** The venue pin. An air position borrows its ground view from here. */
  subject: LatLon | null
  /** How high an air position flies, in feet AGL. Clamped in core. */
  onSetAltitude: (id: string, feet: number) => void
  /** What kind of shot this position is. Framed, top-down or 360. */
  onSetShotType: (id: string, shotType: ShotType) => void
  /** Which way a top-down's rectangle is turned. Never a camera bearing. */
  onSetYaw: (id: string, degrees: number) => void
  /**
   * Where the pilot is standing, or null if it has not been placed.
   *
   * Used ONLY to measure a distance. It is not a check, a clearance or a
   * permission, and nothing here decides whether a flight can happen.
   */
  pilotAt: LatLon | null
  /** Arms the map to place the pilot. */
  onPlacePilot: () => void
}

/*
 * ONE ICON, ONE WORD, ONE PHRASE, laid over the photo.
 *
 * The glyph is how much of the subject the sun is on: a full disc front-lit, a
 * half disc side-lit, a rim backlit. It is read at a glance from the shape, and
 * the word underneath it means nobody has to.
 */
/* The words themselves now live in src/lib/lightCopy.ts, shared with the shot
 * list and the field card, because there are three kinds of read to word and
 * three private copies of that switch would be three chances to print a
 * lighting class over a nadir shot. */

const deg = (n: number) => `${n.toFixed(1)}°`

/** A percentage, or a dash. NEVER a zero standing in for a missing reading. */
const pct = (n: number | null) => (n === null ? '–' : String(Math.round(n)))

/**
 * Both units on one line. The kit is metric, the airspace rules are not.
 *
 * metersToFeet from core, not a local 3.28084. This file had the FOURTH copy of
 * that constant; the other three were consolidated into reachScale.ts and this
 * one was missed because it is in a component rather than in core.
 */
const distance = (metres: number) =>
  `${Math.round(metres)}m · ${Math.round(metersToFeet(metres))}ft`

const feet = (metres: number) => Math.round(metersToFeet(metres)).toLocaleString('en-US')

/** Rising, falling, or as near to neither as makes no difference. */
const TIDE_ARROW: Record<string, string> = { rising: '↑', falling: '↓', slack: '·' }

const WARNING_COPY: Record<SiteWarning, string> = {
  'in-water': 'This position is in water. Nobody can stand here.',
  'in-roadway': 'This position is in a roadway. Check access before committing.',
  'over-structure': 'This drone path crosses buildings or a gathering area. The Air 3S is too heavy for FAA Category 1 flight over people.',
}

/**
 * TWO SEVERITIES, BECAUSE THEY ARE TWO DIFFERENT KINDS OF THING.
 *
 * beyond-standoff is a hazard and keeps the magenta: the shot will not work at
 * that distance, and on the air side the aircraft is at the edge of being seen.
 * It is also rare, firing past 450 m on the ground and 400 m in the air.
 *
 * A WIDE FRAME IS NOT A HAZARD, it is a choice, and on an aerial it is usually
 * the reason for flying. It used to be magenta on all three positions of a
 * drone shoot. "Red is for something being wrong. A wide frame is a choice."
 * So it reads as a note, and the words are a measurement rather than a verdict:
 * see src/lib/framingCopy.ts.
 */
const FRAMING_SEVERITY: Record<FramingWarning, 'hazard' | 'note'> = {
  'frame-wider-than-subject': 'note',
  'beyond-standoff': 'hazard',
}

const FRAMING_COPY: Record<FramingWarning, string> = {
  /* Said with the real numbers by framingCopy; this is the aria/no-data case. */
  'frame-wider-than-subject': 'The frame is much wider than the subject.',
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
function PhotoSlot({
  planned,
  shootAt,
  subject,
}: {
  planned: PlannedPosition
  /** The day being planned, so the imagery age is measured against it. */
  shootAt: Date | null
  /** The venue pin, which is where an air position borrows a view from. */
  subject: LatLon | null
}) {
  const { at } = planned.position
  /* Street View needs a direction to look. Only a framed shot has one. */
  const cameraBearing = cameraBearingOf(planned.aim)
  const { hFOV } = planned.fov
  const air = planned.position.platform === 'air'

  /*
   * AN AIR POSITION LOOKS AT THE SUBJECT, FROM ITS OWN SIDE.
   *
   * THE FIRST VERSION HAD THIS BACKWARDS. It stood at the venue pin and looked
   * towards the position, which at a building is a wall from ten feet away:
   * "That is backwards for what I need."
   *
   * What the aircraft is going to be looking AT is the subject, and the thing
   * that makes the picture useful is seeing the subject from the side the
   * aircraft will be on. So the camera goes where the POSITION is and points
   * at the SUBJECT, which is exactly what a ground position already does.
   *
   * THERE IS NO STREET VIEW CAR AT 200 FEET, and that was the original
   * reasoning for standing at the pin instead. It was the wrong conclusion
   * from a true fact: Street View is at ground level wherever you ask from, so
   * asking from the position's coordinate returns the nearest road imagery to
   * that spot, which is "roughly where it will be looking from". The altitude
   * was never the thing that could be honoured.
   *
   * IT STILL SAYS WHAT IT IS, every time. A photograph from a road near the
   * position, presented as the view from the aircraft, would be the same class
   * of error as the lens that was not on the aircraft.
   *
   * A TOP-DOWN AND A 360 HAVE NO CAMERA BEARING, by construction: one points
   * at the ground and the other at everything. They still get a view, aimed
   * from the position at the subject, because what is around the subject is
   * the useful part for both.
   */
  const aim = groundViewAim({ at, subject, cameraBearing, air })
  const borrowed = aim.disclose
  const viewFrom = aim.from
  const viewBearing = aim.bearing

  /*
   * Loading is the INITIAL state, not something an effect sets on the way in.
   * This component is keyed by position id at the call site, so opening a
   * different position mounts a fresh one and the state starts correct rather
   * than being corrected by a second render.
   */
  const [view, setView] = useState<GroundView>({ status: 'loading' })

  useEffect(() => {
    if (viewBearing === null) return
    let live = true
    fetchGroundView(viewFrom, viewBearing, hFOV).then((next) => {
      if (live) setView(next)
    })
    return () => {
      live = false
    }
  }, [viewFrom, viewBearing, hFOV])

  /*
   * HOW OLD THE VIEW IS, AND HOW LOUDLY TO SAY SO.
   *
   * The year was always in the corner and always looked the same, so a 2018
   * on a shot where trees were the problem read exactly like a 2026. The band
   * changes the treatment; the rule is in src/core/imageryAge.ts.
   */
  const year = view.status === 'ok' ? imageryYear(view.date) : null
  const shootYear = Number((shootAt ?? new Date()).getFullYear())
  const age = imageryAge(year, shootYear)
  const yearsOld = imageryYearsOld(year, shootYear)
  const ageNote = imageryNote(age, yearsOld)

  const line = lightLine(planned.read)

  return (
    <div className="frame">
      {air && !borrowed ? (
        <p className="frame__none">
          Flown, not walked, and there is no venue pin to aim a ground view at.
        </p>
      ) : null}

      {viewBearing !== null && view.status === 'loading' ? (
        <p className="frame__none">Loading ground view…</p>
      ) : null}

      {view.status === 'ok' ? (
        <img
          className="frame__img"
          src={view.image}
          alt={`Street View looking ${deg(cameraBearing ?? 0)} from position ${planned.position.number}`}
        />
      ) : null}

      {view.status === 'no-key' || view.status === 'no-coverage' || view.status === 'error' ? (
        <p className="frame__none">
          {view.message}
          {/*
            * WHERE "HERE" WAS. On a borrowed view the message is about the
            * venue pin, not about the position, and "no imagery at this spot"
            * would send somebody looking at the wrong coordinate.
            */}
          {/*
            * WHERE "HERE" WAS, and no substitute. "If no usable imagery
            * exists on that bearing, say so rather than showing me something
            * pointing elsewhere." So there is no second attempt from a
            * different spot: the absence is reported.
            */}
          {borrowed
            ? ' That is street level near this position. Nothing is shown from another spot instead.'
            : ''}
        </p>
      ) : null}

      {/* Quietly, in the corners, so neither competes with the picture. */}
      <span className="frame__num num">
        {planned.position.number}
        {planned.position.moved ? <span className="frame__moved">moved</span> : null}
      </span>
      {year === null ? null : (
        <span className={`frame__year num frame__year--${age}`}>{year}</span>
      )}

      {/*
        * THE TWO THINGS SAID OVER THE PICTURE, STACKED.
        *
        * Both are qualifications of the photograph, so both sit on it rather
        * than under it where they would be scrolled past, and they stack
        * rather than overlapping: a drone position on 2018 imagery has
        * something to say twice.
        *
        * WHOSE VIEW IT IS comes first, because it changes what the picture is
        * rather than how much to trust it.
        */}
      {ageNote === null && !(borrowed && view.status === 'ok') ? null : (
        <div className="frame__foot">
          {!borrowed || view.status !== 'ok' ? null : (
            <p className="frame__borrowed">
              Street level near this position, looking at the subject. Not the
              view from the aircraft.
            </p>
          )}
          {ageNote === null ? null : (
            <p className={`frame__age frame__age--${age}`}>{ageNote}</p>
          )}
        </div>
      )}



      {/*
        * THE LIGHT ROW, which is a different read per shot type and says so.
        *
        * A framed shot gets the classification it always got. The other two
        * get what IS true instead, and the phrase carries the reason there is
        * no class, because a missing classification where one used to be
        * reads as a broken app rather than as a deliberate refusal. Worded in
        * src/lib/lightCopy.ts, computed in src/core/lighting.ts.
        */}
      <p className={`frame__light frame__light--${line.tone}`}>
        <span className="frame__light-icon" aria-hidden="true">
          {line.icon}
        </span>
        <span className="frame__light-word">{line.word}</span>
        <span className="frame__light-phrase">{line.phrase}</span>
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
      /*
       * A SIGHTLINE NEEDS A DIRECTION TO LOOK ALONG. Only a framed shot has
       * one; the control that calls this is hidden for the other two.
       */
      [
        {
          id: planned.position.id,
          from: planned.position.at,
          bearing: cameraBearingOf(planned.aim) ?? 0,
        },
      ],
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
      {/*
        * A DASH FOR A MISSING READING, never a zero.
        *
        * "0%" is a forecast of clear sky; the forecast not having said is a
        * different thing and looks different. Same rule in the per-sample
        * table below.
        */}
      <p className="cloud__low">
        <span className="cloud__low-label">Low cloud, worst</span>
        <span className="num">
          {cloud.worstLow === null ? 'not forecast' : `${Math.round(cloud.worstLow)}%`}
        </span>
        {cloud.worstLowAtKm === null ? null : (
          <span className="cloud__at num">at {cloud.worstLowAtKm}km</span>
        )}
      </p>

      <ol className="cloud__samples">
        {cloud.samples.map((sample) => (
          <li className="cloud__sample" key={sample.distanceKm}>
            <span className="cloud__km num">{sample.distanceKm}km</span>
            <span className="cloud__layer num">{pct(sample.low)}</span>
            <span className="cloud__layer cloud__layer--soft num">{pct(sample.mid)}</span>
            <span className="cloud__layer cloud__layer--soft num">{pct(sample.high)}</span>
          </li>
        ))}
      </ol>
      <p className="cloud__legend">
        Low · mid · high, percent, sampled along the camera bearing. A dash is the
        forecast not saying, which is not the same as nought.
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
  count,
  onDelete,
  onDuplicate,
  isolated,
  onIsolate,
  onMove,
  onSetOptic,
  kit,
  selection,
  marks,
  subject,
  onSetAltitude,
  pilotAt,
  onPlacePilot,
  onSetShotType,
  onSetYaw,
}: PositionCardProps) {
  const {
    position,
    fov,
    read,
    subjectRangeMeters,
    frameWidthMeters,
    standoff,
    framingWarnings,
    warnings,
  } = planned

  /*
   * WHAT THIS POSITION MAY SHOOT WITH, decided by its platform. An air
   * position gets the aircraft's cameras and nothing else; a ground position
   * gets the packed glass and none of the aircraft's cameras.
   */
  const optics = opticsFor(position.platform, kit, selection, position.lensId)
  const activeOptic = optics.find((optic) => optic.id === position.lensId)
  /* "Lens" is wrong on an aircraft: the Air 3S cameras are not lenses. */
  const opticWord = position.platform === 'air' ? 'Camera' : 'Lens'

  /*
   * THE PILOT SEPARATION, COMPUTED IN CORE.
   *
   * Two numbers because they are two questions: across the ground is what you
   * pace out, and pilot-to-aircraft is the real distance, which at 400ft is
   * 122m of it before any horizontal distance at all.
   *
   * Neither is a clearance. See src/core/air.ts.
   */
  const separation =
    pilotAt === null || position.platform !== 'air'
      ? null
      : pilotSeparation(pilotAt, position.at, position.altitudeFeet)
  const pilotAcross = separation === null ? null : formatReach(separation.horizontalMeters)
  const pilotSlant = separation === null ? null : formatReach(separation.slantMeters)

  return (
    <aside
      className={`card card--${lightLine(read).tone}`}
      aria-label={`Position ${position.number}`}
    >
      <button type="button" className="card__close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <PhotoSlot key={position.id} planned={planned} shootAt={shootAt} subject={subject} />

      {/*
        * The shot in plain words, and the largest text on the card.
        *
        * A manually placed position has none until someone writes one, and that
        * is left blank rather than filled with "Position 4". An empty line here
        * is honest; a generated-looking one is not.
        */}
      {position.shot === '' ? null : <p className="card__shot">{position.shot}</p>}

      {/*
        * THE GLASS IS EDITABLE, on every position whatever placed it. Standing
        * in one spot and asking what 200mm does instead of 600mm is the common
        * question, and all of it, lighting included, recomputes from the answer.
        *
        * THE LIST COMES FROM THE PLATFORM. It used to be kit.lenses whatever
        * the position was, which is how a drone position came to read "Sigma
        * 28-75 f2.8" at 28mm: the held value was air-3s-wide, no option
        * matched it, and a select with no matching option displays its FIRST
        * one. The label lied about the position and a touch would have written
        * that lie into it. core/optics.ts answers what the platform can carry
        * and guarantees the held optic is among the options.
        */}
      <div className="optic">
        <label className="optic__field">
          <span className="optic__label">{opticWord}</span>
          <select
            className="optic__select"
            value={position.lensId}
            onChange={(event) => {
              const optic = optics.find((o) => o.id === event.target.value)
              if (optic === undefined) return
              onSetOptic(position.id, optic.id, focalOn(optic, position.focalLength))
            }}
          >
            {optics.map((optic) => (
              <option key={optic.id} value={optic.id}>
                {optic.name}
              </option>
            ))}
          </select>
        </label>
        <label className="optic__field optic__field--focal">
          <span className="optic__label">Focal</span>
          <input
            className="optic__focal num"
            type="number"
            inputMode="numeric"
            min={activeOptic?.minFocalLength ?? 1}
            max={activeOptic?.maxFocalLength ?? 2000}
            /*
             * A DRONE CAMERA IS A PRIME, so there is nothing to type: the Air
             * 3S wide is 24mm and has no other setting. Read-only beats a field
             * that accepts 45 and silently snaps back.
             */
            readOnly={activeOptic?.kind === 'drone'}
            value={position.focalLength}
            onChange={(event) => {
              const next = Number(event.target.value)
              if (!Number.isFinite(next)) return
              onSetOptic(position.id, position.lensId, next)
            }}
          />
          <span className="optic__unit">mm</span>
        </label>
      </div>

      {/*
        * WHAT KIND OF SHOT THIS IS.
        *
        * A select rather than a row of segments, so a shoot that only uses
        * framed positions gains ONE line on the card and no new chrome
        * anywhere else: no map control, no header row, nothing in the sheet.
        * A client event shoot looks as it did.
        *
        * It sits under the lens because it is the same kind of decision, about
        * what this one position is, and everything downstream recomputes from
        * it: the lighting read, the cone, and whether there is a bearing at
        * all.
        */}
      <div className="optic">
        <label className="optic__field">
          <span className="optic__label">Shot</span>
          <select
            className="optic__select"
            value={position.shotType}
            onChange={(event) => onSetShotType(position.id, event.target.value as ShotType)}
          >
            {SHOT_TYPES.map((type) => (
              <option key={type} value={type}>
                {SHOT_TYPE_LABEL[type]}
              </option>
            ))}
          </select>
        </label>

        {/*
          * YAW, only for a top-down, because only a top-down has a rectangle
          * to turn. It is NOT a camera bearing and the label does not call it
          * one: the camera points at the ground whatever this says.
          */}
        {position.shotType !== 'top-down' ? null : (
          <label className="optic__field optic__field--focal">
            <span className="optic__label">Frame</span>
            <input
              className="optic__focal num"
              type="number"
              inputMode="numeric"
              min={0}
              max={359}
              step={5}
              value={position.yawDegrees}
              aria-label="Which way the top-down frame is turned, in degrees"
              onChange={(event) => onSetYaw(position.id, Number(event.target.value))}
            />
            <span className="optic__unit">°</span>
          </label>
        )}
      </div>

      {/*
        * WHAT THE PIN IS DOING FOR THIS SHOT TYPE.
        *
        * Said only when it is not the obvious thing. For a framed shot the pin
        * is the subject and the camera is aimed at it, which the whole card
        * already says; for the other two it is a place the aircraft is, and
        * leaving that unsaid is how a pin quietly gets treated as a subject.
        */}
      {position.shotType === 'framed' ? null : (
        <p className="card__pinrole">The pin is {PIN_ROLE[position.shotType]}.</p>
      )}

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
      {/*
        * THE MEASUREMENT, ON EVERY POSITION. What this lens frames from here,
        * which is the sentence the shooter asked for and the one thing here
        * that is true without being told anything about the subject.
        */}
      <p className="card__frame">
        {frameLine(planned)}
        {wideFrameLine(planned) === null ? null : (
          <span className="card__frame-wide"> {wideFrameLine(planned)}</span>
        )}
      </p>

      {/*
        * WHAT IS MARKED IN THE WAY.
        *
        * A hazard, because a position you cannot see the subject from is a
        * position that does not work. Named and measured from the shooter's
        * own marks; see src/lib/sightlineCopy.ts.
        *
        * NOTHING IS DRAWN WHEN THE LIST IS EMPTY, deliberately. The only true
        * sentence would be "nothing is marked between here and the subject",
        * which beside a plan reads as "this is clear". It is not the same
        * claim and this app does not make the second one.
        */}
      {planned.blockedBy.length === 0 ? null : (
        <div className="card__warn card__blocked">
          <p className="card__blocked-head">{blockedLine(planned.blockedBy, marks)}</p>
          <ul className="card__blocked-list">
            {planned.blockedBy.map((blocker) => (
              <li key={blocker.markId}>{blockerLine(blocker, marks)}</li>
            ))}
          </ul>
        </div>
      )}

      {/*
        * ONLY THE HAZARDS GET THE MAGENTA BLOCK. A wide frame is said in the
        * line above, in the same type as everything else on the card, because
        * it is a measurement and not a problem.
        */}
      {framingWarnings
        .filter((warning) => FRAMING_SEVERITY[warning] === 'hazard')
        .map((warning) => (
          <p className="card__warn" key={warning}>
            {FRAMING_COPY[warning]}
          </p>
        ))}

      {!usesAltitude(position.platform, position.shotType) ? null : (
        <div className="card__air">
          <div className="card__air-row">
            {/*
              * "Drone" only when it IS one. A top-down or a 360 from the
              * ground is a mast or a tripod, and the height still sizes the
              * rectangle and the ring, so the field is there either way.
              */}
            <span className="card__air-tag">
              {position.platform === 'air' ? 'Drone' : 'Height'}
            </span>
            <label className="card__alt">
              <input
                className="card__alt-input num"
                type="number"
                inputMode="numeric"
                min={MIN_ALTITUDE_FEET}
                max={MAX_ALTITUDE_FEET}
                step={10}
                value={position.altitudeFeet}
                aria-label="Camera height, feet above ground level"
                onChange={(event) =>
                  onSetAltitude(position.id, Number(event.target.value))
                }
              />
              <span className="card__alt-unit">ft AGL</span>
            </label>
          </div>

          {/*
            * The ceiling, stated as the rule it is. It says what the limit in
            * the regulation is. It does NOT say this flight is permitted,
            * cleared or compliant: that depends on the airspace, the aircraft
            * and the operator, none of which this app knows.
            */}
          {/*
            * ONLY FOR AN AIRCRAFT. Part 107 is a rule about uncrewed
            * aircraft; printing it beside a tripod height would be an
            * aviation rule attached to something it does not govern, which is
            * its own kind of false statement. The field still stops at 400
            * either way, which is a field limit and says so.
            */}
          {position.platform !== 'air' ? null : (
            <p className="card__air-note">
              Part 107 sets the altitude limit at {FAA_CEILING_FEET} ft above ground level.
              The field stops there.
            </p>
          )}

          {/*
            * THE PILOT SEPARATION. A MEASUREMENT, NOT A CLEARANCE.
            *
            * Two numbers because they answer different questions: across the
            * ground is what you pace out, and the slant is how far away the
            * aircraft actually is, which at 400ft is 122m of it before any
            * horizontal distance at all.
            *
            * Nothing here says whether the aircraft can be seen from there or
            * whether the flight is allowed. It says how far apart two points
            * are, and the judgement is the reader's.
            */}
          {position.platform !== 'air' ? null : separation === null ||
            pilotAcross === null ||
            pilotSlant === null ? (
            <p className="card__air-note">
              <button type="button" className="card__air-place" onClick={onPlacePilot}>
                Place the pilot position
              </button>{' '}
              to measure the distance from it.
            </p>
          ) : (
            <div className="card__pilot">
              <dl className="card__pilot-pair">
                <div className="card__pilot-cell">
                  <dt>Pilot, across ground</dt>
                  <dd>
                    <span className="num">{pilotAcross.metric}</span>
                    <span className="card__pilot-alt num">{pilotAcross.imperial}</span>
                  </dd>
                </div>
                <div className="card__pilot-cell">
                  <dt>Pilot to aircraft</dt>
                  <dd>
                    <span className="num">{pilotSlant.metric}</span>
                    <span className="card__pilot-alt num">{pilotSlant.imperial}</span>
                  </dd>
                </div>
              </dl>
              <p className="card__pilot-note">
                Measured distances, nothing more. Not a statement about line of sight, and not a
                statement about whether this flight is permitted.
              </p>
            </div>
          )}
        </div>
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
        * REORDER, COPY, DELETE. The copy lands on the same spot with a fresh
        * id, which is how you compare two focal lengths from one place without
        * throwing the first away.
        */}
      <div className="cardacts">
        {/*
          * THE ARROWS SAY WHAT THEY DO.
          *
          * They were a bare up and a bare down. "They reorder positions and
          * nothing says so." An arrow on a card can mean half a dozen things
          * and a screen reader was the only thing being told which: the
          * aria-labels were right and nobody holding the phone could see them.
          *
          * The word is ORDER, which is what the number on the disc is. The
          * arrows keep their shape because the shape is what says which way,
          * and the label stops them being a guess.
          */}
        <span className="cardacts__order">
          <span className="cardacts__order-label">Order</span>
          <button
            type="button"
            className="cardacts__btn"
            onClick={() => onMove(position.id, -1)}
            disabled={position.number <= 1}
            aria-label="Move earlier in the order"
          >
            ↑
          </button>
          <span className="cardacts__order-n num">
            {position.number}/{count}
          </span>
          <button
            type="button"
            className="cardacts__btn"
            onClick={() => onMove(position.id, 1)}
            disabled={position.number >= count}
            aria-label="Move later in the order"
          >
            ↓
          </button>
        </span>
        {/*
          * ISOLATE: one cone filled, the others outlined rather than hidden.
          * Seeing what this position covers THAT THE OTHERS DO NOT is the
          * question people have when they ask for one cone.
          */}
        <button
          type="button"
          className={`cardacts__btn${isolated ? ' cardacts__btn--on' : ''}`}
          aria-pressed={isolated}
          onClick={() => onIsolate(isolated ? null : position.id)}
        >
          Only this
        </button>
        <button
          type="button"
          className="cardacts__btn cardacts__btn--wide"
          onClick={() => onDuplicate(position.id)}
        >
          Duplicate
        </button>
        <button
          type="button"
          className="cardacts__btn cardacts__btn--danger"
          onClick={() => onDelete(position.id)}
        >
          Delete
        </button>
      </div>

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
            {/*
              * CAMERA BEARING AND SUN DELTA ONLY EXIST FOR A FRAMED SHOT.
              *
              * Both are statements about where the lens points. A top-down
              * gets the shadow figures instead, which is the read that
              * matters there, and a 360 gets where the sun sits on the ring.
              * Neither gets a dash where a number used to be.
              */}
            {read.shotType === 'framed' ? (
              <>
                <Receipt kind="bearing">
                  <div className="card__stat">
                    <dt>Camera bearing</dt>
                    <dd className="num">{deg(read.lighting.cameraBearing)}</dd>
                  </div>
                  <div className="card__stat">
                    <dt>Sun delta</dt>
                    <dd className="num">{deg(read.lighting.delta)}</dd>
                  </div>
                </Receipt>
              </>
            ) : null}
            {/*
              * WHAT THE FRAME ACTUALLY COVERS ON THE GROUND, which is the
              * number a nadir shot is planned with: at 200ft the Air 3S wide
              * camera lays 91 by 61 metres on the ground. Computed in
              * src/core/footprint.ts from the altitude and the sensor.
              */}
            {planned.footprint?.shotType !== 'top-down' ? null : (
              <div className="card__stat">
                <dt>Ground covered</dt>
                <dd className="num">
                  {Math.round(planned.footprint.widthMeters)} ×{' '}
                  {Math.round(planned.footprint.heightMeters)} m
                </dd>
              </div>
            )}
            {planned.footprint?.shotType !== 'orbit' ? null : (
              <div className="card__stat">
                <dt>Horizon</dt>
                <dd className="num">
                  {(planned.footprint.horizonMeters / 1000).toFixed(1)} km
                </dd>
              </div>
            )}
            {read.shotType !== 'top-down' ? null : (
              <>
                <Receipt kind="bearing">
                  <div className="card__stat">
                    <dt>Shadow bearing</dt>
                    <dd className="num">{deg(read.shadowBearing)}</dd>
                  </div>
                </Receipt>
                <div className="card__stat">
                  <dt>Shadow length</dt>
                  <dd className="num">
                    {read.shadowLengthRatio === null
                      ? 'none'
                      : `${read.shadowLengthRatio.toFixed(1)}×`}
                  </dd>
                </div>
              </>
            )}
            {read.shotType !== 'orbit' ? null : (
              <>
                <Receipt kind="solar">
                  <div className="card__stat">
                    <dt>Sun on the ring</dt>
                    <dd className="num">{deg(read.sunBearing)}</dd>
                  </div>
                  <div className="card__stat">
                    <dt>Sun altitude</dt>
                    <dd className="num">{deg(read.sunAltitude)}</dd>
                  </div>
                </Receipt>
              </>
            )}
            <Receipt kind="focal">
              <div className="card__stat">
                <dt>FOV h</dt>
                <dd className="num">{deg(fov.hFOV)}</dd>
              </div>
              <div className="card__stat">
                <dt>FOV v</dt>
                <dd className="num">{deg(fov.vFOV)}</dd>
              </div>
            </Receipt>
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
