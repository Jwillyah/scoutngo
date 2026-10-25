import { Receipt } from '../lib/numerals.tsx'
import { SHOT_TYPE_LABEL } from '../core/shotType.ts'
import { lightLine } from '../lib/lightCopy.ts'
import type { FramingWarning } from '../core/fov.ts'
import type { SiteWarning } from '../core/siting.ts'
import type { DesiredShot } from '../lib/shotList.ts'
import type { PlanCoverage, PlannedPosition } from '../lib/plan.ts'
import { CoverageNotice } from './CoverageNotice.tsx'

interface ShotListProps {
  plan: PlannedPosition[]
  /** Coverage across the WHOLE plan, not just the filtered rows below. */
  planCoverage: PlanCoverage | null
  /** The pasted shot list, when there is one. Shown with what covers it. */
  desiredShots?: DesiredShot[]
  selectedId: string | null
  onPick: (id: string) => void
}

const deg = (n: number) => `${n.toFixed(1)}°`

const WARNING_LABEL: Record<SiteWarning, string> = {
  'in-water': 'in water',
  'in-roadway': 'in roadway',
  'over-structure': 'over people',
}

const FRAMING_LABEL: Record<FramingWarning, string> = {
  'frame-wider-than-subject': 'wide frame',
  'beyond-standoff': 'too far',
}

/*
 * A WIDE FRAME IS NOT A HAZARD. It used to share the magenta chip with "in
 * water" and "over people", and on a drone shoot that painted every row. Red
 * is for something being wrong; a wide frame is a choice. See the note in
 * src/core/fov.ts.
 */
const FRAMING_SEVERITY: Record<FramingWarning, 'hazard' | 'note'> = {
  'frame-wider-than-subject': 'note',
  'beyond-standoff': 'hazard',
}

/**
 * The generated positions as a list. Lighting on every row is computed by
 * src/core/lighting.ts from the position's own coordinates, not carried over
 * from anything the model said.
 */
export function ShotList({
  plan,
  planCoverage,
  desiredShots = [],
  selectedId,
  onPick,
}: ShotListProps) {
  /*
   * Which pasted shots a position claimed. Unclaimed entries are the point: a
   * list someone sent you with a gap in it is worth knowing about before the
   * day, not after.
   */
  const claimedBy = new Map<number, number>()
  for (const planned of plan) {
    const index = planned.position.coversShot
    if (index !== null && !claimedBy.has(index)) claimedBy.set(index, planned.position.number)
  }
  /*
   * THE EMPTY LINE SAID "press Generate on the Plan tab" -- while rendering
   * ON the Plan tab, under a + and a Suggest button. Directions to the screen
   * you are standing on. The two controls are directly above this line now,
   * so the line's whole job is to say the list is empty.
   */
  if (plan.length === 0) {
    return <p className="empty">No positions yet. Add one above, or ask for a plan.</p>
  }

  return (
    <>
      <CoverageNotice planCoverage={planCoverage} />

      {desiredShots.length === 0 ? null : (
        <ol className="wanted">
          {desiredShots.map((shot, index) => {
            const by = claimedBy.get(index)
            return (
              <li
                className={`wanted__row${by === undefined ? ' wanted__row--open' : ''}`}
                key={shot.id}
              >
                <span className="wanted__mark num">
                  {by === undefined ? '—' : by}
                </span>
                <span className="wanted__text">{shot.text}</span>
                <span className="wanted__state">
                  {by === undefined ? 'unclaimed' : 'covered'}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <ol className="shots">
      {plan.map((planned) => {
        const { position, fov, read, warnings, framingWarnings, subjectRangeMeters } =
          planned
        /*
         * A FRAMED SHOT SHOWS ITS CLASSIFICATION, as it always has. The other
         * two show what they are instead, in their own tone, because printing
         * "backlit" beside a 360 would be stating a direction the camera is
         * not pointing. src/lib/lightCopy.ts does the wording.
         */
        const line = lightLine(read)
        return (
          <li key={position.id}>
            <button
              type="button"
              className={`shot${selectedId === position.id ? ' shot--on' : ''}`}
              onClick={() => onPick(position.id)}
            >
              <span className="shot__head">
                <span className="shot__number num">{position.number}</span>
                <span className={`shot__light shot__light--${line.tone}`}>
                  {line.hasClass ? line.word.toLowerCase() : SHOT_TYPE_LABEL[position.shotType]}
                </span>
                {position.platform === 'air' ? (
                  <span className="shot__air num">{position.altitudeFeet}ft</span>
                ) : null}
                {position.moved ? <span className="shot__moved">moved</span> : null}
                {warnings.map((warning) => (
                  <span className="shot__warn" key={warning}>
                    {WARNING_LABEL[warning]}
                  </span>
                ))}
                {framingWarnings.map((warning) => (
                  <span
                    className={
                      FRAMING_SEVERITY[warning] === 'hazard' ? 'shot__warn' : 'shot__note'
                    }
                    key={warning}
                  >
                    {FRAMING_LABEL[warning]}
                  </span>
                ))}
              </span>

              <span className="shot__shot">{position.shot}</span>

              {position.angleRationale === '' ? null : (
                <span className="shot__why">{position.angleRationale}</span>
              )}

              <span className="shot__stats num">
                {position.focalLength}mm · {Math.round(subjectRangeMeters)}m · vFOV{' '}
                {deg(fov.vFOV)}
                {/* Sun delta needs a lens direction. Shadow length is the top-down read. */}
                {read.shotType === 'framed'
                  ? ' · sun delta'
                  : read.shotType === 'top-down'
                    ? ` · shadows ${
                        read.shadowLengthRatio === null
                          ? 'none'
                          : `${read.shadowLengthRatio.toFixed(1)}×`
                      }`
                    : ' · sun up'}
              </span>
              {/*
                * The degrees that went with those two phrases. Kept beside
                * them rather than inside the template string, so the words
                * survive the switch and only the numbers go.
                */}
              <Receipt kind="solar">
                <span className="shot__read-deg num">
                  {read.shotType === 'framed'
                    ? ` ${deg(read.lighting.delta)}`
                    : read.shotType === 'orbit'
                      ? ` ${Math.round(read.sunAltitude)}°`
                      : ''}
                </span>
              </Receipt>

              {position.risk === '' ? null : (
                <span className="shot__risk">{position.risk}</span>
              )}
            </button>
          </li>
        )
        })}
      </ol>
    </>
  )
}
