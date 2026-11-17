import { formatClock } from '../core/timezone.ts'
import { windRgb } from '../core/windViewport.ts'
import { windIn, windUnitLabel, type WindUnit } from '../lib/units.ts'
import '../styles/wind.css'

/*
 * THE WIND'S HOURS AT THE MARKER, in the half sheet (Batch TRUTH, Section 7).
 * The thin wind bar that lived here is gone (Batch DRONE, Section 3): every
 * layer has the one timeline bar now, src/components/LayerTimeline.tsx.
 */
const HOUR = 3_600_000

/** Dragging the bar up: the wind at the marker hour by hour from the bar's time, in the user's unit, each a swatch of its colour. */
export function WindHours({ at, from, strip, unit, timeZone }: { at: Date; from: Date; strip: readonly (number | null)[]; unit: WindUnit; timeZone: string }) {
  const start = Math.max(0, Math.floor((at.getTime() - from.getTime()) / HOUR))
  const rows = strip.slice(start, start + 24).map((mps, i) => ({ t: new Date(from.getTime() + (start + i) * HOUR), mps }))
  if (rows.length === 0) return <p className="wbar__note">The marker&rsquo;s hours come with the wind.</p>
  return (
    <div className="whours" data-wind-hours>
      <p className="whours__head">At the marker, hour by hour</p>
      <ol className="whours__rows">
        {rows.map((r) => (
          <li key={r.t.getTime()} className="whours__row">
            <span className="whours__t">{formatClock(r.t, timeZone).replace(/:00 /, ' ')}</span>
            <span className="whours__sw" style={{ background: r.mps === null ? undefined : `rgb(${windRgb(r.mps).join(' ')})` }} />
            <span className="whours__v num">{r.mps === null ? '—' : `${Math.round(windIn(r.mps, unit) ?? 0)} ${windUnitLabel(unit)}`}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
