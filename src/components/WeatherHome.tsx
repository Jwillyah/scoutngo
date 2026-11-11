import { useEffect, useMemo, useState } from 'react'
import { getPosition, getTimes } from 'suncalc'
import { conditionOf } from '../core/homeDay.ts'
import { localDate } from '../core/modelSkill.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import { rainTileLine, uvBand, uvLine } from '../core/weatherTiles.ts'
import { dayIcon } from '../core/weatherWords.ts'
import { useBlend } from '../lib/blendData.ts'
import { fetchWeatherExtras, hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import { formatTemperature, type Units } from '../lib/units.ts'
import type { StationObs } from '../core/nowcast.ts'
import { gustWords, windAt, windWords } from '../lib/windNow.ts'
import { SkyGlyph } from './SkyGlyph.tsx'
import { SkyIconSvg } from './SkyIconSvg.tsx'

/*
 * THE WEATHER-ONLY HOME (Batch Polish 2, Section 2): with only Weather
 * picked, the home's day is the weather itself, in the Weather page's own
 * numbers (src/components/WeatherPage.tsx, src/core/weatherTiles.ts): the
 * next six hours, the rain in the next six hours, the wind, the UV, the
 * sunrise and sunset, and the 7 days with their rain chance. Every part opens
 * the Weather page. It fits the screen like the rest of the home
 * (scripts/audit-home-fit.mjs): at its tightest the week goes first.
 */
interface Props {
  venue: { lat: number; lon: number }
  timeZone: string
  units: Units
  now: Date
  wx: Hourly | null
  obs: StationObs | null
  /** The home's fit (Home.tsx DayView): above 0, the week is left to the Weather page. */
  drop: number
  onOpen: () => void
}

export function WeatherHome({ venue, timeZone, units, now, wx, obs, drop, onOpen }: Props) {
  const { state } = useBlend(venue, timeZone, true)
  const [extra, setExtra] = useState<Hourly | null>(null)
  useEffect(() => {
    let live = true
    void fetchWeatherExtras(venue).then((x) => live && setExtra(x), () => undefined)
    return () => {
      live = false
    }
  }, [venue.lat, venue.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  const deg = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const hourWord = (d: Date) => formatClock(d, timeZone).replace(/:00 /, ' ')
  const at = (s: Hourly | null, name: string, t: Date) => (s === null ? null : hourlyAt(s, name, t))
  const sunUp = (t: Date) => getPosition(t, venue.lat, venue.lon).altitude > -0.8

  const hours = useMemo(() => {
    const start = Math.floor(now.getTime() / 3_600_000) * 3_600_000
    return Array.from({ length: 6 }, (_, i) => new Date(start + i * 3_600_000))
  }, [now])
  const next6 = state === null ? [] : state.hours.filter((h) => h.at.getTime() > now.getTime() - 3_600_000 && h.at.getTime() <= now.getTime() + 6 * 3_600_000).map((h) => ({ at: h.at, chance: h.rain.chance }))
  const rainNow = next6[0]?.chance ?? null
  const wind = windAt(wx, now, obs)
  const uv = at(extra, 'uv_index', now)
  const today = localDate(now, timeZone)
  const uvLater = extra === null ? [] : extra.times.filter((t) => t > now.getTime() && localDate(new Date(t), timeZone) === today).map((t) => ({ at: new Date(t), uv: hourlyAt(extra, 'uv_index', new Date(t)) }))
  /* The next sunrise and sunset, in the order they come. */
  const sun = [0, 1]
    .flatMap((k) => {
      const tt = getTimes(new Date(now.getTime() + k * 86_400_000), venue.lat, venue.lon)
      return [
        { at: tt.sunrise as Date, word: 'Sunrise' },
        { at: tt.sunset as Date, word: 'Sunset' },
      ]
    })
    .filter((s) => s.at instanceof Date && !Number.isNaN(s.at.getTime()) && s.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
  const tiles: { k: string; label: string; big: string; line: string }[] = [
    { k: 'rain', label: 'Rain · next 6 h', big: rainNow === null ? '—' : `${Math.round(rainNow * 100)}%`, line: state === null ? 'asking the models…' : rainTileLine(next6, now, hourWord) },
    { k: 'wind', label: 'Wind', big: windWords(wind, units.wind) ?? '—', line: gustWords(wind, units.wind) ?? 'gusts not said' },
    { k: 'uv', label: 'UV', big: uv === null ? '—' : String(Math.round(uv)), line: uvLine(uv === null ? null : Math.round(uv), uvLater.map((h) => ({ at: h.at, uv: h.uv === null ? null : Math.round(h.uv) })), hourWord) ?? (uv === null ? 'not said' : uvBand(uv).word) },
    { k: 'sun', label: sun[0]?.word ?? 'Sun', big: sun[0] === undefined ? '—' : formatClock(sun[0].at, timeZone), line: sun[1] === undefined ? '' : `${sun[1].word.toLowerCase()} ${formatClock(sun[1].at, timeZone)}` },
  ]

  const lows = state?.days.map((d) => d.lo).filter((v): v is number => v !== null) ?? []
  const highs = state?.days.map((d) => d.hi).filter((v): v is number => v !== null) ?? []
  const lo = Math.min(...lows)
  const hi = Math.max(...highs)
  const x = (v: number) => `${(((v - lo) / Math.max(1, hi - lo)) * 100).toFixed(1)}%`

  return (
    <div className="hwh">
      <button type="button" className="hwh__hours" onClick={onOpen} aria-label="The next six hours: the weather">
        {hours.map((h, i) => {
          const t = new Date(h.getTime() + 1_800_000)
          const cc = conditionOf(at(wx, 'weather_code', t), sunUp(t))
          return (
            <span key={h.getTime()} className="hstrip__step">
              <span className="hstrip__at">{i === 0 ? 'Now' : formatShortHour(h, timeZone)}</span>
              {cc === null ? <span className="hstrip__icon">—</span> : <SkyIconSvg icon={cc.icon} className="hstrip__icon" />}
              <span className="hstrip__t num">{deg(at(wx, 'temperature_2m', i === 0 ? now : t))}</span>
            </span>
          )
        })}
      </button>
      <div className="hwh__tiles">
        {tiles.map((t) => (
          <button key={t.k} type="button" className={`wtile hwh__tile wtile--${t.k}`} onClick={onOpen}>
            <span className="wtile__label">{t.label}</span>
            <span className="wtile__big num">{t.big}</span>
            <span className="wtile__line">{t.line}</span>
          </button>
        ))}
      </div>
      {drop > 0 ? null : state === null ? (
        <p className="hwh__note">Asking the forecast models for the week…</p>
      ) : (
        <button type="button" className="wweek hwh__week" onClick={onOpen}>
          <span className="wweek__head">7 days · rain chance</span>
          {/* From today on: the forecast's first days can be behind the clock. */}
          {state.days.filter((d) => d.date >= today).map((d) => (
            <span key={d.date} className="wweek__day">
              <span className="wweek__name">{d.date === today ? 'Today' : new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</span>
              <SkyGlyph icon={dayIcon(d)} size={16} />
              <span className="wweek__rain num">{d.rainChance === null || d.rainChance < 0.1 ? '' : `${Math.round(d.rainChance * 100)}%`}</span>
              <span className="wweek__lo num">{deg(d.lo)}</span>
              <span className="wweek__bar" aria-hidden="true">
                {d.lo === null || d.hi === null ? null : <i className="wweek__fill" style={{ left: x(d.lo), right: `calc(100% - ${x(d.hi)})` }} />}
              </span>
              <span className="wweek__hi num">{deg(d.hi)}</span>
            </span>
          ))}
        </button>
      )}
    </div>
  )
}
