import { useState } from 'react'
import { getTimes } from 'suncalc'
import { cloudWords, hourAt, localDate, MODEL_LABEL, type BlendedHour, type ModelId } from '../core/modelSkill.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import { cloudAgreement, dayAgreement, dayIcon, habitWord, MODEL_COLOR } from '../core/weatherWords.ts'
import type { LatLon } from '../core/geo.ts'
import type { BlendState } from '../lib/blendData.ts'
import { readFireLog, trackRecord } from '../lib/fireLog.ts'
import type { StormRisk } from '../lib/stormRiskData.ts'
import { formatTemperature, windIn, type Units } from '../lib/units.ts'
import { SkyGlyph } from './SkyGlyph.tsx'
import { WeatherDetails } from './WeatherDetails.tsx'

/*
 * THE WEATHER TAB'S TWO PAGES (Batch K addendum, C).
 *
 * 7 DAYS: blended from the models, each corrected for how it has done here;
 * per day an icon, one plain line of shooter facts (sunset or sunrise and
 * the sky then, the SPC's category for today and tomorrow), low and high,
 * rain with its likeliest hours, and whether the models agree.
 *
 * MODELS: tonight in a sentence ("They agree." / "They're split.") with why;
 * a chart per quantity, one thin line per model in its colour and the blend
 * thick and white, the sunset shaded; a card per model with its habit here
 * and how much it counts; and the Sky fire record from your own log.
 */
const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

export function DaysPage({ state, venue, timeZone, units, risk }: { state: BlendState; venue: LatLon; timeZone: string; units: Units; risk: StormRisk | null }) {
  const deg = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const hour = (d: Date) => formatShortHour(d, timeZone)
  return (
    <section className="wxl__card wxl__days" aria-label="Seven days, blended">
      <p className="wxl__note">Blended from {state.models.length} models, each corrected for how it has done here the last 30 days.</p>
      <ol className="wxl__daylist">
        {state.days.map((d, i) => {
          const hours = state.hours.filter((h) => localDate(h.at, timeZone) === d.date)
          const agree = dayAgreement(hours)
          const sunset = getTimes(new Date(`${d.date}T17:00:00Z`), venue.lat, venue.lon).sunset as Date
          const atSet = hourAt(state.hours, sunset)
          const spc = i < 2 ? risk?.spc.outlook?.[i] ?? null : null
          const facts = [`sunset ${formatClock(sunset, timeZone)}, ${cloudWords(atSet?.cloud.value ?? null)}`, spc === null ? null : `SPC ${spc.word}`].filter(Boolean).join(' · ')
          const name = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
          return (
            <li key={d.date} className="wxl__dayrow">
              <SkyGlyph icon={dayIcon(d, spc !== null && spc.label !== 'TSTM')} size={22} />
              <span className="wxl__daytext">
                <span className="wxl__dayhead">
                  <b>{name}</b>
                  <span className="num">{d.rainChance === null || d.rainChance < 0.1 ? '' : `rain ${pct(d.rainChance)}${d.rainFrom === null || d.rainTo === null ? '' : ` ${hour(d.rainFrom)}–${hour(d.rainTo)}`} · `}{deg(d.lo)} / {deg(d.hi)}</span>
                </span>
                <span className="wxl__dayline">{facts} · models {agree.word}</span>
              </span>
            </li>
          )
        })}
      </ol>
      <p className="wxl__note">Days 4–7 change daily.</p>
    </section>
  )
}

type Quantity = 'cloud' | 'rain' | 'wind' | 'temp'
const QUANTITY_LABEL: Record<Quantity, string> = { cloud: 'Clouds', rain: 'Rain', wind: 'Wind', temp: 'Temp' }

