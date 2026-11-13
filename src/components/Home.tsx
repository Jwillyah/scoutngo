import { bestSpotWords, betterColorLine } from '../core/bestSky.ts'
import { useBestSky } from '../lib/useBestSky.ts'
import '../styles/home-d.css'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
/* suncalc 2.0.2 (this repo's): altitude and azimuth in DEGREES, azimuth from north, clockwise (Batch N E10: the moon read "S" when it was treated as radians from south). */
import { getMoonPosition, getPosition } from 'suncalc'
import { saneAzimuth } from '../core/sanity.ts'
import { moonTimesOnLocalDay } from '../core/moonTimes.ts'
import { droneTag, kt, surfOn, surfTag, windTag, type CallRead, type WindTag } from '../core/briefing.ts'
import { droneWindow } from '../core/droneWindow.ts'
import { bestRun, bestWindows, colorWords, skyStripLit, sideShort, sideSpanWords, weekPill, weekSurfRow, WEEK_SURE_DAYS, groundOf, sideWords, nothingLine, rainLine, spanWords, stripSteps, weekHeadline, type Activity, type CardKind, type WindowRow } from '../core/homeDay.ts'
import { camsFacingWaterOrSun } from '../core/skyCams.ts'
import { wakeAt } from '../core/alertIcs.ts'
import { formatClock } from '../core/timezone.ts'
import { useCoastCams } from '../lib/coastCamsLazy.ts'
import { homeOrder, primaryFor, useActivities } from '../lib/activities.ts'
import { seaNow, surfLine, useSurfNow, type SurfNow } from '../lib/useSurfNow.ts'
import { rangeSizeWords } from '../core/surfReads.ts'
import { chartMarks, firstFun, homeCardsShown, homeLayout, nextLine, nightSpans, surfChartMarks, surfPath, tideAt, tideCurve, type HomeLayout, type SurfChartMarks } from '../core/homeCards.ts'
import { gustWords, windAt, windWords } from '../lib/windNow.ts'
import { useStationObs, type StationNow } from '../lib/useStationObs.ts'
import { freshSky, skyCondition } from '../core/skyWord.ts'
import { colorNowLine } from '../core/colorNow.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { compass } from '../lib/tideWords.ts'
import { formatTemperature, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { useBriefing, type Briefing, type BriefingDrone, type DayBrief } from '../lib/useBriefing.ts'
import { useStormPlay } from '../lib/useStormPlay.ts'
import { useMarineAlerts } from '../lib/coastData.ts'
import { NetDebug } from './NetDebug.tsx'
import { refreshLine, useWeatherRefreshing } from '../lib/useWeatherStatus.ts'
import { ActivityIcon } from './ActivityIcon.tsx'
import { MoonGlyph } from './MoonGlyph.tsx'
/* Batch Polish 2, Section 4: not in the first paint's JavaScript. The cams' sheet opens on a tap; the weather-only home is one choice of five. */
const WeatherHome = lazy(() => import('./WeatherHome.tsx').then((m) => ({ default: m.WeatherHome })))
import { OPEN_RADAR_EVENT } from '../lib/pageEvents.ts'
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
export type HomeTarget = 'surf' | 'wind' | 'tides' | 'sky' | 'preflight' | 'moon' | 'weather' | 'drone' | 'bestsky'

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
  const surf = useSurfNow(venue, now, timeZone, units.distance === 'ft', placeName)
  /* Batch MAP2, Section 2: a station within 15 km that reported in the last hour; the wind now leans to it (the Wind page reads the same). */
  const stationObs = useStationObs(venue)
  const [picked] = useActivities()
  const order = homeOrder(picked, drone !== null)
  /* Batch Flow, Section 3: 1-3 activities picked, big full-width cards; else the six (boards D_Home2, D_Home6). */
  const layout = homeLayout(picked)
  /* The cards, the menu's too (src/core/homeCards.ts homeCardsShown). */
  const shown = homeCardsShown(picked, order, drone !== null)
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
      {/* Batch Flow, Section 3 (boards D_Home6, D_Home2): the spot ⌄ centred; Today · Tomorrow · Week are swiped, three dots under it. */}
      <div className="home__top home__top--d">
        <button type="button" className="home__spot" onClick={onSwitchSpot} disabled={onSwitchSpot === undefined} aria-label={`${placeName}: switch spot`}>
          <span className="home__spotname">{placeName}</span>
          <svg className="home__chev" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5L6 8l3.5-3.5" />
          </svg>
        </button>
        <div className="home__dots" role="tablist">
          {PAGES.map((p, i) => (
            <button key={p} type="button" role="tab" aria-label={p} aria-selected={page === i} className={`home__dot${page === i ? ' home__dot--on' : ''}`} onClick={() => go(i as Page)} />
          ))}
        </div>
      </div>
      {/* Swipe pages by design (Today · Tomorrow · Week, with the dots that name them): marked for the overflow audit, as Sky › Now is. */}
      <div className="home__track" ref={track} data-sideways>
        <section className="home__page" aria-label="Today">
          <DayView placeName={placeName} which="today" brief={brief} day={brief.days[0] ?? null} order={order} venue={venue} timeZone={timeZone} units={units} drone={drone} now={now} alert={alert === null ? null : alert.event} stormLine={play.inPlay ? play.headline : null} onOpen={onOpen} onDebug={() => setDebug((d) => !d)} surf={surf} obs={stationObs} layout={layout} shown={shown} weatherOnly={picked !== null && picked.length === 1 && picked[0] === 'weather'} />
        </section>
        <section className="home__page" aria-label="Tomorrow">
          <DayView placeName={placeName} which="tomorrow" brief={brief} day={brief.days[1] ?? null} order={order} venue={venue} timeZone={timeZone} units={units} drone={drone} now={now} alert={null} stormLine={null} onOpen={onOpen} surf={surf} obs={stationObs} layout={layout} shown={shown} />
        </section>
        <section className="home__page" aria-label="Week">
          <WeekView brief={brief} order={order} timeZone={timeZone} units={units} now={now} venue={venue} surf={surf} />
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
          {/* Batch Flow, Section 2: the map is a destination, bottom right (boards D_Home6, D_Home2). */}
          <button type="button" className="hbtn hbtn--round" onClick={onMenu} aria-label="Menu">
            <svg className="hbtn__glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
          <button type="button" className="hbtn hbtn--round" onClick={onOpenMap} aria-label="Open the map">
            <svg className="hbtn__glyph" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4l-6 2.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4zM9 4v13M15 6.5v13" />
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
  /** The cards shown, in order (src/core/homeCards.ts homeCardsShown). */
  shown: CardKind[]
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
  obs: StationNow | null
  /** Batch Flow, Section 3: few (1-3 activities picked) or many cards. */
  layout: HomeLayout
  /** Batch Polish 2, Section 2: only Weather picked: today is the weather itself (src/components/WeatherHome.tsx). */
  weatherOnly?: boolean
}

