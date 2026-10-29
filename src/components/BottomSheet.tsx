import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { SHEET_DETENTS, type SheetDetent } from '../core/sheetDetent.ts'
import { dragAxis, landing, releaseVelocity, VERTICAL_SLOP_ON_SIDEWAYS_PX } from '../core/sheetMotion.ts'
import { claimGesture, gestureOwner, startGesture } from '../lib/gestureOwner.ts'

export type { SheetDetent }

const PEEK_PX = 88

const HALF_FRACTION = 0.45
/** The least card a half sheet shows below its peek. */
const HALF_BODY_MIN_PX = 200
const FULL_FRACTION = 0.92

/** How far past a detent a drag may stretch before it stops following. */
const RUBBER_BAND_PX = 64

function nominalHeight(detent: SheetDetent, viewport: number, peekPx: number): number {
  if (detent === 'peek') return peekPx
  if (detent === 'half') {
    return Math.min(viewport * FULL_FRACTION, Math.max(viewport * HALF_FRACTION, peekPx + HALF_BODY_MIN_PX))
  }
  return viewport * FULL_FRACTION
}

function rubberBand(height: number, min: number, max: number): number {
  if (height < min) return min - Math.min(RUBBER_BAND_PX, Math.sqrt(min - height) * 8)
  if (height > max) return max + Math.min(RUBBER_BAND_PX, Math.sqrt(height - max) * 8)
  return height
}

/*
 * WHAT A DRAG MAY NOT START ON: a control whose own drag means something
 * else. A range slider is the one; text fields keep their caret. Everything
 * else in the sheet, its empty space included, moves it (29 Oct: "Empty
 * space in the sheet also drags the sheet"), and a tap is still a tap.
 */
const NOT_A_SHEET_DRAG = 'input[type="range"], input[type="text"], input[type="number"], textarea, [data-no-sheet-drag]'

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
  /** Reports the height the sheet settles at, so the map can keep its content above it. */
  onHeightChange?: (height: number) => void
  /** Space taken by the fixed nav rail underneath, excluded from every stop. */
  reservedBottom?: number
  reservedTop?: number
}

