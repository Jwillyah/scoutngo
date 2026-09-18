import type { FramingWarning } from '../core/fov.ts'
import type { SiteWarning } from '../core/siting.ts'
import type { DesiredShot } from '../lib/describe.ts'
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
  'frame-too-wide': 'frame too wide',
  'beyond-standoff': 'too far',
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
  if (plan.length === 0) {
    return (
      <p className="empty">
        No positions yet. Set the venue and the subject point, then press Generate
        on the Plan tab.
      </p>
    )
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
        const { position, fov, lighting, warnings, framingWarnings, subjectRangeMeters } =
          planned
        return (
          <li key={position.id}>
            <button
              type="button"
              className={`shot${selectedId === position.id ? ' shot--on' : ''}`}
              onClick={() => onPick(position.id)}
            >
              <span className="shot__head">
                <span className="shot__number num">{position.number}</span>
                <span
                  className={`shot__light shot__light--${lighting.classification}`}
                >
                  {lighting.classification}
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
                  <span className="shot__warn" key={warning}>
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
                {deg(fov.vFOV)} · sun delta {deg(lighting.delta)}
              </span>

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