function DayView({ which, brief, day, order, venue, timeZone, units, drone, now, alert, stormLine, onOpen, onDebug, surf, obs, layout, shown, weatherOnly = false }: DayViewProps) {
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
  /* One sky word with the map's strip (src/core/skyWord.ts): fog only from the station, else the layers. */
  const cond = skyCondition({
    code: at('weather_code', when),
    layers: { low: at('cloud_cover_low', when), mid: at('cloud_cover_mid', when), high: at('cloud_cover_high', when) },
    day: sunUp,
    station: which === 'today' ? freshSky(obs, now) : null,
  })
  /* Batch TRUTH, Section 0.5: a live colour window with a Maybe or better leads the home. */
  /* Batch BEST SKY, Section 4: today only, with Shoot picked: the grid within 15 mi (7 or so questions, each kept an hour). */
  const bestSky = useBestSky(which === 'today' && order.includes('shoot') ? venue : null, 15, now)
  const colorNow = which !== 'today' || day === null ? null : colorNowLine([day.reads.sunrise, day.reads.sunset], now, venue, timeZone, bestSky.event === null ? null : bestSpotWords(bestSky.ranked, bestSky.here, venue, units.distance === 'ft'))
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
  const sunAz = day?.events.sunset === null || day === null ? null : getPosition(day.events.sunset, venue.lat, venue.lon).azimuth
  const coastCams = useCoastCams()
  const cams = which === 'today' && coastCams !== null ? camsFacingWaterOrSun(venue, sunAz, brief.facing, coastCams) : []

  /* Batch Flow, Section 3: within 3 h of a sunrise or sunset, it is said up top. */
  const soon = which !== 'today' ? null : [day?.events.sunrise ?? null, day?.events.sunset ?? null, brief.days[1]?.events.sunrise ?? null].find((t): t is Date => t !== null && t.getTime() > now.getTime() && t.getTime() - now.getTime() <= 3 * 3_600_000) ?? null
  const soonWord = soon === null ? null : `${soon === day?.events.sunset ? 'sunset' : 'sunrise'} ${clock(soon)}`
  /* One decision for the day's line and the Surf card's tag (Batch QA, Section 0B: "Nothing standout today" under "Fun now"): the card's first Fun is an item here too. */
  const items = rows.filter((r) => r.from !== undefined).map((r) => ({ what: NEXT_WORD[r.activity], from: r.from as Date }))
  const surfFun = order.includes('surf') ? surfFunAt(brief, surf, which, now, day).fun : null
  if (surfFun !== null && !items.some((i) => i.what === NEXT_WORD.surf)) items.push({ what: NEXT_WORD.surf, from: surfFun === 'now' ? now : surfFun })
  const nextWords = nextLine(items, now, (d) => clock(d))
  void rain
  void steps
  void speed
  void windMps
  void windFrom
  void noForecast
  void nextGood

  /*
   * THE HOME NEVER SCROLLS (Batch Polish, Section 3; scripts/audit-home-fit.mjs).
   * Measured on the page itself after each draw: first tighter (the hero, the
   * charts and the dial smaller, the tide's turns in its line), then the
   * lowest-priority card left for the menu, until nothing scrolls. A resize
   * (rotation, Safari's bars, the text size) starts again.
   */
  const better = bestSky.event === null ? null : betterColorLine(bestSky.ranked, bestSky.here, venue, formatClock(bestSky.event.peak, timeZone), units.distance === 'ft')
  const nextText = nextWords === null ? (loading ? 'Reading the forecast…' : noForecast ? 'No forecast yet · retrying' : nothingLine(which, nextGood)) : `Next: ${nextWords}`
  const root = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState<{ tight: 0 | 1 | 2; drop: number }>({ tight: 0, drop: 0 })
  useEffect(() => {
    const again = () => setFit({ tight: 0, drop: 0 })
    window.addEventListener('resize', again)
    return () => window.removeEventListener('resize', again)
  }, [])
  /* oxlint-disable react/set-state-in-effect -- the fit is measured from the drawn page (a layout read), one step at a time, never back down until a resize */
  useLayoutEffect(() => {
    const page = root.current?.closest('.home__page') as HTMLElement | null
    if (page === null || page === undefined || page.scrollHeight <= page.clientHeight + 1) return
    if (fit.tight < 2) setFit({ tight: fit.tight === 0 ? 1 : 2, drop: 0 })
    /* The weather-only home has one block: its week is the one thing it can leave (WeatherHome's drop). */
    else if (fit.drop < Math.max(shown.length - 1, weatherOnly && which === 'today' ? 1 : 0)) setFit({ tight: 2, drop: fit.drop + 1 })
  }, [fit, shown.length, brief, layout, nextText, cams.length, weatherOnly, which])
  /* oxlint-enable react/set-state-in-effect */
  const cardsShown = fit.drop === 0 ? shown : shown.slice(0, shown.length - fit.drop)

  return (
    <div ref={root} className={`hday hday--d hday--${layout}${fit.tight === 0 ? '' : fit.tight === 1 ? ' hday--snug' : ' hday--snug hday--tight'}`} data-fit={fit.tight === 0 ? 'full' : `${fit.tight === 1 ? 'snug' : 'tight'}${fit.drop === 0 ? '' : `, ${fit.drop} left for the menu`}`}>
      {alert === null ? null : (
        <p className="hday__alert" role="status">
          {alert}
        </p>
      )}
      <div className="hwx hwx--d">
        {/* Batch TRUTH, Section 0.5: in a live colour window the date line's slot leads with it, at no extra height. */}
        {colorNow === null ? (
          <p className="hwx__date" onClick={(e) => (e.detail >= 3 ? onDebug?.() : undefined)}>
            {dateWords}
          </p>
        ) : (
          <button type="button" className="hwx__date hday__colornow" data-colornow="" onClick={() => onOpen('sky')}>
            {colorNow}
          </button>
        )}
        {/* Batch Pages / Flow: the temperature opens the Weather page. */}
        <button type="button" className="hwx__temp num" data-shared="temp" data-value={bigTemp === null ? '' : temp(bigTemp)} onClick={() => onOpen('weather')} aria-label={`${bigTemp === null ? 'No temperature' : temp(bigTemp)}: the weather`}>
          {bigTemp === null ? (loading ? '…' : '—') : temp(bigTemp)}
        </button>
        <p className="hwx__cond">
          {cond?.word ?? '—'} · H {temp(hi)} L {temp(lo)}
          {soonWord === null ? '' : ` · ${soonWord}`}
        </p>
      </div>
      {stormLine === null ? null : <p className="hday__storm">{stormLine}</p>}

      {/* Batch Polish, Section 3: no routine NWS marine text on the home; an advisory or warning is the alert line above. */}

      {weatherOnly && which === 'today' ? (
        <Suspense fallback={null}>
        <WeatherHome venue={venue} timeZone={timeZone} units={units} now={now} wx={wx} obs={obs} drop={fit.drop} onOpen={() => onOpen('weather')} />
        </Suspense>
      ) : (
        <div className={`hcards hcards--${layout}`}>
          {cardsShown.map((c) => (
            <Card key={c} kind={c} layout={layout} which={which} day={day} brief={brief} units={units} drone={drone} now={now} venue={venue} timeZone={timeZone} onOpen={onOpen} surf={surf} obs={obs} />
          ))}
        </div>
      )}
      {/* Batch TRUTH, Section 4: the Next line alone; the cams live in the menu ("Next: … / Cams · VB Pier" was two things in one row). */}
      {/* Batch BEST SKY, Section 4: when somewhere near has better color than here, that is the row; it opens "Where's the color?". */}
      {better === null ? (
        <p className="hnext">{nextText}</p>
      ) : (
        <button type="button" className="hnext hnext--better" data-better onClick={() => onOpen('bestsky')}>
          {better} ›
        </button>
      )}
    </div>
  )
}

