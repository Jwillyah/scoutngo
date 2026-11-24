import '../styles/home-tiles.css'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getPosition, getTimes } from 'suncalc'
import { droneTag, kt, surfOn, windTag } from '../core/briefing.ts'
import { sideWords, skyStripLit } from '../core/homeDay.ts'
import { firstFun, tideAt } from '../core/homeCards.ts'
import { cleanMoment, fogMoment, pickMoment, rainMoment, skyMoment, swellMoment, tileOrder, type Moment, type TileKind } from '../core/homeTiles.ts'
import { cloudBandWords, rainStripShown, RAIN_SHOW_PCT, skyPhrase, slotLabel, stripFrom, weatherStrip, type StripSlot } from '../core/homeWeather.ts'
import { localDate, moonTimesOnLocalDay } from '../core/moonTimes.ts'
import { moonHomeMoment } from '../core/moonMoment.ts'
import { colorWords } from '../core/homeDay.ts'
import { EVENT_LINGER_MS } from '../core/skyCall.ts'
import { cloudRange, freshSky, skyCondition } from '../core/skyWord.ts'
import { formatClock, formatShortClock, formatShortHour } from '../core/timezone.ts'
import { compassPoint } from '../core/field.ts'
import { wetsuitWords } from '../core/waterTemp.ts'
import type { Intensity } from '../core/rainNow.ts'
import { useGoAlert, useRainMoonAlerts } from '../lib/goAlert.ts'
import { agoWords, useHomeParts, type Shown } from '../lib/homeSnapshot.ts'
import { daylightAt, stretchWords, surfWindow, windowHour } from '../lib/surfTapIn.ts'
import { useOnline } from '../lib/useOnline.ts'
import { useSkyCalls } from '../lib/useSkyCalls.ts'
import { stationNowAnswered } from '../lib/useStationNow.ts'
import { useMarineAlerts } from '../lib/coastData.ts'
import { PERSONA_PILL, type Persona } from '../lib/persona.ts'
import { shareSkyWordNow } from '../lib/skyWordNow.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { formatTemperature, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { useBriefing, type BriefingDrone } from '../lib/useBriefing.ts'
import { useFogRain } from '../lib/useFogRain.ts'
import { useLiveSky } from '../lib/useLiveSky.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import { useStormPlay } from '../lib/useStormPlay.ts'
import { callOf, surfDayHours, surfLine, useSurfNow } from '../lib/useSurfNow.ts'
import { useWaterTemp } from '../lib/waterTemp.ts'
import { droneWindAt, gustWords, windAt, windWords } from '../lib/windNow.ts'
import { BarsPic, FishPic, MomentIcon, SkyPic, TidePic, WindPic, type Tick } from './HomePics.tsx'
import { groundOf } from '../core/homeDay.ts'
import { LiveSkyDraw } from './LiveSky.tsx'
import { SkyIconSvg } from './SkyIconSvg.tsx'

/*
 * THE HOME (Batch SIMPLE-2, Section 2; boards Home_P_Surf, Home_P_Shoot,
 * Home_P_Fish; Batch SIMPLE-3, Section 2, mockup Home_Visual). What, when,
 * where, for someone who has never opened the app:
 *
 *   header   the spot ⌄ (opens the spot search) · the persona pill
 *   moment   one gold card with its small picture, ONLY when something is
 *            worth it (src/core/homeTiles.ts pickMoment); otherwise nothing
 *   weather  the temperature, one short phrase (or the fog, or the rain's
 *            two hours in 15-minute bars), high and low; the next 48 hours
 *            as a strip that scrolls sideways, 6 on show; a tap on the tile
 *            or an hour opens the Weather page at that hour
 *   tiles    2 × 3 in the persona's order: label, value, one line, a live
 *            mini picture (src/components/HomePics.tsx), ›. Each opens one
 *            page.
 *   dock     Map and ☰, nothing else
 *
 * Every value is an existing computation (the briefing, the one surf call,
 * the one wind now and at 400 ft, the one sky call, the station's tide
 * table, the moon's moments, the fog and rain nowcasts); a dash where the
 * forecast did not say. It never scrolls up and down: the tiles share what
 * height is left (src/styles/home-tiles.css), and the home-fit audit holds
 * it at 390 × 844, 390 × 664 and 412 × 915, tab and standalone.
 */
export type TileTarget = 'weather' | 'sky-night' | TileKind

interface TileHomeProps {
  venue: { lat: number; lon: number }
  placeName: string
  timeZone: string
  units: Units
  drone: BriefingDrone | null
  now: Date
  persona: Persona | null
  onClose: () => void
  onOpenMap: () => void
  onMenu: () => void
  onSwitchSpot?: () => void
  onPersona: () => void
  /** `at`: the hour the Weather page opens on (a tap on an hour of the strip); absent, now. */
  onOpen: (target: TileTarget, at?: number) => void
}

const HOUR = 3_600_000

/* ------------------------------------------------------------- the parts */

/*
 * Batch SIMPLE-3, Section 0.1: each part of the home is plain data, built from
 * the live inputs, then shown through the one snapshot per spot
 * (src/lib/homeSnapshot.ts useHomeParts): a part is drawn once its own inputs
 * have all answered, else what was last shown for the spot, else a skeleton.
 * The moment card is worked out from the SHOWN parts, so it can never say
 * something the tiles under it do not. Times are ms, so a part keeps on the
 * phone as it was.
 */
