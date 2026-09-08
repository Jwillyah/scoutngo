import type { SiteWarning } from '../core/siting.ts'
import type { PlannedPosition } from '../lib/plan.ts'

interface ShotListProps {
  plan: PlannedPosition[]
  selectedId: string | null
  onPick: (id: string) => void
}

const deg = (n: number) => `${n.toFixed(1)}°`

const WARNING_LABEL: Record<SiteWarning, string> = {
  'in-water': 'in water',
  'in-roadway': 'in roadway',
}

/**
 * The generated positions as a list. Lighting on every row is computed by
 * src/core/lighting.ts from the position's own coordinates, not carried over
 * from anything the model said.
 */
export function ShotList({ plan, selectedId, onPick }: ShotListProps) {
  if (plan.length === 0) {
    return (
      <p className="empty">
        No positions yet. Set the venue and the subject point, then press Generate
        on the Plan tab.
      </p>
    )
  }

  return (
    <ol className="shots">
      {plan.map((planned) => {
        const { position, lens, body, fov, lighting, warnings } = planned
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
                {position.moved ? <span className="shot__moved">moved</span> : null}
                {warnings.map((warning) => (
                  <span className="shot__warn" key={warning}>
                    {WARNING_LABEL[warning]}
                  </span>
                ))}
              </span>

              <span className="shot__shot">{position.shot}</span>

              <span className="shot__gear">
                {body.name}, {lens.name}
              </span>

              <span className="shot__stats num">
                {position.focalLength}mm · vFOV {deg(fov.vFOV)} · sun delta{' '}
                {deg(lighting.delta)}
              </span>

              {position.risk === '' ? null : (
                <span className="shot__risk">{position.risk}</span>
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