/** A mini chart's words over its drawing (Batch Polish, Section 3; Batch Polish 2, Section 2): gridline labels, the peak, "steady all day", the time ticks. */
function ChartMarksText({ marks, unit }: { marks: SurfChartMarks | null; unit: string }) {
  if (marks === null) return null
  const one = (v: number) => (unit === 'ft' ? v.toFixed(1) : String(Math.round(v)))
  return (
    <>
      {marks.grid.map((g, i) => (
        <span key={g.ft} className={`hcard__gl${i === 1 ? ' hcard__gl--mid' : ''}`} style={{ top: `${g.y * 100}%` }}>
          {g.ft}
        </span>
      ))}
      {marks.peak === null ? null : (
        /* Inside the plot (Batch TRUTH, Section 4): past the middle the label sits left of its dot, clear of the right edge and the axis words; never above the top. */
        <span className={`hcard__peak${marks.peak.x > 0.55 ? ' hcard__peak--left' : ''}`} style={{ left: `${marks.peak.x * 100}%`, top: `${Math.max(12, marks.peak.y * 100)}%` }}>
          <span className="hcard__peakdot" />
          <span className="hcard__peaklabel">
            {one(marks.peak.ft)} {unit}
          </span>
        </span>
      )}
      <span className="hcard__ticks" aria-hidden="true">
        {marks.ticks.map((t) => (
          <span key={t.label} className={t.x === 0 ? 'hcard__tick--edge' : undefined} style={{ left: `${t.x * 100}%` }}>
            {t.label}
          </span>
        ))}
      </span>
    </>
  )
}

