import { BLEND_MODELS, MODEL_LABEL, skillOverall, type BlendedHour } from '../core/modelSkill.ts'
import { formatShortHour } from '../core/timezone.ts'
import type { BlendState } from '../lib/blendData.ts'
import type { StormRisk } from '../lib/stormRiskData.ts'
import { formatTemperature, formatWind, type Units } from '../lib/units.ts'
import { StormWhy } from './StormOutlook.tsx'

/*
 * THE MODELS IN NUMBERS (Batch K): each model's value for the hour with its
 * weight, how well each did here over 30 days, and how the blend is made.
 * One tap deeper than the Weather tab.
 */
const pct = (x: number | null) => (x === null ? '\u2014' : `${Math.round(x * 100)}%`)

export function WeatherDetails({ state, now, units, timeZone, risk }: { state: BlendState; now: BlendedHour | null; units: Units; timeZone: string; risk: StormRisk | null }) {
  const deg = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const scored = state.history?.days.length ?? 0
  return (
    <>
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
        <StormWhy risk={risk} />
        <p className="fire__note">Scored on this phone only, kept in its storage and in your backup file. Cloud is scored only when the station reports a layer: it sees nothing above 12,000 ft.</p>
      </details>
    </>
  )
}