interface Seg {
  text: string
  shared?: { key: string; value?: string }
}
interface TileData {
  value: Seg | null
  tag: string | null
  line: Seg[] | null
}
interface SkyPart {
  kind: 'sunrise' | 'sunset'
  event: number
  call: 'Go' | 'Maybe' | 'Skip' | null
  from: number | null
  to: number | null
  lookDeg: number
  dayIndex: number
  /** "overcast now · clears 4p" (src/core/homeWeather.ts cloudBandWords). */
  band?: string | null
}
interface SurfPart extends TileData {
  bars: { v: number | null; on: boolean; at?: number }[]
  /** The one surf window (src/lib/surfTapIn.ts surfWindow), and the call's words for its first hour. */
  window: { from: number; to: number; words: string; size: string | null } | null
  fun: number | 'now' | null
  coast: boolean
  /** The beach read when the spot is not on one: its distance goes in the pill, so the line never wraps (Section 2.3). */
  far?: string | null
}
interface TidePart {
  turns: { at: number; feet: number; kind: 'high' | 'low' }[]
}
interface WindPart extends TileData {
  steps: { fromDeg: number | null; calm: boolean; at: number; mps?: number | null }[] | null
}
interface DronePart extends TileData {
  bars: { v: number | null; on: boolean; at?: number }[]
  limit: number | null
}
interface FishPart {
  /** Batch SIMPLE-3, Section 7.1: no computed fishing window exists yet; never an all-day one. */
  run: { from: number; to: number } | null
  /** Every hour left today at 10 kt or more, by the Wind tile's own wind (windAt, station-leaned); null when not said. */
  windy?: boolean | null
  noWind: boolean
  /** The moon's next rise or set within the day bar. */
  moon?: { kind: 'rise' | 'set'; at: number } | null
}
interface WeatherPart {
  tempC: number | null
  cond: string | null
  hiC: number | null
  loC: number | null
  /** Batch SIMPLE-3, Section 2.5: the next 48 hours (src/core/homeWeather.ts weatherStrip). */
  strip?: StripSlot[] | null
  /** Batch SIMPLE-3, Section 1.2: the fog's one line, and what the moment card needs of it. */
  fog?: { line: string; high: boolean; windows: { from: number; to: number; level: string }[] } | null
  /** Batch SIMPLE-3, Section 1b: the rain now (src/lib/useFogRain.ts), its line and its two hours of bars when it is now or due. */
  rain?: { state: string; startsAt: number | null; intensity: Intensity | null; line: string | null; strip: boolean; bars: { from: number; mm: number | null }[] } | null
}

/** A sky call still worth showing: its colour is not over (src/core/skyCall.ts colourOver). */
const skyLive = (p: SkyPart | null, now: number) => p === null || Math.max(p.event + EVENT_LINGER_MS, p.to ?? 0) > now
/** A tide table with a turn still to come. */
const tideLive = (p: TidePart, now: number) => p.turns.some((x) => x.at > now)

