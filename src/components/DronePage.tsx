import '../styles/drone.css'
import { AIR_FOOT } from '../core/safetyWords.ts'
import { useEffect, useRef, useState } from 'react'
import { getPosition, getTimes } from 'suncalc'
import type { AirspaceAtPoint } from '../core/airspaceCard.ts'
import { DRONE_LIGHT_RATIO } from '../core/briefing.ts'
import { airspaceRead } from '../core/droneAirRead.ts'
import { gridLegend, heightGrid, heightHeadline, heightSub, type GridHour } from '../core/droneHeight.ts'
import { coldMinutes, coldTrim, dayBars, gustAloft, blowsToward, kpRow, kpTime, limitChip, skyRow, visibilityWords, type DayBars, type HourAloft, type KpState } from '../core/droneNow.ts'
import { lensAir, lensFog, lensSun, lensSunWords, sunAtHeightWords, sunsetAtHeight } from '../core/dronePlan.ts'
import { droneWindow, type CalmRead } from '../core/droneWindow.ts'
import { metresBetween } from '../core/faaLive.ts'
import { compassPoint } from '../core/field.ts'
import { readFlightCsv } from '../core/flightLog.ts'
import type { LatLon } from '../core/geo.ts'
import { groundOf } from '../core/homeDay.ts'
import { windAtFeet } from '../core/homeCards.ts'
import { shortPlace } from '../core/spotName.ts'
import { formatClock, formatDayTime, formatShortClock, formatShortHour, formatSpan } from '../core/timezone.ts'
import { coordinateLabel } from '../core/venueName.ts'
import { airspaceAtPoint } from '../lib/airspaceAtPoint.ts'
import { forgetFlight, keepFlight, readKeptFlight, type KeptFlight } from '../lib/flightLogStore.ts'
import { fetchKp, kpWord, readKeptKp } from '../lib/kp.ts'
import { keptFlightMinutes } from '../lib/preflight/usePreflight.ts'
import { fetchSkyHours, fetchWeatherExtras, hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import { useBriefing, type BriefingDrone } from '../lib/useBriefing.ts'
import { useStationNow } from '../lib/useStationNow.ts'
import { formatTemperature, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { facilityCellAt } from '../lib/uasfm.ts'
import { calmDirection, windAt } from '../lib/windNow.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import { DroneAirspace } from './DroneAirspace.tsx'
import { DroneHeightView } from './DroneHeight.tsx'
import { DroneNowView, type DroneRow } from './DroneNow.tsx'
import { DronePlanView } from './DronePlan.tsx'
import { useWaterTemp } from '../lib/waterTemp.ts'
import { PageShell } from './PageShell.tsx'

/*
 * THE DRONE PAGE (Batch Flow, Section 5; Batch DRONE, Section 2: boards
 * Drone_P1 to P4 and Drone_Layers). Four pages, swiped, with the Sky page's
 * pill (one-style.css .ui-seg) over them:
 *
 *   Now        the wind at 400 ft, its direction and gusts against the
 *              drone's limit; the calm window; today's hours at 400 ft in
 *              daylight and civil twilight; Airspace · Battery · Sky · GPS
 *   By height  the wind at the ground to 400 ft by the hour, the LAANC
 *              ceiling, sunset; the headline is the calm window
 *   Airspace   the FAA's layers on a map and what is over the marker
 *   Plan       turn back by, sun at 400 ft, sun in the lens, lens and ice,
 *              your last flight here
 *
 * Opens on Now; the Airspace card (and a caller with `tab`) opens Airspace.
 * Every number is the code's (src/core/droneNow.ts, droneHeight.ts,
 * dronePlan.ts, faaLive.ts); never "safe", never "clear".
 */
export type DroneTab = 'now' | 'height' | 'airspace' | 'plan'
const DRONE_TABS: readonly { id: DroneTab; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'height', label: 'By height' },
  { id: 'airspace', label: 'Airspace' },
  { id: 'plan', label: 'Plan' },
]

interface DronePageProps {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  now: Date
  drone: BriefingDrone | null
  /** The tab it opens on: Now unless a caller asks for another. */
  tab?: DroneTab
  onBack: () => void
  onMap: () => void
  onPreflight: () => void
  onFly: () => void
  onSaveSpot?: (at: LatLon, name: string) => void
}

const HOUR = 3_600_000
const isoDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

/** The forecast's hours at 400 ft and the ground, from the briefing's own series. */
function hoursFrom(wx: Hourly | null): (HourAloft & GridHour)[] {
  if (wx === null) return []
  return wx.times.map((t, i) => ({ at: new Date(t), mps: wx.values.wind_speed_120m?.[i] ?? null, mps10: wx.values.wind_speed_10m?.[i] ?? null, mps120: wx.values.wind_speed_120m?.[i] ?? null }))
}

export function DronePage({ venue: spot, placeName, timeZone, units, now, drone, tab: startTab = 'now', onBack, onMap, onPreflight, onFly, onSaveSpot }: DronePageProps) {
  /*
   * ONE POINT FOR THE WHOLE PAGE (Batch FIX, Section 6.1). The Airspace tab's
   * marker IS the page's point: a tap or a search moves it, and the header,
   * the wind, the cards and the sheet all follow. The spot comes back with ◎.
   * `venue` below is that point, never the spot behind it.
   */
  const spotKey = `${spot.lat},${spot.lon}`
  /* A moved point is kept with the spot it was moved from: a new spot starts the page there again. */
  const [moved, setMoved] = useState<{ spotKey: string; at: LatLon; name: string | null } | null>(null)
  const point = moved !== null && moved.spotKey === spotKey ? moved : { at: spot, name: null }
  const setPoint = (p: { at: LatLon; name: string | null }) => setMoved({ spotKey, ...p })
  const venue = point.at
  const atSpot = venue.lat === spot.lat && venue.lon === spot.lon
  const pointName = point.name ?? (atSpot ? placeName : coordinateLabel(venue.lat.toFixed(4), venue.lon.toFixed(4)))
  const brief = useBriefing(venue, timeZone, now, true)
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  const station = useStationNow(venue, now, online)
  const near = useStationObs(venue)
  /* Batch FIX, Section 4: the measured water, for the lens fog row (src/core/waterTemp.ts). */
  const water = useWaterTemp(venue)
  const clock = (d: Date) => formatClock(d, timeZone)
  const hourWord = (d: Date) => clock(d).replace(/:00 /, ' ')
  const spanWords = (from: Date, to: Date) => formatSpan(hourWord(from), hourWord(to))
  const unit = windUnitLabel(units.wind)
  const toUnit = (mps: number) => windIn(mps, units.wind) ?? 0
  const num = (mps: number) => `${Math.round(toUnit(mps))}`
  const speed = (mps: number) => `${num(mps)} ${unit}`
  const wx = brief.wx
  const at = (name: string, t: Date) => (wx === null ? null : hourlyAt(wx, name, t))
  const temp = (c: number | null) => formatTemperature(c, units.temperature)

  /* ------------------------------------------------ the wind now */
  /* Batch FIX, Section 1: the ground's wind now is the one wind now (src/lib/windNow.ts), leaned to the one station every screen reads (src/lib/useStationObs.ts); 400 ft is the forecast's 120 m. */
  const wind10 = windAt(wx, now, near)
  const mps10 = wind10?.mps ?? null
  const gust10 = wind10?.gustMps ?? null
  const mps400 = at('wind_speed_120m', now)
  const fromDeg = calmDirection(mps10, wind10?.fromDeg ?? null)
  const gust400 = gustAloft(mps10, gust10, mps400)
  const limit = drone?.maxWindMps ?? null
  const dir = fromDeg === null ? null : compassPoint(fromDeg)

  /* ---------------------------- today's light, or tomorrow's after dusk */
  const hours = hoursFrom(wx)
  const lightOf = (dayStart: Date) => {
    const t = getTimes(new Date(dayStart.getTime() + 12 * HOUR), venue.lat, venue.lon)
    /* Polar day or night: suncalc has no dawn or dusk, and there are no bars rather than wrong ones. */
    return t.dawn === null || t.sunset === null || t.dusk === null ? null : { dawn: t.dawn, sunset: t.sunset, dusk: t.dusk }
  }
  const today = brief.days[0] ?? null
  const tomorrow = brief.days[1] ?? null
  const barsFor = (day: typeof today, from: Date): DayBars | null => {
    if (day === null) return null
    const l = lightOf(day.start)
    return l === null ? null : dayBars(hours, from, l.dawn, l.sunset, l.dusk, limit)
  }
  const todayBars = barsFor(today, now)
  const dayIdx = todayBars === null && tomorrow !== null ? 1 : 0
  const bars = dayIdx === 0 ? todayBars : barsFor(tomorrow, tomorrow?.start ?? now)
  const day = dayIdx === 0 ? today : tomorrow
  const light = day === null ? null : lightOf(day.start)
  /* The calm window: the home's own (src/core/droneWindow.ts), so the two never disagree. */
  const calm: CalmRead = day === null ? { kind: 'unknown' } : droneWindow(day.wind, limit, day.start, venue.lat, venue.lon, dayIdx === 0 ? now : day.start).calm
  const sunsetToday = dayIdx === 0 ? (light?.sunset ?? null) : null
  /* ONE chip (Batch FIX, Section 6.2): teal under the limit, orange only for limit or gust trouble. */
  const chip = limitChip(now, hours, mps400, gust400, limit, sunsetToday, clock, speed)
  const dayWord = dayIdx === 0 ? 'Today' : 'Tomorrow'

  /* ------------------------------------------------------- the cards */
  /* The point's airspace, looked up ONCE here and read by every tab (src/core/droneAirRead.ts). */
  const [air, setAir] = useState<{ key: string; here: AirspaceAtPoint } | null>(null)
  const airKey = `${venue.lat},${venue.lon}`
  const [kp, setKp] = useState<KpState>(() => {
    const k = readKeptKp()
    return k === null ? 'loading' : { kp: k.kp, at: kpTime(k.at), kept: true }
  })
  const [extras, setExtras] = useState<Hourly | null>(null)
  const [skyHours, setSkyHours] = useState<Hourly | null>(null)
  useEffect(() => {
    let live = true
    void fetchKp().then(
      (k) => live && setKp(k === null ? (navigator.onLine ? 'missing' : 'offline') : { kp: k.kp, at: kpTime(k.at), kept: k.kept }),
      () => live && setKp(navigator.onLine ? 'missing' : 'offline'),
    )
    void fetchWeatherExtras(venue).then((x) => live && setExtras(x), () => undefined)
    void fetchSkyHours(venue).then((x) => live && setSkyHours(x?.value ?? null), () => undefined)
    return () => {
      live = false
    }
  }, [venue.lat, venue.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true
    void airspaceAtPoint(venue, 400).then((here) => live && setAir({ key: airKey, here }), () => undefined)
    return () => {
      live = false
    }
  }, [airKey]) // eslint-disable-line react-hooks/exhaustive-deps
  const here = air !== null && air.key === airKey ? air.here : null
  const read = here === null ? null : airspaceRead(here, facilityCellAt(venue.lat, venue.lon))
  const ceilingFt = read?.ceilingFt ?? null
  const rated = keptFlightMinutes()
  const tempC = at('temperature_2m', now)
  const dewC = extras === null ? null : hourlyAt(extras, 'dew_point_2m', now)
  const rainPct = at('precipitation_probability', now)
  const vis = visibilityWords(skyHours === null ? null : hourlyAt(skyHours, 'visibility', now))
  const stationAt = station === null || station.at === '' ? null : new Date(station.at)
  const fresh = station !== null && stationAt !== null && now.getTime() - stationAt.getTime() <= 75 * 60_000 ? station : null
  const lowest = fresh === null ? null : ([...fresh.sky.groups].sort((a, b) => a.baseFt - b.baseFt)[0] ?? null)
  const sky = skyRow(lowest?.baseFt ?? null, fresh?.sky.station ?? null, at('cloud_cover', now), vis, rainPct)
  /* NOAA's time tag: the clock today, the day and clock before. */
  const kpWhen = (d: Date) => (isoDay(d, timeZone) === isoDay(now, timeZone) ? clock(d) : formatDayTime(d, timeZone))
  const gps = kpRow(kp, kpWord, kpWhen)
  /* The four rows (Batch FIX, Section 6.2): one line each; Airspace reads the page's one airspace read. */
  const rows: DroneRow[] = [
    { key: 'airspace', label: 'Airspace', big: read === null ? 'Reading…' : read.row.big, small: read?.row.small ?? null, tone: read?.controlled === true ? 'drone' : undefined, onTap: () => go('airspace') },
    { key: 'battery', label: 'Battery', big: `~${coldMinutes(rated, tempC)} min`, small: tempC === null ? `${rated} min rated · no temperature` : `${temp(tempC)}${coldTrim(tempC) > 0 ? ' cold' : ''}` },
    { key: 'sky', label: 'Sky', big: sky.big, small: sky.small },
    ...(gps === null ? [] : [{ key: 'gps', label: 'GPS', big: gps.big, small: gps.small }]),
  ]

  /* ------------------------------------------------------------- Now */
  const calmInBars = calm.kind === 'calm' && bars !== null && calm.span.from.getTime() > bars.from.getTime() && calm.span.from.getTime() < bars.to.getTime()
  const nowData = {
    speed: mps400 === null ? null : num(mps400),
    unit,
    fromLine: [dir === null ? null : `from ${dir}`, gust400 === null ? null : `gusts ${num(gust400)}`, mps400 === null ? null : 'at 400 ft'].filter((s) => s !== null).join(' · ') || null,
    towardDeg: fromDeg === null ? null : blowsToward(fromDeg),
    chip,
    /* With no chip, why: no limit, or no wind at 400 ft (the contact sheet, 16 Nov). */
    note: chip !== null ? null : limit !== null ? `Your limit ${speed(limit)} · the forecast did not give the wind at 400 ft` : drone === null ? 'Add your drone in Settings › My gear for its wind limit' : `${drone.name} has no wind limit in My gear`,
    bars,
    barsLabel: `${dayWord} at 400 ft`,
    marks: bars === null || light === null
      ? []
      : [
          { key: 'start', text: dayIdx === 0 && bars.from.getTime() <= now.getTime() + HOUR ? 'now' : formatShortClock(bars.from, timeZone) },
          ...(calmInBars && calm.kind === 'calm' ? [{ key: 'calm', text: `calmer ${formatSpan(formatShortClock(calm.span.from, timeZone), formatShortClock(calm.span.to, timeZone))}`, tone: 'calm' as const }] : []),
          ...(bars.sunsetAt === null ? [] : [{ key: 'sunset', text: `sunset ${formatShortClock(light.sunset, timeZone)}` }]),
        ],
    barsNone: wx === null ? (brief.status === 'loading' ? 'Reading the forecast…' : 'The forecast did not arrive.') : 'The forecast does not reach the next daylight.',
  }

  /* ------------------------------------------------------- By height */
  const gridHours = bars === null ? [] : hours.filter((h) => h.at.getTime() >= bars.from.getTime() && h.at.getTime() < bars.to.getTime()).slice(0, 8)
  const grid = gridHours.length === 0 ? null : heightGrid(gridHours, limit, ceilingFt, light?.sunset ?? null)
  const sunrise = day === null ? null : getTimes(new Date(day.start.getTime() + 12 * HOUR), venue.lat, venue.lon).sunrise
  const heightData = {
    headline: heightHeadline(calm, bars?.from ?? null, light?.sunset ?? null, dayIdx === 1 || sunrise === null || now.getTime() <= sunrise.getTime() + 2 * HOUR, dayIdx === 1, spanWords, speed),
    sub: heightSub(grid, limit, dir, toUnit, unit),
    grid,
    label: `${unit} by height`,
    ceilingLabel: ceilingFt === null || ceilingFt >= 400 ? null : `your ceiling ${ceilingFt} ft`,
    hourLabels: gridHours.map((h, i) => (i === 0 && dayIdx === 0 && h.at.getTime() <= now.getTime() ? 'now' : formatShortHour(h.at, timeZone))),
    value: (mps: number | null) => (mps === null ? '—' : num(mps)),
    legend: gridLegend(limit, DRONE_LIGHT_RATIO, toUnit),
    none: nowData.barsNone,
  }

  /* ------------------------------------------------------------ Plan */
  const nextSunset = brief.days.map((d) => d.events.sunset).find((s): s is Date => s !== null && s.getTime() > now.getTime()) ?? null
  const alt = (t: Date) => getPosition(t, venue.lat, venue.lon).altitude
  const s400 = nextSunset === null ? null : sunsetAtHeight(nextSunset, 400, alt)
  const low = lensSun(now, (t) => getPosition(t, venue.lat, venue.lon))
  const la = tempC === null || dewC === null ? null : lensAir(tempC, dewC, 400, rainPct)
  const fog = tempC === null || dewC === null ? null : lensFog(tempC, dewC)
  const [kept, setKept] = useState<KeptFlight | null>(() => readKeptFlight())
  const [logError, setLogError] = useState<string | null>(null)
  const keptHere = kept !== null && metresBetween(kept.place, venue) <= 3000 ? kept : null
  const flightAt = keptHere?.summary.at ?? null
  const forecastThen = flightAt === null || keptHere === null ? null : windAtFeet(at('wind_speed_10m', flightAt), at('wind_speed_120m', flightAt), Math.min(400, keptHere.summary.maxHeightFt))
  const heightWords = (ft: number) => (units.distance === 'm' ? `${Math.round(ft * 0.3048)} m` : `${Math.round(ft)} ft`)
  const planData = {
    wind: mps400 === null || fromDeg === null ? null : { fromDeg, mps: mps400 },
    ratedMin: rated,
    tempC,
    tempWords: tempC === null ? null : temp(tempC),
    speed,
    distanceUnit: units.distance,
    sunAtHeight: sunAtHeightWords(s400, nextSunset, clock),
    lens: lensSunWords(low, compassPoint, clock),
    /* Batch FIX, Section 6.8: "Possible" or "Low" (src/core/dronePlan.ts lensFog); ice at 400 ft over both. */
    lensFog:
      fog === null || tempC === null || dewC === null
        ? { big: 'Not forecast', small: 'no dew point', notice: false }
        : la?.icing === true
          ? { big: 'Icing possible', small: `${temp(la.aloftC)} at 400 ft`, notice: true }
          : { big: fog.word, small: `dew ${temp(dewC)} / ${temp(tempC)}${water.status === 'ok' ? ` · water ${temp(water.reading.c)}` : ''}`, notice: fog.word === 'Possible' },
    lastFlight:
      keptHere === null
        ? null
        : {
            big: `${flightAt === null ? '' : `${new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(flightAt)} · `}${Math.round(keptHere.summary.durationS / 60)} min · max ${heightWords(keptHere.summary.maxHeightFt)}`,
            small: `${keptHere.summary.windMps === null ? 'no wind in the log' : `felt ${speed(keptHere.summary.windMps)}`}${forecastThen === null ? '' : ` · forecast ${speed(forecastThen)}`}`,
          },
    lastFlightNone: kept !== null && keptHere === null ? 'Your kept flight was more than 3 km from here.' : null,
    lastFlightError: logError,
    onImport: (file: File) => {
      void file.text().then((text) => {
        const log = readFlightCsv(text)
        if (!log.ok) {
          setLogError(log.why)
          return
        }
        const k: KeptFlight = { summary: log.summary, place: log.summary.takeoff ?? venue, name: file.name }
        keepFlight(k)
        setKept(k)
        setLogError(log.summary.takeoff !== null && metresBetween(log.summary.takeoff, venue) > 3000 ? 'That flight took off more than 3 km from here; it shows when this spot is near it.' : null)
      })
    },
    onForget: () => {
      forgetFlight()
      setKept(null)
      setLogError(null)
    },
  }

  /* ------------------------------------------------- the four pages */
  const [tab, setTab] = useState<DroneTab>(startTab)
  const [airSeen, setAirSeen] = useState(startTab === 'airspace')
  const track = useRef<HTMLDivElement>(null)
  const index = (t: DroneTab) => DRONE_TABS.findIndex((x) => x.id === t)
  const go = (t: DroneTab) => {
    setTab(t)
    if (t === 'airspace') setAirSeen(true)
    const el = track.current
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    if (el !== null) el.scrollTo({ left: index(t) * el.clientWidth, behavior: still ? 'auto' : 'smooth' })
  }
  useEffect(() => {
    const el = track.current
    if (el === null) return
    el.scrollLeft = index(startTab) * el.clientWidth
    const onScroll = () => {
      const t = DRONE_TABS[Math.round(el.scrollLeft / Math.max(1, el.clientWidth))]?.id
      if (t === undefined) return
      setTab(t)
      if (t === 'airspace') setAirSeen(true)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ground = groundOf(alt(now), at('weather_code', now), false)

  return (
    <PageShell
      /* Batch FIX, Section 6.6: one footer per page; on Airspace the sheet's own line is the one disclaimer. */
      footNote={tab === 'airspace' ? null : AIR_FOOT}
      kind="drpage"
      title="Drone"
      sub={`${pointName}${drone === null ? '' : ` · ${drone.name}`} · now`}
      ground={ground}
      onBack={onBack}
      onMap={onMap}
      how={
        <>
          <p>The wind at 400 ft is the forecast's at 120 m; the ground's at 10 m; 100 to 300 ft between them, on a log of the height. Its direction is the 10 m wind's. Gusts are forecast at 10 m only: the gust's excess over the steady wind there is added to the wind at 400 ft.</p>
          <p>Colour: teal under {Math.round(DRONE_LIGHT_RATIO * 100)}% of your drone's limit (the home's "Light wind"), amber up to it, orange at or past it. The calm window is the first run of daylight hours under that line, the same one the home's drone line says. Today's bars run from civil dawn to civil dusk (the sun 6° down).</p>
          <p>Battery: your pack's rated minutes (Preflight), less {Math.round((0.4 / 30) * 1000) / 10}% for every °C under 20 °C, at most 40%: a rule of thumb for cold lithium cells, not a measurement of your battery.</p>
          <p>Sky: the nearest station's lowest cloud when its report is under 75 minutes old; otherwise the forecast's total cloud, and visibility. GPS: NOAA's planetary K index and the time NOAA gave it; 5 and over is a geomagnetic storm, which degrades GPS. When NOAA does not answer, the last value this phone received, with its time; no row when it never has.</p>
          <p>Airspace: the class airspace, the FAA facility map grid, restricted and prohibited areas and national parks are in the app. TFRs, national security UAS restrictions, FRIAs, heliports and warning, alert and military operations areas are fetched from the FAA whole, for the country, with no place in the request, and kept on this phone with their date. State and city park rules are not in any FAA data, so they are not shown. This is not an authorization, and the app never issues LAANC.</p>
          <p>Turn back by: out and straight back at the cruise on the card, in the wind at 400 ft, landing with the reserve on the card; climb, hover and descent are not counted. Sun at 400 ft: the horizon dips by √(2h/R) from up there, so the sun sets when it is that much lower. Sun in the lens: the bearings within 20° of the sun while it is under 25°. Lens fog: "Possible" when the air is within 5 °F of its dew point, or 15 °F or more colder than a warm car (taken as 70 °F: the car is not measured); "Low" otherwise. Last flight: a flight log CSV (an Airdata or PhantomHelp export; DJI’s own .txt logs are encrypted), read on this phone and never sent. Birds: no free forecast the app can check, so no row.</p>
        </>
      }
    >
      <div className="ui-seg drp__seg" role="tablist" aria-label="Now, by height, airspace or plan">
        {DRONE_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ui-seg__opt${tab === t.id ? ' ui-seg__opt--on' : ''}`} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {/* Swipe pages by design (Now · By height · Airspace · Plan, with the pill that names them), as the home's days. */}
      <div className="drp__track" ref={track} data-sideways>
        <section className="drp__page drp__page--now" aria-label="Now" data-drone-page="now">
          <DroneNowView data={nowData} rows={rows} />
        </section>
        <section className="drp__page drp__page--height" aria-label="By height" data-drone-page="height">
          <DroneHeightView data={heightData} />
        </section>
        <section className="drp__page drp__page--airspace" aria-label="Airspace" data-drone-page="airspace">
          {airSeen ? <DroneAirspace spot={spot} marker={venue} here={here} read={read} onMarker={(at, name) => setPoint({ at, name: name === null ? null : shortPlace(name) })} timeZone={timeZone} now={now} online={online} todayIso={isoDay(now, timeZone)} windWords={mps400 === null ? null : `Wind ${speed(mps400)}${dir === null ? '' : ` from ${dir}`} at 400 ft`} gustWords={gust400 === null ? null : `Gusts ${speed(gust400)} at 400 ft`} sunsetWords={nextSunset === null ? null : clock(nextSunset)} onSaveSpot={onSaveSpot} /> : null}
        </section>
        <section className="drp__page drp__page--plan" aria-label="Plan" data-drone-page="plan">
          <DronePlanView data={planData} />
        </section>
      </div>
      {/* The buttons on Now and Plan (boards Drone_Slim_1 and 4); By height and Airspace have none. */}
      {tab === 'now' || tab === 'plan' ? (
        <div className="drp__foot">
          <div className="drp__buttons">
            <button type="button" className="btn btn--primary drp__btn" onClick={onPreflight}>
              Preflight check
            </button>
            <button type="button" className="btn drp__btn" onClick={onFly}>
              Plan the flight
            </button>
          </div>
        </div>
      ) : null}
    </PageShell>
  )
}
