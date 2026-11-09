import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
/* suncalc 2.0.2 (this repo's): altitude and azimuth in DEGREES, azimuth from north, clockwise (Batch N E10: the moon read "S" when it was treated as radians from south). */
import { getMoonPosition, getPosition } from 'suncalc'
import { moonTimesOnLocalDay } from '../core/moonTimes.ts'
import { droneTag, kt, surfTag, windTag, type CallRead } from '../core/briefing.ts'
import { droneWindow } from '../core/droneWindow.ts'
import { bestRun, bestWindows, cardList, colorWords, conditionOf, groundOf, sideWords, nothingLine, rainLine, spanWords, stripSteps, weekHeadline, type Activity, type CardKind, type WindowRow } from '../core/homeDay.ts'
import { camsFacingWaterOrSun } from '../core/skyCams.ts'
import { wakeAt } from '../core/alertIcs.ts'
import { formatClock } from '../core/timezone.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { homeOrder, primaryFor, useActivities } from '../lib/activities.ts'
import { surfLine, useSurfNow, type SurfNow } from '../lib/useSurfNow.ts'
import { rangeSizeWords } from '../core/surfReads.ts'
import { beachName } from '../lib/surfBeach.ts'
import { gustWords, windAt, windWords } from '../lib/windNow.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import type { StationObs } from '../core/nowcast.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { compass } from '../lib/tideWords.ts'
import { formatTemperature, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { useBriefing, type Briefing, type BriefingDrone, type DayBrief } from '../lib/useBriefing.ts'
import { useStormPlay } from '../lib/useStormPlay.ts'
import { useCoast, useMarineAlerts } from '../lib/coastData.ts'
import { NetDebug } from './NetDebug.tsx'
import { refreshLine, useWeatherRefreshing } from '../lib/useWeatherStatus.ts'
import { ActivityIcon } from './ActivityIcon.tsx'
import { MoonGlyph } from './MoonGlyph.tsx'
import { CamsSheet } from './CamsSheet.tsx'
import { OPEN_RADAR_EVENT } from './WeatherTab.tsx'
import { SkyIconSvg } from './SkyIconSvg.tsx'

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
export type HomeTarget = 'surf' | 'wind' | 'tides' | 'sky' | 'preflight' | 'moon' | 'weather'

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
const TAB_KEY = 'scoutngo.homeTab.v1'
function readHomeTab(): Page | null {
  try {
    const v = Number(localStorage.getItem(TAB_KEY))
    return v === 0 || v === 1 || v === 2 ? v : null
  } catch {
    return null
  }
}
function writeHomeTab(p: Page): void {
  try {
    localStorage.setItem(TAB_KEY, String(p))
  } catch {
    /* Private browsing: this session still has it. */
  }
}

export function Home({ venue, placeName, timeZone, units, drone, now, onClose, onOpenMap, onMenu, onSwitchSpot, onViewfinder, onOpen, start = 0 }: HomeProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  /* Batch Map A1/A2: the spot's surf beach and its band, the same hook the menu and the Surf page read. */
  const surf = useSurfNow(venue, now, timeZone, units.distance === 'ft')
  /* Batch MAP2, Section 2: a station within 15 km that reported in the last hour; the wind now leans to it (the Wind page reads the same). */
  const stationObs = useStationObs(venue)
  const [picked] = useActivities()
  const order = homeOrder(picked, drone !== null)
  /* Batch N A2: reopening lands on the tab last used (kept on this phone). */
  const [page, setPageRaw] = useState<Page>(() => readHomeTab() ?? start)
  const setPage = (p: Page) => {
    setPageRaw(p)
    writeHomeTab(p)
  }
  const [debug, setDebug] = useState(false)
  const track = useRef<HTMLDivElement>(null)
  const go = (p: Page) => {
    setPage(p)
    const el = track.current
    if (el !== null) el.scrollTo({ left: p * el.clientWidth, behavior: 'smooth' })
  }
  useEffect(() => {
    const el = track.current
    if (el === null) return
    el.scrollLeft = (readHomeTab() ?? start) * el.clientWidth
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
  /*
   * The banner: the NWS alerts at the spot, and at a beach the marine zone's
   * too (Batch N E5: a Small Craft Advisory showed nowhere). Fish or boat
   * picked: the marine ones first. As the NWS names them, with when they end.
   */
  const marineAlerts = useMarineAlerts(brief.facing !== null ? venue : null)
  const until = (d: Date | null) => (d === null ? '' : ` until ${formatClock(d, timeZone).replace(/:00 /, ' ')} ${new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(d)}`)
  const land = (play.now?.alerts ?? []).map((a) => `${a.event}${until(a.ends)}`)
  const sea = (marineAlerts ?? []).map((a) => `${a.event}${until(a.ends)}`)
  const banner = [...new Set(order.includes('fish') ? [...sea, ...land] : [...land, ...sea])].slice(0, 2)
  const alert = banner.length === 0 ? null : { event: banner.join(' · ') }
  const openRadar = () => {
    window.dispatchEvent(new CustomEvent(OPEN_RADAR_EVENT, { detail: play.now?.radar?.scanAt ?? null }))
    onOpenMap()
  }
  const primary = play.inPlay ? 'radar' : primaryFor(order)
  const sky = skyOf(brief, now, venue, play.inPlay)
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
          <DayView placeName={placeName} which="today" brief={brief} day={brief.days[0] ?? null} order={order} venue={venue} timeZone={timeZone} units={units} drone={drone} now={now} alert={alert === null ? null : alert.event} stormLine={play.inPlay ? play.headline : null} onOpen={onOpen} onDebug={() => setDebug((d) => !d)} surf={surf} obs={stationObs} />
        </section>
        <section className="home__page" aria-label="Tomorrow">
          <DayView placeName={placeName} which="tomorrow" brief={brief} day={brief.days[1] ?? null} order={order} venue={venue} timeZone={timeZone} units={units} drone={drone} now={now} alert={null} stormLine={null} onOpen={onOpen} surf={surf} obs={stationObs} />
        </section>
        <section className="home__page" aria-label="Week">
          <WeekView brief={brief} order={order} timeZone={timeZone} units={units} now={now} venue={venue} />
        </section>
      </div>
      {debug ? <NetDebug onClose={() => setDebug(false)} /> : null}
      <div className="home__foot">
        {refreshing === null ? null : <p className="home__fresh">{refreshing}</p>}
        <div className="home__buttons">
          {primary === 'viewfinder' && onViewfinder !== undefined ? (
            <button type="button" className="hbtn hbtn--main" onClick={onViewfinder}>
              <CamGlyph /> Viewfinder
            </button>
          ) : primary === 'preflight' ? (
            <button type="button" className="hbtn hbtn--main" onClick={() => onOpen('preflight')}>
              <DroneGlyph /> Preflight
            </button>
          ) : (
            <button type="button" className="hbtn hbtn--main" onClick={openRadar}>
              <RadarGlyph /> Radar
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

/** The ground's sky now (Batch N A1): from the forecast's WMO code and the sun's height; night is the sun below -6° (civil dusk), not the clock. */
function skyOf(brief: Briefing, now: Date, venue: { lat: number; lon: number }, storms: boolean) {
  const elev = getPosition(now, venue.lat, venue.lon).altitude
  const code = brief.wx === null ? null : hourlyAt(brief.wx, 'weather_code', now)
  return groundOf(elev, code, storms)
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
  /** A triple tap on the date: the network debug lines (Batch N E1). */
  onDebug?: () => void
  placeName: string
  surf: SurfNow
  obs: StationObs | null
}

function DayView({ which, brief, day, order, venue, timeZone, units, drone, now, alert, stormLine, onOpen, onDebug, placeName, surf, obs }: DayViewProps) {
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
  const sunUp = getPosition(when, venue.lat, venue.lon).altitude > -0.8
  const cond = conditionOf(at('weather_code', when), sunUp)
  const bigTemp = which === 'today' ? at('temperature_2m', now) : hi
  /* The one wind now (src/lib/windNow.ts), as the wind card and the Wind page read it. */
  const heroWind = windAt(wx, when, obs)
  const windMps = heroWind?.mps ?? null
  const windFrom = heroWind?.fromDeg ?? null
  const rainHours = (from: Date, n: number) => Array.from({ length: n }, (_, i) => ({ at: new Date(Math.floor(from.getTime() / 3_600_000) * 3_600_000 + i * 3_600_000), mm: at('precipitation', new Date(Math.floor(from.getTime() / 3_600_000) * 3_600_000 + i * 3_600_000)) }))
  const rain = which === 'today' ? rainLine(rainHours(now, 8), now, timeZone) : day === null ? null : rainDay(rainHours(new Date(day.start.getTime() + 6 * 3_600_000), 15), timeZone)
  const steps = which === 'today' ? stripSteps(now, venue.lat, venue.lon, timeZone) : day === null ? [] : stripSteps(new Date(day.start.getTime() + 7 * 3_600_000), venue.lat, venue.lon, timeZone).map((s, i) => (i === 0 && s.kind === 'hour' ? { ...s, label: formatClock(s.at, timeZone).replace(/:00 /, ' ').replace(/ [AP]M$/, (m) => m.trim().toLowerCase().slice(0, 1)).replace(' ', '') } : s))
  const dateWords = which === 'today' ? `${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(now)} · ${clock(now)}` : day === null ? 'Tomorrow' : `Tomorrow · ${new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone }).format(day.start)}`

  const rows = useMemo(() => {
    if (day === null) return []
    const own = windowRows(which, day, order, units, drone, now, venue, timeZone, brief.facing)
    /* Batch N E3: after dark, nothing is left today: tomorrow's first windows, said as tomorrow's. */
    const next = brief.days[1] ?? null
    const dark = which === 'today' && day.events.sunset !== null && now.getTime() > day.events.sunset.getTime()
    if (own.length > 0 || !dark || next === null) return own
    return windowRows('tomorrow', next, order, units, drone, now, venue, timeZone, brief.facing).map((r) => ({ ...r, head: `Tomorrow: ${r.head}` }))
  }, [which, day, order, units, drone, now, venue, timeZone, brief.facing, brief.days])
  /* Batch N E2: no forecast is not "nothing standout": it says so, and that it is asking again. */
  const noForecast = !loading && (wx === null || day === null || day.wind.every((w) => w.mps === null))
  const nextGood = useMemo(() => nextGoodDay(brief.days, which === 'today' ? 1 : 2, timeZone), [brief.days, which, timeZone])
  const cards = cardList(order, drone !== null || order.includes('drone'))
  const sunAz = day?.events.sunset === null || day === null ? null : getPosition(day.events.sunset, venue.lat, venue.lon).azimuth
  const cams = which === 'today' ? camsFacingWaterOrSun(venue, sunAz, brief.facing, COAST_CAMS) : []
  const [camsOpen, setCamsOpen] = useState(false)
  /* Fish or boat (Batch M, Section 2): the NWS marine forecast for the zone, first period, as written; asked only when picked, at a beach. */
  const fish = order.includes('fish') && brief.facing !== null
  const marine = useCoast(fish && which === 'today' ? venue : null, null, units.distance === 'ft' ? 'mi' : 'km', fish && which === 'today').coast?.marine ?? null

  return (
    <div className="hday">
      {alert === null ? null : (
        <p className="hday__alert" role="status">
          {alert}
        </p>
      )}
      <div className="hwx">
        <div className="hwx__main">
          <p className="hwx__date" onClick={(e) => (e.detail >= 3 ? onDebug?.() : undefined)}>
            {dateWords}
          </p>
          {/* Batch Pages, Section 1: the temperature, the hourly strip and "Weather ›" open the Weather page. */}
          <button type="button" className="hwx__temp num" onClick={() => onOpen('weather')} aria-label={`${bigTemp === null ? 'No temperature' : temp(bigTemp)}: the weather`}>
            {bigTemp === null ? (loading ? '…' : '—') : temp(bigTemp)}
          </button>
        </div>
        <div className="hwx__side">
          <p className="hwx__cond">
            {cond === null ? null : <SkyIconSvg icon={cond.icon} className="hwx__icon" />}
            <span>{cond?.word ?? '—'}</span>
          </p>
          <p className="hwx__line">
            H {temp(hi)} · L {temp(lo)} · {windFrom === null ? '' : `${compass(windFrom)} `}
            {speed(windMps)}
          </p>
          <p className="hwx__line hwx__rain">{rain ?? '—'}</p>
          <button type="button" className="hwx__more" onClick={() => onOpen('weather')}>
            Weather ›
          </button>
        </div>
      </div>
      {stormLine === null ? null : <p className="hday__storm">{stormLine}</p>}
      <ol className="hstrip" onClick={() => onOpen('weather')}>
        {steps.map((s) => {
          const t = at('temperature_2m', s.at)
          const c = conditionOf(at('weather_code', s.at), s.kind === 'sunrise' || getPosition(s.at, venue.lat, venue.lon).altitude > -0.8)
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
          <p className="hbest__none">{loading ? 'Reading the forecast…' : noForecast ? 'No forecast yet · retrying' : nothingLine(which, nextGood)}</p>
        ) : (
          <ul className="hbest__rows">
            {rows.map((r) => (
              <li key={r.activity} className="hbest__row">
                <span className={`hbest__tile hbest__tile--${r.activity}`}>
                  <ActivityIcon activity={r.activity} />
                </span>
                <b>{r.head}</b>
                <span className="hbest__why">{r.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {marine === null ? null : (
        <button type="button" className="hmarine" onClick={() => onOpen('tides')}>
          <b>NWS marine · {marine.period}:</b> {marine.text}
        </button>
      )}

      <div className="hcards">
        {cards.map((c) => (
          <Card key={c} kind={c} which={which} day={day} brief={brief} units={units} drone={drone} now={now} venue={venue} timeZone={timeZone} onOpen={onOpen} surf={surf} obs={obs} />
        ))}
      </div>

      {cams.length === 0 ? null : (
        /* Batch N A4: the row opens "Cams near <spot>"; the cams themselves are links out (docs/cams.md). */
        <button type="button" className="hcams" onClick={() => setCamsOpen(true)}>
          <CamGlyph />
          <span className="hcams__words">Cams · {cams.map((c) => beachName(c.cam.name)).join(', ')}</span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {camsOpen ? <CamsSheet spot={placeName} venue={venue} sunsetAzDeg={sunAz} seaFacingDeg={brief.facing} onClose={() => setCamsOpen(false)} /> : null}
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
  /* Batch N E3: in the future (8:11 PM offered "Surf 7-9 PM"), and in daylight for surf, the drone and the light. */
  const after = which === 'today' ? now.getTime() : 0
  const rise = day.events.sunrise?.getTime() ?? null
  const set = day.events.sunset?.getTime() ?? null
  const daylight = (t: number) => rise !== null && set !== null && t >= rise && t <= set
  const speed = (mps: number) => `${Math.round(windIn(mps, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`
  const rows: Partial<Record<Activity, WindowRow | null>> = {}

  /* Surf: the longest run of Fun or Firing hours still to come. */
  const surfRun = bestRun(
    day.surf.filter((b) => b.at.getTime() > after && daylight(b.at.getTime())).map((b) => ({ at: new Date(b.at.getTime() - 1_800_000), value: b })),
    (b) => surfTag(b.faceFt, b.shape) !== 'Flat',
  )
  if (surfRun !== null) {
    const ft = Math.round(Math.max(...surfRun.values.map((b) => b.faceFt)))
    const mid = surfRun.values[Math.floor(surfRun.values.length / 2)].at
    const w = day.wind.reduce((a, b) => (Math.abs(b.at.getTime() - mid.getTime()) < Math.abs(a.at.getTime() - mid.getTime()) ? b : a), day.wind[0])
    const side = windTag(w?.fromDeg ?? null, facing)
    rows.surf = { activity: 'surf', head: `Surf ${spanWords(surfRun.from, surfRun.to, timeZone)}`, reason: `${ft} ft${side === null ? '' : `, ${sideWords(side)}`}` }
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
  /** Batch Map A2: the spot's surf (src/lib/useSurfNow.ts); when away, the nearest surf beach's name and how far. */
  surf: SurfNow
  obs: StationObs | null
}

function Card({ kind, which, day, brief, units, drone, now, venue, timeZone, onOpen, surf, obs }: CardProps) {
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
    const band = which === 'today' ? surf.now : surf.tomorrow
    const words = which === 'today' ? surf.nowWords : surf.tomorrowWords
    if (words !== null) {
      big = <span data-shared={which === 'today' ? 'surf' : 'surf-tomorrow'}>{words}</span>
      /* Batch MAP2, Section 1: today's line is the Surf page's own (size from the band's ends, the dominant period); tomorrow's, its size. */
      line = surf.away !== null ? null : which === 'today' ? surfLine(surf.sea, band, now) : band === null ? null : rangeSizeWords(band.range.lowFt, band.range.highFt)
      tag = band?.tag ?? null
    }
    /* Not on open ocean (Batch N E8: a bay point read "0-1 ft · flat, 3 s"): the nearest surf beach, said as that. */
    if (surf.away !== null) line = `Nearest surf: ${surf.away.name} · ${surf.away.far}`
  } else if (kind === 'wind') {
    title = 'Wind'
    target = 'wind'
    /* Batch Map A2: today's is the one wind now (src/lib/windNow.ts), the Wind page's headline too; tomorrow's, the day's strongest hour. */
    const strong = day === null ? null : day.wind.reduce<(typeof day.wind)[number] | null>((a, b) => (a === null || (b.mps ?? 0) > (a.mps ?? 0) ? b : a), null)
    const w = which === 'today' ? windAt(brief.wx, now, obs) : strong?.mps == null ? null : { mps: strong.mps, fromDeg: strong.fromDeg, gustMps: strong.gustMps }
    const said = windWords(w, units.wind)
    big = said === null ? '—' : which === 'today' ? <span data-shared="wind">{said}</span> : said
    const side = windSideSpan(day, brief.facing, which === 'today' ? now : null, timeZone)
    line = side ?? gustWords(w, units.wind)
    tag = day?.windTag ?? null
  } else if (kind === 'tide') {
    title = 'Tide'
    target = 'tides'
    /* Batch N E6: the next turn from the station's whole list (the map's source), past midnight too; the height now on Today. */
    const from = which === 'today' ? now.getTime() : (day?.start.getTime() ?? now.getTime())
    const next = brief.turns.find((x) => x.at.getTime() > from) ?? null
    big = next === null ? '—' : `${next.kind === 'high' ? 'High' : 'Low'} ${clock(next.at)}`
    const feet = which === 'today' ? (day?.tide?.nowFeet ?? null) : null
    const going = next === null ? null : next.kind === 'high' ? 'rising' : 'falling'
    line = going === null ? null : feet === null ? going : `${feet.toFixed(1)} ft now · ${going}`
  } else if (kind === 'sky') {
    /* Batch Pages, Section 1 (board HomeV9): the Sky card is the sunset (or, after it, tomorrow's sunrise), the colour call in words and one reason; a tap opens the Sky page. */
    title = 'Sky'
    target = 'sky'
    const past = which === 'today' && day?.events.sunset != null && now.getTime() > day.events.sunset.getTime()
    const next = past ? (brief.days[1] ?? null) : null
    const read = past ? (next?.reads.sunrise ?? null) : (day?.reads.sunset ?? null)
    const at = past ? (next?.events.sunrise ?? null) : (day?.events.sunset ?? null)
    big = at == null ? '—' : `${past ? 'Sunrise' : 'Sunset'} ${clock(at).replace(/ [AP]M$/, '')}`
    const said = colorWords(read?.call ?? null)
    /* Tomorrow: when the call is settled, an hour before, from the stations (the briefing's own rule). */
    line = which === 'tomorrow' && at != null ? `${said ?? 'no call yet'} · final call ${clock(new Date(at.getTime() - 3_600_000))}` : read === null ? null : [said, shortWhy(read.why)].filter((x) => x !== null && x !== '').join(' · ')
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
    const az = rise === null ? null : getMoonPosition(rise, venue.lat, venue.lon).azimuth
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
  return change === undefined ? `${sideWords(first.side)} all day` : `${sideWords(first.side)} until ${hour(change.at)}`
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
      <p className="hweek__head">{head ?? (brief.status === 'loading' ? 'Reading the forecast…' : wx === null || brief.days.every((d) => d.wind.every((w) => w.mps === null)) ? 'No forecast yet · retrying' : 'Nothing standout this week')}</p>
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

/* ------------------------------------------------------------- button glyphs */

function CamGlyph() {
  return (
    <svg className="hbtn__icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M8 7l1.5-2.5h5L16 7" />
    </svg>
  )
}
function RadarGlyph() {
  return (
    <svg className="hbtn__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" />
    </svg>
  )
}
function DroneGlyph() {
  return (
    <svg className="hbtn__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="19" cy="6" r="2.5" />
      <path d="M7 7.5l3 3h4l3-3M10 10.5v3h4v-3M12 13.5v4" />
    </svg>
  )
}