export function TileHome({ venue, placeName, timeZone, units, drone, now, persona, onClose, onOpenMap, onMenu, onSwitchSpot, onPersona, onOpen }: TileHomeProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  /* Batch SIMPLE-3, Section 0.2: the one sky call object (src/lib/useSkyCalls.ts), Sky Tonight's and the color page's too; the Go alert reads it. */
  const calls = useSkyCalls(brief, venue, now, timeZone)
  const call = calls.now
  useGoAlert(call, now, timeZone)
  const obs = useStationObs(venue)
  const surf = useSurfNow(venue, now, timeZone, units.distance === 'ft', placeName, obs, 'daily')
  const online = useOnline()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /* The NWS alerts at the spot, and the marine zone's at a beach: said as the NWS names them, one line, only when there is one. */
  const play = useStormPlay(venue, timeZone, units, true)
  const marine = useMarineAlerts(brief.facing !== null ? venue : null)
  const alertWords = [...new Set([...(play.now?.alerts ?? []).map((a) => a.event), ...(marine ?? []).map((a) => a.event)])].slice(0, 2).join(' · ')
  /* Batch SIMPLE-3, Sections 1 and 1b: the fog and the rain here, from the one hook (the storm play's radar scan, the briefing's facing: nothing asked twice). */
  const fr = useFogRain(venue, now, timeZone, { radar: play.now?.radar ?? null, ...(brief.settled.facing ? { facing: brief.facing } : {}) })
  /* Batch SIMPLE-3, Sections 1b.3 and 2b.2: the rain and Supermoon alerts, under the Go alert's switch (src/lib/goAlert.ts). */
  useRainMoonAlerts(fr.rain, moonHomeMoment(now, venue.lat, venue.lon, timeZone), now, timeZone)

  const wx = brief.wx
  const at = (n: string, t: Date) => (wx === null ? null : hourlyAt(wx, n, t))
  const sunUp = (t: Date) => getPosition(t, venue.lat, venue.lon).altitude > -0.8
  const cover = { low: at('cloud_cover_low', now), mid: at('cloud_cover_mid', now), high: at('cloud_cover_high', now) }
  const cond = skyCondition({ code: at('weather_code', now), layers: cover, day: sunUp(now), station: freshSky(obs, now) })
  const fast = cloudRange([-2, -1, 0, 1, 2].map((h) => at('cloud_cover', new Date(now.getTime() + h * HOUR))), at('wind_speed_500hPa', now))
  /* Batch CORE, Section 4.1: the word for now, the one the map's strip says too. */
  useEffect(() => {
    shareSkyWordNow(venue, fast !== null ? 'Coming and going' : (cond?.word ?? null))
  }, [venue, fast?.lo, fast?.hi, cond?.word]) // eslint-disable-line react-hooks/exhaustive-deps
  const live = useLiveSky('home', venue, now, at('weather_code', now), cover, cond?.word ?? null)
  const ground = play.inPlay || live === null ? groundOf(getPosition(now, venue.lat, venue.lon).altitude, at('weather_code', now), play.inPlay) : live.ground

  const day = brief.days[0] ?? null
  const wind = windAt(wx, now, obs)
  const short = (d: Date) => formatShortClock(d, timeZone)

  /* ----------------------------------------------------- the live parts */
  const daylight = daylightAt(surf.spot ?? venue)
  const surfWin = surfWindow(surf.series, now, daylight)
  const winHour = surfWin === null ? null : windowHour(surf.series, surfWin, now)
  const surfCall = surf.week[0]?.call ?? null
  const surfTag = surfCall === null ? null : (surfCall.quality ?? surfCall.size)
  const surfPart: SurfPart = {
    value: surfCall === null ? null : { text: surfCall.words, shared: { key: 'surf' } },
    tag: surfTag,
    line: [{ text: (surf.away !== null ? `at ${shortBeach(surf.away.name)}` : surfLine(surf.sea, surf.now, now)) ?? '' }].filter((x) => x.text !== ''),
    far: surf.away?.far ?? null,
    bars: surf.series.filter((h) => h.at.getTime() + HOUR / 2 > now.getTime()).slice(0, 12).map((h) => ({ v: h.centerFt, on: surfOn(h.tag), at: h.at.getTime() })),
    window: surfWin === null ? null : { from: surfWin.from.getTime(), to: surfWin.to.getTime(), words: stretchWords(surfWin, now, timeZone), size: callOf(winHour, 0)?.words ?? null },
    fun: (() => {
      const f = firstFun(surfDayHours(surf.series, timeZone).map((h) => ({ at: h.at, ft: h.centerFt, fun: surfOn(h.tag) })), now)
      return f === null || f === 'now' ? f : f.getTime()
    })(),
    coast: brief.facing !== null && surf.away === null,
  }
  /* The sky tile's cloud band: the cover now and the first change by the event. */
  const band = call === null ? null : cloudBandWords(at('cloud_cover', now), Array.from({ length: Math.max(0, Math.min(18, Math.ceil((call.event.getTime() - now.getTime()) / HOUR))) }, (_, k) => {
    const t = new Date(Math.floor(now.getTime() / HOUR) * HOUR + (k + 1) * HOUR)
    return { at: t, pct: at('cloud_cover', new Date(t.getTime() + HOUR / 2)) }
  }), timeZone)
  const skyPart: SkyPart | null = call === null ? null : { kind: call.kind, event: call.event.getTime(), call: call.call, from: call.from?.getTime() ?? null, to: call.to?.getTime() ?? null, lookDeg: call.lookDeg, dayIndex: call.dayIndex, band }
  const tidePart: TidePart = { turns: brief.turns.filter((x) => x.at.getTime() > now.getTime() - 14 * HOUR).slice(0, 12).map((x) => ({ at: x.at.getTime(), feet: x.feet, kind: x.kind })) }
  const said = windWords(wind, units.wind)
  const side = wind?.fromDeg == null ? null : windTag(wind.fromDeg, brief.facing)
  const windPart: WindPart = {
    value: said === null ? null : { text: said, shared: { key: 'wind' } },
    tag: null,
    line: [{ text: [gustWords(wind, units.wind), side === null ? null : sideWords(side)].filter((x) => x !== null).join(' · ') }].filter((x) => x.text !== ''),
    /* Home_Visual: now and every 2 h, each with its speed. The same windAt, leaned to the station, as the words. */
    steps: wx === null ? null : [0, 2, 4, 6, 8].map((h) => {
      const w = h === 0 ? wind : windAt(wx, new Date(now.getTime() + h * HOUR), obs, now)
      return { fromDeg: w?.fromDeg ?? null, calm: w !== null && w.fromDeg === null, at: now.getTime() + h * HOUR, mps: w?.mps ?? null }
    }),
  }
  /* Drone: the one wind at 400 ft (Batch SIMPLE-3, Section 1c, src/lib/windNow.ts droneWindAt), now and by the hour, against the kit's rated wind. */
  const aloft = droneWindAt(wx, now, obs, now)
  const high = aloft?.mps ?? null
  const dTag = drone === null || high === null ? null : droneTag(high, drone.maxWindMps)
  const dSpeed = high === null ? null : `${Math.round(windIn(high, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`
  const dronePart: DronePart = {
    value: dTag !== null ? { text: dTag } : dSpeed === null ? null : { text: dSpeed },
    tag: null,
    line: dSpeed === null ? null : [{ text: `${dSpeed} at 400 ft${drone?.maxWindMps == null ? '' : ` · limit ${Math.round(windIn(drone.maxWindMps, units.wind) ?? 0)}`}` }],
    bars: wx === null ? [] : Array.from({ length: 12 }, (_, k) => {
      const t = k === 0 ? now : new Date(Math.floor(now.getTime() / HOUR) * HOUR + k * HOUR)
      const m = k === 0 ? high : (droneWindAt(wx, t, obs, now)?.mps ?? null)
      return { v: m === null ? null : (windIn(m, units.wind) ?? null), on: k === 0, at: t.getTime() }
    }),
    limit: drone?.maxWindMps == null ? null : windIn(drone.maxWindMps, units.wind),
  }
  /* Fish (Section 7.1): no all-day windows. "None today" only when every hour left today is 10 kt or more by the Wind tile's own wind. */
  const endOfDay = (() => {
    const d = localDate(now, timeZone)
    const left = Array.from({ length: 24 }, (_, k) => new Date(Math.floor(now.getTime() / HOUR) * HOUR + k * HOUR)).filter((t) => localDate(t, timeZone) === d)
    return left
  })()
  const windsLeft = wx === null ? [] : endOfDay.map((t, k) => (k === 0 ? wind : windAt(wx, new Date(t.getTime() + HOUR / 2), obs, now))).filter((w) => w !== null)
  const moonNext = (() => {
    const both = [moonTimesOnLocalDay(now, venue.lat, venue.lon, timeZone), moonTimesOnLocalDay(new Date(now.getTime() + 86_400_000), venue.lat, venue.lon, timeZone)]
    const evs = both.flatMap((m) => [...(m.rise === null ? [] : [{ kind: 'rise' as const, at: m.rise.getTime() }]), ...(m.set === null ? [] : [{ kind: 'set' as const, at: m.set.getTime() }])])
    return evs.filter((e) => e.at > now.getTime() && e.at <= now.getTime() + 12 * HOUR).sort((a, b) => a.at - b.at)[0] ?? null
  })()
  const fishPart: FishPart = { run: null, windy: windsLeft.length === 0 ? null : windsLeft.every((w) => (kt(w.mps) ?? 0) >= 10), noWind: wx === null, moon: moonNext }
  const temps = day === null ? [] : Array.from({ length: 24 }, (_, i) => at('temperature_2m', new Date(day.start.getTime() + i * HOUR + HOUR / 2))).filter((x): x is number => x !== null)
  const fog = fr.fog
  const rain = fr.rain
  const weatherPart: WeatherPart = {
    tempC: at('temperature_2m', now),
    cond: skyPhrase(cond?.word ?? null, fast),
    hiC: temps.length === 0 ? null : Math.max(...temps),
    loC: temps.length === 0 ? null : Math.min(...temps),
    strip:
      wx === null
        ? null
        : weatherStrip({
            now,
            timeZone,
            lat: venue.lat,
            lon: venue.lon,
            hour: (t, first) => {
              const c = skyCondition({ code: at('weather_code', t), layers: { low: at('cloud_cover_low', t), mid: at('cloud_cover_mid', t), high: at('cloud_cover_high', t) }, day: sunUp(t), station: first ? freshSky(obs, now) : null })
              return { icon: c?.icon ?? null, tC: at('temperature_2m', t), rainPct: at('precipitation_probability', t) }
            },
          }),
    fog: fog === null || fog.line === null ? null : { line: fog.line, high: fog.now.level === 'high', windows: fog.windows.map((w) => ({ from: w.from.getTime(), to: w.to.getTime(), level: w.level })) },
    rain:
      rain === null
        ? null
        : { state: rain.state, startsAt: rain.startsAt?.getTime() ?? null, intensity: rain.intensity, line: fr.rainLine, strip: rainStripShown(rain, now), bars: rain.bars.map((b) => ({ from: b.from.getTime(), mm: b.mm })) },
  }
  const st = brief.settled
  const skySettled = st.sky && stationNowAnswered(venue, now, online)
  const shown = useHomeParts(
    `${venue.lat.toFixed(3)},${venue.lon.toFixed(3)}`,
    {
      weather: { live: weatherPart, settled: st.sea && fr.settled },
      sky: { live: skyPart, settled: skySettled, valid: skyLive },
      surf: { live: surfPart, settled: surf.settled && st.facing },
      tide: { live: tidePart, settled: st.tide, valid: tideLive },
      wind: { live: windPart, settled: st.sea && st.facing },
      fish: { live: fishPart, settled: st.sea },
      drone: { live: dronePart, settled: st.sea },
    },
    now,
  )

  /* ----------------------------------------------------- the moment, from what is shown */
  const sky = shown.sky === null || !skyLive(shown.sky.data, now.getTime()) ? null : shown.sky.data
  const tideShown = shown.tide?.data ?? null
  const nextTurn = tideShown === null ? null : (tideShown.turns.find((x) => x.at > now.getTime()) ?? null)
  const surfShown = shown.surf?.data ?? null
  const wShown = shown.weather?.data ?? null
  const moment = useMemo<Moment | null>(() => {
    const coast = surfShown?.coast === true
    const w = surfShown?.window ?? null
    const clean = coast && w !== null ? cleanMoment({ from: new Date(w.from), to: new Date(w.to), words: w.words, size: w.size }, now, timeZone) : null
    const fun = surfShown?.fun ?? null
    const swell = coast ? swellMoment(fun === null || fun === 'now' ? fun : new Date(fun), null, now, timeZone) : null
    /* Batch SIMPLE-3, Section 2b: the moon's one moment (Supermoon, Big moonrise, Moonset at sunrise; src/core/moonMoment.ts). */
    const moon = moonHomeMoment(now, venue.lat, venue.lon, timeZone)
    const skyM = sky === null ? null : skyMoment({ kind: sky.kind, event: new Date(sky.event), call: sky.call, from: sky.from === null ? null : new Date(sky.from), to: sky.to === null ? null : new Date(sky.to), lookDeg: sky.lookDeg }, now, timeZone)
    const r = wShown?.rain ?? null
    const rainM = r == null ? null : rainMoment({ state: r.state, startsAt: r.startsAt === null ? null : new Date(r.startsAt), intensity: r.intensity }, now, timeZone)
    const f = wShown?.fog ?? null
    const fogM = f == null ? null : fogMoment({ line: f.line, now: { level: f.high ? 'high' : null }, windows: f.windows.map((x) => ({ from: new Date(x.from), to: new Date(x.to), level: x.level })) }, now)
    /* Section 7.1: no fish moment until a real computed window exists (the calm-water run said "7 AM–9 PM"). */
    return pickMoment([skyM, clean, swell, moon, rainM, fogM], persona, now)
  }, [sky, surfShown, wShown, now, timeZone, venue, persona]) // eslint-disable-line react-hooks/exhaustive-deps

  const order = tileOrder(persona)

  return (
    <div className={`home homep home--${ground}`} role="dialog" aria-label="Home" data-persona={persona ?? 'none'}>
      {live === null || play.inPlay ? null : <LiveSkyDraw sky={live} />}
      <header className="homep__head">
        <button type="button" className="homep__spot home__spot" onClick={onSwitchSpot} disabled={onSwitchSpot === undefined} aria-label={`${placeName}: find a spot`}>
          <span className="homep__spotname home__spotname" data-spot-name>
            {placeName}
          </span>
          <svg className="homep__chev" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 4.5L6 8l3.5-3.5" />
          </svg>
        </button>
        <button type="button" className="homep__pill" data-persona-pill onClick={onPersona} aria-label={persona === null ? 'What do you do outside? Pick one' : `${PERSONA_PILL[persona]}: change`}>
          {persona === null ? 'Pick yours' : PERSONA_PILL[persona]}
        </button>
      </header>
      {alertWords === '' ? null : (
        <p className="homep__alert" role="status">
          {alertWords}
        </p>
      )}
      <main className="homep__body">
        {moment === null ? null : (
          <button type="button" className="hmoment" data-moment={moment.kind} onClick={() => onOpen(moment.target)}>
            <MomentIcon kind={moment.kind} />
            <span className="hmoment__words">
              <span className="hmoment__eyebrow">{moment.eyebrow}</span>
              <span className="hmoment__line">{moment.line}</span>
            </span>
            <Chev />
          </button>
        )}
        <WeatherTile shown={shown.weather} now={now} timeZone={timeZone} units={units} onOpen={(t) => onOpen('weather', t ?? undefined)} />
        <div className="htiles" data-tiles={order.join(' ')}>
          {order.map((k) => (
            <Tile key={k} kind={k} onOpen={() => onOpen(k)} {...tileOf(k)} />
          ))}
        </div>
      </main>
      <nav className="homep__dock" aria-label="Map and menu">
        <button type="button" className="hdock__map hbtn--round" onClick={onOpenMap} aria-label="Open the map">
          Map
        </button>
        <button type="button" className="hdock__menu hbtn--round" onClick={onMenu} aria-label="Menu">
          <svg className="hdock__glyph" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </nav>
    </div>
  )

  /* ----------------------------------------------------- each tile, from what is shown */
  function aged(p: Shown<unknown> | null): Seg[] | null {
    return p !== null && p.aged ? [{ text: agoWords(now.getTime() - p.at) }] : null
  }
  function hourWord(ms: number): string {
    return formatShortHour(new Date(ms), timeZone)
  }
  function tileOf(k: TileKind): TileBody {
    const clock = (d: Date) => formatClock(d, timeZone)
    if (k === 'surf') {
      const p = shown.surf
      if (p === null) return { label: 'Surf', value: null, line: null, pic: null, skeleton: true }
      const bars = p.data.bars
      const s0 = bars[0]?.at ?? Math.floor(now.getTime() / HOUR) * HOUR
      const span = Math.max(1, bars.length) * HOUR
      const share = (t: number) => (t - s0) / span
      const w = p.data.window
      const win = w === null || w.to <= s0 || w.from >= s0 + span ? null : { from: share(Math.max(w.from, now.getTime())), to: share(w.to), text: `clean → ${hourWord(w.to)}` }
      const tag = [p.data.tag, p.data.far ?? null].filter((x) => x !== null).join(' · ')
      return {
        label: 'Surf',
        tag: tag === '' ? null : tag,
        value: p.data.value,
        line: aged(p) ?? p.data.line,
        pic: bars.length === 0 ? null : <BarsPic values={bars} floor={3} tone="surf" window={win} ticks={[{ x: 0, text: 'now', tone: 'now' }, { x: 1, text: hourWord(s0 + span - HOUR) }]} />,
      }
    }
    if (k === 'tide') {
      const p = shown.tide
      if (p === null) return { label: 'Tide', value: null, line: null, pic: null, skeleton: true }
      const turns = p.data.turns.map((x) => ({ at: new Date(x.at), feet: x.feet, kind: x.kind }))
      const next = turns.find((x) => x.at.getTime() > now.getTime()) ?? null
      const after = next === null ? null : (turns.find((x) => x.at.getTime() > next.at.getTime()) ?? null)
      const from = now.getTime() - 2 * HOUR
      const to = now.getTime() + 10 * HOUR
      const x = (t: number) => (t - from) / (to - from)
      const curve = Array.from({ length: 49 }, (_, i) => from + i * 15 * 60_000).flatMap((t) => {
        const feet = tideAt(turns, new Date(t))
        return feet === null ? [] : [{ x: x(t), feet }]
      })
      const feetNow = tideAt(turns, now)
      const inSpan = turns.filter((t) => t.at.getTime() > from && t.at.getTime() < to)
      return {
        label: 'Tide',
        value: next === null ? null : { text: `${next.kind === 'high' ? 'High' : 'Low'} ${short(next.at)}`, shared: { key: 'tide', value: `${next.kind} ${clock(next.at)}`.toLowerCase() } },
        line: aged(p) ?? (next === null ? null : [{ text: `then ${next.kind === 'high' ? 'falling' : 'rising'}${after === null ? '' : ` · ${after.kind} ${short(after.at)}`}` }]),
        pic: curve.length < 2 ? null : <TidePic curve={curve} now={feetNow === null ? null : { x: x(now.getTime()), feet: feetNow }} turns={inSpan.map((t) => ({ x: x(t.at.getTime()), feet: t.feet, text: short(t.at) }))} />,
      }
    }
    if (k === 'wind') {
      const p = shown.wind
      if (p === null) return { label: 'Wind', value: null, line: null, pic: null, skeleton: true }
      const steps = p.data.steps
      return {
        label: 'Wind',
        value: p.data.value,
        line: aged(p) ?? p.data.line,
        pic:
          steps === null ? null : (
            <WindPic
              steps={steps.map((s, i) => ({
                key: s.at,
                toDeg: s.fromDeg === null ? null : (s.fromDeg + 180) % 360,
                calm: s.calm,
                speed: s.mps == null ? null : String(Math.round(windIn(s.mps, units.wind) ?? 0)),
                at: i === 0 ? 'now' : hourWord(s.at),
              }))}
            />
          ),
      }
    }
    if (k === 'sky') {
      const p = shown.sky
      if (p === null) return { label: 'Sky', value: null, line: null, pic: null, skeleton: true }
      const c = sky
      const word = colorWords(c?.call ?? null)
      const ev = c === null ? null : new Date(c.event)
      return {
        label: 'Sky',
        value: word === null ? null : { text: word.replace(/^color /, '').replace(/^./, (x) => x.toUpperCase()), shared: { key: 'skycall', value: word } },
        line:
          aged(p) ??
          (ev === null || c === null
            ? null
            : [{ text: `${c.kind} ${short(ev)}`, ...(c.kind === 'sunset' && c.dayIndex === 0 ? { shared: { key: 'sunset', value: `sunset ${clock(ev)}`.toLowerCase() } } : {}) }, { text: ` · look ${compassPoint(c.lookDeg)}` }]),
        pic: ev === null || c === null ? null : skyPic(c, ev),
      }
    }
    if (k === 'fish') {
      const p = shown.fish
      if (p === null) return { label: 'Fish', value: null, line: null, pic: null, skeleton: true }
      const turn = nextTurn === null ? null : { kind: nextTurn.kind, at: new Date(nextTurn.at) }
      const moon = p.data.moon ?? null
      const windy = p.data.windy === true
      const span = 12 * HOUR
      const x = (t: number) => (t - now.getTime()) / span
      const turnsIn = (tideShown?.turns ?? []).filter((t) => t.at > now.getTime() && t.at <= now.getTime() + span)
      const moonWords = moon === null ? null : `moon${moon.kind} ${short(new Date(moon.at))}`
      return {
        label: 'Fish',
        /* Section 7.1: the next tide turn (and the moon) until a real computed window exists; "None today" by the Wind tile's own wind. */
        value: windy ? { text: 'None today' } : turn === null ? null : { text: `${turn.kind === 'high' ? 'High' : 'Low'} ${short(turn.at)}` },
        line: aged(p) ?? (windy ? [{ text: 'wind 10 kt+' }] : [{ text: turn === null ? '' : 'tide turn' }, ...(moonWords === null ? [] : [{ text: `${turn === null ? '' : ' · '}${moonWords}` }])].filter((s) => s.text !== '')),
        pic:
          p.data.noWind && turn === null ? null : (
            <FishPic
              run={null}
              marks={[...turnsIn.map((t) => ({ x: x(t.at), kind: 'tide' as const })), ...(moon === null ? [] : [{ x: x(moon.at), kind: 'moon' as const }])]}
              ticks={[{ x: 0, text: 'now', tone: 'now' }, ...turnsIn.slice(0, 1).map((t): Tick => ({ x: x(t.at), text: short(new Date(t.at)), tone: 'tide' })), { x: 1, text: hourWord(now.getTime() + span) }]}
            />
          ),
      }
    }
    if (k === 'water') return { label: 'Water', water: { at: venue, unit: units.temperature }, value: null, line: null, pic: null }
    const p = shown.drone
    if (p === null) return { label: 'Drone', value: null, line: null, pic: null, skeleton: true }
    const bars = p.data.bars
    const lim = p.data.limit
    return {
      label: 'Drone',
      value: p.data.value,
      line: aged(p) ?? p.data.line,
      pic: bars.length === 0 ? null : <BarsPic values={bars} floor={15} tone="drone" limit={lim} limitText={lim === null ? null : `limit ${Math.round(lim)}`} ticks={[{ x: 0, text: 'now', tone: 'now' }, { x: 1, text: bars[bars.length - 1]?.at === undefined ? '' : hourWord(bars[bars.length - 1].at as number) }]} />,
    }
  }

  /** Home_Visual's sky: the day's arc of the call's event, the sun now on it while it is up, the event's end marked, the cloud band over it. */
  function skyPic(c: SkyPart, ev: Date): ReactNode {
    const t = getTimes(new Date(ev.getTime() + (c.kind === 'sunrise' ? 6 : -6) * HOUR), venue.lat, venue.lon)
    const rise = t.sunrise instanceof Date && !Number.isNaN(t.sunrise.getTime()) ? t.sunrise.getTime() : null
    const set = t.sunset instanceof Date && !Number.isNaN(t.sunset.getTime()) ? t.sunset.getTime() : null
    const nowShare = rise === null || set === null || now.getTime() < rise || now.getTime() > set ? null : (now.getTime() - rise) / (set - rise)
    return <SkyPic nowShare={nowShare} nowText="now" eventShare={c.kind === 'sunset' ? 1 : 0} eventText={short(ev)} lit={skyStripLit(c.call)} band={c.band ?? null} />
  }
}

