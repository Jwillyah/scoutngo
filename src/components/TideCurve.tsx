import { useMemo } from 'react'
import { tideCurveModel, timeAtFraction } from '../core/tideCurve.ts'
import type { TideSample } from '../core/tide.ts'
import { formatShortClock, formatShortHour } from '../core/timezone.ts'
import '../styles/tapin.css'

/*
 * THE ONE TIDE CURVE (Batch SIMPLE-2, Section 1). Pure: it draws the samples
 * it is given and fetches nothing. The geometry is src/core/tideCurve.ts, so
 * the Surf strip, the Fish chart and the Tide page cannot disagree about the
 * water.
 *
 *   strip  thin: the line and a now dot (under the Surf bars)
 *   chart  the line, a shaded window band, the turn's marker and time (Fish)
 *   page   the line, a now line, the next turn's marker and time, the axis
 */
export type TideCurveVariant = 'strip' | 'chart' | 'page'

const SIZE: Record<TideCurveVariant, { h: number; padTop: number; padBottom: number; axis: number }> = {
  strip: { h: 40, padTop: 4, padBottom: 4, axis: 0 },
  chart: { h: 150, padTop: 40, padBottom: 30, axis: 18 },
  page: { h: 170, padTop: 26, padBottom: 30, axis: 18 },
}
const W = 330
const CHAR_PX = 6.6

export interface TideCurveProps {
  variant: TideCurveVariant
  curve: readonly TideSample[]
  from: Date
  to: Date
  timeZone: string
  now?: Date | null
  /** Highs and lows to mark; `label` is the words beside the dot ("low 5:48p"), or the time alone when none. */
  marks?: readonly { at: Date; kind: 'high' | 'low'; label?: string }[]
  /** The window to shade (Fish: the best window), with its words above it. */
  band?: { from: Date; to: Date; label?: string } | null
  /** A finger on the curve (the Tide page): the time under it, and the callbacks. */
  scrubAt?: Date | null
  onScrub?: (at: Date) => void
  onRelease?: () => void
  label?: string
}

export function TideCurve({ variant, curve, from, to, timeZone, now = null, marks = [], band = null, scrubAt = null, onScrub, onRelease, label }: TideCurveProps) {
  const size = SIZE[variant]
  const model = useMemo(
    () => tideCurveModel({ curve, from, to, now, marks, band, timeZone, width: W, height: size.h, padTop: size.padTop, padBottom: size.padBottom, axisRoom: size.axis }),
    [curve, from, to, now, marks, band, timeZone, size.h, size.padTop, size.padBottom, size.axis],
  )
  if (model === null) return <p className="tcurve__none">The tide curve does not reach this window.</p>
  const scrubX = scrubAt === null ? null : ((scrubAt.getTime() - model.from) / Math.max(1, model.to - model.from)) * W
  const at = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    onScrub?.(timeAtFraction(from, to, (e.clientX - r.left) / Math.max(1, r.width)))
  }
  const scrubbing = onScrub !== undefined
  /* The "now" word goes left of its line when a turn's words are about to sit on it. */
  const nowLeft = model.now !== null && model.now.x >= 34 && model.marks.some((m) => m.x > model.now!.x - 12 && m.x - 48 < model.now!.x + 40)
  const clampX = (x: number, chars: number) => Math.min(W - (chars * CHAR_PX) / 2, Math.max((chars * CHAR_PX) / 2, x))
  return (
    <svg
      className={`tcurve tcurve--${variant} dtide__curve`}
      viewBox={`0 0 ${W} ${size.h}`}
      role="img"
      aria-label={label ?? 'The water level, with now and the next turn marked.'}
      data-tide-curve={variant}
      {...(scrubbing ? { 'data-sideways': true } : {})}
      style={scrubbing ? { touchAction: 'pan-y' } : undefined}
      onPointerDown={
        scrubbing
          ? (e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              at(e)
            }
          : undefined
      }
      onPointerMove={scrubbing ? (e) => (e.buttons > 0 || e.pointerType === 'touch' ? at(e) : undefined) : undefined}
      onPointerUp={scrubbing ? onRelease : undefined}
      onPointerCancel={scrubbing ? onRelease : undefined}
    >
      {model.band === null ? null : (
        <>
          <rect className="tcurve__band" x={model.band.x0} y={size.padTop - 6} width={model.band.x1 - model.band.x0} height={model.plotBottom - size.padTop + 6} rx={6} data-tide-band />
          {band?.label === undefined ? null : (
            <text className="tcurve__bandt" x={clampX((model.band.x0 + model.band.x1) / 2, band.label.length)} y={size.padTop - 12} textAnchor="middle">
              {band.label}
            </text>
          )}
        </>
      )}
      {variant === 'strip' ? null : <path className="tcurve__area" d={model.area} />}
      <path className="tcurve__line" d={model.path} />
      {variant === 'page' && model.now !== null ? (
        <g data-now>
          <line className="tcurve__nowline" x1={model.now.x} x2={model.now.x} y1={size.padTop - 10} y2={model.plotBottom} />
          <text className="tcurve__nowt" x={nowLeft ? model.now.x - 8 : Math.min(W - 24, model.now.x + 8)} y={size.padTop - 2} textAnchor={nowLeft ? 'end' : 'start'}>
            now
          </text>
        </g>
      ) : null}
      {variant !== 'page' && model.now !== null ? <circle className="tcurve__nowdot" cx={model.now.x} cy={model.now.y} r={variant === 'strip' ? 4 : 5} data-now /> : null}
      {variant === 'strip'
        ? null
        : model.marks.map((m) => {
            const words = marks.find((x) => x.at.getTime() === m.at.getTime())?.label ?? formatShortClock(m.at, timeZone)
            return (
              <g key={m.at.getTime()} className={`tcurve__mark tcurve__mark--${m.kind}`} data-tide-mark={m.kind}>
                <circle cx={m.x} cy={m.y} r={5.5} />
                <text x={clampX(m.x, words.length)} y={m.kind === 'low' ? m.y + 20 : m.y - 11} textAnchor="middle">
                  {words}
                </text>
              </g>
            )
          })}
      {scrubX === null ? null : <line className="dtide__scrub" x1={scrubX} x2={scrubX} y1={0} y2={model.plotBottom} data-scrub />}
      {variant === 'strip'
        ? null
        : model.ticks.map((t, k) => (
            <text key={t.at.getTime()} className="tcurve__tick" x={t.x} y={size.h - 3} textAnchor={k === 0 && t.x < 14 ? 'start' : k === model.ticks.length - 1 && t.x > W - 14 ? 'end' : 'middle'}>
              {formatShortHour(t.at, timeZone)}
            </text>
          ))}
    </svg>
  )
}
