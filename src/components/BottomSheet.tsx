import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export type SheetState = 'peek' | 'half' | 'full'

const PEEK_PX = 108
const HALF_FRACTION = 0.5
const FULL_FRACTION = 0.92

/** Resolved pixel height of each stop, against the current viewport. */
function heightFor(state: SheetState, viewport: number): number {
  if (state === 'peek') return PEEK_PX
  return viewport * (state === 'half' ? HALF_FRACTION : FULL_FRACTION)
}

function nearestState(height: number, viewport: number): SheetState {
  const stops: SheetState[] = ['peek', 'half', 'full']
  return stops.reduce((best, stop) =>
    Math.abs(heightFor(stop, viewport) - height) < Math.abs(heightFor(best, viewport) - height)
      ? stop
      : best,
  )
}

interface BottomSheetProps {
  state: SheetState
  onStateChange: (next: SheetState) => void
  /** Always visible: the summary line and the primary action. */
  peek: ReactNode
  children: ReactNode
  /** Reports the live height so the map can keep its content above the sheet. */
  onHeightChange?: (height: number) => void
  /** Space taken by the fixed nav bar underneath, excluded from every stop. */
  reservedBottom?: number
}

/**
 * The setup form lives here, over the map. The map stays visible and
 * interactive at peek and half. Dragging the grab bar snaps to the nearest of
 * the three stops; tapping it steps up and wraps back to peek from full.
 */
export function BottomSheet({
  state,
  onStateChange,
  peek,
  children,
  onHeightChange,
  reservedBottom = 0,
}: BottomSheetProps) {
  const [rawViewport, setViewport] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  )
  const viewport = Math.max(PEEK_PX * 2, rawViewport - reservedBottom)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const height = dragHeight ?? heightFor(state, viewport)

  useEffect(() => {
    onHeightChange?.(height)
  }, [height, onHeightChange])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      drag.current = { startY: event.clientY, startHeight: heightFor(state, viewport) }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [state, viewport],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (drag.current === null) return
      const next = drag.current.startHeight + (drag.current.startY - event.clientY)
      setDragHeight(Math.min(viewport * FULL_FRACTION, Math.max(PEEK_PX, next)))
    },
    [viewport],
  )

  const endDrag = useCallback(() => {
    if (drag.current === null) return
    const settled = dragHeight
    drag.current = null
    setDragHeight(null)
    if (settled !== null) onStateChange(nearestState(settled, viewport))
  }, [dragHeight, onStateChange, viewport])

  const step = () => {
    onStateChange(state === 'peek' ? 'half' : state === 'half' ? 'full' : 'peek')
  }

  return (
    <section
      className={`sheet sheet--${state}${dragHeight === null ? '' : ' sheet--dragging'}`}
      style={{ height: `${height}px` }}
      aria-label="Shoot setup"
    >
      <div
        className="sheet__grab"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <button
          type="button"
          className="sheet__handle"
          onClick={step}
          aria-label={`Sheet is ${state}. Tap to resize.`}
        >
          <span className="sheet__handle-bar" />
        </button>
      </div>

      <div className="sheet__peek">{peek}</div>

      <div className="sheet__body" hidden={state === 'peek'}>
        {children}
      </div>
    </section>
  )
}
