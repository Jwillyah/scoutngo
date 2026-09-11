import { DEFAULT_KIT } from '../core/kit.ts'
import type { PlannedPosition } from '../lib/plan.ts'

export type ConeMode = 'none' | 'all'

interface ConeFilterProps {
  plan: PlannedPosition[]
  coneMode: ConeMode
  onConeMode: (next: ConeMode) => void
  /** Optic ids to show. EMPTY MEANS ALL, not none. */
  lensFilters: string[]
  onLensFilters: (next: string[]) => void
  isolatedId: string | null
  onClearIsolate: () => void
}

/** Ground lenses and drone cameras both land here, so look in both lists. */
function opticName(id: string): string {
  const lens = DEFAULT_KIT.lenses.find((l) => l.id === id)
  if (lens !== undefined) return lens.name
  const camera = DEFAULT_KIT.drones.flatMap((d) => d.cameras).find((c) => c.id === id)
  return camera?.name ?? id
}

/**
 * Six overlapping cones is unreadable. Cones start hidden after a generate and
 * come back on demand: tap a position to isolate it, or tap lenses to narrow the
 * markers down to the ones using them.
 *
 * The lens chips are MULTI SELECT. Comparing the 200-600 against the 75-300 means
 * seeing both at once, and single select made that impossible: picking the second
 * chip silently dropped the first. Every selected chip stays lit, and the count is
 * shown on the clear control so the filter can never be on without saying so.
 */
export function ConeFilter({
  plan,
  coneMode,
  onConeMode,
  lensFilters,
  onLensFilters,
  isolatedId,
  onClearIsolate,
}: ConeFilterProps) {
  if (plan.length === 0) return null

  const opticIds = [...new Set(plan.map((p) => p.position.lensId))]
  const filtering = lensFilters.length > 0

  const toggle = (id: string) => {
    onLensFilters(
      lensFilters.includes(id)
        ? lensFilters.filter((existing) => existing !== id)
        : [...lensFilters, id],
    )
  }

  return (
    <div className="cones" role="group" aria-label="Cone and lens filters">
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

      {!filtering ? null : (
        <button
          type="button"
          className="chip chip--clear"
          onClick={() => onLensFilters([])}
        >
          Clear {lensFilters.length}
        </button>
      )}

      {opticIds.map((id) => {
        const on = lensFilters.includes(id)
        return (
          <button
            key={id}
            type="button"
            className={`chip${on ? ' chip--on' : ''}`}
            aria-pressed={on}
            onClick={() => toggle(id)}
          >
            {opticName(id)}
          </button>
        )
      })}
    </div>
  )
}