export function ModelsPage({ state, venue, timeZone, units, at, risk }: { state: BlendState; venue: LatLon; timeZone: string; units: Units; at: Date; risk: StormRisk | null }) {
  const [q, setQ] = useState<Quantity>('cloud')
  const sunset = getTimes(at, venue.lat, venue.lon).sunset as Date
  const tonight = cloudAgreement(hourAt(state.hours, sunset))
  const now = hourAt(state.hours, at)
  /* The next 24 hours from the hour now. */
  const start = Math.floor(at.getTime() / 3_600_000) * 3_600_000
  const hours = state.hours.filter((h) => h.at.getTime() >= start && h.at.getTime() < start + 24 * 3_600_000)
  const record = trackRecord(readFireLog())
  /* Each model's share today, from the temperature weights through the day. */
  const share = (m: ModelId) => {
    const ws = hours.map((h) => h.temp.models.find((x) => x.model === m)?.weight).filter((x): x is number => x !== undefined)
    return ws.length === 0 ? null : ws.reduce((a, b) => a + b, 0) / ws.length
  }
  return (
    <section className="wxl__card wxl__modelspage" aria-label="The models">
      <p className="wxl__headline">{tonight.word}</p>
      <p className="wxl__note">{tonight.why}</p>
      <div className="seg wxl__qtabs" role="group" aria-label="Which to compare">
        {(Object.keys(QUANTITY_LABEL) as Quantity[]).map((k) => (
          <button key={k} type="button" className={`seg__btn${q === k ? ' seg__btn--on' : ''}`} aria-pressed={q === k} onClick={() => setQ(k)}>
            {QUANTITY_LABEL[k]}
          </button>
        ))}
      </div>
      <ModelChart hours={hours} q={q} sunset={sunset} units={units} />
      <ul className="wxl__mcards">
        {state.models.map((m) => (
          <li key={m} className="wxl__mcard" style={{ borderTopColor: MODEL_COLOR[m] }}>
            <span className="wxl__mhead"><b>{MODEL_LABEL[m]}</b><span className="num">{pct(share(m))}</span></span>
            <span>{habitWord(state.history, m)}</span>
          </li>
        ))}
      </ul>
      <p className="wxl__note">% = how much each model counts, from how it has done here</p>
      <p className="wxl__tile num">{record.said === 0 ? 'No Sky fire calls logged yet' : `${record.fired}/${record.said} Sky fire calls right · from your log`}</p>
      <details className="frow">
        <summary>The numbers</summary>
        <WeatherDetails state={state} now={now} units={units} timeZone={timeZone} risk={risk} />
      </details>
    </section>
  )
}

/** One thin line per model and the blend thick and white, the next 24 hours; the sunset shaded. */
function ModelChart({ hours, q, sunset, units }: { hours: readonly BlendedHour[]; q: Quantity; sunset: Date; units: Units }) {
  const W = 340
  const H = 62
  if (hours.length < 2) return <p className="wxl__note">The models did not say for the next 24 hours.</p>
  const t0 = hours[0].at.getTime()
  const t1 = hours[hours.length - 1].at.getTime()
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W
  const val = (h: BlendedHour, m: ModelId | null): number | null => {
    /* Rain: each model's mm in the hour; the blend's line is their mean. */
    if (q === 'rain') return m === null ? (h.rain.models.length === 0 ? null : h.rain.models.reduce((a, r) => a + r.mm, 0) / h.rain.models.length) : (h.rain.models.find((r) => r.model === m)?.mm ?? null)
    const b = h[q]
    if (m === null) return b.value
    return b.models.find((r) => r.model === m)?.value ?? null
  }
  const models = [...new Set(hours.flatMap((h) => h.temp.models.map((m) => m.model)))]
  const all = hours.flatMap((h) => [val(h, null), ...models.map((m) => val(h, m))]).filter((v): v is number => v !== null)
  const lo = q === 'cloud' || q === 'rain' ? 0 : Math.min(...all)
  const hi = q === 'cloud' ? 100 : q === 'rain' ? Math.max(1, ...all) : Math.max(...all)
  const y = (v: number) => H - 6 - ((v - lo) / Math.max(1e-6, hi - lo)) * (H - 12)
  const path = (m: ModelId | null) =>
    hours
      .map((h) => ({ t: h.at.getTime(), v: val(h, m) }))
      .filter((p): p is { t: number; v: number } => p.v !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
      .join(' ')
  const setX = sunset.getTime() >= t0 && sunset.getTime() <= t1 ? x(sunset.getTime()) : null
  const unit = q === 'cloud' ? '% cloud' : q === 'rain' ? 'mm of rain an hour' : q === 'wind' ? units.wind : `°${units.temperature}`
  const show = (v: number) => (q === 'temp' ? formatTemperature(v, units.temperature) : q === 'wind' ? `${Math.round(windIn(v, units.wind) ?? 0)}` : q === 'rain' ? v.toFixed(1) : `${Math.round(v)}`)
  return (
    <figure className="wxl__chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${QUANTITY_LABEL[q]}, the next 24 hours, one line per model, the blend thick`}>
        {setX === null ? null : <rect x={setX - 10} y={0} width={20} height={H} className="wxl__chartset" />}
        {models.map((m) => <path key={m} d={path(m)} fill="none" stroke={MODEL_COLOR[m]} strokeWidth={1.2} />)}
        <path d={path(null)} fill="none" stroke="#fff" strokeWidth={3} />
      </svg>
      <figcaption className="wxl__note num">
        next 24 h · {unit} {show(lo)}–{show(hi)}{setX === null ? '' : ` · sunset shaded`}
      </figcaption>
    </figure>
  )
}
