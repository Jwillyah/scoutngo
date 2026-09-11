import type { FramingWarning } from '../core/fov.ts'
import type { SiteWarning } from '../core/siting.ts'
import type { PlanCoverage, PlannedPosition } from '../lib/plan.ts'
import { CoverageNotice } from './CoverageNotice.tsx'

interface ShotListProps {
  plan: PlannedPosition[]
  /** Coverage across the WHOLE plan, not just the filtered rows below. */
  planCoverage: PlanCoverage | null
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
export function ShotList({ plan, planCoverage, selectedId, onPick }: ShotListProps) {
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
