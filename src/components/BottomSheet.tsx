import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/*
 * THREE DETENTS, AND IT IS THE ONLY SURFACE OVER THE MAP.
 *
 * WHAT THIS REPLACES. Two stops, plus four other things that floated over the
 * map independently: the hazard editor, the sky key, the layers list and the
 * position card. Each had its own absolute positioning, its own bottom offset
 * arithmetic against the live sheet height, and its own exclusion rule. Three
 * separate bugs came out of that arithmetic and the panel audit grew a
 * hand-written list of elements a panel must not cover, assembled from
 * whichever ones had gone wrong so far.
 *
 * One surface has no exclusion rules to get wrong. There is nothing to keep
 * apart.
 *
 *   PEEK   the shoot line and the time scrubber. Nothing else.
 *   HALF   adds the positions list, or the selected position's card.
 *   FULL   adds every section: conditions, sun when, layers, hazards, sky.
 *
 * IT OPENS AT PEEK and never raises itself past where the shooter left it.
 * The one programmatic move allowed is PEEK to HALF when a position is
 * tapped, because a card at peek is a card nobody can read; see raiseToHalf
 * in PlanMode. Nothing lowers it, ever.
 */
import { SHEET_DETENTS, type SheetDetent } from '../core/sheetDetent.ts'

export type { SheetDetent }

/*
 * 88 CSS px, which is the 88pt asked for: the shoot line and the scrubber and
 * no more. It was 176 when the peek carried a summary, a primary button and a
 * secondary row; those moved into the positions list at HALF, which is where
 * the thing they act on lives.
 */
const PEEK_PX = 88
const HALF_FRACTION = 0.45
const FULL_FRACTION = 0.92

/** How far past a detent a drag may stretch before it stops following. */
const RUBBER_BAND_PX = 64

function heightFor(detent: SheetDetent, viewport: number): number {
  if (detent === 'peek') return PEEK_PX
  return viewport * (detent === 'half' ? HALF_FRACTION : FULL_FRACTION)
}

function nearestDetent(height: number, viewport: number): SheetDetent {
  return SHEET_DETENTS.reduce((best, stop) =>
    Math.abs(heightFor(stop, viewport) - height) < Math.abs(heightFor(best, viewport) - height)
      ? stop
      : best,
  )
}

/**
 * Resistance past the ends.
 *
 * Without it a drag below PEEK or above FULL either stops dead, which feels
 * like a broken gesture, or keeps following, which lets the sheet leave the
 * screen. The square root is the usual shape: it moves, it clearly resists,
 * and it cannot travel more than RUBBER_BAND_PX however hard it is pulled.
 */
function rubberBand(height: number, min: number, max: number): number {
  if (height < min) return min - Math.min(RUBBER_BAND_PX, Math.sqrt(min - height) * 8)
  if (height > max) return max + Math.min(RUBBER_BAND_PX, Math.sqrt(height - max) * 8)
  return height
}

interface BottomSheetProps {
  detent: SheetDetent
  onDetentChange: (next: SheetDetent) => void
  /** Always visible, at every detent. */
  peek: ReactNode
  /** Added at HALF and FULL. */
  half: ReactNode
  /** Added at FULL only. The stacked sections, in one scroll. */
  full: ReactNode
  /** Reports the live height so the map can keep its content above the sheet. */
  onHeightChange?: (height: number) => void
  /** Space taken by the fixed nav rail underneath, excluded from every stop. */
  reservedBottom?: number
}

export function BottomSheet({
  detent,
  onDetentChange,
  peek,
  half,
  full,
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

  /*
   * THE DETENT IS THE PROP, so a re-render cannot change it: the height is
   * derived from it every time rather than held anywhere. The only local state
   * is the live drag, which is null except between pointerdown and pointerup.
   */
  const height = dragHeight ?? heightFor(detent, viewport)

  useEffect(() => {
    onHeightChange?.(height)
  }, [height, onHeightChange])

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      drag.current = { startY: event.clientY, startHeight: heightFor(detent, viewport) }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [detent, viewport],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (drag.current === null) return
      const raw = drag.current.startHeight + (drag.current.startY - event.clientY)
      setDragHeight(rubberBand(raw, PEEK_PX, viewport * FULL_FRACTION))
    },
    [viewport],
  )

  const endDrag = useCallback(() => {
    if (drag.current === null) return
    const settled = dragHeight
    drag.current = null
    setDragHeight(null)
    if (settled !== null) onDetentChange(nearestDetent(settled, viewport))
  }, [dragHeight, onDetentChange, viewport])

  /** Tapping the grabber steps up, and wraps from the top back to peek. */
  const step = () => {
    const index = SHEET_DETENTS.indexOf(detent)
    onDetentChange(SHEET_DETENTS[(index + 1) % SHEET_DETENTS.length])
  }

  return (
    <section
      className={`sheet sheet--${detent}${dragHeight === null ? '' : ' sheet--dragging'}`}
      style={{ height: `${height}px` }}
      aria-label="Shoot setup"
      data-detent={detent}
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
          aria-label={`Sheet is ${detent}. Tap to resize.`}
        >
          <span className="sheet__handle-bar" />
        </button>
      </div>

      <div className="sheet__peek">{peek}</div>

      {/*
        * ONE SCROLL for everything above peek. Half and full are the same
        * scrolling column with more in it, rather than two containers that
        * each scroll, because nested scrollers were one of the things the
        * reachability audit was built to catch.
        */}
      <div className="sheet__body" hidden={detent === 'peek'}>
        {half}
        {detent === 'full' ? full : null}
      </div>
    </section>
  )
}
