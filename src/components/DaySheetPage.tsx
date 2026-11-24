import { useCallback, useEffect, useMemo, useState } from 'react'
import { daySheet, dayWords, shiftDate, warningsLine, type BandKind, type DayHour, type DaySheet } from '../core/daySheet.ts'
import { groundOf } from '../core/homeDay.ts'
import { formatClock, formatShortClock, venueTimeZone, deviceTimeZone } from '../core/timezone.ts'
import { getSunPosition } from '../core/sun.ts'
import { venueClock } from '../lib/forecast.ts'
import { DAY_REFRESH_MS, dayWxOf, fetchDayForecast, type DayForecast } from '../lib/daySheetData.ts'
import { renderSheet, shareSheet, type SheetPicture } from '../lib/daySheetImage.ts'
import { formatWind, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { PageShell } from './PageShell.tsx'
import '../styles/daysheet.css'

/*
 * THE DAY SHEET (Batch SIMPLE-3, Section 4; board Day_Sheet.png): Menu › Plan
 * a shoot opens this, for the spot you are at and today. A strip of the sun's
 * height over the day on its bands, an hour a row from first light to last
 * light, one warnings line, then Share as image and Add positions ›, which is
 * the planner, unchanged. Every number is src/core/daySheet.ts; this draws.
 *
 * FOG IS A SEAM, `fogAt`: where fog risk is high in the hour starting at an
 * instant (null where it was not worked out). Not given, no fog mark.
 */
export interface DaySpot {
  id: string
  name: string
  lat: number
  lon: number
}

interface Props {
  /** The spot the sheet opens on (the app's current one). */
  here: DaySpot
  /** Other saved spots, for the picker at the top. */
  spots?: readonly DaySpot[]
  units: Units
  onBack: () => void
  /** "Add positions ›": the planner, asked for by this tap (src/lib/planner.ts askPlanner). */
  onAddPositions: () => void
  /** Fog risk by hour for a spot; see the header. */
  fogAt?: (spot: DaySpot, hourStart: Date) => boolean | null
  /** For tests: the clock. */
  clock?: () => Date
}

const BAND_WORD: Record<BandKind, string> = { golden: 'golden', side: 'side', top: 'top', color: 'color', blue: 'blue' }

function Arrow({ travel }: { travel: number }) {
  return (
    <svg className="dsheet__arrow" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: `rotate(${Math.round(travel)}deg)` }}>
      <path d="M12 3v17M5.5 9.5 12 3l6.5 6.5" />
    </svg>
  )
}

const degrees = (n: number): string => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n))}°`

function Strip({ sheet, tz }: { sheet: DaySheet; tz: string }) {
  if (sheet.span === null) return null
  const W = 342
  const x0 = 12
  const x1 = W - 12
  const from = sheet.span.from.getTime()
  const span = sheet.span.to.getTime() - from
  const X = (t: number) => x0 + ((t - from) / span) * (x1 - x0)
  const base = 70
  const Y = (a: number) => base - (Math.max(0, a) / sheet.maxAltitude) * 50
  const path = sheet.curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${X(c.t).toFixed(1)} ${Y(c.altitude).toFixed(1)}`).join(' ')
  const e = sheet.edges
  const mark = (d: Date | null, text: string, anchor: 'start' | 'middle' | 'end') => (d === null ? null : (
    <text x={Math.min(x1, Math.max(x0, X(d.getTime())))} y={100} textAnchor={anchor} className="dsheet__tick">{text}</text>
  ))
  return (
    <svg className="dsheet__strip" viewBox={`0 0 ${W} 112`} role="img" aria-label="The sun's height over the day, on its light bands" data-strip>
      <path d={path} className="dsheet__curve" />
      {sheet.bands.map((b) => (
        <rect key={`${b.band}${b.from}`} x={X(b.from)} y={76} width={Math.max(1, X(b.to) - X(b.from))} height={10} className={`dsheet__band dsheet__band--${b.band}`} />
      ))}
      {sheet.nowAt === null ? null : (
        <g data-now>
          <line x1={X(sheet.nowAt)} x2={X(sheet.nowAt)} y1={8} y2={90} className="dsheet__now" />
          <text x={X(sheet.nowAt) + 4} y={16} className="dsheet__nowword">now</text>
        </g>
      )}
      {mark(e.sunrise, `rise ${formatShortClock(e.sunrise ?? new Date(0), tz)}`, 'start')}
      {e.noon === null ? null : mark(e.noon.at, `noon ${Math.round(e.noon.altitude)}°`, 'middle')}
      {mark(e.sunset, `set ${formatShortClock(e.sunset ?? new Date(0), tz)}`, 'end')}
    </svg>
  )
}