/** The beach's name short enough for one line: its first words up to 16 letters ("Virginia Beach", not "Virginia Beach Oceanfront"). */
function shortBeach(name: string): string {
  const words = name.split(/[\s,]+/).filter((w) => w !== '')
  let out = ''
  for (const w of words) {
    const next = out === '' ? w : `${out} ${w}`
    if (next.length > 16 && out !== '') break
    out = next
  }
  return out
}

/* ------------------------------------------------------------- pieces */

interface TileBody {
  label: string
  tag?: string | null
  /** Null: a dash (the part has answered and there is no value), or the skeleton while it has not. */
  value: Seg | null
  line: Seg[] | null
  pic: ReactNode
  /** Batch SIMPLE-3, Section 0.5: nothing settled or kept for this part yet: a light skeleton, never "…" or a dash. */
  skeleton?: boolean
  /** The Water tile reads the water temperature itself (one reading, src/lib/waterTemp.ts). */
  water?: { at: { lat: number; lon: number }; unit: 'F' | 'C' }
}

function Chev() {
  return (
    <span className="htile__chev" aria-hidden="true">
      ›
    </span>
  )
}

/** Words, with the one-number audit's marks where a word is a value other screens say too (scripts/audit-one-number.mjs). */
function SegText({ seg }: { seg: Seg }) {
  return seg.shared === undefined ? <>{seg.text}</> : <span data-shared={seg.shared.key} {...(seg.shared.value === undefined ? {} : { 'data-value': seg.shared.value })}>{seg.text}</span>
}

