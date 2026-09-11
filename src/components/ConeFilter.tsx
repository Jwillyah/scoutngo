import { DEFAULT_KIT } from '../core/kit.ts'
import type { PlannedPosition } from '../lib/plan.ts'

export type ConeMode = 'none' | 'all'

interface ConeFilterProps {
  plan: PlannedPosition[]
  coneMode: ConeMode
  onConeMode: (next: ConeMode) => void
  lensFilter: string | null
  onLensFilter: (next: string | null) => void
  isolatedId: string | null
  onClearIsolate: () => void
}

const lensName = (id: string) => DEFAULT_KIT.lenses.find((l) => l.id === id)?.name ?? id

/**
 * Six overlapping cones is unreadable. Cones start hidden after a generate and
 * come back one at a time: tap a position to isolate it, or a lens to see only
 * the positions using it.
 */
export function ConeFilter({
  plan,
  coneMode,
  onConeMode,
  lensFilter,
  onLensFilter,
  isolatedId,
  onClearIsolate,
}: ConeFilterProps) {
  if (plan.length === 0) return null

  const lensIds = [...new Set(plan.map((p) => p.position.lensId))]

  return (
    <div className="cones" role="group" aria-label="Cone filters">
      {isolatedId === null ? (
        <button
          type="button"
          className={`chip${coneMode === 'all' ? ' chip--on' : ''}`}
          aria-pressed={coneMode === 'all'}
          onClick={() => onConeMode(coneMode === 'all' ? 'none' : 'all')}
        >
          {coneMode === 'all' ? 'All cones' : 'No cones'}
        </button>
      ) : (
        <button type="button" className="chip chip--on" onClick={onClearIsolate}>
          Isolated · show all
        </button>
      )}

      {lensIds.map((id) => (
        <button
          key={id}
          type="button"
          className={`chip${lensFilter === id ? ' chip--on' : ''}`}
          aria-pressed={lensFilter === id}
          onClick={() => onLensFilter(lensFilter === id ? null : id)}
        >
          {lensName(id)}
        </button>
      ))}
    </div>
  )
}
