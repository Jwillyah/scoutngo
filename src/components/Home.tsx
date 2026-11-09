import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getMoonPosition, getPosition } from 'suncalc'
import { moonTimesOnLocalDay } from '../core/moonTimes.ts'
import { droneTag, kt, surfTag, windTag, type CallRead } from '../core/briefing.ts'
import { droneWindow } from '../core/droneWindow.ts'
import { bestRun, bestWindows, cardList, conditionOf, nothingLine, rainLine, spanWords, stripSteps, weekHeadline, type Activity, type CardKind, type SkyIcon, type WindowRow } from '../core/homeDay.ts'
import { camsFacingWaterOrSun } from '../core/skyCams.ts'
import { wakeAt } from '../core/alertIcs.ts'
import { formatClock } from '../core/timezone.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { homeOrder, primaryFor, useActivities } from '../lib/activities.ts'
import { beachName } from '../lib/surfBeach.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { compass } from '../lib/tideWords.ts'
import { formatTemperature, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { useBriefing, type Briefing, type DayBrief } from '../lib/useBriefing.ts'
import { useStormPlay } from '../lib/useStormPlay.ts'
import { refreshLine, useWeatherRefreshing } from '../lib/useWeatherStatus.ts'
import type { BriefingDrone } from './Briefing.tsx'
import { ActivityIcon } from './ActivityIcon.tsx'
import { MoonGlyph } from './MoonGlyph.tsx'
import { OPEN_RADAR_EVENT } from './WeatherTab.tsx'

/*
 * THE HOME (Batch M, Section 3; boards "HOME 8 Nov · surfer / shooter").
 * One app for anyone heading outside: the weather is always first, and
 * every element is meant to be understood in three seconds by someone who
 * does not take photos; anything more is one tap deeper.
 *
 *   top        Today · Tomorrow · Week, the spot with ⌄ (switch spot)
 *   weather    the date and time, the temperature big; the sky in a word,
 *              high and low, wind, the rain line; the NWS alert above when
 *              there is one; six hourly steps with sunrise or sunset
 *   windows    up to three best windows across what you do (the picker,
 *              src/lib/activities.ts), worked out in src/core/homeDay.ts
 *   cards      Surf, Wind, Tide, Sunset, Drone (picked or in the kit),
 *              Moon, in the picker's order; a tap opens its page
 *   cams       real cams within 15 km facing the water or the sun's line,
 *              else no row
 *   bottom     one primary button by the picker (Radar, Viewfinder or
 *              Preflight), a round Map and a round Menu
 *
 * Every number is the code's (src/core/briefing.ts, src/core/homeDay.ts,
 * src/lib/useBriefing.ts); a dash where the forecast did not say. Facts,
 * never instructions (rule 28). It fits 390 x 844 and 412 x 915 on a calm
 * day with nothing scrolled (scripts/audit-briefing.mjs).
 */
export type HomeTarget = 'surf' | 'wind' | 'tides' | 'fire' | 'preflight' | 'moon' | 'weather'

interface HomeProps {
  venue: { lat: number; lon: number }
  placeName: string
  timeZone: string
  units: Units
  drone: BriefingDrone | null
  now: Date
  onClose: () => void
  onOpenMap: () => void
  onMenu: () => void
  onSwitchSpot?: () => void
  onViewfinder?: () => void
  onOpen: (target: HomeTarget) => void
  start?: 0 | 1 | 2
}

type Page = 0 | 1 | 2
const PAGES = ['Today', 'Tomorrow', 'Week'] as const

export function Home({ venue, placeName, timeZone, units, drone, now, onClose, onOpenMap, onMenu, onSwitchSpot, onViewfinder, onOpen, start = 0 }: HomeProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  const [picked] = useActivities()
  const order = homeOrder(picked, drone !== null)
  const [page, setPage] = useState<Page>(start)
  const track = useRef<HTMLDivElement>(null)
  const go = (p: Page) => {
    setPage(p)
    const el = track.current
    if (el !== null) el.scrollTo({ left: p * el.clientWidth, behavior: 'smooth' })
  }
  useEffect(() => {
    const el = track.current
    if (el === null) return
    el.scrollLeft = start * el.clientWidth
    const onScroll = () => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) as Page)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [start])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const play = useStormPlay(venue, timeZone, units, true)
  const alert = play.now?.alerts?.[0] ?? null
  const openRadar = () => {
    window.dispatchEvent(new CustomEvent(OPEN_RADAR_EVENT, { detail: play.now?.radar?.scanAt ?? null }))
    onOpenMap()
  }
  const primary = play.inPlay ? 'radar' : primaryFor(order)
  const sky = skyOf(brief, now, venue)
  const refreshing = refreshLine(brief.checkedAt, useWeatherRefreshing(), (d) => formatClock(d, timeZone))

  return (
    <div className={`home home--${sky}`} role="dialog" aria-label="Home">
      <div className="home__top">
        <div className="home__seg" role="tablist">
          {PAGES.map((p, i) => (
            <button key={p} type="button" role="tab" aria-selected={page === i} className={`home__tab${page === i ? ' home__tab--on' : ''}`} onClick={() => go(i as Page)}>
              {p}
            </button>
          ))}
        </div>
        <button type="button" className="home__spot" onClick={onSwitchSpot} disabled={onSwitchSpot === undefined} aria-label={`${placeName}: switch spot`}>
          <span className="home__spotname">{placeName}</span>
          <svg className="home__chev" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5L6 8l3.5-3.5" />
          </svg>
        </button>
      </div>
      <div className="home__track" ref={track}>
        <section className="home__page" aria-label="Today">
          <DayView which="today" brief={brief} day={brief.days[0] ?? null} order={order} venue={venue} timeZone={timeZone} units={units} drone={drone} now={now} alert={alert === null ? null : alert.event} stormLine={play.inPlay ? play.headline : null} onOpen={onOpen} />
        </section>
        <section className="home__page" aria-label="Tomorrow">
          <DayView which="tomorrow" brief={brief} day={brief.days[1] ?? null} order={order} venue={venue} timeZone={timeZone} units={units} drone={drone} now={now} alert={null} stormLine={null} onOpen={onOpen} />
        </section>
        <section className="home__page" aria-label="Week">
          <WeekView brief={brief} order={order} timeZone={timeZone} units={units} now={now} venue={venue} />
        </section>
      </div>
      <div className="home__foot">
        {refreshing === null ? null : <p className="home__fresh">{refreshing}</p>}
        <div className="home__buttons">
          {primary === 'viewfinder' && onViewfinder !== undefined ? (
            <button type="button" className="hbtn hbtn--main" onClick={onViewfinder}>
              Viewfinder
            </button>
          ) : primary === 'preflight' ? (
            <button type="button" className="hbtn hbtn--main" onClick={() => onOpen('preflight')}>
              Preflight
            </button>
          ) : (
            <button type="button" className="hbtn hbtn--main" onClick={openRadar}>
              Radar
            </button>
          )}
          <button type="button" className="hbtn hbtn--round" onClick={onOpenMap} aria-label="Open the map">
            <svg className="hbtn__glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4l-6 2.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4zM9 4v13M15 6.5v13" />
            </svg>
          </button>
          <button type="button" className="hbtn hbtn--round" onClick={onMenu} aria-label="Menu">
            <svg className="hbtn__glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- the ground */

/** The ground's sky: night, golden near the sun's event, rain, cloud, or a day sky; from the forecast at now. */
function skyOf(brief: Briefing, now: Date, venue: { lat: number; lon: number }): 'night' | 'golden' | 'rain' | 'cloud' | 'day' {
  const elev = (getPosition(now, venue.lat, venue.lon).altitude * 180) / Math.PI
  if (elev < -4) return 'night'
  const code = brief.wx === null ? null : hourlyAt(brief.wx, 'weather_code', now)
  if (code !== null && (code >= 51 || code === 45 || code === 48)) return 'rain'
  if (elev < 8) return 'golden'
  if (code === 3) return 'cloud'
  return 'day'
}

/* ------------------------------------------------------------- a day view */

interface DayViewProps {
  which: 'today' | 'tomorrow'
  brief: Briefing
  day: DayBrief | null
  order: readonly Activity[]
  venue: { lat: number; lon: number }
  timeZone: string
  units: Units
  drone: BriefingDrone | null
  now: Date
  alert: string | null
  stormLine: string | null
  onOpen: (target: HomeTarget) => void
}

const ICON: Record<SkyIcon, ReactNode> = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  moon: <path d="M15 4a8 8 0 1 0 5 14A7 7 0 0 1 15 4z" />,
  partly: (
    <>
      <circle cx="9" cy="9" r="3.5" />
      <path d="M9 2.5v1.5M2.5 9H4M4.4 4.4l1 1M13.6 4.4l-1 1" />
      <path d="M8 19h9.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 8.5 13 3 3 0 0 0 8 19z" />
    </>
  ),
  'partly-night': (
    <>
      <path d="M11 3.5a5 5 0 0 0 4 7.8 5 5 0 0 1-4-7.8z" />
      <path d="M7 19h9.5a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7.5 13 3 3 0 0 0 7 19z" />
    </>
  ),
  cloud: <path d="M6.5 18h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 18z" />,
  fog: <path d="M4 9h16M3 13h18M5 17h14" />,
  drizzle: (
    <>
      <path d="M6.5 14h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 14z" />
      <path d="M9 17.5v1M13 17.5v1M17 17.5v1" />
    </>
  ),
  rain: (
    <>
      <path d="M6.5 14h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 14z" />
      <path d="M8.5 16.5l-1 3M12.5 16.5l-1 3M16.5 16.5l-1 3" />
    </>
  ),
  snow: (
    <>
      <path d="M6.5 14h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 14z" />
      <path d="M9 18h.01M13 18h.01M17 18h.01M11 21h.01M15 21h.01" />
    </>
  ),
  storm: (
    <>
      <path d="M6.5 13h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.3A3.4 3.4 0 0 0 6.5 13z" />
      <path d="M12.5 14l-2.5 4h3l-2 4" />
    </>
  ),
}

function SkyIconSvg({ icon, className }: { icon: SkyIcon; className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      {ICON[icon]}
    </svg>
  )
}

function DayView({ which, brief, day, order, venue, timeZone, units, drone, now, alert, stormLine, onOpen }: DayViewProps) {
  const clock = (d: Date | null) => (d === null ? '—' : formatClock(d, timeZone))
  const wx = brief.wx
  const at = (name: string, t: Date) => (wx === null ? null : hourlyAt(wx, name, t))
  const temp = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const speed = (mps: number | null) => (mps === null ? '—' : `${Math.round(windIn(mps, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`)
  const loading = brief.status === 'loading'

  /* The moment the block describes: now, or tomorrow at 1 PM local. */
  const when = which === 'today' ? now : day === null ? now : new Date(day.start.getTime() + 13 * 3_600_000)
  const dayHours = day === null ? [] : Array.from({ length: 24 }, (_, i) => new Date(day.start.getTime() + i * 3_600_000 + 1_800_000))
  const temps = dayHours.map((h) => at('temperature_2m', h)).filter((t): t is number => t !== null)
  const hi = temps.length === 0 ? null : Math.max(...temps)
  const lo = temps.length === 0 ? null : Math.min(...temps)
  const sunUp = (getPosition(when, venue.lat, venue.lon).altitude * 180) / Math.PI > -0.8
  const cond = conditionOf(at('weather_code', when), sunUp)
  const bigTemp = which === 'today' ? at('temperature_2m', now) : hi
  const windMps = at('wind_speed_10m', when)
  const windFrom = at('wind_direction_10m', when)
  const rainHours = (from: Date, n: number) => Array.from({ length: n }, (_, i) => ({ at: new Date(Math.floor(from.getTime() / 3_600_000) * 3_600_000 + i * 3_600_000), mm: at('precipitation', new Date(Math.floor(from.getTime() / 3_600_000) * 3_600_000 + i * 3_600_000)) }))
  const rain = which === 'today' ? rainLine(rainHours(now, 8), now, timeZone) : day === null ? null : rainDay(rainHours(new Date(day.start.getTime() + 6 * 3_600_000), 15), timeZone)
  const steps = which === 'today' ? stripSteps(now, venue.lat, venue.lon, timeZone) : day === null ? [] : stripSteps(new Date(day.start.getTime() + 7 * 3_600_000), venue.lat, venue.lon, timeZone).map((s, i) => (i === 0 && s.kind === 'hour' ? { ...s, label: formatClock(s.at, timeZone).replace(/:00 /, ' ').replace(/ [AP]M$/, (m) => m.trim().toLowerCase().slice(0, 1)).replace(' ', '') } : s))
  const dateWords = which === 'today' ? `${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(now)} · ${clock(now)}` : day === null ? 'Tomorrow' : `Tomorrow · ${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(day.start)}`

  const rows = useMemo(() => (day === null ? [] : windowRows(which, day, order, units, drone, now, venue, timeZone, brief.facing)), [which, day, order, units, drone, now, venue, timeZone, brief.facing])
  const nextGood = useMemo(() => nextGoodDay(brief.days, which === 'today' ? 1 : 2, timeZone), [brief.days, which, timeZone])
  const cards = cardList(order, drone !== null || order.includes('drone'))
  const sunAz = day?.events.sunset === null || day === null ? null : (getPosition(day.events.sunset, venue.lat, venue.lon).azimuth * 180) / Math.PI + 180
  const cams = which === 'today' ? camsFacingWaterOrSun(venue, sunAz, brief.facing, COAST_CAMS) : []

  return (
    <div className="hday">
      {alert === null ? null : (
        <p className="hday__alert" role="status">
          {alert}
        </p>
      )}
      <div className="hwx">
        <div className="hwx__main">
          <p className="hwx__date">{dateWords}</p>
          <p className="hwx__temp num">{bigTemp === null ? (loading ? '…' : '—') : temp(bigTemp)}</p>
        </div>
        <div className="hwx__side">
          <p className="hwx__cond">
            {cond === null ? null : <SkyIconSvg icon={cond.icon} className="hwx__icon" />}
            <span>{cond?.word ?? '—'}</span>
          </p>
          <p className="hwx__line">
            H {temp(hi)} · L {temp(lo)}
          </p>
          <p className="hwx__line">
            Wind {windFrom === null ? '' : `${compass(windFrom)} `}
            {speed(windMps)}
          </p>
          <p className="hwx__line hwx__rain">{rain ?? '—'}</p>
        </div>
      </div>
      {stormLine === null ? null : <p className="hday__storm">{stormLine}</p>}
      <ol className="hstrip">
        {steps.map((s) => {
          const t = at('temperature_2m', s.at)
          const c = conditionOf(at('weather_code', s.at), s.kind === 'sunrise' || (getPosition(s.at, venue.lat, venue.lon).altitude * 180) / Math.PI > -0.8)
          return (
            <li key={s.at.getTime()} className={`hstrip__step${s.kind === 'hour' ? '' : ' hstrip__step--sun'}`}>
              <span className="hstrip__at">{s.kind === 'hour' ? s.label : `${s.kind === 'sunrise' ? 'Rise' : 'Set'} ${s.label}`}</span>
              {c === null ? <span className="hstrip__icon">—</span> : <SkyIconSvg icon={c.icon} className="hstrip__icon" />}
              <span className="hstrip__t">{temp(t)}</span>
            </li>
          )
        })}
      </ol>

      <div className="hbest">
        <p className="hbest__title">Best windows {which}</p>
        {rows.length === 0 ? (
          <p className="hbest__none">{loading ? 'Reading the forecast…' : nothingLine(which, nextGood)}</p>
        ) : (
          <ul className="hbest__rows">
            {rows.map((r) => (
              <li key={r.activity} className="hbest__row">
                <ActivityIcon activity={r.activity} />
                <b>{r.head}</b>
                <span className="hbest__why">· {r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hcards">
        {cards.map((c) => (
          <Card key={c} kind={c} which={which} day={day} brief={brief} units={units} drone={drone} now={now} venue={venue} timeZone={timeZone} onOpen={onOpen} />
        ))}
      </div>

      {cams.length === 0 ? null : (
        /* LINK OUT ONLY (docs/cams.md): a link, nothing fetched. */
        <p className="hcams">
          Cams:{' '}
          {cams.map((c, i) => (
            <span key={c.cam.id}>
              {i === 0 ? '' : ' · '}
              <a href={c.cam.url} target="_blank" rel="noopener noreferrer">
                {beachName(c.cam.name)}
              </a>
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

/** Tomorrow's rain: "Rain from 3 PM", "No rain 6 AM–9 PM", or null. */
function rainDay(hours: readonly { at: Date; mm: number | null }[], timeZone: string): string | null {
  if (hours.length === 0 || hours.some((h) => h.mm === null)) return null
  const wet = hours.find((h) => (h.mm ?? 0) >= 0.2)
  return wet === undefined ? `No rain ${spanWords(hours[0].at, new Date(hours[hours.length - 1].at.getTime() + 3_600_000), timeZone)}` : `Rain from ${formatClock(wet.at, timeZone).replace(/:00 /, ' ')}`
}

/* ---------------------------------------------------------- the windows */

function windowRows(which: 'today' | 'tomorrow', day: DayBrief, order: readonly Activity[], units: Units, drone: BriefingDrone | null, now: Date, venue: { lat: number; lon: number }, timeZone: string, facing: number | null): WindowRow[] {
  const after = which === 'today' ? now.getTime() - 3_600_000 : 0
  const speed = (mps: number) => `${Math.round(windIn(mps, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`
  const rows: Partial<Record<Activity, WindowRow | null>> = {}

  /* Surf: the longest run of Fun or Firing hours still to come. */
  const surfRun = bestRun(
    day.surf.filter((b) => b.at.getTime() > after).map((b) => ({ at: new Date(b.at.getTime() - 1_800_000), value: b })),
    (b) => surfTag(b.faceFt, b.shape) !== 'Flat',
  )
  if (surfRun !== null) {
    const ft = Math.round(Math.max(...surfRun.values.map((b) => b.faceFt)))
    const mid = surfRun.values[Math.floor(surfRun.values.length / 2)].at
    const w = day.wind.reduce((a, b) => (Math.abs(b.at.getTime() - mid.getTime()) < Math.abs(a.at.getTime() - mid.getTime()) ? b : a), day.wind[0])
    const side = windTag(w?.fromDeg ?? null, facing)
    rows.surf = { activity: 'surf', head: `Surf ${spanWords(surfRun.from, surfRun.to, timeZone)}`, reason: `${ft} ft${side === null ? '' : `, ${side.toLowerCase()}`}` }
  }

  /* Shoot: the day's colour call still to come, Go or Maybe. */
  const reads = (['sunrise', 'sunset'] as const).map((k) => day.reads[k]).filter((r): r is CallRead => r !== null && r.event.getTime() > after && (r.call === 'Go' || r.call === 'Maybe'))
  const read = reads.sort((a, b) => (a.call === b.call ? a.event.getTime() - b.event.getTime() : a.call === 'Go' ? -1 : 1))[0]
  if (read !== undefined) {
    const from = read.colorFrom ?? read.event
    const to = read.colorTo ?? new Date(read.event.getTime() + 20 * 60_000)
    /* Tomorrow: when the call is settled (sunrise: the wake-up time; sunset: an hour before, from the stations). */
    const settled = read.kind === 'sunrise' ? wakeAt(read.event) : new Date(read.event.getTime() - 3_600_000)
    rows.shoot = { activity: 'shoot', head: `${read.kind === 'sunset' ? 'Sunset' : 'Sunrise'} color ${spanWords(from, to, timeZone)}`, reason: which === 'tomorrow' ? `${read.call}, final call ${formatClock(settled, timeZone)}` : `${read.call}, ${shortWhy(read.why)}` }
  }

  /* Drone: the next calm daylight run at 400 ft against the aircraft's rating. */
  if (drone !== null) {
    const w = droneWindow(day.wind, drone.maxWindMps, day.start, venue.lat, venue.lon, which === 'today' ? now : day.start)
    if (w.calm.kind === 'calm') {
      const span = w.calm.span
      const inside = day.wind.filter((h) => h.at.getTime() >= span.from.getTime() && h.at.getTime() < span.to.getTime() && h.highMps !== null)
      const top = inside.length === 0 ? null : Math.max(...inside.map((h) => h.highMps as number))
      rows.drone = { activity: 'drone', head: `Drone calm ${spanWords(span.from, span.to, timeZone)}`, reason: top === null ? 'at 400 ft' : `${speed(top)} at 400 ft` }
    }
  }

  /* Fish or boat: the longest run of daylight wind under 10 kt, and the tide's next turn. */
  const calmWater = bestRun(
    day.wind.filter((h) => h.at.getTime() > after).map((h) => ({ at: new Date(h.at.getTime() - 1_800_000), value: h })),
    (h) => h.mps !== null && (kt(h.mps) ?? 99) < 10,
    3,
  )
  if (calmWater !== null) {
    const top = Math.max(...calmWater.values.map((h) => h.mps ?? 0))
    const turn = day.tide?.next ?? null
    rows.fish = { activity: 'fish', head: `Calm water ${spanWords(calmWater.from, calmWater.to, timeZone)}`, reason: `${speed(top)}${turn === null ? '' : `, ${turn.kind} ${formatClock(turn.at, timeZone)}`}` }
  }
  return bestWindows(order, rows)
}

/** "lit low deck" from "Likely: 5 of 5 models see lit low deck. Final call…": its gist, for a row. */
function shortWhy(why: string): string {
  const s = why.replace(/^[A-Z][a-z]+:\s*/, '').split(/[.;]/)[0].trim().replace(/^\d+ of \d+ models (see|say|have)\s+/, '')
  return s.length > 42 ? `${s.slice(0, 40).replace(/\s\S*$/, '')}…` : s.charAt(0).toLowerCase() + s.slice(1)
}

/** The next day from `from` on with a Go sunrise or sunset: "Tue sunset". */
function nextGoodDay(days: readonly DayBrief[], from: number, timeZone: string): { day: string; what: string } | null {
  for (const d of days.slice(from)) {
    for (const k of ['sunset', 'sunrise'] as const) {
      const r = d.reads[k]
      if (r?.call === 'Go') return { day: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(r.event), what: k }
    }
  }
  return null
}

/* ------------------------------------------------------------- the cards */

interface CardProps {
  kind: CardKind
  which: 'today' | 'tomorrow'
  day: DayBrief | null
  brief: Briefing
  units: Units
  drone: BriefingDrone | null
  now: Date
  venue: { lat: number; lon: number }
  timeZone: string
  onOpen: (t: HomeTarget) => void
}

function Card({ kind, which, day, brief, units, drone, now, venue, timeZone, onOpen }: CardProps) {
  const clock = (d: Date) => formatClock(d, timeZone)
  const speed = (mps: number | null) => (mps === null ? '—' : `${Math.round(windIn(mps, units.wind) ?? 0)}`)
  const unit = windUnitLabel(units.wind)
  const nearest = <T extends { at: Date }>(list: readonly T[], t: Date): T | null => (list.length === 0 ? null : list.reduce((a, b) => (Math.abs(b.at.getTime() - t.getTime()) < Math.abs(a.at.getTime() - t.getTime()) ? b : a)))
  const t = which === 'today' ? now : day === null ? now : new Date(day.start.getTime() + 13 * 3_600_000)
  let title = ''
  let big: ReactNode = '—'
  let line: ReactNode = null
  let tag: string | null = null
  let target: HomeTarget = 'weather'
  if (kind === 'surf') {
    title = 'Surf'
    target = 'surf'
    const bars = day?.surf ?? []
    if (bars.length > 0) {
      const lo = Math.round(Math.min(...bars.map((b) => b.faceFt)))
      const hi = Math.round(Math.max(...bars.map((b) => b.faceFt)))
      big = lo === hi ? `${hi} ft` : `${lo}–${hi} ft`
      line = (day?.surfWords ?? '').replace(/^[^,]*,\s*/, '')
      tag = day?.surfTag ?? null
    }
  } else if (kind === 'wind') {
    title = 'Wind'
    target = 'wind'
    const w = day === null ? null : which === 'today' ? nearest(day.wind, now) : day.wind.reduce<(typeof day.wind)[number] | null>((a, b) => (a === null || (b.mps ?? 0) > (a.mps ?? 0) ? b : a), null)
    big = w?.mps == null ? '—' : `${speed(w.mps)} ${unit}${w.fromDeg === null ? '' : ` ${compass(w.fromDeg)}`}`
    const side = windSideSpan(day, brief.facing, which === 'today' ? now : null, timeZone)
    line = side ?? (w?.gustMps == null ? null : `gusts ${speed(w.gustMps)} ${unit}`)
    tag = day?.windTag ?? null
  } else if (kind === 'tide') {
    title = 'Tide'
    target = 'tides'
    const next = day?.tide?.next ?? null
    big = next === null ? '—' : `${next.kind === 'high' ? 'High' : 'Low'} ${clock(next.at)}`
    line = day?.tide?.rising == null ? null : day.tide.rising ? 'rising' : 'falling'
  } else if (kind === 'sunset') {
    const read = day?.reads.sunset ?? null
    title = 'Sunset'
    target = 'fire'
    big = day?.events.sunset == null ? '—' : clock(day.events.sunset)
    /* Tomorrow: when the call is settled, an hour before, from the stations (the briefing's own rule). */
    line = which === 'tomorrow' && day?.events.sunset != null ? `final call ${clock(new Date(day.events.sunset.getTime() - 3_600_000))}` : read === null ? null : shortWhy(read.why)
    tag = read?.call ?? null
  } else if (kind === 'drone') {
    title = 'Drone'
    target = 'preflight'
    const w = day === null ? null : nearest(day.wind, t)
    big = w?.highMps == null ? '—' : `${speed(w.highMps)} ${unit}`
    line = 'at 400 ft · check airspace'
    tag = drone === null || w === null ? null : droneTag(w.highMps, drone.maxWindMps)
  } else {
    title = 'Moon'
    target = 'moon'
    const base = day?.start ?? now
    /* The venue's own day, not suncalc's UTC one (src/core/moonTimes.ts). */
    const rise = moonTimesOnLocalDay(new Date(base.getTime() + 12 * 3_600_000), venue.lat, venue.lon, timeZone).rise
    const az = rise === null ? null : (getMoonPosition(rise, venue.lat, venue.lon).azimuth * 180) / Math.PI + 180
    const moon = day?.moon ?? null
    big = rise === null ? 'No rise' : `Rise ${clock(rise)}`
    line = (
      <>
        {moon === null ? null : <MoonGlyph phase={moon.phase} size={14} />} {moon === null ? '—' : `${Math.round(moon.fraction * 100)}%`}
        {az === null ? '' : ` · ${compass(az)}`}
      </>
    )
  }
  return (
    <button type="button" className={`hcard hcard--${kind}`} onClick={() => onOpen(target)}>
      <span className="hcard__head">
        <span className="hcard__title">{title}</span>
        {tag === null ? null : <span className={`hcard__tag hcard__tag--${tag.toLowerCase().replace(/\s+/g, '-')}`}>{tag}</span>}
      </span>
      <span className="hcard__big">{big}</span>
      <span className="hcard__line">{line ?? '—'}</span>
    </button>
  )
}

/** "Offshore until 11 AM", "Onshore from 2 PM": the wind's side to the beach and when it changes. */
function windSideSpan(day: DayBrief | null, facing: number | null, now: Date | null, timeZone: string): string | null {
  if (day === null || facing === null) return null
  const hours = day.wind.filter((h) => now === null || h.at.getTime() + 1_800_000 > now.getTime())
  const sides = hours.map((h) => ({ at: h.at, side: windTag(h.fromDeg, facing) }))
  const first = sides[0]
  if (first === undefined || first.side === null) return null
  const change = sides.find((s) => s.side !== first.side && s.side !== null)
  const hour = (d: Date) => formatClock(new Date(d.getTime() - 1_800_000), timeZone).replace(/:00 /, ' ')
  return change === undefined ? `${first.side} all day` : `${first.side} until ${hour(change.at)}`
}

/* ------------------------------------------------------------- the week */

function WeekView({ brief, order, timeZone, units, now, venue }: { brief: Briefing; order: readonly Activity[]; timeZone: string; units: Units; now: Date; venue: { lat: number; lon: number } }) {
  const wx = brief.wx
  const day = (d: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(d)
  const rows = brief.days.map((d) => {
    const noon = new Date(d.start.getTime() + 13 * 3_600_000)
    const temps = wx === null ? [] : Array.from({ length: 24 }, (_, i) => hourlyAt(wx, 'temperature_2m', new Date(d.start.getTime() + i * 3_600_000 + 1_800_000))).filter((t): t is number => t !== null)
    const cond = conditionOf(wx === null ? null : hourlyAt(wx, 'weather_code', noon), true)
    const worth = worthOf(d, order)
    return { d, name: d.index === 0 ? 'Today' : day(d.start), cond, hi: temps.length === 0 ? null : Math.max(...temps), worth, call: d.reads.sunset?.call ?? null, guess: d.index >= 3 }
  })
  const head = weekHeadline(rows.filter((r) => r.d.index > 0 && r.worth !== null).map((r) => ({ day: r.name, what: (r.worth as Activity) === 'shoot' ? 'sunset' : (r.worth as string) })))
  void now
  void venue
  return (
    <div className="hweek">
      <p className="hweek__head">{head ?? (brief.status === 'loading' ? 'Reading the forecast…' : 'Nothing standout this week')}</p>
      <ol className="hweek__rows">
        {rows.map((r) => (
          <li key={r.d.iso} className={`hweek__row${r.guess ? ' hweek__row--guess' : ''}`}>
            <span className="hweek__day">{r.name}</span>
            {r.cond === null ? <span className="hweek__icon">—</span> : <SkyIconSvg icon={r.cond.icon} className="hweek__icon" />}
            <span className="hweek__worth">{r.worth === null ? '—' : <><ActivityIcon activity={r.worth} className="hweek__act" /> {WORTH_WORD[r.worth]}</>}</span>
            <span className="hweek__t">{formatTemperature(r.hi, units.temperature).replace(/°[FC]$/, '°')}</span>
            <span className={`hweek__call hweek__call--${(r.call ?? 'none').toLowerCase()}`}>{r.call ?? '—'}</span>
          </li>
        ))}
      </ol>
      <p className="hweek__note">Days 4–7 are guesses: the models drift apart that far out.</p>
    </div>
  )
}

const WORTH_WORD: Record<Activity, string> = { surf: 'Surf', shoot: 'Sunset', drone: 'Drone', fish: 'Calm', weather: 'Dry' }

/** What a day is worth, in the user's order: Fun or Firing surf, a Go sunset or sunrise, a calm day at 400 ft, wind under 10 kt, dry. */
function worthOf(d: DayBrief, order: readonly Activity[]): Activity | null {
  for (const a of order) {
    if (a === 'surf' && (d.surfTag === 'Fun' || d.surfTag === 'Firing')) return a
    if (a === 'shoot' && (d.reads.sunset?.call === 'Go' || d.reads.sunrise?.call === 'Go')) return a
    if (a === 'fish' && d.windMaxKt !== null && d.windMaxKt < 10) return a
    if (a === 'drone' && d.windMaxKt !== null && d.windMaxKt < 8) return a
  }
  return null
}