/** Batch SIMPLE-3, Section 0.5: a value on its way, drawn as a light bar (src/styles/home-tiles.css .hskel). */
function Skel({ wide = false }: { wide?: boolean }) {
  return <span className={`hskel${wide ? ' hskel--wide' : ''}`} aria-hidden="true" />
}

function Tile({ kind, label, tag = null, value, line, pic, water, skeleton = false, onOpen }: TileBody & { kind: TileKind; onOpen: () => void }) {
  return (
    <button type="button" className={`htile htile--${kind}`} data-tile={kind} data-loading={skeleton ? '' : undefined} onClick={onOpen} aria-label={skeleton ? `${label}: on its way` : undefined}>
      <span className="htile__head">
        <span className="htile__label">{label}</span>
        {tag === null ? null : <span className="htile__tag">{tag}</span>}
        <Chev />
      </span>
      {water !== undefined ? (
        <WaterReadout at={water.at} unit={water.unit} />
      ) : skeleton ? (
        <>
          <span className="htile__value">
            <Skel />
          </span>
          <span className="htile__line">
            <Skel wide />
          </span>
          <span className="htile__pic" />
        </>
      ) : (
        <>
          <span className="htile__value">{value === null ? '—' : <SegText seg={value} />}</span>
          {line === null || line.length === 0 ? null : (
            <span className="htile__line">
              {line.map((x, i) => (
                <SegText key={i} seg={x} />
              ))}
            </span>
          )}
          <span className="htile__pic">{pic}</span>
        </>
      )}
    </button>
  )
}

