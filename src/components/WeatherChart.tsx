import { useMemo } from 'react'
import { weatherChartModel, type ChartHour } from '../core/weatherChart.ts'
import { formatShortHour } from '../core/timezone.ts'
import '../styles/tapin.css'

/* The Weather page's one chart card (board Page_Weather): the next 18 h, the temperature as a line, rain chance as bars. Draws what it is given. */
const W = 330
const H = 132
export function WeatherChart({ hours, timeZone }: { hours: readonly ChartHour[]; timeZone: string }) {
  const m = useMemo(() => weatherChartModel(hours, { width: W, height: H, padTop: 22, padBottom: 22, padX: 8, barRoom: 30 }), [hours])
  const none = m.lines.length === 0
  return (
    <div className="wchart" data-wchart>
      <p className="wchart__title">next 18 h · rain bars</p>
      {none ? (
        <p className="tcurve__none">The forecast did not give the temperatures.</p>
      ) : (
        <svg className="wchart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="The temperature for the next 18 hours as a line, with the chance of rain as small bars under it.">
          {m.bars.map((b) => (
            <rect key={b.at.getTime()} className="wchart__bar" x={b.x} y={b.y} width={b.w} height={b.h} rx={2} />
          ))}
          {m.lines.map((d) => (
            <path key={d} className="wchart__line" d={d} />
          ))}
          {m.nowDot === null ? null : <circle className="wchart__dot" cx={m.nowDot.x} cy={m.nowDot.y} r={4.5} />}
          {m.ticks.map((t) => (
            <text key={t.at.getTime()} className="wchart__tick" x={t.x} y={H - 4} textAnchor={t.isNow ? 'start' : t.x > W - 30 ? 'end' : 'middle'}>
              {t.isNow ? 'now' : formatShortHour(t.at, timeZone)}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}
