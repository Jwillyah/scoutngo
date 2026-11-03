import type { ReactNode } from 'react'
import type { LatLon } from '../core/geo.ts'
import { compassPoint } from '../core/field.ts'
import { BLEND_MODELS, cloudWords, hourAt, MODEL_LABEL, skillOverall, type BlendedHour } from '../core/modelSkill.ts'
import { formatShortHour } from '../core/timezone.ts'
import { useBlend } from '../lib/blendData.ts'
import { Nowcast } from './Nowcast.tsx'
import { StormOutlook } from './StormOutlook.tsx'
import { forecastAge } from '../lib/savedForecast.ts'
import { formatTemperature, formatWind, type Units } from '../lib/units.ts'

/*
 * THE WEATHER TAB (Batch K): the forecast for this spot, from six models
 * corrected against what the stations near here measured and blended by how
 * well each did (src/core/modelSkill.ts). Plain words first; the models, the
 * scores and the method one row deeper.
 *
 * Never "clear" (ux-rules 12): cloud is said as an amount.
 */

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

interface WeatherTabProps {
  venue: LatLon
  timeZone: string
  units: Units
  /** The time the bar is on. */
  at: Date
  /** The nowcast and the storm line, from later sections; drawn above the week. */
  children?: ReactNode
}

export function WeatherTab({ venue, timeZone, units, at, children }: WeatherTabProps) {
  const { state, reason } = useBlend(venue, timeZone, true)
  const t = (c: number | null) => formatTemperature(c, units.temperature)
  const deg = (c: number | null) => t(c).replace(/°[FC]$/, '°')
  if (state === null) return <div className="wx"><p className="fire__note">{reason === null ? 'Asking six forecast models about here…' : `No forecast: ${reason}.`}</p></div>
  const now = hourAt(state.hours, at)
  const wind = (h: BlendedHour) => `${formatWind(h.wind.value, units.wind)}${h.fromDeg === null ? '' : ` ${compassPoint(h.fromDeg)}`}`
  const scored = state.history?.days.length ?? 0
  return (
    <div className="wx">
      {now === null ? (
        <p className="fire__note">The forecast does not reach this hour.</p>
      ) : (
        <div className="wx__now">
          <p className="wx__temp num" role="status">{t(now.temp.value)}</p>
          <div className="wx__nowfacts">
            <p className="wx__line">{cloudWords(now.cloud.value)} · rain {pct(now.rain.chance)}</p>
            <p className="wx__line num">wind {wind(now)}{now.gust.value === null ? '' : ` · gusts ${formatWind(now.gust.value, units.wind)}`}</p>
            <p className="fire__note num">models {deg(now.temp.lo)} to {deg(now.temp.hi)}</p>
          </div>
        </div>
      )}
      {state.stale ? <p className="fire__note">From the forecast of {forecastAge(new Date(state.fetchedAt).toISOString()).text.replace(' old', ' ago')}: a newer one could not be had.</p> : null}
      <Nowcast venue={venue} timeZone={timeZone} units={units} />
      <StormOutlook venue={venue} timeZone={timeZone} />
      {children}
      <ol className="wx__week" aria-label="The next seven days">
        {state.days.map((d) => (
          <li key={d.date} className="wx__day">
            <span className="wx__dname">{new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span>
            <span className="wx__hilo num">
              {deg(d.hi)}<span className="wx__lo"> {deg(d.lo)}</span>
            </span>
            <span className="wx__spread num" aria-label="the models' highs">{deg(d.hiLo)}–{deg(d.hiHi)}</span>
            <span className="wx__rain num">{d.rainChance === null || d.rainChance < 0.1 ? '' : `rain ${pct(d.rainChance)}`}</span>
            <span className="wx__wind num">{d.windMax === null ? '' : formatWind(d.windMax, units.wind)}</span>
          </li>
        ))}
      </ol>
      <details className="frow">
        <summary>Compare models</summary>
        {now === null ? null : (
          <div className="wx__scroll">
            <table className="wx__table num">
              <thead>
                <tr><th>model</th><th>temp</th><th>wind</th><th>cloud</th><th>weight</th></tr>
              </thead>
              <tbody>
                {now.temp.models.map((m) => {
                  const w = now.wind.models.find((x) => x.model === m.model)
                  const c = now.cloud.models.find((x) => x.model === m.model)
                  return (
                    <tr key={m.model}>
                      <td>{MODEL_LABEL[m.model]}</td>
                      <td>{deg(m.value)}{Math.abs(m.value - m.raw) >= 0.3 ? <span className="wx__raw"> ({deg(m.raw)})</span> : null}</td>
                      <td>{w === undefined ? '—' : formatWind(w.value, units.wind)}</td>
                      <td>{c === undefined ? '—' : `${Math.round(c.value)}%`}</td>
                      <td>{Math.round(m.weight * 100)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="fire__note">For {formatShortHour(now.at, timeZone)}. In brackets: the model before its local correction. {now.rain.of === 0 ? '' : `${now.rain.wet} of ${now.rain.of} models have rain this hour.`}</p>
          </div>
        )}
      </details>
      <details className="frow">
        <summary>How well each model did here</summary>
        {scored === 0 ? (
          <p className="fire__note">{state.stations.length === 0 ? 'No weather station within 60 km to score the models against.' : 'Not scored yet: the stations’ reports did not come back. Asked again next time.'}</p>
        ) : (
          <div className="wx__scroll">
            <table className="wx__table num">
              <thead>
                <tr><th>model</th><th>temp off by</th><th>wind off by</th><th>leans</th><th>rain right</th></tr>
              </thead>
              <tbody>
                {BLEND_MODELS.map((m) => {
                  const tt = skillOverall(state.history, m, 'temp')
                  const ww = skillOverall(state.history, m, 'wind')
                  const rr = skillOverall(state.history, m, 'rain')
                  const tUnit = units.temperature === 'F' ? 1.8 : 1
                  return (
                    <tr key={m}>
                      <td>{MODEL_LABEL[m]}</td>
                      <td>{tt.mae === null ? '—' : `${(tt.mae * tUnit).toFixed(1)}°`}</td>
                      <td>{ww.mae === null ? '—' : formatWind(ww.mae, units.wind, 1)}</td>
                      <td>{tt.bias === null || Math.abs(tt.bias * tUnit) < 0.5 ? '—' : `${(tt.bias * tUnit).toFixed(1)}° ${tt.bias > 0 ? 'warm' : 'cool'}`}</td>
                      <td>{pct(rr.hit)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="fire__note">The last {scored} days against {state.stations.map((s) => `${s.id} (${Math.round(s.km)} km)`).join(' and ')}: each model&rsquo;s forecast made the day before, hour by hour, against what the station measured.</p>
          </div>
        )}
      </details>
      <details className="frow">
        <summary>Why</summary>
        <p className="fire__note">Six models: {state.models.map((m) => MODEL_LABEL[m]).join(', ')} (Open-Meteo). Each is corrected for how it has been wrong here at that hour of the day over the last 30 days, then blended, weighted by how close it has come since. A model with no record yet weighs the same as the rest. The spread is the lowest and highest model after correction.</p>
        <p className="fire__note">Scored on this phone only, kept in its storage and in your backup file. Cloud is scored only when the station reports a layer: it sees nothing above 12,000 ft.</p>
      </details>
    </div>
  )
}