function WaterReadout({ at, unit }: { at: { lat: number; lon: number }; unit: 'F' | 'C' }) {
  const s = useWaterTemp(at)
  const c = s.status === 'ok' ? s.reading.c : null
  const suit = c === null ? null : wetsuitWords(c)
  return (
    <>
      <span className="htile__value" data-water={s.status}>
        {s.status === 'loading' ? <Skel /> : c === null ? '—' : formatTemperature(c, unit).replace(/°[FC]$/, '°')}
      </span>
      <span className="htile__line">{s.status === 'none' ? 'no water temp here' : suit === null ? (s.status === 'loading' ? <Skel wide /> : null) : `${suit} typical`}</span>
      <span className="htile__pic">{c === null ? null : <Gauge c={c} />}</span>
    </>
  )
}

/** Where the water sits between 40 °F and 80 °F: the reading, drawn, never a trend we do not have. */
function Gauge({ c }: { c: number }) {
  const f = c * 1.8 + 32
  const x = Math.max(4, Math.min(156, ((f - 40) / 40) * 152 + 4))
  return (
    <svg className="hpic hpic--gauge" viewBox="0 0 160 24" preserveAspectRatio="none" aria-hidden="true">
      <line x1="4" x2="156" y1="12" y2="12" className="hpic__track" />
      <circle cx={x} cy="12" r="5" className="hpic__dotwater" />
    </svg>
  )
}