/** The "Next:" line's words for each window (Batch Flow, Section 3). */
const NEXT_WORD: Record<Activity, string> = { surf: 'surf on', shoot: 'sky color', drone: 'drone calm', fish: 'calm water', weather: 'dry' }

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
    (b) => surfOn(surfTag(b.faceFt, b.shape)),
  )
  if (surfRun !== null) {
    const ft = Math.round(Math.max(...surfRun.values.map((b) => b.faceFt)))
    const mid = surfRun.values[Math.floor(surfRun.values.length / 2)].at
    const w = day.wind.reduce((a, b) => (Math.abs(b.at.getTime() - mid.getTime()) < Math.abs(a.at.getTime() - mid.getTime()) ? b : a), day.wind[0])
    const side = windTag(w?.fromDeg ?? null, facing)
    rows.surf = { activity: 'surf', head: `Surf ${spanWords(surfRun.from, surfRun.to, timeZone)}`, reason: `${ft} ft${side === null ? '' : `, ${sideWords(side)}`}`, from: surfRun.from }
  }

  /* Shoot: the day's colour call still to come, Go or Maybe. */
  const reads = (['sunrise', 'sunset'] as const).map((k) => day.reads[k]).filter((r): r is CallRead => r !== null && r.event.getTime() > after && (r.call === 'Go' || r.call === 'Maybe'))
  const read = reads.sort((a, b) => (a.call === b.call ? a.event.getTime() - b.event.getTime() : a.call === 'Go' ? -1 : 1))[0]
  if (read !== undefined) {
    const from = read.colorFrom ?? read.event
    const to = read.colorTo ?? new Date(read.event.getTime() + 20 * 60_000)
    /* Tomorrow: when the call is settled (sunrise: the wake-up time; sunset: an hour before, from the stations). */
    const settled = read.kind === 'sunrise' ? wakeAt(read.event) : new Date(read.event.getTime() - 3_600_000)
    rows.shoot = { activity: 'shoot', head: `${read.kind === 'sunset' ? 'Sunset' : 'Sunrise'} color ${spanWords(from, to, timeZone)}`, reason: which === 'tomorrow' ? `${read.call}, final call ${formatClock(settled, timeZone)}` : `${read.call}, ${shortWhy(read.why)}`, from }
  }

  /* Drone: the next calm daylight run at 400 ft against the aircraft's rating. */
  if (drone !== null) {
    const w = droneWindow(day.wind, drone.maxWindMps, day.start, venue.lat, venue.lon, which === 'today' ? now : day.start)
    if (w.calm.kind === 'calm') {
      const span = w.calm.span
      const inside = day.wind.filter((h) => h.at.getTime() >= span.from.getTime() && h.at.getTime() < span.to.getTime() && h.highMps !== null)
      const top = inside.length === 0 ? null : Math.max(...inside.map((h) => h.highMps as number))
      rows.drone = { activity: 'drone', head: `Drone calm ${spanWords(span.from, span.to, timeZone)}`, reason: top === null ? 'at 400 ft' : `${speed(top)} at 400 ft`, from: span.from }
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
    rows.fish = { activity: 'fish', head: `Calm water ${spanWords(calmWater.from, calmWater.to, timeZone)}`, reason: `${speed(top)}${turn === null ? '' : `, ${turn.kind} ${formatClock(turn.at, timeZone)}`}`, from: calmWater.from }
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
  layout: HomeLayout
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
  obs: StationNow | null
}

const CHART = { w: 300, h: 70 }

/*
 * THE CARDS, LOOK D (Batch Flow, Section 3; boards D_Home6, D_Home2). Each
 * with its own live graphic: the surf's 24 hours with the night shaded, the
 * wind's dial (the offshore half teal, the arrow where it goes), the tide's
 * curve with its turns, the sky's light strip, the drone's height ladder,
 * the moon's phase. Every number is the code's (src/core/homeCards.ts).
 */
function Card({ kind, layout, which, day, brief, units, drone, now, venue, timeZone, onOpen, surf, obs }: CardProps) {
  const clock = (d: Date) => formatClock(d, timeZone)
  const short = (d: Date) => clock(d).replace(/:00 /, ' ')
  const speed = (mps: number | null) => (mps === null ? '—' : `${Math.round(windIn(mps, units.wind) ?? 0)}`)
  const unit = windUnitLabel(units.wind)
  const nearest = <T extends { at: Date }>(list: readonly T[], t: Date): T | null => (list.length === 0 ? null : list.reduce((a, b) => (Math.abs(b.at.getTime() - t.getTime()) < Math.abs(a.at.getTime() - t.getTime()) ? b : a)))
  const t = which === 'today' ? now : day === null ? now : new Date(day.start.getTime() + 13 * 3_600_000)
  const wide = layout === 'few' || kind === 'surf'
  const small = layout === 'many' && (kind === 'sky' || kind === 'drone' || kind === 'moon')
  /* The chart's width on the card, near enough for the tick words' spacing (chartMarks TICK_GAP_PX). */
  /* A small card's chart is about 96 px across (the six-card home's thirds). */
  const cardPx = wide ? 340 : small ? 96 : 160
  let title = ''
  let big: ReactNode = '—'
  /* A value this card says that other screens say too (Batch QA, Section 3: scripts/audit-one-number.mjs). */
  let shared: { key: string; value: string } | null = null
  let line: ReactNode = null
  let tag: string | null = null
  let tagGood = false
  let pic: ReactNode = null
  let target: HomeTarget = 'weather'
  if (kind === 'surf') {
    title = 'Surf · next 24 hours'
    target = 'surf'
    /* Batch TRUTH, Section 1: the day's one call (src/core/surfCall.ts), the week list's and the Surf page's too. */
    const daySurf = surf.week[which === 'today' ? 0 : 1] ?? null
    const band = daySurf?.hour ?? null
    const call = daySurf?.call ?? null
    const words = call === null ? null : call.words
    if (words !== null && call !== null) {
      big = <span data-shared={which === 'today' ? 'surf' : 'surf-tomorrow'}>{words}</span>
      line = surf.away !== null ? null : which === 'today' ? surfLine(surf.sea, band, now) : rangeSizeWords(call.lowFt, call.highFt)
    }
    if (surf.away !== null) line = `Nearest surf: ${surf.away.name} · ${surf.away.far}`
    /* The next 24 hours of faces, from the briefing's hours, today's and tomorrow's. */
    const from = which === 'today' ? now : (day?.start ?? now)
    const { pts, fun } = surfFunAt(brief, surf, which, now, day)
    /* The tag is the call's size; "Fun 3p" only says when, for a day the call says is Fun or Firing. */
    const on = call !== null && surfOn(call.size)
    tag = !on || fun === null ? (call?.size ?? null) : fun === 'now' ? `${call.size} now` : `${call.size} ${short(fun)}`
    tagGood = on
    const path = surfPath(pts, from, 24, CHART)
    const marks = surfChartMarks(pts, from, 24, timeZone, { widthPx: cardPx, dayStart: which === 'tomorrow' })
    if (marks?.steady === true) title = 'Surf · next 24 h · steady'
    const nights = nightSpans(from, 24, brief.days.map((d) => d.events.sunset).filter((x): x is Date => x !== null), brief.days.map((d) => d.events.sunrise).filter((x): x is Date => x !== null))
    /* The parts, at the hour (S7 look), in the few-cards layout: the Surf page's own (seaNow). */
    const parts = layout === 'few' && which === 'today' ? seaNow(surf.sea, now).parts.slice(0, 2) : []
    pic = (
      <>
        {parts.length === 0 ? null : (
          <span className="hcard__parts">
            {parts.map((p) => (
              <span key={p.name}>
                <b>{p.name}</b> {p.ft.toFixed(1)} ft{p.periodS === null ? '' : ` ${Math.round(p.periodS)} s`}{p.fromDeg === null ? '' : ` ${compass(p.fromDeg)}`}
              </span>
            ))}
          </span>
        )}
        {path === null ? null : (
          /* Batch Polish, Section 3: readable: whole-foot gridlines labelled on the right, the time ticks, the peak and its height, "steady all day"; the words are text over the drawing, never stretched with it. */
          <span className="hcard__chartbox">
          <svg className="hcard__chart hcard__chart--surf" viewBox={`0 0 ${CHART.w} ${CHART.h}`} preserveAspectRatio="none" aria-hidden="true">
            {(marks?.grid ?? []).map((g) => (
              <line key={g.ft} x1="0" x2={CHART.w} y1={g.y * CHART.h} y2={g.y * CHART.h} className="hcard__grid" />
            ))}
            <defs>
              <linearGradient id="surfFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--d-surf)" stopOpacity="0.55" />
                <stop offset="1" stopColor="var(--d-surf)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {nights.map((n) => (
              <rect key={n.a} x={n.a * CHART.w} y="0" width={(n.b - n.a) * CHART.w} height={CHART.h} className="hcard__night" />
            ))}
            <path d={path.fill} fill="url(#surfFill)" />
            <path d={path.line} className="hcard__line hcard__line--surf" />
            {which === 'today' ? <line x1="1" x2="1" y1="0" y2={CHART.h} className="hcard__now" /> : null}
          </svg>
          <ChartMarksText marks={marks} unit="ft" />
          </span>
        )}
      </>
    )
  } else if (kind === 'wind') {
    title = 'Wind'
    target = 'wind'
    const strong = day === null ? null : day.wind.reduce<(typeof day.wind)[number] | null>((a, b) => (a === null || (b.mps ?? 0) > (a.mps ?? 0) ? b : a), null)
    const w = which === 'today' ? windAt(brief.wx, now, obs) : strong?.mps == null ? null : { mps: strong.mps, fromDeg: strong.fromDeg, gustMps: strong.gustMps }
    const said = windWords(w, units.wind)
    big = said === null ? '—' : which === 'today' ? <span data-shared="wind">{said}</span> : said
    /* Batch Flow, Section 3: one function decides the side, for the tag and the line alike (it read "Offshore" over "cross-shore"). */
    const sideNow = w?.fromDeg == null ? null : windTag(w.fromDeg, brief.facing)
    /* Batch TRUTH, Section 4: the short word on the tag ("Cross-on"), so it never wraps on a half-width card; the line says it in full. */
    tag = sideNow === null ? null : sideShort(sideNow).replace(/^./, (c) => c.toUpperCase())
    tagGood = sideNow === 'Offshore'
    const span = windSideSpan(day, brief.facing, which === 'today' ? now : null, timeZone, which === 'today' ? sideNow : null)
    const gusts = gustWords(w, units.wind)
    line = [gusts, span !== null && !span.endsWith('all day') ? span : null].filter((x) => x !== null).join(' · ') || null
    pic = <WindDial fromDeg={w?.fromDeg ?? null} facing={brief.facing} />
  } else if (kind === 'tide') {
    title = layout === 'few' ? 'Tide · today' : 'Tide'
    target = 'tides'
    const from = which === 'today' ? now.getTime() : (day?.start.getTime() ?? now.getTime())
    const next = brief.turns.find((x) => x.at.getTime() > from) ?? null
    const going = next === null ? null : next.kind === 'high' ? 'Rising' : 'Falling'
    big = going ?? '—'
    const feet = which === 'today' ? (day?.tide?.nowFeet ?? null) : null
    line = next === null ? null : `${next.kind} ${clock(next.at)}${layout === 'few' ? ` · ${next.feet.toFixed(1)} ft${feet === null ? '' : ` · now ${feet.toFixed(1)} ft`}` : ''}`
    tag = next === null ? null : `${next.kind === 'high' ? 'High' : 'Low'} ${clock(next.at)}`
    const curve = tideCurve(brief.turns, new Date(from - 3 * 3_600_000), 24, CHART)
    /*
     * Batch Beach, Section 6: the turns' labels sat inside the stretched chart
     * at about 9 px; now only the next low and the next high, as text at 12 px
     * or more under the curve.
     */
    const nextLow = brief.turns.find((x) => x.kind === 'low' && x.at.getTime() > from) ?? null
    const nextHigh = brief.turns.find((x) => x.kind === 'high' && x.at.getTime() > from) ?? null
    const turnWords = (t: typeof nextLow) => (t === null ? null : `${t.kind === 'high' ? 'High' : 'Low'} ${clock(t.at)} · ${t.feet.toFixed(1)} ft`)
    /* Batch Polish 2, Section 2: the surf chart's treatment: whole-foot gridlines, the time ticks with "now" 3 h in, the highest water and its height, the night. */
    /* Tomorrow's chart is tomorrow's day, from 12a, with no "now" (Batch TRUTH, Section 4). */
    const tideFrom = new Date(which === 'today' ? from - 3 * 3_600_000 : from)
    const tidePts = Array.from({ length: 73 }, (_, i) => new Date(tideFrom.getTime() + i * 20 * 60_000)).flatMap((t) => {
      const v = tideAt(brief.turns, t)
      return v === null ? [] : [{ at: t, v }]
    })
    const tideMarks = curve === null ? null : chartMarks(tidePts, tideFrom, 24, timeZone, { floor: 0, steady: 0.3, steps: [-1, 0, 1, 2, 3, 4, 5, 6, 8, 10], low: curve.range.lo, high: curve.range.hi, nowAt: 3 / 24, widthPx: cardPx, dayStart: which === 'tomorrow' })
    const tideNights = nightSpans(tideFrom, 24, brief.days.map((d) => d.events.sunset).filter((x): x is Date => x !== null), brief.days.map((d) => d.events.sunrise).filter((x): x is Date => x !== null))
    pic =
      curve === null ? null : (
        <span className="hcard__tidepic">
          <span className="hcard__chartbox">
          <svg className="hcard__chart hcard__chart--tide" viewBox={`0 0 ${CHART.w} ${CHART.h}`} preserveAspectRatio="none" aria-hidden="true">
            {(tideMarks?.grid ?? []).map((g) => (
              <line key={g.ft} x1="0" x2={CHART.w} y1={g.y * CHART.h} y2={g.y * CHART.h} className="hcard__grid" />
            ))}
            {tideNights.map((n) => (
              <rect key={n.a} x={n.a * CHART.w} y="0" width={(n.b - n.a) * CHART.w} height={CHART.h} className="hcard__night" />
            ))}
            <path d={curve.line} className="hcard__line hcard__line--tide" />
            {which === 'today' ? (
              <>
                <line x1={(3 / 24) * CHART.w} x2={(3 / 24) * CHART.w} y1="0" y2={CHART.h} className="hcard__now" />
                <circle cx={(3 / 24) * CHART.w} cy={curve.scale(tideAt(brief.turns, new Date(from)) ?? 0)} r="4" className="hcard__dot" />
              </>
            ) : null}
          </svg>
          <ChartMarksText marks={tideMarks} unit="ft" />
          </span>
          <span className="hcard__turns" data-tide-turns>
            {[nextLow, nextHigh]
              .filter((t): t is NonNullable<typeof t> => t !== null)
              .sort((a, b) => a.at.getTime() - b.at.getTime())
              .map((t) => (
                <span key={t.at.getTime()}>{turnWords(t)}</span>
              ))}
          </span>
        </span>
      )
  } else if (kind === 'sky') {
    /* The sunset still to come, or after it tomorrow's sunrise: never an event that has passed (Batch Flow, Section 4). */
    title = 'Sky'
    target = 'sky'
    const past = which === 'today' && day?.events.sunset != null && now.getTime() > day.events.sunset.getTime()
    const next = past ? (brief.days[1] ?? null) : null
    const read = past ? (next?.reads.sunrise ?? null) : (day?.reads.sunset ?? null)
    const at = past ? (next?.events.sunrise ?? null) : (day?.events.sunset ?? null)
    const said = colorWords(read?.call ?? null)
    big = said === null ? '—' : <span data-shared={which === 'today' ? 'skycall' : 'skycall-tomorrow'} data-value={said}>{said.replace(/^color /, '').replace(/^./, (c) => c.toUpperCase())}</span>
    line = at == null ? null : `${past ? 'rise' : 'set'} ${clock(at)}`
    /* Batch QA, Section 3: the sunset the card says, compared with every screen that says it. */
    if (which === 'today' && !past && at != null) shared = { key: 'sunset', value: `sunset ${clock(at)}`.toLowerCase() }
    tag = read?.call ?? null
    tagGood = read?.call === 'Go'
    /* Batch Beach, Section 6: colour only for a possible or likely call; grey for Unlikely and for none. */
    const lit = skyStripLit(read?.call ?? null)
    pic = <span className={`hcard__strip hcard__strip--${past ? 'rise' : 'set'}${lit ? '' : ' hcard__strip--muted'}`} data-strip={lit ? 'lit' : 'muted'} aria-hidden="true" />
  } else if (kind === 'drone') {
    title = small ? 'Drone' : 'Drone · 400 ft'
    /* Batch Flow, Section 5: the Drone page first. */
    target = 'drone'
    const w = day === null ? null : nearest(day.wind, t)
    /* Batch TRUTH, Section 3: the number says where it is, so 14 kt up here never reads as a contradiction of the Wind card's 7 kt on the ground. */
    big = w?.highMps == null ? '—' : (
      <>
        {speed(w.highMps)} {unit}
        <span className="hcard__at"> at 400 ft</span>
      </>
    )
    tag = drone === null || w === null ? null : droneTag(w.highMps, drone.maxWindMps)
    /*
     * Batch Polish 2, Section 2: the 400 ft wind over the next 24 hours with
     * the surf chart's treatment (gridlines in the wind's unit, the time
     * ticks, the strongest hour and its speed, the night, "steady"); the
     * aircraft's rated wind a dashed line when it is in the kit.
     */
    const dFrom = which === 'today' ? now : (day?.start ?? now)
    const toUnit = (mps: number) => windIn(mps, units.wind) ?? 0
    const dPts = brief.days.flatMap((d) => d.wind).flatMap((h) => (h.highMps === null ? [] : [{ at: h.at, v: toUnit(h.highMps) }]))
    const rated = drone?.maxWindMps == null ? null : toUnit(drone.maxWindMps)
    const dTop = Math.max(rated ?? 0, 10, ...dPts.filter((p) => p.at.getTime() >= dFrom.getTime() && p.at.getTime() <= dFrom.getTime() + 24 * 3_600_000).map((p) => p.v)) * 1.15
    const dMarks = chartMarks(dPts, dFrom, 24, timeZone, { floor: 10, steady: 3, steps: [5, 10, 15, 20, 25, 30, 40, 50], high: dTop, widthPx: cardPx, dayStart: which === 'tomorrow' })
    if (dMarks?.steady === true) title = small ? 'Drone · steady' : 'Drone · 400 ft · steady'
    const dPath = surfPath(dPts.map((p) => ({ at: p.at, ft: p.v, fun: false })), dFrom, 24, CHART, dTop)
    const dNights = nightSpans(dFrom, 24, brief.days.map((d) => d.events.sunset).filter((x): x is Date => x !== null), brief.days.map((d) => d.events.sunrise).filter((x): x is Date => x !== null))
    pic =
      dPath === null ? null : (
        <span className="hcard__chartbox">
          <svg className="hcard__chart hcard__chart--drone" viewBox={`0 0 ${CHART.w} ${CHART.h}`} preserveAspectRatio="none" aria-hidden="true">
            {(dMarks?.grid ?? []).map((g) => (
              <line key={g.ft} x1="0" x2={CHART.w} y1={g.y * CHART.h} y2={g.y * CHART.h} className="hcard__grid" />
            ))}
            {dNights.map((n) => (
              <rect key={n.a} x={n.a * CHART.w} y="0" width={(n.b - n.a) * CHART.w} height={CHART.h} className="hcard__night" />
            ))}
            {rated === null ? null : <line x1="0" x2={CHART.w} y1={(1 - rated / dTop) * CHART.h} y2={(1 - rated / dTop) * CHART.h} className="hcard__rated" />}
            <path d={dPath.line} className="hcard__line hcard__line--drone" />
            {which === 'today' ? <line x1="1" x2="1" y1="0" y2={CHART.h} className="hcard__now" /> : null}
          </svg>
          <ChartMarksText marks={dMarks} unit={unit} />
        </span>
      )
  } else {
    title = 'Moon'
    target = 'moon'
    const base = day?.start ?? now
    const rise = moonTimesOnLocalDay(new Date(base.getTime() + 12 * 3_600_000), venue.lat, venue.lon, timeZone).rise
    const az = rise === null ? null : saneAzimuth(getMoonPosition(rise, venue.lat, venue.lon).azimuth)
    const moon = day?.moon ?? null
    big = moon === null ? '—' : moon.fraction < 0.03 ? 'New' : moon.fraction > 0.97 ? 'Full' : `${Math.round(moon.fraction * 100)}%`
    /* The small card has room for the time alone (Batch QA, Section 0B: "rise 10:05 PM · ENE" was cut, then wrapped to four lines); its bearing is the Sky page's. */
    /* Batch Beach, Section 6: the small card in one line, the short clock ("rise 10:05p"; it wrapped to three lines). */
    const riseAt = rise === null ? null : small ? clock(rise).replace(/ ([AP])M$/, (_m, x: string) => x.toLowerCase()) : clock(rise)
    line = `${riseAt === null ? 'no rise' : `rise ${riseAt}`}${az === null || small ? '' : ` · ${compass(az)}`}`
    pic = moon === null ? null : <MoonGlyph phase={moon.phase} size={layout === 'few' ? 56 : small ? 32 : 40} />
  }
  return (
    <button type="button" className={`hcard hcard--${kind}${wide ? ' hcard--wide' : ''}${small ? ' hcard--small' : ''}`} onClick={() => onOpen(target)}>
      <span className="hcard__head">
        <span className="hcard__title">{title}</span>
        {/* A small card has no room for a pill: its tag is said under its number. */}
        {tag === null || small ? null : <span className={`hcard__tag hcard__tag--${tag.toLowerCase().replace(/\s+/g, '-')}${tagGood ? ' hcard__tag--good' : ''}`} {...(kind === 'tide' && which === 'today' ? { 'data-shared': 'tide', 'data-value': tag.toLowerCase() } : {})}>{tag}</span>}
      </span>
      <span className="hcard__body">
        <span className="hcard__words">
          <span className="hcard__big">{big}</span>
          {/* No line, no placeholder (Batch QA, Section 0B: a stray "—" under the Drone card's number). */}
          {(() => {
            const said = small && tag !== null && kind !== 'sky' ? tag : line
            return said === null || said === '' ? null : <span className="hcard__line" {...(shared === null ? {} : { 'data-shared': shared.key, 'data-value': shared.value })}>{said}</span>
          })()}
        </span>
        {kind === 'wind' || kind === 'moon' ? pic : null}
      </span>
      {kind === 'wind' || kind === 'moon' ? null : pic}
    </button>
  )
}

