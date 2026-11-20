import { chartTopFt } from '../core/surfRange.ts'
import type { SurfDay } from '../lib/useSurfNow.ts'

/** Seven days, each its biggest hour's range (Batch SIMPLE-2: lifted out of SurfPageV2.tsx so the tap-in Week tab and the detail page draw the same bars). */
export function WeekBars({ week }: { week: SurfDay[] }) {
  const top = chartTopFt(week.map((d) => d.call?.highFt ?? 0))
  return (
    <div className="dsurf__week" role="img" aria-label="Seven days, each day's biggest hour and its likely range; grey Flat, teal Fun, amber Firing">
      {week.map((d, i) => (
        <div key={d.date} className={`dsurf__day${i >= 3 ? ' dsurf__day--later' : ''}`}>
          <span className="dsurf__dname">
            {new Intl.DateTimeFormat('en-US', {
              weekday: 'short',
              timeZone: 'UTC',
            }).format(new Date(`${d.date}T12:00:00Z`))}
          </span>
          <div className="dsurf__barbox">
            {d.call === null || d.hour === null ? null : (
              <span
                className={`dsurf__bar dsurf__bar--${d.call.size.toLowerCase()}`}
                style={{
                  height: `${Math.max(12, (d.hour.centerFt / top) * 100)}%`,
                }}
              />
            )}
          </div>
          <span className="dsurf__drange" data-day={d.date}>{d.call === null ? '—' : d.call.words.replace(/ ft$/, '')}</span>
        </div>
      ))}
    </div>
  )
}
