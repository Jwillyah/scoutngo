import { useState, type ReactNode } from 'react'
import { getTimes } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { compassPoint } from '../core/field.ts'
import { lightningLine } from '../core/lightning.ts'
import { cloudWords, hourAt, localDate, type BlendedDay } from '../core/modelSkill.ts'
import { shooterLines } from '../core/shooterStorm.ts'
import { cellCalls, cellLine } from '../core/stormCells.ts'
import { stormLine } from '../core/stormRisk.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import { dayAgreement, dayIcon, hourlyStrip, leading, MODEL_COLOR, modelName, rainLine6h, type SkyIcon } from '../core/weatherWords.ts'
import { useBlend } from '../lib/blendData.ts'
import { useNowcast } from '../lib/stormData.ts'
import { useStormRisk } from '../lib/stormRiskData.ts'
import { forecastAge } from '../lib/savedForecast.ts'
import { formatTemperature, formatWind, type Units } from '../lib/units.ts'
import { RadarStrip } from './RadarStrip.tsx'
import { WeatherDetails } from './WeatherDetails.tsx'

/*
 * THE WEATHER TAB (Batch K addendum, A): the forecast for this spot, from six
 * models corrected against the stations here and blended by how each has
 * done (src/core/modelSkill.ts), in the Version L look: a sky gradient,
 * glass cards, big light numbers. One screen at 390 x 844:
 *
 *   1  the spot and date, the temperature big; sky and wind, high and low,
 *      rain chance on the right
 *   2  an amber banner when an NWS statement or warning is in force (tap:
 *      the official text; no advice, rule 28)
 *   3  the next 6 hours' rain in one line, and the hours with the sunset or
 *      sunrise in its place
 *   4  7 DAYS, blended for the spot: icon, rain, low, a range bar whose
 *      lighter band is where the models' highs disagree, high
 *   5  the six models as coloured dots: agree or split, and which leads here
 *   6  the live radar strip, the real map round the venue
 *   7  storm days only: the storm card and a gold "Shoot it:" line
 *
 * Never "clear" or "safe" (ux-rules 12).
 */

export const OPEN_RADAR_EVENT = 'scoutngo:open-radar'

