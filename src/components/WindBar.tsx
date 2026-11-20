import { useMemo } from 'react'
import { hourTicks } from '../core/tideCurve.ts'
import { windArrows, windPlot, type BarSpan, type WindHour } from '../core/layerTimeline.ts'
import { formatShortHour } from '../core/timezone.ts'
import { windIn, windUnitLabel, type WindUnit } from '../lib/units.ts'
import '../styles/tapin.css'

/*
 * THE ONE WIND BAR (Batch SIMPLE-2, Section 1; board Wind_Bar_7): an hour a
 * bar, coloured by the map's wind bands (WIND_BANDS_KT), a white cap on each
 * where the gust is above the wind, an arrow on every sixth hour pointing
 * where it blows, a drone limit when one is given, the now marker and the
 * time axis. Pure: it draws the hours it is given. The arithmetic is
 * windPlot / windArrows in src/core/layerTimeline.ts, the same the map's
 * timeline bar uses, so the Wind page's chart and the map's bar read alike.
 * An hour the forecast did not say has no bar, never a zero bar.
 */
const W = 330
const H = 120
const PLOT_TOP = 18
const PLOT_BOTTOM = 100

export interface WindBarProps {
  /** hours[i] is span.from + i hours. */
  hours: readonly WindHour[]
  span: BarSpan
  timeZone: string
  unit: WindUnit
  /** The chosen drone's rated wind, m/s; null for none. */
  limitMps?: number | null
  now?: Date | null
  /** Arrows on every sixth hour. */
  arrows?: boolean
  label?: string
}

export function WindBar({ hours, span, timeZone, unit, limitMps = null, now = null, arrows = true, label }: WindBarProps) {
  const plot = useMemo(() => windPlot(hours, span, timeZone, limitMps), [hours, span, timeZone, limitMps])
  const arrs = useMemo(() => (arrows ? windArrows(hours, span, timeZone) : []), [arrows, hours, span, timeZone])
  const ticks = useMemo(() => hourTicks(span.from, new Date(span.from.getTime() + span.hours * 3_600_000), timeZone), [span, timeZone])
  if (plot.bars.length === 0) return <p className="tcurve__none">The wind forecast has not said yet.</p>
  const plotH = PLOT_BOTTOM - PLOT_TOP
  const y = (h: number) => PLOT_BOTTOM - h * plotH
  const nowX = now === null ? null : ((now.getTime() - span.from.getTime()) / (span.hours * 3_600_000)) * W
  const limitWord = limitMps === null ? null : `drone limit ${Math.round(windIn(limitMps, unit) ?? 0)}`
  return (
    <svg className="wbar7" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? `Wind by the hour in ${windUnitLabel(unit)}; caps are gusts.`} data-wind-bar={plot.bars.length}>
      {plot.bars.map((b) => (
        <rect key={b.x} className={`wbar7__bar wbar7__bar--b${b.band}`} x={b.x * W + 1} y={y(b.h)} width={Math.max(1, b.w * W - 2)} height={b.h * plotH} rx={2} data-kt={b.kt.toFixed(1)} />
      ))}
      {plot.bars.map((b) => (b.gustH === null ? null : <rect key={`g${b.x}`} className="wbar7__cap" x={b.x * W + 1} y={y(b.gustH) - 3} width={Math.max(1, b.w * W - 2)} height={3} rx={1.5} />))}
      {plot.limitH === null ? null : (
        <>
          <line className="wbar7__limit" x1={0} x2={W} y1={y(plot.limitH)} y2={y(plot.limitH)} data-wind-limit />
          <text className="wbar7__limitt" x={2} y={y(plot.limitH) - 4}>
            {limitWord}
          </text>
        </>
      )}
      {arrs.map((a) => (
        <g key={a.x} transform={`translate(${(a.x * W).toFixed(1)} 8) rotate(${a.toDeg.toFixed(0)})`} className="wbar7__arrow" data-wind-arrow>
          <path d="M0 6V-6M-3.5 -2.5L0 -6L3.5 -2.5" />
        </g>
      ))}
      {nowX === null || nowX < 0 || nowX > W ? null : <line className="wbar7__now" x1={nowX} x2={nowX} y1={PLOT_TOP - 6} y2={PLOT_BOTTOM} data-now />}
      {ticks.map((t) => (
        <text key={t.getTime()} className="tcurve__tick" x={((t.getTime() - span.from.getTime()) / (span.hours * 3_600_000)) * W} y={H - 3} textAnchor="middle">
          {formatShortHour(t, timeZone)}
        </text>
      ))}
    </svg>
  )
}