/**
 * THE PLAN SHEET, MOVED LIKE APPLE MAPS'.
 *
 *   - It follows the finger 1:1. The height is written straight onto the
 *     element in the frame the finger moved, not through a React render of
 *     the plan, which is what made it lag (and the map under it).
 *   - A flick of any length goes one detent on; a slow drag settles on the
 *     nearest (src/core/sheetMotion.ts).
 *   - Any vertical drag in it moves it: the handle, the date row, a card's
 *     empty space. At half and peek the content does not scroll; at full it
 *     scrolls, and pulling down with it at its top hands the drag to the
 *     sheet.
 *   - Sideways drags are the content's (the time bar's ruler, the tide
 *     curve): the axis is decided once, on the first 8 px
 *     (src/lib/gestureOwner.ts), and never changes mid-drag.
 *   - A card shorter than the screen opens at its own height, not full
 *     height over an empty gap.
 *
 * Touch is handled with touch events, not pointer events, because taking a
 * drag away from a scrolling list means cancelling its touchmove before the
 * browser starts the scroll, which only a non-passive touch listener can do.
 * A mouse uses pointer events, the same rules.
 */
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
  const [rawViewport, setViewport] = useState(() => (typeof window === 'undefined' ? 800 : window.innerHeight))
  const viewport = Math.max(PEEK_PX * 2, rawViewport - reservedBottom - reservedTop)
  const root = useRef<HTMLElement | null>(null)
  const body = useRef<HTMLDivElement | null>(null)
  const content = useRef<HTMLDivElement | null>(null)
  /* The height the open card needs: the chrome above the body plus the body's content. Null until measured. */
  const [natural, setNatural] = useState<number | null>(null)

  useEffect(() => {
    const onResize = () => setViewport(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* A card at its own height: measured whenever its content changes size. */
  useLayoutEffect(() => {
    const sheet = root.current
    const inner = content.current
    const scroller = body.current
    if (sheet === null || inner === null || scroller === null || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      if (scroller.hidden) return
      const chrome = scroller.getBoundingClientRect().top - sheet.getBoundingClientRect().top
      const pad = Number.parseFloat(getComputedStyle(sheet).paddingBottom) || 0
      const next = Math.ceil(chrome + inner.getBoundingClientRect().height + pad)
      setNatural((was) => (was !== null && Math.abs(was - next) < 2 ? was : next))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(inner)
    return () => watch.disconnect()
  }, [detent])

  /** Each detent's height now: never taller than the open card needs, never shorter than the peek. */
  const heights = useCallback(
    (): Record<SheetDetent, number> => {
      const cap = (h: number) => (natural === null ? h : Math.max(peekPx, Math.min(h, natural)))
      return { peek: peekPx, half: cap(nominalHeight('half', viewport, peekPx)), full: cap(nominalHeight('full', viewport, peekPx)) }
    },
    [natural, viewport, peekPx],
  )
  const height = heights()[detent]

  useEffect(() => {
    onHeightChange?.(height)
  }, [height, onHeightChange])

  /* ------------------------------------------------------------- the drag */
  const drag = useRef<{
    startX: number
    startY: number
    startHeight: number
    samples: [number, number][]
    live: boolean
    /** Started inside the scrolling content at full: the sheet only takes a pull down with it at its top. */
    inScroller: boolean
    /** Started on a sideways control (data-sideways): up or down needs further, for a thumb's hook. */
    onSideways: boolean
    from: SheetDetent
  } | null>(null)
  const dragged = useRef(false)
  const frame = useRef(0)
  const pendingHeight = useRef<number | null>(null)

  const paint = () => {
    frame.current = 0
    const el = root.current
    if (el !== null && pendingHeight.current !== null) el.style.height = `${pendingHeight.current}px`
  }

  /* `at` is the event's own timestamp: a handler can run late, and the speed is the finger's, not the handler's. */
  const begin = useCallback(
    (x: number, y: number, target: EventTarget | null, at: number) => {
      dragged.current = false
      const el = target instanceof Element ? target : null
      if (el === null || el.closest(NOT_A_SHEET_DRAG) !== null) {
        drag.current = null
        return
      }
      const scroller = body.current
      const inScroller = detent === 'full' && scroller !== null && scroller.contains(el) && scroller.scrollHeight > scroller.clientHeight + 1
      drag.current = { startX: x, startY: y, startHeight: heights()[detent], samples: [[at, y]], live: false, inScroller, onSideways: el.closest('[data-sideways]') !== null, from: detent }
    },
    [detent, heights],
  )

  /** Returns true when the sheet owns this move (the caller then stops the page from scrolling). */
  const move = useCallback(
    (x: number, y: number, at: number): boolean => {
      const d = drag.current
      if (d === null) return false
      if (!d.live) {
        if (gestureOwner() !== null && gestureOwner() !== 'sheet') {
          drag.current = null
          return false
        }
        const axis = dragAxis(x - d.startX, y - d.startY, d.onSideways ? VERTICAL_SLOP_ON_SIDEWAYS_PX : undefined)
        if (axis === null) return false
        if (axis === 'x') {
          /* Sideways is the content's: the ruler, a curve. Not the sheet's, for the whole of this drag. */
          drag.current = null
          return false
        }
        const scroller = body.current
        /* In the scrolling content, only a pull down from its very top is the sheet's. */
        if (d.inScroller && !(y > d.startY && scroller !== null && scroller.scrollTop <= 0)) {
          drag.current = null
          return false
        }
        if (!claimGesture('sheet')) {
          drag.current = null
          return false
        }
        d.live = true
        /*
         * FROM WHERE THE FINGER CAME DOWN, the slop included. This started
         * from where the finger was when the drag was claimed, and a quick
         * flick's claiming move carries most of it: a 60 px flick moved the
         * sheet 0 px and landed back where it began.
         */
        root.current?.classList.add('sheet--dragging')
      }
      d.samples.push([at, y])
      if (d.samples.length > 12) d.samples.shift()
      const max = nominalHeight('full', viewport, peekPx)
      pendingHeight.current = rubberBand(d.startHeight + (d.startY - y), peekPx, max)
      if (frame.current === 0) frame.current = requestAnimationFrame(paint)
      return true
    },
    [viewport, peekPx],
  )

  const end = useCallback(() => {
    const d = drag.current
    drag.current = null
    if (d === null || !d.live) return
    dragged.current = true
    if (frame.current !== 0) cancelAnimationFrame(frame.current)
    frame.current = 0
    const released = pendingHeight.current ?? d.startHeight
    pendingHeight.current = null
    const v = releaseVelocity(d.samples)
    const next = landing(d.from, released, v, heights())
    const el = root.current
    if (el !== null) {
      el.classList.remove('sheet--dragging')
      /* Spring from where the finger let go to the detent: set the target height now, the transition runs it. */
      el.style.height = `${heights()[next]}px`
    }
    onDetentChange(next)
  }, [heights, onDetentChange])

  /* Touch: native listeners, so a claimed move can cancel the page's own scroll. */
  useEffect(() => {
    const el = root.current
    if (el === null) return
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        drag.current = null
        return
      }
      startGesture()
      begin(e.touches[0].clientX, e.touches[0].clientY, e.target, e.timeStamp)
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      if (move(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp) && e.cancelable) e.preventDefault()
    }
    const onEnd = () => end()
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [begin, move, end])

  /* The settled height is React's again once the drag is over. */
  useLayoutEffect(() => {
    if (drag.current?.live) return
    const el = root.current
    if (el !== null) el.style.height = `${height}px`
  }, [height])

  /** Tapping the grabber steps up, and wraps from the top back to peek. */
  const step = () => {
    const index = SHEET_DETENTS.indexOf(detent)
    onDetentChange(SHEET_DETENTS[(index + 1) % SHEET_DETENTS.length])
  }

  return (
    <section
      ref={root}
      className={`sheet sheet--${detent}`}
      style={{ height: `${height}px` }}
      aria-label="Shoot setup"
      data-detent={detent}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse') return
        startGesture()
        begin(e.clientX, e.clientY, e.target, e.timeStamp)
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || drag.current === null) return
        if (move(e.clientX, e.clientY, e.timeStamp)) {
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* Synthetic pointers have nothing to capture. */
          }
        }
      }}
      onPointerUp={(e) => {
        if (e.pointerType === 'mouse') end()
      }}
      onPointerCancel={(e) => {
        if (e.pointerType === 'mouse') end()
      }}
      onClickCapture={(event) => {
        if (!dragged.current) return
        dragged.current = false
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      <div className="sheet__grab" data-sheet-drag>
        <button type="button" className="sheet__handle" onClick={step} aria-label={`Sheet is ${detent}. Tap to resize.`}>
          <span className="sheet__handle-bar" />
        </button>
      </div>

      <div className="sheet__peek">{peek}</div>

      <div ref={body} className="sheet__body" hidden={detent === 'peek'}>
        <div ref={content} className="sheet__content">
          {half}
          {detent === 'full' ? full : null}
        </div>
      </div>
    </section>
  )
}
