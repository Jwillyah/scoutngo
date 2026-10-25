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

/*
 * A SHEET MAY ASK FOR A TALLER PEEK. The plan sheet's peek carries the time
 * bar -- a date line and a strip of sky -- which does not fit in 88 and was
 * measured cut off at the screen edge with only its header showing.
 */
const HALF_FRACTION = 0.45
/** The least card a half sheet shows below its peek. */
const HALF_BODY_MIN_PX = 200
const FULL_FRACTION = 0.92

/** How far a drag on an axis-locked region moves before its direction decides whose it is. */
const AXIS_SLOP_PX = 8

/** How far past a detent a drag may stretch before it stops following. */
const RUBBER_BAND_PX = 64

function heightFor(detent: SheetDetent, viewport: number, peekPx: number = PEEK_PX): number {
  if (detent === 'peek') return peekPx
  /*
   * HALF LEAVES ROOM UNDER THE PEEK. With the time bar the peek is 164, and at
   * 660 tall 45% left 134 px of body, which no shot row could land in. Half is
   * never less than the peek plus HALF_BODY_MIN_PX of card, and never more
   * than full.
   */
  if (detent === 'half') {
    return Math.min(viewport * FULL_FRACTION, Math.max(viewport * HALF_FRACTION, peekPx + HALF_BODY_MIN_PX))
  }
  return viewport * FULL_FRACTION
}