export function DaySheetPage({ here, spots = [], units, onBack, onAddPositions, fogAt, clock }: Props) {
  const nowOf = useCallback(() => (clock === undefined ? new Date() : clock()), [clock])
  const [now, setNow] = useState<Date>(nowOf)
  const [spot, setSpot] = useState<DaySpot>(here)
  const tz = useMemo(() => venueTimeZone(spot.lat, spot.lon) ?? deviceTimeZone(), [spot.lat, spot.lon])
  const today = venueClock(now, tz).date
  const [picked, setPicked] = useState<string | null>(null)
  const date = picked ?? today
  /* The forecast with the spot it was asked for, so a new spot never shows the last one's. */
  const [got, setGot] = useState<{ key: string; forecast: DayForecast | null } | null>(null)
  const spotKey = `${spot.lat},${spot.lon}`
  const forecast = got !== null && got.key === spotKey ? got.forecast : null
  const looked = got !== null && got.key === spotKey
  const [picture, setPicture] = useState<{ url: string; blob: Blob } | null>(null)
  const [shareNote, setShareNote] = useState<string | null>(null)

  /* The clock for the highlighted hour and the now line. */
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowOf()), 60_000)
    return () => window.clearInterval(id)
  }, [nowOf])

  /* The forecast: on open, on a new spot, and every 30 minutes while open. */
  useEffect(() => {
    let cancelled = false
    const key = `${spot.lat},${spot.lon}`
    const load = () => {
      void fetchDayForecast({ lat: spot.lat, lon: spot.lon }).then((f) => {
        if (cancelled) return
        /* A failed refresh keeps the last answer, with its age. */
        setGot((prev) => (f === null && prev !== null && prev.key === key ? prev : { key, forecast: f }))
      })
    }
    load()
    const id = window.setInterval(load, DAY_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [spot.lat, spot.lon])

  useEffect(
    () => () => {
      if (picture !== null) URL.revokeObjectURL(picture.url)
    },
    [picture],
  )

  const sheet = useMemo(
    () =>
      daySheet({
        date,
        lat: spot.lat,
        lon: spot.lon,
        timeZone: tz,
        now,
        wx: forecast === null ? null : dayWxOf(forecast.hourly),
        fogAt: fogAt === undefined ? undefined : (h) => fogAt(spot, h),
        windWords: (mps) => formatWind(mps, units.wind),
      }),
    [date, spot, tz, now, forecast, fogAt, units.wind],
  )
  const warning = warningsLine(sheet, forecast !== null)
  const age = forecast === null ? null : `${forecast.stale ? 'from' : 'updated'} ${formatClock(new Date(forecast.fetchedAt), tz)}`
  const ground = groundOf(getSunPosition(now, spot.lat, spot.lon).altitude, null, false)
  const sub = `${spot.name} · ${dayWords(date)}`
  const last = shiftDate(today, 6)
  const unit = windUnitLabel(units.wind)

  const windCell = (r: DayHour): string => {
    const v = windIn(r.windMps, units.wind)
    return v === null ? '—' : `${Math.round(v)}${r.windFrom === null ? '' : ` ${r.windFrom}`}`
  }
  const pct = (v: number | null): string => (v === null ? '—' : `${Math.round(v)}%`)
  const lightCell = (r: DayHour): string => `${r.word}${r.fog ? ' · fog' : ''}`
  const sunCell = (r: DayHour): string => degrees(r.altitude)

  const share = async () => {
    setShareNote(null)
    const pic: SheetPicture = {
      title: 'Day sheet',
      sub,
      head: ['Time', 'Sun', 'Light', 'Cloud', `Wind ${unit}`, 'Rain'],
      rows: sheet.rows.map((r) => ({ cells: [r.label, sunCell(r), lightCell(r), pct(r.cloud), windCell(r), pct(r.rain)], current: r.current, band: r.band })),
      warning,
      age,
    }
    const blob = await renderSheet(pic)
    if (blob === null) {
      setShareNote("The picture didn't draw on this phone")
      return
    }
    const result = await shareSheet(blob, `day-sheet-${date}.png`)
    if (result === 'show') setPicture({ url: URL.createObjectURL(blob), blob })
  }

  return (
    <PageShell kind="dsheet" title="Day sheet" sub={sub} ground={ground} onBack={picture === null ? onBack : () => setPicture(null)} how={<HowWeGotThis />} footNote="Works offline · saved on this phone">
      <div className="dsheet">
        <div className="dsheet__pick">
          <label className="dsheet__field">
            <span className="dsheet__fl">Spot</span>
            <select
              className="dsheet__ctl"
              value={spot.id}
              onChange={(e) => {
                const all = [here, ...spots]
                setSpot(all.find((s) => s.id === e.target.value) ?? here)
              }}
            >
              {[here, ...spots.filter((s) => s.id !== here.id)].map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="dsheet__field">
            <span className="dsheet__fl">Day</span>
            <input className="dsheet__ctl" type="date" value={date} min={today} max={last} onChange={(e) => setPicked(e.target.value === '' ? null : e.target.value)} />
          </label>
        </div>
        <p className="dsheet__age" data-age>
          {age === null ? (looked ? 'The forecast did not say' : 'Getting the forecast…') : age} · auto every 30 min
        </p>
        {sheet.rows.length === 0 ? (
          <p className="dsheet__none">The sun has no first or last light here on this day.</p>
        ) : (
          <>
            <section className="dsheet__card dsheet__chart">
              <Strip sheet={sheet} tz={tz} />
              <ul className="dsheet__legend" aria-label="Light bands">
                {(['golden', 'side', 'top', 'color', 'blue'] as const).map((b) => (
                  <li key={b}>
                    <span className={`dsheet__swatch dsheet__band--${b}`} aria-hidden="true" /> {BAND_WORD[b]}
                  </li>
                ))}
              </ul>
            </section>
            <section className="dsheet__card dsheet__table" aria-label="The day by the hour">
              <div className="dsheet__row dsheet__row--head" aria-hidden="true">
                <span>Time</span>
                <span>Sun</span>
                <span>Light</span>
                <span>Cloud</span>
                <span>Wind {unit}</span>
                <span>Rain</span>
              </div>
              {sheet.rows.map((r) => (
                <div key={r.start.getTime()} className={`dsheet__row${r.current ? ' dsheet__row--now' : ''}`} data-hour={r.label} aria-current={r.current ? 'time' : undefined}>
                  <b className="dsheet__t">{r.label}</b>
                  <span className="dsheet__sun num">
                    <Arrow travel={r.travel} />
                    {sunCell(r)}
                  </span>
                  <span className="dsheet__light">
                    <span className="dsheet__lw">
                      {r.band === null ? null : <i className={`dsheet__dot dsheet__band--${r.band}`} aria-hidden="true" />}
                      <span data-light>{r.word}</span>
                    </span>
                    {r.fog ? <span className="dsheet__fog" data-fog> · fog</span> : null}
                  </span>
                  <span className="num">{pct(r.cloud)}</span>
                  <span className="num">{windCell(r)}</span>
                  <span className={`num${r.rain === 0 ? ' dsheet__faint' : ''}`}>{pct(r.rain)}</span>
                </div>
              ))}
            </section>
            {warning === null ? null : (
              <p className="dsheet__warn" data-warnings>
                {warning}
              </p>
            )}
          </>
        )}
        {shareNote === null ? null : <p className="dsheet__warn">{shareNote}</p>}
        <div className="dsheet__actions">
          <button type="button" className="dsheet__btn dsheet__btn--primary" data-share disabled={sheet.rows.length === 0} onClick={() => void share()}>
            Share as image
          </button>
          <button type="button" className="dsheet__btn" data-add-positions onClick={onAddPositions}>
            Add positions ›
          </button>
        </div>
      </div>
      {picture === null ? null : (
        <div className="dsheet__show" role="dialog" aria-label="The day sheet as a picture" data-picture>
          <p className="dsheet__showhint">Press and hold the picture to save it</p>
          <img className="dsheet__img" src={picture.url} alt={`The day sheet, ${sub}`} />
          <button type="button" className="dsheet__btn" onClick={() => setPicture(null)}>
            Close
          </button>
        </div>
      )}
    </PageShell>
  )
}

function HowWeGotThis() {
  return (
    <>
      <p>The sun's height and direction, and the golden, color and blue times, are worked out on this phone from the date and the spot (the same marks as the Sky page).</p>
      <p>Cloud, wind and rain chance are the hourly forecast. Fog is shown where the fog risk for that hour is high. Where the forecast did not say, there is a dash.</p>
      <p>Golden is the sun from 6° up to the horizon (sunset), Color from sunset to 4° down, Blue from 4° to 6° down, the morning the other way. Warm side is 6° to 15°, Side 15° to 30°, Top 30° and up. Soft is cloud cover of 60% or more; Flat, 90% or more. The arrow is the way the light travels.</p>
      <p>The picture is drawn on this phone. It goes nowhere unless you share it.</p>
    </>
  )
}

export default DaySheetPage
