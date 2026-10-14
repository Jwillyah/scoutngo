import {
  PLATFORM_FILTER_LABEL,
  PLATFORM_FILTERS,
  type Platform,
  type PlatformFilter as Filter,
} from '../core/platformFilter.ts'

interface PlatformFilterProps {
  value: Filter
  onChange: (next: Filter) => void
  /** How many of each are in the plan, so an empty tab says it is empty. */
  counts: Record<Platform, number>
  /** How many the current choice is hiding. Zero on Both. */
  hidden: number
  /** False when no drone is in the kit, which makes Air meaningless. */
  airAvailable: boolean
}

/**
 * GROUND, AIR, BOTH. Three segments, and the one choice behind them decides
 * both what the map shows and what a generate asks for.
 *
 * IT SAYS WHAT IT IS HIDING. A filter that quietly removes four positions is
 * how somebody walks out of the house with most of the day missing from the
 * plan, so the count sits under the control whenever it is not zero. The same
 * reason the segments carry their own counts: a tab that turns out to be empty
 * should look empty before it is tapped.
 */
export function PlatformFilter({
  value,
  onChange,
  counts,
  hidden,
  airAvailable,
}: PlatformFilterProps) {
  const countFor = (filter: Filter): number | null => {
    if (filter === 'ground') return counts.ground
    if (filter === 'air') return counts.air
    return null
  }

  return (
    <div className="plat">
      <div className="plat__seg" role="group" aria-label="Show ground or air positions">
        {PLATFORM_FILTERS.map((filter) => {
          const count = countFor(filter)
          /*
           * Air with no drone in the kit is not a choice, it is a dead end: no
           * position can ever be air, so the segment is disabled rather than
           * offering a tab that can only ever be empty.
           */
          const dead = filter === 'air' && !airAvailable
          return (
            <button
              key={filter}
              type="button"
              className={`plat__btn${value === filter ? ' plat__btn--on' : ''}`}
              aria-pressed={value === filter}
              disabled={dead}
              title={dead ? 'No drone in the kit.' : undefined}
              onClick={() => onChange(filter)}
            >
              <span className="plat__label">{PLATFORM_FILTER_LABEL[filter]}</span>
              {count === null ? null : <span className="plat__n num">{count}</span>}
            </button>
          )
        })}
      </div>

      {hidden === 0 ? null : (
        <p className="plat__hidden" role="status">
          {hidden} {hidden === 1 ? 'position' : 'positions'} hidden
        </p>
      )}
    </div>
  )
}
