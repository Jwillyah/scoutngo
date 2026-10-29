import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { bestTime, calendarMonth, FILTERS, type CalendarDay, type CalendarFilter, type DayMark } from '../core/calendarMonth.ts'
import type { LatLon } from '../core/geo.ts'
import { rankNights } from '../core/milkyWay.ts'
import { localDate } from '../core/moonTimes.ts'
import { formatClock, zonedTimeToUtc } from '../core/timezone.ts'
import { surfAt } from '../lib/surfDay.ts'
import { fetchMonthExtremes, fetchSkyHours, hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import type { TideSheetData } from '../lib/useTideSheet.ts'
import { MoonGlyph } from './MoonGlyph.tsx'
import { dayWords } from '../lib/calendarWords.ts'
import type { WindUnit } from '../lib/units.ts'

/*
 * SKY › CALENDAR: THE MONTH, AS A CALENDAR (29 Oct).
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

const MARK_GLYPH: Record<DayMark, { cls: string; label: string }> = {
  'glass-rise': { cls: 'glass', label: 'Glassy sunrise' },
  'glass-set': { cls: 'glass', label: 'Glassy sunset' },
  'colour-rise': { cls: 'colour', label: 'Colourful sunrise' },
  'colour-set': { cls: 'colour', label: 'Colourful sunset' },
  'tide-rise': { cls: 'tide', label: 'Low tide near sunrise' },
  'tide-set': { cls: 'tide', label: 'Low tide near sunset' },
  surf: { cls: 'surf', label: 'Good surf' },
  milky: { cls: 'milky', label: 'Milky Way night' },
  meteor: { cls: 'meteor', label: 'Meteor shower peak' },
  supermoon: { cls: 'super', label: 'Supermoon' },
  'moon-by-sun': { cls: 'moonsun', label: 'Moon rises or sets by the sun' },
}

/** One symbol: a small shape per kind, its data colour from the CSS (gold sun, periwinkle moon; never red). */
function Mark({ kind }: { kind: DayMark }) {
  const g = MARK_GLYPH[kind]
  const half = kind.endsWith('-set') ? 'set' : kind.endsWith('-rise') ? 'rise' : ''
  return <i className={`calk calk--${g.cls}${half ? ` calk--${half}` : ''}`} aria-hidden="true" />
}

/* The key: each symbol once, in plain words. Left half of a symbol is the morning, right half the evening. */
const KEY: [DayMark, string][] = [
  ['glass-rise', 'glassy water'],
  ['colour-rise', 'colourful sky'],
  ['tide-rise', 'low tide by the sun'],
  ['surf', 'good surf'],
  ['milky', 'Milky Way night'],
  ['meteor', 'meteor peak'],
  ['supermoon', 'supermoon'],
  ['moon-by-sun', 'moon by the sun'],
]

const MONTH_NAME = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export function CalendarPage({ venue, timeZone, stationId, tideData, windUnit, onPlan, onClose }: CalendarPageProps) {
  const today = localDate(new Date(), timeZone)
  const [ym, setYm] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) }))
  const [picked, setPicked] = useState<string | null>(today)
  const [filters, setFilters] = useState<ReadonlySet<CalendarFilter>>(new Set())
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
        surfFtAt: (t) => (marine === null ? null : (surfAt(marine, t, facing)?.estimate.faceFt ?? null)),
        milkyDates: milky,
      }),
    [ym, venue, timeZone, today, forecastUntil, tides, tideKey, wind, sky, facing, marine, milky],
  )

  const shown = (d: CalendarDay): DayMark[] => {
    if (filters.size === 0) return d.marks
    const keep = new Set<DayMark>([...filters].flatMap((f) => FILTERS[f]))
    return d.marks.filter((m) => keep.has(m))
  }
  const step = (n: number) => setYm(({ y, m }) => ({ y: m + n > 12 ? y + 1 : m + n < 1 ? y - 1 : y, m: ((m + n + 11) % 12) + 1 }))
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const pickedDay = days.find((d) => d.date === picked) ?? null
  const clock = (t: Date | null) => (t === null ? '—' : formatClock(t, timeZone))

  return createPortal(
    <div className="cal" role="dialog" aria-label="Calendar">
      <div className="cal__head">
        <button type="button" className="cal__nav" aria-label="The month before" onClick={() => step(-1)}>
          ‹
        </button>
        <p className="cal__month">{MONTH_NAME.format(new Date(Date.UTC(ym.y, ym.m - 1, 15)))}</p>
        <button type="button" className="cal__nav" aria-label="The month after" onClick={() => step(1)}>
          ›
        </button>
        <button type="button" className="cal__close" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="cal__filters" role="group" aria-label="Show only">
        {(Object.keys(FILTERS) as CalendarFilter[]).map((f) => {
          const on = filters.has(f)
          return (
            <button
              key={f}
              type="button"
              className={`cal__chip${on ? ' cal__chip--on' : ''}`}
              aria-pressed={on}
              onClick={() => {
                const next = new Set(filters)
                if (on) next.delete(f)
                else next.add(f)
                setFilters(next)
              }}
            >
              {f}
            </button>
          )
        })}
      </div>

      <div
        className="cal__grid"
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
          <span key={i} className="cal__dow" aria-hidden="true">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const marks = shown(d)
          return (
            <button
              key={d.date}
              type="button"
              className={`cal__day${d.inMonth ? '' : ' cal__day--out'}${d.today ? ' cal__day--today' : ''}${d.date === picked ? ' cal__day--on' : ''}${d.forecast || d.past ? '' : ' cal__day--nofc'}`}
              aria-pressed={d.date === picked}
              aria-label={`${d.date}${d.moon.named === null ? '' : `, ${d.moon.named} moon`}${marks.length === 0 ? '' : `: ${marks.map((m) => MARK_GLYPH[m].label).join(', ')}`}${d.forecast || d.past ? '' : ', no forecast yet'}`}
              onClick={() => setPicked(d.date)}
            >
              <span className="cal__num num">{Number(d.date.slice(8))}</span>
              <MoonGlyph phase={d.moon.phase} strong={d.moon.named !== null} />
              <span className="cal__marks">
                {marks.slice(0, 6).map((m) => (
                  <Mark key={m} kind={m} />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      <div className="cal__card" aria-live="polite">
        {pickedDay === null ? (
          <p className="cal__words">Tap a day.</p>
        ) : (
          <>
            <p className="cal__words num">{dayWords(pickedDay, clock, windUnit)}</p>
            <button
              type="button"
              className="btn btn--primary cal__plan"
              disabled={bestTime(pickedDay) === null}
              onClick={() => {
                const at = bestTime(pickedDay)
                if (at !== null) onPlan(pickedDay.date, at)
              }}
            >
              Plan this day
            </button>
          </>
        )}
      </div>

      <div className="cal__key" aria-label="What the symbols mean">
        <span className="cal__keyrow">
          <MoonGlyph phase={0.5} strong /> full or new moon
        </span>
        {KEY.map(([m, words]) => (
          <span key={m} className="cal__keyrow">
            <Mark kind={m} /> {words}
          </span>
        ))}
        <span className="cal__keyrow">
          <i className="calk calk--nofc" aria-hidden="true" /> no forecast yet
        </span>
      </div>
    </div>,
    document.body,
  )
}

