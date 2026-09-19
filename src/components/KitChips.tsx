import { DEFAULT_KIT } from '../core/kit.ts'
import { toggleId, type KitSelection } from '../lib/kitSelection.ts'

interface KitChipsProps {
  value: KitSelection
  onChange: (next: KitSelection) => void
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
export function KitChips({ value, onChange, onEdit }: KitChipsProps) {
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
      <div className="kitrow__scroll" role="group" aria-label="Kit in play">
        {DEFAULT_KIT.bodies.map((body) =>
          chip(body.id, body.name.replace('Sony ', ''), value.bodyIds.includes(body.id), () =>
            onChange({ ...value, bodyIds: toggleId(value.bodyIds, body.id) }),
          ),
        )}
        {DEFAULT_KIT.lenses.map((lens) =>
          chip(lens.id, lens.name.replace(/^(Sony|Sigma) /, ''), value.lensIds.includes(lens.id), () =>
            onChange({ ...value, lensIds: toggleId(value.lensIds, lens.id) }),
          ),
        )}
        {DEFAULT_KIT.drones.map((drone) =>
          chip(drone.id, drone.name.replace('DJI ', ''), value.droneIds.includes(drone.id), () =>
            onChange({ ...value, droneIds: toggleId(value.droneIds, drone.id) }),
          ),
        )}
      </div>
    </div>
  )
}