/** The wind's dial: where it comes from the offshore half is teal, onshore orange; the arrow points where it goes (board D_Home6). */
function WindDial({ fromDeg, facing }: { fromDeg: number | null; facing: number | null }) {
  const r = 26
  const wedge = (centre: number, half: number) => {
    const p = (a: number) => [30 + r * Math.sin((a * Math.PI) / 180), 30 - r * Math.cos((a * Math.PI) / 180)]
    const [x0, y0] = p(centre - half)
    const [x1, y1] = p(centre + half)
    return `M30 30 L${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`
  }
  return (
    <svg className="hcard__dial" viewBox="0 0 60 60" aria-hidden="true">
      <circle cx="30" cy="30" r={r} className="hcard__dialface" />
      {facing === null ? null : (
        <>
          {/* Wind FROM the land side (opposite the way the beach faces) is offshore; from the sea side, onshore (src/core/coastFacing.ts, 45° each way). */}
          <path d={wedge(facing + 180, 45)} className="hcard__dial--off" />
          <path d={wedge(facing, 45)} className="hcard__dial--on" />
        </>
      )}
      {fromDeg === null ? null : (
        <g transform={`rotate(${fromDeg + 180} 30 30)`}>
          <path d="M30 50 V12 M24 18 L30 10 L36 18" className="hcard__arrow" />
        </g>
      )}
    </svg>
  )
}

