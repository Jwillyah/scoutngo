import {
  PLATFORM_FILTER_LABEL,
  PLATFORM_FILTERS,
  type PlatformFilter,
} from '../core/platformFilter.ts'
import { SHOOT_KIND_LABEL, type ShootKind } from '../core/shootWindow.ts'

interface ShootChipsProps {
  kind: ShootKind | null
  onKind: (next: ShootKind) => void
  platform: PlatformFilter
  onPlatform: (next: PlatformFilter) => void
  /** What the chosen kind would set the window to, for the line underneath. */
  windowLine: string | null
  /** False with no drone in the kit, which makes Air a dead end. */
  airAvailable: boolean
}

/**
 * TWO ROWS OF CHIPS, AND NO MODEL CALL.
 *
 * WHAT THIS REPLACED. A text box labelled "What's the shoot?" whose answer was
 * sent to a model to extract a date, a window and a platform. That is an API
 * call, a key, a wait and a chance of being misread, all to set three things
 * that are two taps. The box is still here, demoted to the case where a model
 * earns the call: a real client brief or a pasted shot list, which is prose
 * nobody wants to retype.
 *
 * SO THE COMMON CASE NEEDS NO KEY AT ALL, which matters for an app that is
 * given away and expects people to bring their own.
 *
 * THE TWO ROWS ARE INDEPENDENT, which is the whole of a reported bug. One row
 * says WHEN: it suggests a window computed from the sun's own bands in
 * src/core/shootWindow.ts rather than guessed at. The other says WHAT IS
 * FLYING: it sets the platform filter, which decides what shows, what a
 * generate may return, and what an Add makes. Neither row gets to change the
 * other's answer. A daytime drone shoot is Daytime then Drone in either order,
 * and tapping one after the other used to leave the platform on Both and hand
 * back a ground position. See onShootKind in src/App.tsx.
 */
export function ShootChips({
  kind,
  onKind,
  platform,
  onPlatform,
  windowLine,
  airAvailable,
}: ShootChipsProps) {
  const KINDS: readonly ShootKind[] = ['sunrise', 'sunset', 'daytime']

  return (
    <div className="chips">
      <div className="chips__row" role="group" aria-label="Kind of shoot">
        {KINDS.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip${kind === option ? ' chip--on' : ''}`}
            aria-pressed={kind === option}
            onClick={() => onKind(option)}
          >
            {SHOOT_KIND_LABEL[option]}
          </button>
        ))}
      </div>

      <div className="chips__row" role="group" aria-label="Ground or drone">
        {PLATFORM_FILTERS.map((option) => {
          /*
           * Air with no drone in the kit is not a choice, it is a dead end: no
           * position could ever be an air one. Disabled rather than offered.
           */
          const dead = option === 'air' && !airAvailable
          return (
            <button
              key={option}
              type="button"
              className={`chip${platform === option ? ' chip--on' : ''}`}
              aria-pressed={platform === option}
              disabled={dead}
              title={dead ? 'No drone in the kit.' : undefined}
              onClick={() => onPlatform(option)}
            >
              {/*
                * "Drone" and "Both" read better here than the filter's own
                * "Air", which is the word used on the map where it sits beside
                * Ground in a segmented control.
                */}
              {option === 'air' ? 'Drone' : PLATFORM_FILTER_LABEL[option]}
            </button>
          )
        })}
      </div>

      {/*
        * WHAT THE CHIP DID, said rather than left to be discovered. Tapping a
        * chip moves the window fields above, and a control that silently
        * changes something else is a control you stop trusting.
        */}
      {windowLine === null ? null : <p className="chips__note">{windowLine}</p>}
    </div>
  )
}