const pct = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`)

export function SkyGlyph({ icon, size = 20 }: { icon: SkyIcon | 'sunset' | 'sunrise'; size?: number }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  const cloud = <path {...p} d="M7 17h10a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.4A3 3 0 0 0 7 17z" />
  const body: Record<string, ReactNode> = {
    sun: <><circle {...p} cx="12" cy="12" r="4" /><path {...p} d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
    part: <><circle {...p} cx="8.5" cy="8.5" r="3" /><path {...p} d="M8.5 3v1.2M3 8.5h1.2M4.6 4.6l.9.9" />{cloud}</>,
    cloud,
    rain: <>{cloud}<path {...p} d="M9 19.5l-1 2M13 19.5l-1 2M17 19.5l-1 2" /></>,
    storm: <>{cloud}<path {...p} d="M12.5 17.5 10.5 21h3l-2 3" /></>,
    sunset: <><path {...p} d="M4 18h16M7 18a5 5 0 0 1 10 0M12 6v4M9.5 8.5 12 11l2.5-2.5" /></>,
    sunrise: <><path {...p} d="M4 18h16M7 18a5 5 0 0 1 10 0M12 11V7M9.5 8.5 12 6l2.5 2.5" /></>,
  }
  return <svg className="wxl__glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{body[icon]}</svg>
}

interface WeatherTabProps {
  venue: LatLon
  timeZone: string
  units: Units
  /** The time the bar is on. */
  at: Date
  placeName?: string
}

export function WeatherTab({ venue, timeZone, units, at, placeName }: WeatherTabProps) {
  const { state, reason } = useBlend(venue, timeZone, true)
  const risk = useStormRisk(venue, timeZone, true)
  const nowcast = useNowcast(venue, true)
  const [view, setView] = useState<'main' | 'days' | 'models'>('main')
  const t = (c: number | null) => formatTemperature(c, units.temperature)
  const deg = (c: number | null) => t(c).replace(/°[FC]$/, '°')
  const clock = (d: Date) => formatClock(d, timeZone)
  const hour = (d: Date) => formatShortHour(d, timeZone)
  const dist = units.distance === 'ft' ? 'mi' : 'km'
  if (state === null) return <div className="wxl"><p className="wxl__note">{reason === null ? 'Asking six forecast models about here…' : `No forecast: ${reason}.`}</p></div>
  const now = hourAt(state.hours, at)
  const today = state.days.find((d) => d.date === localDate(at, timeZone)) ?? state.days[0] ?? null
  if (view !== 'main') {
    return (
      <div className="wxl">
        <button type="button" className="wxl__back" onClick={() => setView('main')}>‹ Weather</button>
        {view === 'models' ? <WeatherDetails state={state} now={now} units={units} timeZone={timeZone} risk={risk} /> : <DaysList days={state.days} deg={deg} />}
      </div>
    )
  }

  /* Sunrise and sunset today and tomorrow, for the hour strip. */
  const sun = [0, 1].flatMap((k) => {
    const tt = getTimes(new Date(at.getTime() + k * 86_400_000), venue.lat, venue.lon)
    return [{ at: tt.sunrise as Date, word: 'sunrise' as const }, { at: tt.sunset as Date, word: 'sunset' as const }].filter((s) => s.at instanceof Date && Number.isFinite(s.at.getTime()))
  })
  const strip = hourlyStrip(state.hours, at, sun)

  /* The storm day: the models' line, a cell coming, an SPC risk of Marginal or more, or a thunderstorm alert. */
  const calls = nowcast?.radar == null ? [] : cellCalls(venue, nowcast.radar.tracks, nowcast.radar.scanAt)
  const coming = calls.find((c) => c.over || c.arrives !== null) ?? null
  const todayRisk = risk?.days.find((d) => d.word === 'today') ?? null
  const storm = todayRisk === null ? null : stormLine(todayRisk.storm, hour, 'today')
  const spc = risk?.spc.outlook?.[0] ?? null
  const alerts = nowcast?.alerts ?? []
  const stormDay = coming !== null || storm !== null || (spc !== null && spc.label !== 'TSTM') || alerts.some((a) => /thunder|tornado/i.test(a.event))
  const shoot = nowcast?.radar == null ? [] : shooterLines(venue, calls, nowcast.strikes ?? [], nowcast.radar.scanAt, clock, dist)
  const bolt = nowcast?.strikes == null ? null : lightningLine(venue, nowcast.strikes, dist, clock)

  /* The models row. */
  const lead = leading(state.history, state.models)
  const agree = today === null ? null : dayAgreement(state.hours.filter((h) => localDate(h.at, timeZone) === today.date))

  /* The week's scale for the range bars. */
  const lows = state.days.map((d) => d.lo).filter((v): v is number => v !== null)
  const highs = state.days.flatMap((d) => [d.hi, d.hiHi]).filter((v): v is number => v !== null)
  const lo = Math.min(...lows)
  const hi = Math.max(...highs)
  const x = (v: number) => `${(((v - lo) / Math.max(1, hi - lo)) * 100).toFixed(1)}%`
  const openRadar = () => window.dispatchEvent(new CustomEvent(OPEN_RADAR_EVENT, { detail: nowcast?.radar?.scanAt ?? null }))

  return (
    <div className="wxl">
      <div className="wxl__top">
        <div className="wxl__left">
          <p className="wxl__place"><span className="wxl__placename">{placeName ?? 'Here'}</span><span className="wxl__date"> · {at.toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })}</span></p>
          <p className="wxl__temp num" role="status">{now === null ? '—' : deg(now.temp.value)}</p>
        </div>
        {now === null ? null : (
          <div className="wxl__right">
            <p>{cloudWords(now.cloud.value)}</p>
            <p className="num">H {deg(today?.hi ?? null)} · L {deg(today?.lo ?? null)}</p>
            <p className="num">rain {pct(today?.rainChance ?? null)} · {formatWind(now.wind.value, units.wind)}{now.fromDeg === null ? '' : ` ${compassPoint(now.fromDeg)}`}</p>
          </div>
        )}
      </div>
      {state.stale ? <p className="wxl__note">From the forecast of {forecastAge(new Date(state.fetchedAt).toISOString()).text.replace(' old', ' ago')}: a newer one could not be had.</p> : null}

      {alerts.map((a) => (
        <details key={a.event + a.headline} className="wxl__alert">
          <summary>
            <span className="wxl__alert-ev">{a.event}</span>
            {a.ends === null ? null : <span className="num"> · until {clock(a.ends)}</span>}
          </summary>
          <p>{a.headline}</p>
          <p className="wxl__alert-text">{a.description}</p>
          <p>{a.sender}, as issued.</p>
        </details>
      ))}

      {stormDay ? (
        <section className="wxl__card wxl__storm" aria-label="Storms">
          <p className="wxl__cardhead">STORMS{spc === null ? '' : ` · SPC ${spc.word}`}</p>
          <p className="wxl__line">
            {coming !== null ? cellLine(coming, { dist, clock }) : storm ?? ''}
            <span className="wxl__sub num">
              {' · '}{bolt === null ? 'no lightning in the last hour' : bolt.replace(/^Lightning /, 'lightning ')}
              {today?.gustMax == null ? '' : ` · gusts ${formatWind(today.gustMax, units.wind)}`}
            </span>
          </p>
          {shoot.length === 0 ? null : <p className="wxl__shoot">Shoot it: {shoot[0]}</p>}
        </section>
      ) : null}

      <section className="wxl__card" aria-label="The next 6 hours">
        <p className="wxl__line">{rainLine6h(state.hours, at, hour)}</p>
        <ol className="wxl__hours">
          {strip.map((c) => (
            <li key={`${c.kind}${c.at.getTime()}`} className={`wxl__hour${c.kind === 'sun' ? ' wxl__hour--sun' : ''}`}>
              <span className="num">{c.kind === 'sun' ? clock(c.at).replace(/ [AP]M$/, '') : hour(c.at)}</span>
              <span className="wxl__hourrow">
                {c.kind === 'sun' ? <SkyGlyph icon={c.word} size={16} /> : <SkyGlyph size={16} icon={(c.rain ?? 0) >= 0.5 ? 'rain' : (c.cloud ?? 50) < 25 ? 'sun' : (c.cloud ?? 50) < 70 ? 'part' : 'cloud'} />}
                <span className="num">{c.kind === 'sun' ? c.word.slice(3) : deg(c.temp)}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <button type="button" className="wxl__card wxl__week" onClick={() => setView('days')}>
        <span className="wxl__cardhead">7 DAYS · blended for {placeName ?? 'here'}</span>
        {state.days.map((d) => (
          <span key={d.date} className="wxl__day">
            <span className="wxl__dname">{d.date === today?.date ? 'Today' : new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span>
            <SkyGlyph icon={dayIcon(d, d.date === today?.date && stormDay)} size={18} />
            <span className="wxl__rain num">{d.rainChance === null || d.rainChance < 0.1 ? '' : pct(d.rainChance)}</span>
            <span className="wxl__lo num">{deg(d.lo)}</span>
            <span className="wxl__bar" aria-hidden="true">
              {d.lo === null || d.hi === null ? null : <i className="wxl__barfill" style={{ left: x(d.lo), right: `calc(100% - ${x(d.hi)})` }} />}
              {d.hiLo === null || d.hiHi === null ? null : <i className="wxl__barspread" style={{ left: x(d.hiLo), right: `calc(100% - ${x(d.hiHi)})` }} />}
            </span>
            <span className="wxl__hi num">{deg(d.hi)}</span>
          </span>
        ))}
      </button>

      <button type="button" className="wxl__models" onClick={() => setView('models')}>
        <span className="wxl__dots" aria-hidden="true">
          {state.models.map((m) => <i key={m} style={{ background: MODEL_COLOR[m] }} />)}
        </span>
        <span className="wxl__modelswords">
          {agree === null ? `${state.models.length} models` : agree.agree ? `${state.models.length} models agree` : `Models ${agree.word}`}
          {lead === null ? '' : ` · ${modelName(lead)} leads here`}
        </span>
        <span className="wxl__more">Models ›</span>
      </button>

      <RadarStrip venue={venue} radar={nowcast?.radar ?? null} timeZone={timeZone} dist={dist} onOpen={openRadar} />
    </div>
  )
}

/** Interim list of the seven days (Batch K addendum A); the full page is C. */
function DaysList({ days, deg }: { days: readonly BlendedDay[]; deg: (c: number | null) => string }) {
  return (
    <ol className="wxl__card wxl__dayslist">
      {days.map((d) => (
        <li key={d.date} className="wxl__line num">
          {new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}: {deg(d.lo)} to {deg(d.hi)} · rain {pct(d.rainChance)}
        </li>
      ))}
    </ol>
  )
}