/** "Offshore until 11 AM", "Onshore from 2 PM": the wind's side to the beach and when it changes. */
function windSideSpan(day: DayBrief | null, facing: number | null, now: Date | null, timeZone: string, sideNow: WindTag | null = null): string | null {
  if (day === null || facing === null) return null
  const hours = day.wind.filter((h) => now === null || h.at.getTime() + 1_800_000 > now.getTime())
  const sides = hours.map((h) => ({ at: h.at, side: windTag(h.fromDeg, facing) }))
  /* Batch NOW, Section 2.4: the line starts from the headline's side (the one wind now), never a second "now" from the model's hour. */
  const first = sideNow === null ? sides[0] : { at: now ?? sides[0]?.at, side: sideNow }
  if (first === undefined || first.side === null) return null
  const change = sides.find((s) => s.side !== first.side && s.side !== null)
  /* Batch TRUTH, Section 4: "cross-off · offshore 9a", at the hour the change starts. */
  return sideSpanWords(first.side, change === undefined || change.side === null ? null : { tag: change.side, at: new Date(change.at.getTime() - 1_800_000) }, timeZone)
}

/**
 * When the surf is first Fun or better, the Surf card's tag and the day's line
 * both (Batch QA, Section 0B): the hours on the one scale (surfOn), and now
 * only when the reading the card's line is from (useSurfNow's band) agrees:
 * never "Fun now" over "bumpy, onshore".
 */
