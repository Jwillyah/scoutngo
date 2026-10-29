import { startTransition, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { dragAxis, VERTICAL_SLOP_ON_SIDEWAYS_PX } from '../core/sheetMotion.ts'
import { claimGesture, gestureOwner } from './gestureOwner.ts'

/*
 * A SIDEWAYS SCRUB INSIDE THE SHEET: the tide curve, the sun curve's grip.
 * The same rules as the time bar's ruler (TimeBar.tsx, docs/gestures.md):
 *
 *   - decided once, on the first pixels: sideways (8 px) is the scrub and
 *     claims the drag, so the sheet never moves with it; up or down (16 px,
 *     for a thumb's hook) is the sheet's, and the scrub lets go
 *   - a tap sets the time where it landed, when the control has a `tap`
 *   - the time goes up at most once a frame, as a transition, so a busy
 *     plan never holds the finger back
 *
 * Mark the element `data-sideways` (BottomSheet.tsx reads it) and spread
 * the handlers on it.
 */
export function useSidewaysScrub(scrub: (event: { clientX: number; target: Element }) => void, tap: boolean) {
  const drag = useRef<{ x: number; y: number; mine: boolean } | null>(null)
  const frame = useRef(0)
  const last = useRef<{ clientX: number; target: Element } | null>(null)
  const send = (e: { clientX: number; target: Element }) => {
    last.current = e
    if (frame.current !== 0) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const ev = last.current
      if (ev !== null) startTransition(() => scrub(ev))
    })
  }
  return {
    'data-sideways': '',
    onPointerDown: (event: ReactPointerEvent<Element>) => {
      drag.current = { x: event.clientX, y: event.clientY, mine: false }
    },
    onPointerMove: (event: ReactPointerEvent<Element>) => {
      const d = drag.current
      if (d === null) return
      if (!d.mine) {
        const axis = dragAxis(event.clientX - d.x, event.clientY - d.y, VERTICAL_SLOP_ON_SIDEWAYS_PX)
        if (axis === null) return
        if (axis === 'y' || (gestureOwner() !== null && gestureOwner() !== 'scrub') || !claimGesture('scrub')) {
          drag.current = null
          return
        }
        d.mine = true
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* A synthetic pointer has nothing to capture. */
        }
      }
      event.stopPropagation()
      send({ clientX: event.clientX, target: event.currentTarget })
    },
    onPointerUp: (event: ReactPointerEvent<Element>) => {
      const d = drag.current
      drag.current = null
      if (d !== null && !d.mine && tap) scrub({ clientX: event.clientX, target: event.currentTarget })
    },
    onPointerCancel: () => {
      drag.current = null
    },
  }
}
