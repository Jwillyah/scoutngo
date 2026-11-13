import { useEffect, useMemo, useState } from 'react'
import { getPosition, getTimes } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { groundOf } from '../core/homeDay.ts'
import { freshSky, skyCondition } from '../core/skyWord.ts'
import { cloudWords, localDate } from '../core/modelSkill.ts'
import type { MetarSky } from '../core/metar.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import { cloudTile, pressureTrend, pressureWords, rainTileLine, uvBand, uvLine } from '../core/weatherTiles.ts'
import { dayAgreement, dayIcon, leading, modelName } from '../core/weatherWords.ts'
import { useBlend } from '../lib/blendData.ts'
import { useNowcast } from '../lib/stormData.ts'
import { nearestStation, stationReport } from '../lib/stationNear.ts'
import { fetchBriefWind, fetchWeatherExtras, hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import { formatTemperature, type Units } from '../lib/units.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import { gustWords, windAt, windWords } from '../lib/windNow.ts'
import { PageShell } from './PageShell.tsx'
import { MarineLine } from './MarineLine.tsx'
import { RadarStrip } from './RadarStrip.tsx'
import { SkyGlyph } from './SkyGlyph.tsx'
import { SkyIconSvg } from './SkyIconSvg.tsx'
import { DaysPage, ModelsPage } from './WeatherPages.tsx'

/*
 * THE WEATHER PAGE (Batch Pages, Section 2; board WeatherPage). Its own page:
 * from the home's "Weather ›" (and its temperature and hourly strip), and
 * from the map's Sky sheet. One screen at 390 x 844 and 412 x 915
 * (scripts/audit-pages.mjs):
 *
 *   top      the temperature now, the sky in a word, feels-like, high and low
 *   hours    the next six, the sunset or sunrise in its place
 *   tiles    Wind (gusts) · Rain (next 6 h) · UV (until) · Humidity (dew
 *            point) · Pressure (trend) · Cloud (the station that saw it)
 *   7 days   blended from the models, as the Weather tab had it
 *   radar    the strip round the spot; a tap opens the radar on the map
 *   foot     "N models agree · X leads here ›" and "How we got this ›"
 *
 * The temperature, high and low, wind and sky word are the home's own (the
 * briefing's forecast, the wind leaned to the station): the two screens
 * never say two numbers. Arithmetic in src/core/weatherTiles.ts.
 */
interface WeatherPageProps {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  now: Date
  onBack: () => void
  /** The round Map button (Batch Flow, Section 2). */
  onMap?: () => void
  /** The radar on the map. */
  onRadar: (scanAt: Date | null) => void
}

export function WeatherPage({ venue, placeName, timeZone, units, now, onBack, onMap, onRadar }: WeatherPageProps) {
  const { state, reason } = useBlend(venue, timeZone, true)
  const nowcast = useNowcast(venue, true)
  const obs = useStationObs(venue)
  const [wx, setWx] = useState<Hourly | null>(null)
  const [extra, setExtra] = useState<Hourly | null>(null)
  const [sky, setSky] = useState<MetarSky | null>(null)
  const [view, setView] = useState<'main' | 'days' | 'models'>('main')
  useEffect(() => {
    let live = true
    void fetchBriefWind(venue).then((w) => live && setWx(w), () => undefined)
    void fetchWeatherExtras(venue).then((x) => live && setExtra(x), () => undefined)
    /* The Cloud tile: the nearest airport station's latest report (only its id is asked), within 25 km. */
    void nearestStation(venue, 25)
      .then((s) => (s === null ? null : stationReport(s.id)))
      .then((r) => live && setSky(r?.sky ?? null), () => undefined)
    return () => {
      live = false
    }
  }, [venue.lat, venue.lon]) // eslint-disable-line react-hooks/exhaustive-deps

  const deg = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const clock = (d: Date) => formatClock(d, timeZone)
  const hourWord = (d: Date) => formatClock(d, timeZone).replace(/:00 /, ' ')
  const at = (s: Hourly | null, name: string, t: Date) => (s === null ? null : hourlyAt(s, name, t))
  const sunUp = (t: Date) => getPosition(t, venue.lat, venue.lon).altitude > -0.8

  /* The home's numbers: the briefing's hour now, its day's high and low. */
  const today = localDate(now, timeZone)
  const dayTemps = wx === null ? [] : wx.times.map((t, i) => ({ t, v: wx.values.temperature_2m?.[i] ?? null })).filter((x) => x.v !== null && localDate(new Date(x.t), timeZone) === today).map((x) => x.v as number)
  const temp = at(wx, 'temperature_2m', now)
  /* One sky word (src/core/skyWord.ts, Batch NOW 1.3): the station's when fresh, else the layers. */
  const skyAt = (t: Date, station: ReturnType<typeof freshSky>) => skyCondition({ code: at(wx, 'weather_code', t), layers: { low: at(wx, 'cloud_cover_low', t), mid: at(wx, 'cloud_cover_mid', t), high: at(wx, 'cloud_cover_high', t) }, day: sunUp(t), station })
  const cond = skyAt(now, freshSky(obs, now))
  const feels = at(extra, 'apparent_temperature', now)
  const wind = windAt(wx, now, obs)

  /* The hours: six from this one, the sunset or sunrise in place of the hour nearest it. */
  const cells = useMemo(() => {
    const start = Math.floor(now.getTime() / 3_600_000) * 3_600_000
    const hours = Array.from({ length: 6 }, (_, i) => ({ kind: 'hour' as const, at: new Date(start + i * 3_600_000) }))
    const sun = [0, 1].flatMap((k) => {
      const tt = getTimes(new Date(now.getTime() + k * 86_400_000), venue.lat, venue.lon)
      return [{ at: tt.sunrise as Date, word: 'sunrise' as const }, { at: tt.sunset as Date, word: 'sunset' as const }]
    }).find((s) => s.at instanceof Date && s.at.getTime() > now.getTime() && s.at.getTime() < start + 6 * 3_600_000)
    if (sun === undefined) return hours
    const near = hours.reduce((a, b, i) => (Math.abs(b.at.getTime() - sun.at.getTime()) < Math.abs(hours[a].at.getTime() - sun.at.getTime()) && i > 0 ? i : a), 1)
    return hours.map((h, i) => (i === near ? { kind: 'sun' as const, at: sun.at, word: sun.word } : h))
  }, [now, venue.lat, venue.lon])

  /* The tiles. */
  const next6 = state === null ? [] : state.hours.filter((h) => h.at.getTime() > now.getTime() - 3_600_000 && h.at.getTime() <= now.getTime() + 6 * 3_600_000).map((h) => ({ at: h.at, chance: h.rain.chance }))
  const rainNow = next6[0]?.chance ?? null
  const uv = at(extra, 'uv_index', now)
  const uvLater = extra === null ? [] : extra.times.filter((t) => t > now.getTime() && localDate(new Date(t), timeZone) === today).map((t) => ({ at: new Date(t), uv: hourlyAt(extra, 'uv_index', new Date(t)) }))
  const hum = at(extra, 'relative_humidity_2m', now)
  const dew = at(extra, 'dew_point_2m', now)
  const hpa = at(extra, 'pressure_msl', now)
  const trend = pressureTrend(hpa, at(extra, 'pressure_msl', new Date(now.getTime() - 3 * 3_600_000)))
  const blendNow = state?.hours.find((h) => Math.abs(h.at.getTime() - now.getTime()) <= 1_800_000) ?? null
  /* Batch NOW, Section 1.3: without a station, the tile says the headline's one sky word, never a second one. */
  const cloud = cloudTile(sky, blendNow?.cloud.value ?? null, (pct) => cond?.word ?? cloudWords(pct))
  const imperial = units.distance === 'ft'
  const tiles: { k: string; label: string; big: string; line: string }[] = [
    { k: 'wind', label: 'Wind', big: windWords(wind, units.wind) ?? '—', line: gustWords(wind, units.wind) ?? 'gusts not said' },
    { k: 'rain', label: 'Rain', big: rainNow === null ? '—' : `${Math.round(rainNow * 100)}%`, line: rainTileLine(next6, now, hourWord) },
    { k: 'uv', label: 'UV', big: uv === null ? '—' : String(Math.round(uv)), line: uvLine(uv === null ? null : Math.round(uv), uvLater.map((h) => ({ at: h.at, uv: h.uv === null ? null : Math.round(h.uv) })), hourWord) ?? (uv === null ? 'not said' : uvBand(uv).word) },
    { k: 'humidity', label: 'Humidity', big: hum === null ? '—' : `${Math.round(hum)}%`, line: dew === null ? 'dew point not said' : `dew point ${deg(dew)}` },
    { k: 'pressure', label: 'Pressure', big: pressureWords(hpa, imperial), line: trend ?? 'trend not said' },
    { k: 'cloud', label: 'Cloud', big: cloud.big, line: cloud.line },
  ]

  /* The models' line at the foot. */
  const lead = state === null ? null : leading(state.history, state.models)
  const todays = state === null ? null : dayAgreement(state.hours.filter((h) => localDate(h.at, timeZone) === today))
  const modelsLine = state === null ? null : `${todays !== null && todays.agree ? `${state.models.length} models agree` : todays === null ? `${state.models.length} models` : `Models ${todays.word}`}${lead === null ? '' : ` · ${modelName(lead)} leads here`} ›`

  /* The week's scale for the range bars. */
  const lows = state?.days.map((d) => d.lo).filter((v): v is number => v !== null) ?? []
  const highs = state?.days.flatMap((d) => [d.hi, d.hiHi]).filter((v): v is number => v !== null) ?? []
  const lo = Math.min(...lows)
  const hi = Math.max(...highs)
  const x = (v: number) => `${(((v - lo) / Math.max(1, hi - lo)) * 100).toFixed(1)}%`
  const ground = groundOf(getPosition(now, venue.lat, venue.lon).altitude, at(wx, 'weather_code', now), false)
  const dist = imperial ? 'mi' : 'km'
  const alerts = nowcast?.alerts ?? []

  const how = (
    <>
      <p>The temperature, the sky word, high and low: Open-Meteo's forecast for this spot, the home's own numbers.</p>
      <p>The wind: the same forecast{obs === null ? '' : `, leaned toward ${obs.id}'s report of ${formatShortHour(obs.at, timeZone)}`} (src/core/nowcast.ts).</p>
      <p>Feels-like, UV, humidity, dew point, pressure: Open-Meteo, by the hour. Pressure's trend: now against three hours ago; under 1 hPa is steady.</p>
      <p>Cloud: {sky === null ? 'the blended forecast\'s cover (no report came back from an airport station within 25 km).' : `${sky.station}'s latest report, the most cloud it gives and how high.`}</p>
      <p>Rain and the 7 days: {state === null ? 'the models, once they answer.' : `${state.models.length} models (${state.models.map(modelName).join(', ')}), each corrected for how it has done here and blended by it.`}</p>
      <p>Radar: the nearest rain on the latest scan.</p>
    </>
  )

  return (
    <PageShell
      kind="wpage"
      title="Weather"
      sub={`${placeName} · now`}
      ground={ground}
      onBack={onBack}
      onMap={onMap}
      inner={{ open: view !== 'main', close: () => setView('main') }}
      how={how}
      foot={
        modelsLine === null ? <span /> : (
          <button type="button" className="dpage__link" onClick={() => setView('models')}>
            {modelsLine}
          </button>
        )
      }
    >
      {view !== 'main' && state !== null ? (
        view === 'models' ? <ModelsPage state={state} venue={venue} timeZone={timeZone} units={units} at={now} risk={null} /> : <DaysPage state={state} venue={venue} timeZone={timeZone} units={units} risk={null} />
      ) : (
        <>
          {alerts.slice(0, 1).map((a) => (
            <details key={a.event + a.headline} className="wpage__alert">
              <summary>
                {a.event}
                {a.ends === null ? '' : ` · until ${clock(a.ends)}`} ›
              </summary>
              <p>{a.headline}</p>
              <p>{a.sender}, as issued.</p>
            </details>
          ))}
          <div className="wpage__top">
            <p className="wpage__temp num" role="status" data-shared="temp" data-value={temp === null ? '' : deg(temp)}>
              {temp === null ? (wx === null ? '…' : '—') : deg(temp)}
            </p>
            <div className="wpage__side">
              <p className="wpage__cond">{cond?.word ?? '—'}</p>
              <p className="wpage__line num">
                feels {deg(feels)} · H {deg(dayTemps.length === 0 ? null : Math.max(...dayTemps))} L {deg(dayTemps.length === 0 ? null : Math.min(...dayTemps))}
              </p>
            </div>
          </div>

          <ol className="hstrip wpage__hours">
            {cells.map((c) => {
              if (c.kind === 'sun') {
                return (
                  <li key={`sun${c.at.getTime()}`} className="hstrip__step hstrip__step--sun">
                    <span className="hstrip__at">{clock(c.at).replace(/ [AP]M$/, '')}</span>
                    <SkyIconSvg icon="sun" className="hstrip__icon" />
                    <span className="hstrip__t">{c.word === 'sunset' ? 'set' : 'rise'}</span>
                  </li>
                )
              }
              const t = new Date(c.at.getTime() + 1_800_000)
              const cc = skyAt(t, null)
              return (
                <li key={c.at.getTime()} className="hstrip__step">
                  <span className="hstrip__at">{c.at.getTime() <= now.getTime() ? 'Now' : formatShortHour(c.at, timeZone)}</span>
                  {cc === null ? <span className="hstrip__icon">—</span> : <SkyIconSvg icon={cc.icon} className="hstrip__icon" />}
                  <span className="hstrip__t">{c.at.getTime() <= now.getTime() ? deg(temp) : deg(at(wx, 'temperature_2m', t))}</span>
                </li>
              )
            })}
          </ol>

          <ul className="wtiles">
            {tiles.map((t) => (
              <li key={t.k} className={`wtile wtile--${t.k}`}>
                <span className="wtile__label">{t.label}</span>
                <span className="wtile__big num">{t.big}</span>
                <span className="wtile__line">{t.line}</span>
              </li>
            ))}
          </ul>

          {state === null ? (
            <p className="wpage__note">{reason === null ? 'Asking six forecast models about here…' : `No 7 days: ${reason}.`}</p>
          ) : (
            <button type="button" className="wweek" onClick={() => setView('days')}>
              <span className="wweek__head">7 days · blended from {state.models.length} models</span>
              {state.days.map((d) => (
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

          <RadarStrip venue={venue} radar={nowcast?.radar ?? null} timeZone={timeZone} dist={dist} onOpen={() => onRadar(nowcast?.radar?.scanAt ?? null)} short />
          <MarineLine venue={venue} />
        </>
      )}
    </PageShell>
  )
}