function nearestDetent(height: number, viewport: number, peekPx: number): SheetDetent {
  return SHEET_DETENTS.reduce((best, stop) =>
    Math.abs(heightFor(stop, viewport, peekPx) - height) < Math.abs(heightFor(best, viewport, peekPx) - height)
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
  /** The peek's height in CSS px. Default 88: one line and a control. */
  peekPx?: number
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
  /*
   * SPACE TAKEN BY THE CHROME ABOVE, excluded from every stop as well.
   *
   * WHY THIS EXISTS. FULL is 92% of the space the sheet is allowed, and the
   * space it was allowed used to be the whole viewport minus the dock. The
   * venue bar and the chip row sit over the map at the top of the screen, so
   * the sheet at FULL grew up behind them: the pairwise surface check measured
   * the chip row sitting on 366x34px of the sheet, with the CLOUD chip's value
   * line over the card's own content.
   *
   * TAKEN FROM THE ELEMENT, NOT FROM A TOKEN. Same reason as reservedBottom:
   * the chrome's height is set by its own content, and a constant that agreed
   * with it today would be the dock-height bug again with a different element
   * the first time a venue name wrapped the chip values to two lines. The
   * height this renders at, and the sheet's top edge at each detent, are in
   * measurements/2026-10-19-shell-rebuild.md.
   *
   * AND IT KEEPS THE CHIPS USABLE AT EVERY DETENT, which is the point. The
   * rail hides itself at FULL because its controls act on a map that is no
   * longer visible; the chips are not map controls, they are how you change
   * which card you are reading, so they have to stay reachable while reading.
   */
  reservedTop?: number
}

export function BottomSheet({
  detent,
  onDetentChange,
  peek,
  peekPx = PEEK_PX,
  half,
  full,
  onHeightChange,
  reservedBottom = 0,
  reservedTop = 0,
}: BottomSheetProps) {
  const [rawViewport, setViewport] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  )
  const viewport = Math.max(PEEK_PX * 2, rawViewport - reservedBottom - reservedTop)
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const drag = useRef<{ startY: number; startHeight: number } | null>(null)
  /*
   * THE LIVE HEIGHT, IN A REF AS WELL AS IN STATE.
   *
   * endDrag used to read the STATE, which is only correct if React has
   * rendered between the last move and the release. It usually has, because a
   * real pointer delivers those in separate tasks -- but not always, and not
   * when the three events arrive in one batch. Then `dragHeight` was still
   * null at release, `settled` was null, and the drag ended with no detent
   * change at all: the sheet snapped back and nothing moved.
   *
   * The ref is written synchronously on every move, so the release always has
   * the height the finger actually ended on.
   */
  const dragHeightRef = useRef<number | null>(null)

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
  const height = dragHeight ?? heightFor(detent, viewport, peekPx)

  useEffect(() => {
    onHeightChange?.(height)
  }, [height, onHeightChange])

  /*
   * THE SHEET'S DRAG WINS, FROM ANYWHERE IN THE SHEET.
   *
   * WHAT HAPPENED. The elevation curve put a full-width range input across
   * its plot. The sheet could only be dragged by its 12px grabber, so once
   * the sheet was at HALF the chart swallowed every gesture on it and there
   * was no way back: no controls on screen, no detent change, nothing. The
   * surface audit passed that screen with zero failures, because it checked
   * that a grabber EXISTS rather than that a drag CHANGES anything.
   *
   * SO THE RULE IS THE OTHER WAY ROUND NOW. A drag starting anywhere in the
   * sheet moves the sheet, and a child has to claim the gesture explicitly to
   * keep it. One thing does: the chart's thumb, marked data-scrub. Everything
   * else -- the plot, the sections, the empty space -- drags the sheet.
   *
   * WHAT STILL DOES NOT DRAG IT:
   *
   *   a real control, because a drag that starts on a button or a select is
   *   that control's gesture and always was
   *
   *   a scroller that is not at the top, because at FULL the body scrolls and
   *   pulling the sheet down from halfway through a list is not what anyone
   *   means
   */
  /*
   * AN AXIS-LOCKED REGION: the time bar's strip, which scrubs sideways. A drag
   * that starts there is held undecided until it has moved; up or down makes
   * it the sheet's, sideways leaves it to the strip. Without this the strip
   * covered most of the peek and the sheet could only be moved by its grabber.
   */
  const pending = useRef<{ x: number; y: number; id: number; el: Element } | null>(null)

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target !== null && target.closest('[data-axis-lock]') !== null) {
        pending.current = { x: event.clientX, y: event.clientY, id: event.pointerId, el: event.currentTarget }
        return
      }
      if (target !== null) {
        /* A child that claims the gesture keeps it. */
        if (target.closest('[data-scrub]') !== null) return
        /* A real control's own gesture. */
        if (target.closest('input, select, textarea, a, [role="slider"]') !== null) return
        /* Mid-scroll in the body: that is a scroll, not a sheet drag. */
        const scroller = target.closest('.sheet__body')
        if (scroller !== null && scroller.scrollTop > 0) return
      }
      drag.current = { startY: event.clientY, startHeight: heightFor(detent, viewport, peekPx) }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [detent, viewport, peekPx],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const waiting = pending.current
      if (waiting !== null && drag.current === null) {
        const dx = Math.abs(event.clientX - waiting.x)
        const dy = Math.abs(event.clientY - waiting.y)
        if (dx > AXIS_SLOP_PX && dx >= dy) {
          pending.current = null
          return
        }
        if (dy > AXIS_SLOP_PX && dy > dx) {
          pending.current = null
          drag.current = { startY: waiting.y, startHeight: heightFor(detent, viewport, peekPx) }
          try {
            ;(waiting.el as HTMLElement).setPointerCapture(waiting.id)
          } catch {
            /* A synthetic pointer has nothing to capture; the drag still runs on bubbled moves. */
          }
        }
      }
      if (drag.current === null) return
      const raw = drag.current.startHeight + (drag.current.startY - event.clientY)
      const next = rubberBand(raw, peekPx, viewport * FULL_FRACTION)
      dragHeightRef.current = next
      setDragHeight(next)
    },
    [viewport, detent, peekPx],
  )

  const endDrag = useCallback(() => {
    pending.current = null
    if (drag.current === null) return
    const settled = dragHeightRef.current
    drag.current = null
    dragHeightRef.current = null
    setDragHeight(null)
    if (settled !== null) onDetentChange(nearestDetent(settled, viewport, peekPx))
  }, [onDetentChange, viewport, peekPx])

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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="sheet__grab">
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
