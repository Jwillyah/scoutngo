import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/*
 * Two stops, not three.
 *
 * The old sheet had peek, half and full, which meant the same content could be
 * in three states while ALSO being inside an accordion inside a tab. One of
 * those three reveal mechanisms had to survive and the other two had to go: the
 * sheet survives because the map underneath has to stay visible, and it is
 * reduced to open or shut so there is nothing to learn about it.
 */
export type SheetState = 'peek' | 'open'

const PEEK_PX = 108
const OPEN_FRACTION = 0.72

/** Resolved pixel height of each stop, against the current viewport. */
function heightFor(state: SheetState, viewport: number): number {
  return state === 'peek' ? PEEK_PX : viewport * OPEN_FRACTION
}

function nearestState(height: number, viewport: number): SheetState {
  const stops: SheetState[] = ['peek', 'open']
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
 * The plan detail lives here, over the map, which stays visible at peek.
 * Dragging the grab bar snaps to whichever stop is nearer; tapping it toggles.
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
      setDragHeight(Math.min(viewport * OPEN_FRACTION, Math.max(PEEK_PX, next)))
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
    onStateChange(state === 'peek' ? 'open' : 'peek')
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
