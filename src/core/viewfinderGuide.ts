/*
 * THE VIEWFINDER'S GUIDES (Batch SIMPLE-2, Section 4; mockup Sky_Viewfinder):
 * the compass strip at the top, the sun's dots with their times, and the
 * compass-only view when the camera is not allowed. Arithmetic only; the
 * Viewfinder draws (src/components/Viewfinder.tsx).
 */
import { unproject, type CameraFov, type Orientation } from './arProjection.ts'
import { compassPoint } from './field.ts'
import { normalizeBearing } from './sun.ts'

/** The strip shows this far either side of where the phone points. */
export const STRIP_HALF_DEG = 45
/** A tick every this many degrees; every 45° is a compass letter. */
export const STRIP_STEP_DEG = 15
/** The dots before a sunset (after a sunrise): this many minutes apart … */
export const DOT_STEP_MIN = 20
/** … this many of them, the event's own last. */
export const DOT_COUNT = 5

/** Where the middle of the picture looks, degrees from true north, with the calibration taken off; null while the phone has said nothing. */
export function headingOf(view: Orientation | null, fov: CameraFov, offset: number): number | null {
  if (view === null) return null
  return normalizeBearing(unproject({ x: 0.5, y: 0.5 }, view, fov).azimuth - offset)
}

export interface StripTick {
  /** 0..1 across the strip. */
  x: number
  label: string
  /** A compass letter (S, SW) rather than a number. */
  point: boolean
}

/** The ticks either side of `heading`, leaving the middle to the heading's own label. */
export function stripTicks(heading: number): StripTick[] {
  const out: StripTick[] = []
  const first = Math.ceil((heading - STRIP_HALF_DEG) / STRIP_STEP_DEG) * STRIP_STEP_DEG
  for (let d = first; d <= heading + STRIP_HALF_DEG; d += STRIP_STEP_DEG) {
    const x = 0.5 + (d - heading) / (2 * STRIP_HALF_DEG)
    /* The middle carries "▼ 247° WSW"; nothing under it. */
    if (Math.abs(x - 0.5) < 0.16) continue
    const deg = normalizeBearing(d)
    const point = deg % 45 === 0
    out.push({ x, label: point ? compassPoint(deg) : String(deg), point })
  }
  return out
}

/** "247° WSW": the middle of the strip. */
export const headingWords = (heading: number): string => `${Math.round(heading) % 360}° ${compassPoint(heading)}`

/** The times of the sun's dots: the hour and a half before a sunset up to it, or a sunrise and the hour and a half after. */
export function sunDotTimes(kind: 'sunrise' | 'sunset', event: Date): Date[] {
  return Array.from({ length: DOT_COUNT }, (_, i) => {
    const k = kind === 'sunset' ? i - (DOT_COUNT - 1) : i
    return new Date(event.getTime() + k * DOT_STEP_MIN * 60_000)
  })
}

/**
 * THE COMPASS-ONLY VIEW: with no camera and no motion, the picture is drawn
 * as if the phone were held upright facing `azimuth` (the event's bearing),
 * so the dots and the horizon still say where to look.
 */
export function facingView(azimuth: number): Orientation {
  return { alpha: (360 - normalizeBearing(azimuth)) % 360, beta: 90, gamma: 0 }
}
