import { useLayoutEffect, useRef, useState } from 'react'
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
  /*
   * ONE ROW, FOR SETUP'S STEP 3. The card there is a third of the screen, and
   * nine chips wrap to three rows (149 px on 28 Oct, which cut the card's
   * bottom off). As many chips as fit, then "+N" for the rest, which opens
   * the kit: no row that scrolls sideways, no chip hidden without saying so.
   */
  oneRow?: boolean
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
export function KitChips({ value, onChange, kit, onEdit, platform, oneRow = false }: KitChipsProps) {
  const row = useRef<HTMLDivElement | null>(null)
  const entries = kitRowOrder(platform, kit)
  /* How many chips fit before the "+N" chip; all of them until measured. */
  const [fits, setFits] = useState(entries.length)
  useLayoutEffect(() => {
    if (!oneRow || row.current === null) return
    const box = row.current
    const measure = () => {
      /*
       * Widths, summed: every chip stays laid out (the ones that do not fit
       * are invisible and pushed after "+N"), so a wider screen brings them
       * back without a second render to find out.
       */
      const chips = [...box.querySelectorAll<HTMLElement>('[data-kitchip]')]
      const room = box.clientWidth
      const gap = Number.parseFloat(getComputedStyle(box).columnGap) || 0
      /* Room kept for the "+N" chip, which is short: "+9". */
      const more = 52 + gap
      let n = 0
      let used = 0
      for (const [i, c] of chips.entries()) {
        used += (i === 0 ? 0 : gap) + c.offsetWidth
        const needMore = i < chips.length - 1
        if (used <= room - (needMore ? more : 0)) n = i + 1
        else break
      }
      setFits((was) => (was === n ? was : n))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    return () => watch.disconnect()
  }, [oneRow, entries.length, platform])
  const chip = (
    id: string,
    label: string,
    on: boolean,
    toggle: () => void,
  ) => (
    <button
      key={id}
      type="button"
      data-kitchip=""
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
      <div ref={row} className={`kitrow__scroll${oneRow ? ' kitrow__scroll--one' : ''}`} role="group" aria-label="Kit in play">
        {entries.map((entry, i) => {
          const ids =
            entry.kind === 'body' ? value.bodyIds : entry.kind === 'lens' ? value.lensIds : value.droneIds
          const key =
            entry.kind === 'body' ? 'bodyIds' : entry.kind === 'lens' ? 'lensIds' : 'droneIds'
          const label = entry.name.replace(/^(Sony|Sigma|DJI) /, '')
          const one = chip(entry.id, label, ids.includes(entry.id), () =>
            onChange({ ...value, [key]: toggleId(ids, entry.id) }),
          )
          return oneRow && i >= fits ? (
            /* Laid out so it can be measured, never seen or reached. */
            <span key={entry.id} className="kitrow__spare" aria-hidden="true">
              {one}
            </span>
          ) : (
            one
          )
        })}
        {oneRow && fits < entries.length ? (
          <button type="button" className="kitchip kitchip--more" onClick={onEdit} aria-label={`${entries.length - fits} more in your kit`}>
            +{entries.length - fits}
          </button>
        ) : null}
      </div>
    </div>
  )
}
