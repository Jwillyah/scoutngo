import '../styles/drone.css'
import { AIR_SAFETY } from '../core/safetyWords.ts'
import { useEffect, useRef, useState } from 'react'
import { getPosition, getTimes } from 'suncalc'
import type { AirspaceAtPoint } from '../core/airspaceCard.ts'
import { DRONE_LIGHT_RATIO } from '../core/briefing.ts'
import { gridLegend, heightGrid, type GridHour } from '../core/droneHeight.ts'
import { baseWords, coldMinutes, coldTrim, dayBars, estimatedBaseFt, gustAloft, blowsToward, kpCard, kpTime, limitLine, visibilityWords, windChip, type DayBars, type HourAloft, type KpState } from '../core/droneNow.ts'
import { lensAir, lensSun, sunsetAtHeight } from '../core/dronePlan.ts'
import { droneWindow, type CalmRead } from '../core/droneWindow.ts'
import { metresBetween } from '../core/faaLive.ts'
import { compassPoint } from '../core/field.ts'
import { readFlightCsv } from '../core/flightLog.ts'
import type { LatLon } from '../core/geo.ts'
import { groundOf } from '../core/homeDay.ts'
import { windAtFeet } from '../core/homeCards.ts'
import { formatClock, formatShortClock, formatShortHour, formatSpan } from '../core/timezone.ts'
import { airspaceAtPoint } from '../lib/airspaceAtPoint.ts'
import { forgetFlight, keepFlight, readKeptFlight, type KeptFlight } from '../lib/flightLogStore.ts'
import { fetchKp, kpWord } from '../lib/kp.ts'
import { keptFlightMinutes } from '../lib/preflight/usePreflight.ts'
import { fetchSkyHours, fetchWeatherExtras, hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import { useBriefing, type BriefingDrone } from '../lib/useBriefing.ts'
import { useStationNow } from '../lib/useStationNow.ts'
import { formatTemperature, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { facilityCellAt } from '../lib/uasfm.ts'
import { calmDirection } from '../lib/windNow.ts'
import { DroneAirspace } from './DroneAirspace.tsx'
import { DroneHeightView } from './DroneHeight.tsx'
import { DroneNowView, type DroneCardsData } from './DroneNow.tsx'
import { DronePlanView } from './DronePlan.tsx'
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

export function DronePage({ venue, placeName, timeZone, units, now, drone, tab: startTab = 'now', onBack, onMap, onPreflight, onFly, onSaveSpot }: DronePageProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  const online = typeof navigator === 'undefined' ? true : navigator.onLine
  const station = useStationNow(venue, now, online)
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
  const mps10 = at('wind_speed_10m', now)
  const gust10 = at('wind_gusts_10m', now)
  const mps400 = at('wind_speed_120m', now)
  const fromDeg = calmDirection(mps10, at('wind_direction_10m', now))
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
  const calmMax = calm.kind !== 'calm' || day === null ? null : day.wind.filter((h) => h.at.getTime() + HOUR > calm.span.from.getTime() && h.at.getTime() < calm.span.to.getTime()).reduce<number | null>((a, h) => (h.highMps === null ? a : Math.max(a ?? 0, h.highMps)), null)
  const chip = dayIdx === 0 ? windChip(now, calm, mps10, gust10, calmMax, spanWords, hourWord, speed) : null
  const dayWord = dayIdx === 0 ? 'Today' : 'Tomorrow'

  /* ------------------------------------------------------- the cards */
  const [air, setAir] = useState<AirspaceAtPoint | null>(null)
  const [kp, setKp] = useState<KpState>('loading')
  const [extras, setExtras] = useState<Hourly | null>(null)
  const [skyHours, setSkyHours] = useState<Hourly | null>(null)
  useEffect(() => {
    let live = true
    void airspaceAtPoint(venue, 400).then((a) => live && setAir(a), () => undefined)
    void fetchKp().then(
      (k) => live && setKp(k === null ? (navigator.onLine ? 'missing' : 'offline') : { kp: k.kp, at: kpTime(k.at) }),
      () => live && setKp(navigator.onLine ? 'missing' : 'offline'),
    )
    void fetchWeatherExtras(venue).then((x) => live && setExtras(x), () => undefined)
    void fetchSkyHours(venue).then((x) => live && setSkyHours(x?.value ?? null), () => undefined)
    return () => {
      live = false
    }
  }, [venue.lat, venue.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  const ceilingFt = air?.gridCeilingFeet ?? null
  const cell = facilityCellAt(venue.lat, venue.lon)
  const cls = air === null ? null : (air.classes.find((c) => c !== 'E') ?? (air.classes.includes('E') ? 'E' : null))
  const rated = keptFlightMinutes()
  const tempC = at('temperature_2m', now)
  const dewC = extras === null ? null : hourlyAt(extras, 'dew_point_2m', now)
  const rainPct = at('precipitation_probability', now)
  const lowCover = at('cloud_cover_low', now)
  const vis = visibilityWords(skyHours === null ? null : hourlyAt(skyHours, 'visibility', now))
  const stationAt = station === null || station.at === '' ? null : new Date(station.at)
  const fresh = station !== null && stationAt !== null && now.getTime() - stationAt.getTime() <= 75 * 60_000 ? station : null
  const lowest = fresh === null ? null : ([...fresh.sky.groups].sort((a, b) => a.baseFt - b.baseFt)[0] ?? null)
  const est = estimatedBaseFt(tempC, dewC)
  const skyBig = lowest !== null ? `Base ${baseWords(lowest.baseFt)}` : fresh !== null ? 'No low cloud' : lowCover !== null && lowCover < 10 ? 'Little low cloud' : est !== null ? `Base ~${baseWords(est)}` : 'Base not forecast'
  const skySource = fresh !== null ? fresh.sky.station : lowCover !== null && lowCover < 10 ? `low cloud ${Math.round(lowCover)}%` : est !== null ? 'est. from dew point' : null
  const cards: DroneCardsData = {
    airspace:
      air === null
        ? { big: '…', line: 'reading' }
        : {
            big: cls === null ? (ceilingFt === null ? 'None marked' : `Grid · ${ceilingFt} ft`) : ceilingFt === null ? `Class ${cls}` : `Class ${cls} · ${ceilingFt} ft`,
            line: cell?.icao != null ? `LAANC near ${cell.icao}` : cls !== null ? 'no grid square here' : 'in the app’s data',
          },
    battery: {
      label: tempC === null ? 'Battery' : `Battery · ${temp(tempC)}`,
      big: `~${coldMinutes(rated, tempC)} min`,
      line: coldTrim(tempC) > 0 ? `${rated} min rated · cold trims it` : tempC === null ? `${rated} min rated · no temperature` : `${rated} min rated`,
    },
    sky: { big: skyBig, line: [vis === null ? null : `vis ${vis}`, rainPct === null ? null : `rain ${Math.round(rainPct)}%`, skySource].filter((s) => s !== null).join(' · ') || 'the forecast did not say' },
    kp: kpCard(kp, kpWord, clock),
  }

  /* ------------------------------------------------------------- Now */
  const calmInBars = calm.kind === 'calm' && bars !== null && calm.span.from.getTime() < bars.to.getTime()
  const nowData = {
    speed: mps400 === null ? null : num(mps400),
    unit,
    fromLine: dir === null && gust400 === null ? null : [dir === null ? null : `from ${dir}`, gust400 === null ? null : `gusts ${num(gust400)}`].filter((s) => s !== null).join(' · '),
    /* With a limit and no wind at 400 ft, the limit is said, not "no wind limit" (the contact sheet, 16 Nov). */
    limitLine: limitLine(mps400, gust400, limit, speed) ?? (limit !== null ? `Your limit ${speed(limit)} · the forecast did not give the wind at 400 ft` : drone === null ? 'Add your drone in Settings › My gear for its wind limit' : `${drone.name} has no wind limit in My gear`),
    towardDeg: fromDeg === null ? null : blowsToward(fromDeg),
    chip,
    bars,
    barsLabel: `${dayWord} at 400 ft${limit === null ? '' : ` · your limit ${speed(limit)}`}`,
    marks: bars === null || light === null
      ? []
      : [
          { key: 'start', text: dayIdx === 0 && bars.from.getTime() <= now.getTime() + HOUR ? 'now' : formatShortClock(bars.from, timeZone) },
          ...(calmInBars && calm.kind === 'calm' ? [{ key: 'calm', text: `calmer ${formatSpan(formatShortClock(calm.span.from, timeZone), formatShortClock(calm.span.to, timeZone))}`, tone: 'calm' as const }] : []),
          ...(bars.sunsetAt === null ? [] : [{ key: 'sunset', text: `sunset ${formatShortClock(light.sunset, timeZone)}` }]),
          ...(bars.duskAt === null ? [] : [{ key: 'dusk', text: `twilight ${formatShortClock(light.dusk, timeZone)}`, tone: 'dusk' as const }]),
        ],
    barsNone: wx === null ? (brief.status === 'loading' ? 'Reading the forecast…' : 'The forecast did not arrive.') : 'The forecast does not reach the next daylight.',
  }

  /* ------------------------------------------------------- By height */
  const gridHours = bars === null ? [] : hours.filter((h) => h.at.getTime() >= bars.from.getTime() && h.at.getTime() < bars.to.getTime()).slice(0, 8)
  const grid = gridHours.length === 0 ? null : heightGrid(gridHours, limit, ceilingFt, light?.sunset ?? null)
  const headline =
    calm.kind === 'calm'
      ? `Best window ${dayIdx === 1 ? 'tomorrow ' : ''}${spanWords(calm.span.from, calm.span.to)}`
      : calm.kind === 'windy'
        ? `Over ${speed(calm.overMps)} at 400 ft ${calm.allDay ? 'all day' : 'the rest of the day'}`
        : calm.kind === 'no-rating'
          ? 'No wind limit to hold the hours against'
          : calm.kind === 'dark'
            ? 'Sun down'
            : 'Wind at 400 ft not forecast'
  const heightData = {
    headline,
    sub: mps400 === null ? 'The forecast did not give the wind at 400 ft now.' : `Now: ${dir === null ? '' : `${dir} `}${speed(mps400)} at 400 ft${gust400 === null ? '' : `, gusts ${num(gust400)}`}${limit === null ? '' : ` (limit ${num(limit)})`}.`,
    grid,
    label: `Wind by height · ${unit}${dir === null ? '' : ` · from ${dir}`}`,
    ceilingLabel: ceilingFt === null || ceilingFt >= 400 ? null : `LAANC ${ceilingFt} ft`,
    hourLabels: gridHours.map((h, i) => (i === 0 && dayIdx === 0 && h.at.getTime() <= now.getTime() ? 'now' : formatShortHour(h.at, timeZone))),
    value: (mps: number | null) => (mps === null ? '—' : num(mps)),
    legend: gridLegend(limit, DRONE_LIGHT_RATIO, toUnit),
    none: nowData.barsNone,
  }

  /* ------------------------------------------------------------ Plan */
  const nextSunset = brief.days.map((d) => d.events.sunset).find((s): s is Date => s !== null && s.getTime() > now.getTime()) ?? null
  const alt = (t: Date) => getPosition(t, venue.lat, venue.lon).altitude
  const s400 = nextSunset === null ? null : sunsetAtHeight(nextSunset, 400, alt)
  const later = s400 === null || nextSunset === null ? 0 : Math.round((s400.getTime() - nextSunset.getTime()) / 60_000)
  const low = lensSun(now, (t) => getPosition(t, venue.lat, venue.lon))
  const la = tempC === null || dewC === null ? null : lensAir(tempC, dewC, 400, rainPct)
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
    sunAtHeight:
      s400 === null || nextSunset === null
        ? { big: 'No sunset', line: 'No sunset in the days the forecast covers.' }
        : { big: `Sets ${clock(s400)}`, line: later < 1 ? `Under a minute after the beach (${clock(nextSunset)}).` : `${later} min after the beach (${clock(nextSunset)}): one more pass of light up high.` },
    lens:
      low === null
        ? { big: 'No low sun', line: 'The sun is not low in the next day.' }
        : {
            big: `Flare ${low.fromDeg}–${low.toDeg}°`,
            line: low.part === 'evening' ? `Facing ${compassPoint(low.midDeg)} from ${clock(low.from)} to sunset puts the low sun in frame.` : `Facing ${compassPoint(low.midDeg)} from sunrise to ${clock(low.to)} puts the low sun in frame.`,
          },
    lensAir:
      la === null || tempC === null || dewC === null
        ? { big: 'Not forecast', line: 'The forecast did not give the dew point.' }
        : {
            big: la.icing ? 'Icing possible' : la.fog === 'likely' ? 'Lens may fog' : la.fog === 'possible' ? 'Fog possible' : 'Lens fog unlikely',
            line: `Dew point ${temp(dewC)} vs ${temp(tempC)} · ${temp(la.aloftC)} at 400 ft`,
          },
    lastFlight:
      keptHere === null
        ? null
        : {
            big: `${flightAt === null ? '' : `${new Intl.DateTimeFormat('en-US', { timeZone, month: 'short', day: 'numeric' }).format(flightAt)} · `}${Math.round(keptHere.summary.durationS / 60)} min · max ${heightWords(keptHere.summary.maxHeightFt)}`,
            line: `${keptHere.summary.windMps === null ? 'This log has no wind column.' : `Wind it felt: ${speed(keptHere.summary.windMps)}`}${forecastThen === null ? (keptHere.summary.windMps === null ? '' : ' · our forecast for that hour is not on this phone') : ` · we forecast ${speed(forecastThen)}`}.`,
          },
    lastFlightNone:
      kept === null
        ? 'Import a flight log CSV (an Airdata or PhantomHelp export) to see it here. DJI’s own .txt logs are encrypted, so export a CSV. The file is read on this phone and never sent.'
        : 'Your kept flight was somewhere else, more than 3 km from here.',
    lastFlightError: logError,
    onImport: (file: File) => {
      void file.text().then((text) => {
        const read = readFlightCsv(text)
        if (!read.ok) {
          setLogError(read.why)
          return
        }
        const k: KeptFlight = { summary: read.summary, place: read.summary.takeoff ?? venue, name: file.name }
        keepFlight(k)
        setKept(k)
        setLogError(read.summary.takeoff !== null && metresBetween(read.summary.takeoff, venue) > 3000 ? 'That flight took off more than 3 km from here; it shows when this spot is near it.' : null)
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
  const toAirspace = () => go('airspace')

  return (
    <PageShell
      safety={AIR_SAFETY}
      kind="drpage"
      title="Drone"
      sub={`${placeName}${drone === null ? '' : ` · ${drone.name}`} · now`}
      ground={ground}
      onBack={onBack}
      onMap={onMap}
      how={
        <>
          <p>The wind at 400 ft is the forecast's at 120 m; the ground's at 10 m; 100 to 300 ft between them, on a log of the height. Its direction is the 10 m wind's. Gusts are forecast at 10 m only: the gust's excess over the steady wind there is added to the wind at 400 ft.</p>
          <p>Colour: teal under {Math.round(DRONE_LIGHT_RATIO * 100)}% of your drone's limit (the home's "Light wind"), amber up to it, orange at or past it. The calm window is the first run of daylight hours under that line, the same one the home's drone line says. Today's bars run from civil dawn to civil dusk (the sun 6° down).</p>
          <p>Battery: your pack's rated minutes (Preflight), less {Math.round((0.4 / 30) * 1000) / 10}% for every °C under 20 °C, at most 40%: a rule of thumb for cold lithium cells, not a measurement of your battery.</p>
          <p>Sky: the nearest station's lowest cloud when its report is under 75 minutes old; otherwise estimated from the dew point (125 m per °C of spread), and only where the models have low cloud. GPS: NOAA's planetary K index; 5 and over is a geomagnetic storm, which degrades GPS.</p>
          <p>Airspace: the class airspace, the FAA facility map grid, restricted and prohibited areas and national parks are in the app. TFRs, national security UAS restrictions, FRIAs, heliports and warning, alert and military operations areas are fetched from the FAA whole, for the country, with no place in the request, and kept on this phone with their date. State and city park rules are not in any FAA data, so they are not shown. This is not an authorization, and the app never issues LAANC.</p>
          <p>Turn back by: out and straight back at the cruise on the card, in the wind at 400 ft, landing with the reserve on the card; climb, hover and descent are not counted. Sun at 400 ft: the horizon dips by √(2h/R) from up there, so the sun sets when it is that much lower. Sun in the lens: the bearings within 20° of the sun while it is under 25°. Lens fog: the dew point within 2.5 °C of the air. Birds: no free forecast the app can check, so no card.</p>
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
          <DroneNowView data={nowData} cards={cards} onAirspace={toAirspace} />
        </section>
        <section className="drp__page drp__page--height" aria-label="By height" data-drone-page="height">
          <DroneHeightView data={heightData} cards={cards} onAirspace={toAirspace} />
        </section>
        <section className="drp__page drp__page--airspace" aria-label="Airspace" data-drone-page="airspace">
          {airSeen ? <DroneAirspace venue={venue} timeZone={timeZone} now={now} online={online} todayIso={isoDay(now, timeZone)} windWords={mps400 === null ? null : `Wind ${speed(mps400)}${dir === null ? '' : ` from ${dir}`} at 400 ft`} gustWords={gust400 === null ? null : `Gusts ${speed(gust400)} at 400 ft`} sunsetWords={nextSunset === null ? null : clock(nextSunset)} onSaveSpot={onSaveSpot} /> : null}
        </section>
        <section className="drp__page drp__page--plan" aria-label="Plan" data-drone-page="plan">
          <DronePlanView data={planData} />
        </section>
      </div>
      {tab === 'airspace' ? null : (
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
      )}
    </PageShell>
  )
}