/* ------------------------------------------------------------- weather */

/** The rain's next two hours, 15 minutes a bar (src/core/rainNow.ts rainBars); a dry quarter a stub, an unsaid one nothing. */
function RainBars({ bars }: { bars: readonly { from: number; mm: number | null }[] }) {
  const top = Math.max(0.5, ...bars.map((b) => b.mm ?? 0))
  const w = 64 / Math.max(1, bars.length)
  return (
    <svg className="hwtile__rainbars" viewBox="0 0 64 16" preserveAspectRatio="none" aria-hidden="true" data-rain-bars={bars.length}>
      {bars.map((b, i) =>
        b.mm === null ? null : <rect key={b.from} x={i * w + 0.75} y={16 - Math.max(1.5, (b.mm / top) * 16)} width={Math.max(1, w - 1.5)} height={Math.max(1.5, (b.mm / top) * 16)} rx="1" className={b.mm > 0 ? 'hwtile__rainbar hwtile__rainbar--wet' : 'hwtile__rainbar'} />,
      )}
    </svg>
  )
}

/** A sunrise or sunset's slot in the strip: the sun on the horizon, an arrow up or down. */
function SunSlotIcon({ rising }: { rising: boolean }) {
  return (
    <svg className="hwtile__icon hwtile__icon--sun" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 17a6 6 0 0 1 12 0" />
      <path d="M3 17h18" />
      <path d={rising ? 'M12 4v6M9.5 6.5L12 4l2.5 2.5' : 'M12 4v6M9.5 7.5L12 10l2.5-2.5'} />
    </svg>
  )
}

