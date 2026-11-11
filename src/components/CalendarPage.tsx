import '../styles/calendar.css'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { beachFactorAt } from '../core/beachFactor.ts'
import { bestTime, calendarMonth, type CalendarDay } from '../core/calendarMonth.ts'
import { CAT_LABEL, CAT_ORDER, dayCats, dayLines, shownCats, type CalCat } from '../core/calendarV2.ts'
import type { LatLon } from '../core/geo.ts'
import { rankNights } from '../core/milkyWay.ts'
import { localDate } from '../core/moonTimes.ts'
import { formatClock, zonedTimeToUtc } from '../core/timezone.ts'
import { surfAt } from '../lib/surfDay.ts'
import { fetchMonthExtremes, fetchSkyHours, hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import type { TideSheetData } from '../lib/useTideSheet.ts'
import { formatWind, type WindUnit } from '../lib/units.ts'

/*
 * THE CALENDAR v2 (Batch Pages, Section 4; board CalendarV2): the sky
 * gradient, round month buttons, the legend's chips as filters, each mark a
 * coloured circle with a white icon, two a day at most
 * (src/core/calendarV2.ts); the selected day a white tile and, under the
 * grid, its list in words with the same icons; "Plan this day" white. Days
 * past the forecast are faded and carry no marks.
 *
 * Before (29 Oct): THE MONTH, AS A CALENDAR.
 *
 * A month grid, Sunday to Saturday, today ringed, swiped for the next or the
 * last. Each day carries small symbols for what is good there that day, all
 * worked out in src/core/calendarMonth.ts: the moon's real phase, glass and
 * colour at sunrise and sunset (forecast days only), a low tide near either,
 * good surf, a Milky Way night, a meteor peak, a supermoon, the moon by the
 * sun. A day past the forecast says so and carries only what needs none.
 * Tap a day for its best windows in words and "Plan this day".
 *
 * A full page: no map, no time bar. Fits 390 x 844 with no scroll (the
 * overflow audit opens it).
 */
interface CalendarPageProps {
  venue: LatLon
  timeZone: string
  stationId: string | null
  /** The Tide sheet's data: the wind, the sea and which way the beach faces. */
  tideData: TideSheetData
  windUnit: WindUnit
  onPlan: (date: string, at: Date) => void
  onClose: () => void
}

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
/* A Milky Way night worth a symbol: the ranking's own 0 to 100. */
const MILKY_SCORE = 60

const MONTH_NAME = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function CalendarPage({ venue, timeZone, stationId, tideData, windUnit, onPlan, onClose }: CalendarPageProps) {
  /* Read once when the page opens: what has passed is left out of the day's list. */
  const [nowMs] = useState(() => Date.now())
  const today = localDate(new Date(nowMs), timeZone)
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [picked, setPicked] = useState<string | null>(today)
  const [filters, setFilters] = useState<ReadonlySet<CalCat>>(new Set())
  const [sky, setSky] = useState<Hourly | null>(null)
  const [tides, setTides] = useState<{ key: string; list: { at: Date; kind: 'high' | 'low' }[] | null } | null>(null)

  useEffect(() => {
    let live = true
    void fetchSkyHours(venue).then((r) => {
      if (live) setSky(r?.value ?? null)
    })
    return () => {
      live = false
    }
  }, [venue])

  /* The tide turns for the grid shown: from its first day, 31 days on, and the week either side. */
  const tideKey = `${stationId}|${ym.y}-${ym.m}`
  useEffect(() => {
    if (stationId === null) return
    let live = true
    const from = zonedTimeToUtc(`${ym.y}-${String(ym.m).padStart(2, '0')}-01`, '00:00', timeZone)
    if (from === null) return
    void Promise.all([fetchMonthExtremes(stationId, new Date(from.getTime() - 7 * 86_400_000)), fetchMonthExtremes(stationId, new Date(from.getTime() + 24 * 86_400_000))]).then(([a, b]) => {
      if (!live) return
      const list = [...(a?.value ?? []), ...(b?.value ?? [])]
      setTides({ key: tideKey, list: list.length === 0 ? null : list })
    })
    return () => {
      live = false
    }
  }, [stationId, ym.y, ym.m, timeZone, tideKey])

  const wind = tideData.wind.value
  const marine = tideData.marine.value === 'inland' ? null : tideData.marine.value
  const facing = tideData.facing.value === null || tideData.facing.value === 'inland' ? null : tideData.facing.value.facing
  const milky = useMemo(() => new Set(rankNights(venue.lat, venue.lon, new Date(), 30, timeZone).filter((n) => n.score >= MILKY_SCORE).map((n) => n.date)), [venue, timeZone])
  /* The forecast reaches as far as the hours that came back. */
  const forecastUntil = useMemo(() => {
    const last = [wind?.times, sky?.times].filter((t): t is number[] => Array.isArray(t) && t.length > 0).map((t) => t[t.length - 1])
    return last.length === 0 ? null : localDate(new Date(Math.min(...last)), timeZone)
  }, [wind, sky, timeZone])

  const days = useMemo(
    () =>
      calendarMonth({
        year: ym.y,
        month: ym.m,
        lat: venue.lat,
        lon: venue.lon,
        timeZone,
        today,
        forecastUntil,
        extremes: tides !== null && tides.key === tideKey ? tides.list : null,
        windAt: (t) => {
          if (wind === null) return null
          const s = hourlyAt(wind, 'wind_speed_10m', t)
          const f = hourlyAt(wind, 'wind_direction_10m', t)
          return s === null || f === null ? null : { speedMps: s, fromDeg: f }
        },
        skyAt: (t) => (sky === null ? null : { low: hourlyAt(sky, 'cloud_cover_low', t), mid: hourlyAt(sky, 'cloud_cover_mid', t), high: hourlyAt(sky, 'cloud_cover_high', t) }),
        facing,
        surfFtAt: (t) => (marine === null ? null : (surfAt(marine, t, facing, beachFactorAt(venue))?.estimate.faceFt ?? null)),
        milkyDates: milky,
      }),
    [ym, venue, timeZone, today, forecastUntil, tides, tideKey, wind, sky, facing, marine, milky],
  )

  const step = (n: number) => setYm(({ y, m }) => ({ y: m + n > 12 ? y + 1 : m + n < 1 ? y - 1 : y, m: ((m + n + 11) % 12) + 1 }))
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const pickedDay = days.find((d) => d.date === picked) ?? null
  const clock = (t: Date | null) => (t === null ? '—' : formatClock(t, timeZone))
  const speed = (mps: number) => formatWind(mps, windUnit)
  const dayTitle = (d: CalendarDay) => `${d.today ? 'Today, ' : ''}${new Date(`${d.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}`

  return createPortal(
    <div className="cal cal2" role="dialog" aria-label="Calendar">
      <div className="cal2__head">
        <button type="button" className="cal2__nav" aria-label="The month before" onClick={() => step(-1)}>
          ‹
        </button>
        <p className="cal2__month">{MONTH_NAME.format(new Date(Date.UTC(ym.y, ym.m - 1, 15)))}</p>
        <button type="button" className="cal2__nav" aria-label="The month after" onClick={() => step(1)}>
          ›
        </button>
        <button type="button" className="cal2__nav cal__close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>

      {/* The legend is the filter (Batch Pages, Section 4): a chip on shows only its kind. */}
      <div className="cal2__legend" role="group" aria-label="Show only">
        {CAT_ORDER.map((c) => {
          const on = filters.has(c)
          return (
            <button
              key={c}
              type="button"
              className={`cal2__chip${on ? ' cal2__chip--on' : ''}`}
              aria-pressed={on}
              onClick={() => {
                const next = new Set(filters)
                if (on) next.delete(c)
                else next.add(c)
                setFilters(next)
              }}
            >
              <CalIcon cat={c} />
              {CAT_LABEL[c]}
            </button>
          )
        })}
      </div>

      <div
        className="cal2__grid"
        data-sideways
        onPointerDown={(e) => {
          swipe.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={(e) => {
          const s = swipe.current
          swipe.current = null
          if (s === null) return
          const dx = e.clientX - s.x
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) step(dx < 0 ? 1 : -1)
        }}
      >
        {WEEK.map((w, i) => (
          <span key={i} className="cal2__dow" aria-hidden="true">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const marks = shownCats(d, filters)
          const faded = !d.inMonth || (!d.forecast && !d.past)
          return (
            <button
              key={d.date}
              type="button"
              className={`cal2__day${faded ? ' cal2__day--faded' : ''}${d.date === picked ? ' cal2__day--on' : ''}`}
              aria-pressed={d.date === picked}
              aria-label={`${d.date}${marks.length === 0 ? '' : `: ${dayCats(d).map((c) => CAT_LABEL[c]).join(', ')}`}${d.forecast || d.past ? '' : ', past the forecast'}`}
              onClick={() => setPicked(d.date)}
            >
              <span className="cal2__num num">{Number(d.date.slice(8))}</span>
              <span className="cal2__marks">
                {marks.map((c) => (
                  <CalIcon key={c} cat={c} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="cal2__card" aria-live="polite">
        {pickedDay === null ? (
          <p className="cal2__title">Tap a day.</p>
        ) : (
          <>
            <p className="cal2__title">{dayTitle(pickedDay)}</p>
            <ul className="cal2__lines">
              {dayLines(pickedDay, clock, speed, new Date(nowMs)).map((l) => (
                <li key={l.text} className="cal2__line">
                  {l.cat === null ? <span className="cal2__dot" aria-hidden="true" /> : <CalIcon cat={l.cat} />}
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <button
        type="button"
        className="btn btn--primary cal2__plan"
        disabled={pickedDay === null || bestTime(pickedDay) === null}
        onClick={() => {
          const at = pickedDay === null ? null : bestTime(pickedDay)
          if (pickedDay !== null && at !== null) onPlan(pickedDay.date, at)
        }}
      >
        Plan this day
      </button>
    </div>,
    document.body,
  )
}

/* The five marks: a coloured circle with a white icon (board CalendarV2): a wave, a sunset arc, glassy lines, a tide arch, a moon. */
const CAT_PATH: Record<CalCat, ReactNode> = {
  surf: <path d="M4 13c2-3 4-3 6 0s4 3 6 0 3-2 4-1" />,
  sky: (
    <>
      <path d="M7 15a5 5 0 0 1 10 0" />
      <path d="M4 15h16" />
    </>
  ),
  glassy: <path d="M6 9h12M5 12h14M7 15h10" />,
  tide: <path d="M7 15a5 5 0 0 1 10 0" />,
  moon: <circle cx="12" cy="12" r="4" />,
}
function CalIcon({ cat }: { cat: CalCat }) {
  return (
    <svg className={`cal2__icon cal2__icon--${cat}`} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" className="cal2__disc" />
      <g className={`cal2__glyph${cat === 'moon' ? ' cal2__glyph--fill' : ''}`}>{CAT_PATH[cat]}</g>
    </svg>
  )
}