function surfFunAt(brief: Briefing, surf: SurfNow, which: 'today' | 'tomorrow', now: Date, day: DayBrief | null): { pts: { at: Date; ft: number; fun: boolean }[]; fun: Date | 'now' | null } {
  const band = which === 'today' ? surf.now : surf.tomorrow
  const from = which === 'today' ? now : (day?.start ?? now)
  const pts = brief.days.flatMap((d) => d.surf).map((b) => ({ at: b.at, ft: b.faceFt, fun: surfOn(surfTag(b.faceFt, b.shape)) }))
  const fun = firstFun(pts, from)
  return { pts, fun: fun === 'now' && band !== null && !surfOn(band.tag) ? null : fun }
}

/* ------------------------------------------------------------- the week */

function WeekView({ brief, order, timeZone, units, now, venue, surf }: { brief: Briefing; order: readonly Activity[]; timeZone: string; units: Units; now: Date; venue: { lat: number; lon: number }; surf: SurfNow }) {
  const wx = brief.wx
  const day = (d: Date) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(d)
  const rows = brief.days.map((d) => {
    const noon = new Date(d.start.getTime() + 13 * 3_600_000)
    const temps = wx === null ? [] : Array.from({ length: 24 }, (_, i) => hourlyAt(wx, 'temperature_2m', new Date(d.start.getTime() + i * 3_600_000 + 1_800_000))).filter((t): t is number => t !== null)
    const wxAt = (name: string) => (wx === null ? null : hourlyAt(wx, name, noon))
    const cond = skyCondition({ code: wxAt('weather_code'), layers: { low: wxAt('cloud_cover_low'), mid: wxAt('cloud_cover_mid'), high: wxAt('cloud_cover_high') }, day: true, station: null })
    /* Batch TRUTH, Section 1: the day's one call (useSurfNow's week), the cards' and the Surf page's. */
    const surfDay = order.includes('surf') ? weekSurfRow(surf.week.find((w) => w.date === d.iso)?.call ?? null, d.index) : null
    const worth = worthOf(d, order, surfDay?.on ?? false)
    /* Batch QA, Section 0B: the day's weather, for a week with nothing else to say (weather only): the strongest wind and the hours of rain, from the briefing's own hours. */
    const rainH = wx === null ? null : Array.from({ length: 24 }, (_, i) => hourlyAt(wx, 'precipitation', new Date(d.start.getTime() + i * 3_600_000 + 1_800_000))).filter((mm) => mm !== null && mm >= 0.1).length
    const weather = [d.windMaxKt === null ? null : `${Math.round(d.windMaxKt)} kt`, rainH === null ? null : rainH === 0 ? 'dry' : `rain ${rainH} h`].filter((x) => x !== null).join(' · ')
    const pill = weekPill(worth, d.reads.sunset?.call ?? null, order.includes('shoot'))
    return { d, pill, name: d.index === 0 ? 'Today' : day(d.start), cond, hi: temps.length === 0 ? null : Math.max(...temps), lo: temps.length === 0 ? null : Math.min(...temps), worth, surfWords: worth === null ? (surfDay?.words ?? null) : null, surfFact: surfDay?.fact ?? null, weather: weather === '' ? null : weather, call: d.reads.sunset?.call ?? null, guess: d.index >= WEEK_SURE_DAYS }
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
            {/* Batch Polish, Section 4: a day's worth carries its fact ("Drone · 6 kt max"), never the word alone. */}
            <span className="hweek__worth">{r.worth !== null ? <><ActivityIcon activity={r.worth} className="hweek__act" /> {WORTH_WORD[r.worth]}{worthFact(r.worth, r.d, r.surfFact) === null ? '' : ` · ${worthFact(r.worth, r.d, r.surfFact)}`}</> : r.surfWords !== null ? <span className="hweek__range num">{r.surfWords}</span> : r.weather !== null ? <span className="hweek__range num">{r.weather}</span> : '—'}</span>
            {/* Batch Polish, Section 4: the high and the low on one line, "64° · 45°". */}
            <span className="hweek__t">
              {formatTemperature(r.hi, units.temperature).replace(/°[FC]$/, '°')}
              {r.lo === null ? null : <span className="hweek__lo"> · {formatTemperature(r.lo, units.temperature).replace(/°[FC]$/, '°')}</span>}
            </span>
            {/*
              * Batch TRUTH, Section 4: the pill is the row's best activity, the same call the "Best this week" line reads
              * ("Best: Tue fish" over a Tue row that said Skip, 12 Nov); a day with none shows the sunset call, Shoot's alone.
              */}
            {r.pill === null ? null : <span className={`hweek__call hweek__call--${r.pill.tone}`} data-pill={r.pill.word}>{r.pill.word}</span>}
          </li>
        ))}
      </ol>
      <p className="hweek__note">Days 4–7 are guesses: the models drift apart that far out.</p>
    </div>
  )
}

const WORTH_WORD: Record<Activity, string> = { surf: 'Surf', shoot: 'Sunset', drone: 'Drone', fish: 'Calm', weather: 'Dry' }

/** The fact behind a day's worth (Batch Polish, Section 4): the day's strongest wind for the drone and calm water, the surf's range, the call for the light. */
function worthFact(worth: Activity, d: DayBrief, surfFact: string | null): string | null {
  if (worth === 'drone' || worth === 'fish') return d.windMaxKt === null ? null : `${Math.round(d.windMaxKt)} kt max`
  if (worth === 'surf') return surfFact
  if (worth === 'shoot') return d.reads.sunset?.call === 'Go' ? 'sunset Go' : d.reads.sunrise?.call === 'Go' ? 'sunrise Go' : null
  return null
}


/** What a day is worth, in the user's order: Fun or Firing surf (weekSurf: never past day 3), a Go sunset or sunrise, a calm day at 400 ft, wind under 10 kt, dry. */
function worthOf(d: DayBrief, order: readonly Activity[], surfOnDay: boolean): Activity | null {
  for (const a of order) {
    if (a === 'surf' && surfOnDay) return a
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