function WeatherTile({ shown, now, timeZone, units, onOpen }: { shown: Shown<WeatherPart> | null; now: Date; timeZone: string; units: Units; onOpen: (at: number | null) => void }) {
  const deg = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const w = shown?.data ?? null
  const t = w?.tempC ?? null
  /* The hours from this one on; a kept answer's hours that have passed are not drawn (src/core/homeWeather.ts stripFrom). */
  const slots = stripFrom(w?.strip ?? [], now)
  const rainy = slots.some((s) => s.rainPct !== null)
  const rain = w?.rain ?? null
  const showRain = rain != null && rain.strip && rain.line !== null && !shown?.aged
  const words = w?.fog?.line ?? w?.cond ?? '—'
  /* Section 2.5: the strip starts at Now each time the home is drawn; a scroll to its end drops the edge's fade and ›. */
  const scroller = useRef<HTMLDivElement | null>(null)
  const [atEnd, setAtEnd] = useState(false)
  const firstHour = slots.find((s) => s.kind === 'hour')?.at ?? null
  const label = (ms: number) => formatClock(new Date(ms), timeZone).replace(/:00 /, ' ')
  /* Opening the page puts the strip back at Now under it, so Back finds it at Now (a home drawn again starts there anyway). */
  const open = (at: number | null) => {
    onOpen(at)
    if (scroller.current !== null) scroller.current.scrollLeft = 0
    setAtEnd(false)
  }
  return (
    <div className="hwtile" data-tile="weather" data-loading={shown === null ? '' : undefined} onClick={() => open(null)}>
      <button type="button" className="hwtile__main" onClick={(e) => (e.stopPropagation(), open(null))} aria-label={`Weather: ${t === null ? (shown === null ? 'on its way' : 'no temperature') : deg(t)}${w?.cond == null ? '' : `, ${words}`}`}>
        <span className="htile__label">Weather</span>
        <span className="hwtile__temp num" data-shared="temp" data-value={t === null ? '' : deg(t)}>
          {shown === null ? <Skel /> : t === null ? '—' : deg(t)}
        </span>
      </button>
      <div className="hwtile__strip" data-end={atEnd ? '' : undefined}>
        <div
          ref={scroller}
          className="hwtile__hours"
          role="group"
          aria-label="The next 48 hours: scroll sideways, tap an hour to open the Weather page at it"
          data-hour-strip=""
          data-strip-slots={slots.length}
          data-rain-row={rainy ? '' : undefined}
          onScroll={(e) => {
            const el = e.currentTarget
            setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2)
          }}
        >
          {slots.map((s) => {
            const first = s.kind === 'hour' && s.at === firstHour && s.at === Math.floor(now.getTime() / HOUR) * HOUR
            const top = slotLabel(s, first, timeZone)
            const named = s.kind === 'sun' ? `${s.sun === 'sunrise' ? 'Sunrise' : 'Sunset'} ${label(s.at)}` : `${first ? 'Now' : s.dayBreak ? `${top} ${label(s.at)}` : label(s.at)}, ${deg(s.tC)}${s.rainPct === null ? '' : `, rain ${s.rainPct}%`}`
            return (
              <button
                key={`${s.kind}${s.at}`}
                type="button"
                className={`hwtile__h${s.kind === 'sun' ? ' hwtile__h--sun' : ''}${s.dayBreak ? ' hwtile__h--day' : ''}`}
                data-at={s.at}
                data-slot={s.kind}
                aria-label={named}
                onClick={(e) => {
                  e.stopPropagation()
                  open(s.kind === 'hour' && first ? null : Math.floor(s.at / HOUR) * HOUR)
                }}
              >
                <span className="hwtile__at">{top}</span>
                {s.kind === 'sun' ? <SunSlotIcon rising={s.sun === 'sunrise'} /> : s.icon === null ? <span className="hwtile__icon">—</span> : <SkyIconSvg icon={s.icon} className="hwtile__icon" />}
                {rainy ? <span className="hwtile__rain num">{s.rainPct === null || s.rainPct < RAIN_SHOW_PCT ? '' : `${s.rainPct}%`}</span> : null}
                <span className="hwtile__t num">{s.kind === 'sun' ? (s.sun === 'sunrise' ? 'rise' : 'set') : deg(s.tC)}</span>
              </button>
            )
          })}
        </div>
        <span className="hwtile__more" aria-hidden="true" data-more-hint>
          ›
        </span>
      </div>
      <span className={`hwtile__line${showRain ? ' hwtile__line--rain' : ''}`} data-rain-strip={showRain ? '' : undefined}>
        {shown === null ? (
          <Skel wide />
        ) : shown.aged ? (
          agoWords(now.getTime() - shown.at)
        ) : showRain && rain !== null ? (
          <>
            <RainBars bars={rain.bars} />
            <span className="hwtile__rainline">{rain.line}</span>
          </>
        ) : (
          `${words} · H${deg(w?.hiC ?? null)} L${deg(w?.loC ?? null)}`
        )}
      </span>
    </div>
  )
}
