import { useState } from 'react'
import { DEFAULT_KIT } from '../core/kit.ts'
import type { PlannedPosition } from '../lib/plan.ts'

export type ConeMode = 'none' | 'all'

interface ConePickerProps {
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
 * Cones and lens filtering, behind ONE control.
 *
 * WHAT THIS REPLACED. A permanent horizontally scrolling row of chips pinned
 * above the scrubber: one chip for cones, one per optic in the plan, plus a
 * clear. It was the full width of the phone, it was always there whether or not
 * anyone was filtering, and with the scrubber and the mode rail under it, three
 * stacked bars were taking the bottom third of a map that is supposed to be the
 * hero.
 *
 * NOTHING WAS DROPPED. Every toggle is still here, still multi select, and the
 * button still says when a filter is on, because a filter that hides positions
 * without saying so is how someone walks past the shot.
 */
export function ConePicker({
  plan,
  coneMode,
  onConeMode,
  lensFilters,
  onLensFilters,
  isolatedId,
  onClearIsolate,
}: ConePickerProps) {
  const [open, setOpen] = useState(false)

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

  /*
   * The label carries the state. "Cones" with nothing on, the count when a lens
   * filter is hiding positions, "Isolated" when one position is alone on the
   * map. The control is lit in the same cases, so a narrowed map is legible
   * without opening anything.
   */
  const active = isolatedId !== null || filtering || coneMode === 'all'
  const label =
    isolatedId !== null
      ? 'Isolated'
      : filtering
        ? `Lenses · ${lensFilters.length}`
        : coneMode === 'all'
          ? 'Cones on'
          : 'Cones'

  return (
    <div className="picker">
      <button
        type="button"
        className={`mode${active ? ' mode--on' : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>

      {!open ? null : (
        <div className="picker__menu" role="group" aria-label="Cones and lens filters">
          {isolatedId === null ? (
            <button
              type="button"
              className={`picker__item${coneMode === 'all' ? ' picker__item--on' : ''}`}
              aria-pressed={coneMode === 'all'}
              onClick={() => onConeMode(coneMode === 'all' ? 'none' : 'all')}
            >
              Show every cone
            </button>
          ) : (
            <button
              type="button"
              className="picker__item picker__item--on"
              onClick={() => {
                onClearIsolate()
                setOpen(false)
              }}
            >
              Isolated · show all positions
            </button>
          )}

          <p className="picker__label">Lenses</p>
          {opticIds.map((id) => {
            const on = lensFilters.includes(id)
            return (
              <button
                key={id}
                type="button"
                className={`picker__item${on ? ' picker__item--on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(id)}
              >
                {opticName(id)}
              </button>
            )
          })}

          {!filtering ? null : (
            <button
              type="button"
              className="picker__clear"
              onClick={() => onLensFilters([])}
            >
              Clear {lensFilters.length}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
