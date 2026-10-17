import type { KitProfile } from '../core/kit.ts'
import { kitRowOrder } from '../core/kitOrder.ts'
import type { PlatformFilter } from '../core/platformFilter.ts'
import { toggleId, type KitSelection } from '../lib/kitSelection.ts'

interface KitChipsProps {
  /** Which platform the chips packed for, which decides what leads the row. */
  platform: PlatformFilter
  value: KitSelection
  onChange: (next: KitSelection) => void
  /** The shooter's own gear. Chips are drawn from this, not from a constant. */
  kit: KitProfile
  onEdit: () => void
}

/**
 * The whole kit as one scrolling row of chips.
 *
 * THE SHOOTER KNOWS THEIR OWN GEAR. The full panel listed every body and lens
 * with its focal range, its forced crop and its vertical field of view, which is
 * reference material for someone choosing a lens to buy, not for someone
 * deciding what is in the bag this morning. Tap to include, tap to drop; the
 * detail moves behind "edit kit" for the day it is actually wanted.
 */
export function KitChips({ value, onChange, kit, onEdit, platform }: KitChipsProps) {
  const chip = (
    id: string,
    label: string,
    on: boolean,
    toggle: () => void,
  ) => (
    <button
      key={id}
      type="button"
      className={`kitchip${on ? ' kitchip--on' : ''}`}
      aria-pressed={on}
      onClick={toggle}
    >
      {label}
    </button>
  )

  return (
    <div className="kitrow">
      <div className="kitrow__head">
        <span className="kitrow__label">Kit</span>
        <button type="button" className="kitrow__edit" onClick={onEdit}>
          Edit kit
        </button>
      </div>
      {/*
        * WHATEVER THE CHIP PACKED LEADS. The row used to be in profile order
        * always, which is a fact about the file and not about the shoot: on a
        * drone shoot the one thing coming was the last thing shown and off the
        * right edge. See src/core/kitOrder.ts.
        */}
      <div className="kitrow__scroll" role="group" aria-label="Kit in play">
        {kitRowOrder(platform, kit).map((entry) => {
          const ids =
            entry.kind === 'body' ? value.bodyIds : entry.kind === 'lens' ? value.lensIds : value.droneIds
          const key =
            entry.kind === 'body' ? 'bodyIds' : entry.kind === 'lens' ? 'lensIds' : 'droneIds'
          const label = entry.name.replace(/^(Sony|Sigma|DJI) /, '')
          return chip(entry.id, label, ids.includes(entry.id), () =>
            onChange({ ...value, [key]: toggleId(ids, entry.id) }),
          )
        })}
      </div>
    </div>
  )
}
