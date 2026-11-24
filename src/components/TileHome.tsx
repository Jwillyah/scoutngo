import '../styles/home-tiles.css'
import { useEffect, useMemo, type ReactNode } from 'react'
import { getPosition } from 'suncalc'
import { droneTag, kt, surfOn, windTag } from '../core/briefing.ts'
import { bestRun, groundOf, sideWords, skyStripLit, spanWords } from '../core/homeDay.ts'
import { firstFun, tideAt } from '../core/homeCards.ts'
import { cleanMoment, fishMoment, moonriseMoment, pickMoment, skyMoment, swellMoment, tileOrder, type Moment, type TileKind } from '../core/homeTiles.ts'
import { localDate } from '../core/moonTimes.ts'
import { moonMoments } from '../core/moonNights.ts'
import { colorWords } from '../core/homeDay.ts'
import { EVENT_LINGER_MS } from '../core/skyCall.ts'
import { cloudRange, freshSky, rangeWord, skyCondition } from '../core/skyWord.ts'
import { formatClock, formatShortClock, formatShortHour } from '../core/timezone.ts'
import { compassPoint } from '../core/field.ts'
import { wetsuitWords } from '../core/waterTemp.ts'
import type { TideSample } from '../core/tide.ts'
import { useGoAlert } from '../lib/goAlert.ts'
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
import { useLiveSky } from '../lib/useLiveSky.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import { useStormPlay } from '../lib/useStormPlay.ts'
import { callOf, surfDayHours, surfLine, useSurfNow } from '../lib/useSurfNow.ts'
import { useWaterTemp } from '../lib/waterTemp.ts'
import { gustWords, windAt, windWords } from '../lib/windNow.ts'
import { LiveSkyDraw } from './LiveSky.tsx'
import { SkyIconSvg } from './SkyIconSvg.tsx'
import { TideCurve } from './TideCurve.tsx'

/*
 * THE HOME (Batch SIMPLE-2, Section 2; boards Home_P_Surf, Home_P_Shoot,
 * Home_P_Fish). What, when, where, for someone who has never opened the app:
 *
 *   header   the spot ⌄ (opens the spot search) · the persona pill
 *   moment   one gold card, ONLY when something is worth it (src/core/
 *            homeTiles.ts pickMoment); otherwise nothing
 *   weather  the temperature, the sky in a word, high and low, six hours, ›
 *   tiles    2 × 3 in the persona's order: label, value, one line, a live
 *            picture, ›. Each opens one page.
 *   dock     Map and ☰, nothing else
 *
 * Every value is an existing computation (the briefing, the one surf call,
 * the one wind now, the one sky call, the station's tide table, the moon's
 * moments); a dash where the forecast did not say. It never scrolls: the
 * tiles share what height is left (src/styles/home-tiles.css), and the home-fit
 * audit holds it at 390 × 844, 390 × 664 and 412 × 915, tab and standalone.
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
  onOpen: (target: TileTarget) => void
}

const HOUR = 3_600_000

/* ------------------------------------------------------------- the parts */

/*
 * Batch SIMPLE-3, Section 0.1: each part of the home is plain data, built from
 * the live inputs, then shown through the one snapshot per spot
 * (src/lib/homeSnapshot.ts useHomeParts): a part is drawn once its own inputs
 * have all answered, else what was last shown for the spot, else a skeleton.
 * The moment card is worked out from the SHOWN parts, so it can never say
 * something the tiles under it do not.
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
}
interface SurfPart extends TileData {
  bars: { v: number | null; on: boolean }[]
  /** The one surf window (src/lib/surfTapIn.ts surfWindow), and the call's words for its first hour. */
  window: { from: number; to: number; words: string; size: string | null } | null
  fun: number | 'now' | null
  coast: boolean
}
interface TidePart {
  turns: { at: number; feet: number; kind: 'high' | 'low' }[]
}
interface WindPart extends TileData {
  steps: { fromDeg: number | null; calm: boolean; at: number }[] | null
}
interface DronePart extends TileData {
  bars: { v: number | null; on: boolean }[]
  limit: number | null
}
interface FishPart {
  run: { from: number; to: number } | null
  noWind: boolean
}
interface WeatherPart {
  tempC: number | null
  cond: string | null
  hiC: number | null
  loC: number | null
  hours: { at: number; icon: string | null; tC: number | null }[] | null
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
  const today = localDate(now, timeZone)
  const short = (d: Date) => formatShortClock(d, timeZone)

  /* ----------------------------------------------------- the live parts */
  const daylight = daylightAt(surf.spot ?? venue)
  const surfWin = surfWindow(surf.series, now, daylight)
  const winHour = surfWin === null ? null : windowHour(surf.series, surfWin, now)
  const surfCall = surf.week[0]?.call ?? null
  const surfPart: SurfPart = {
    value: surfCall === null ? null : { text: surfCall.words, shared: { key: 'surf' } },
    tag: surfCall === null ? null : (surfCall.quality ?? surfCall.size),
    line: [{ text: (surf.away !== null ? `nearest: ${surf.away.name} · ${surf.away.far}` : surfLine(surf.sea, surf.now, now)) ?? '' }].filter((x) => x.text !== ''),
    bars: surf.series.filter((h) => h.at.getTime() + HOUR / 2 > now.getTime()).slice(0, 12).map((h) => ({ v: h.centerFt, on: surfOn(h.tag) })),
    window: surfWin === null ? null : { from: surfWin.from.getTime(), to: surfWin.to.getTime(), words: stretchWords(surfWin, now, timeZone), size: callOf(winHour, 0)?.words ?? null },
    fun: (() => {
      const f = firstFun(surfDayHours(surf.series, timeZone).map((h) => ({ at: h.at, ft: h.centerFt, fun: surfOn(h.tag) })), now)
      return f === null || f === 'now' ? f : f.getTime()
    })(),
    coast: brief.facing !== null && surf.away === null,
  }
  const skyPart: SkyPart | null = call === null ? null : { kind: call.kind, event: call.event.getTime(), call: call.call, from: call.from?.getTime() ?? null, to: call.to?.getTime() ?? null, lookDeg: call.lookDeg, dayIndex: call.dayIndex }
  const tidePart: TidePart = { turns: brief.turns.filter((x) => x.at.getTime() > now.getTime() - 14 * HOUR).slice(0, 12).map((x) => ({ at: x.at.getTime(), feet: x.feet, kind: x.kind })) }
  const said = windWords(wind, units.wind)
  const side = wind?.fromDeg == null ? null : windTag(wind.fromDeg, brief.facing)
  const windPart: WindPart = {
    value: said === null ? null : { text: said, shared: { key: 'wind' } },
    tag: null,
    line: [{ text: [gustWords(wind, units.wind), side === null ? null : sideWords(side)].filter((x) => x !== null).join(' · ') }].filter((x) => x.text !== ''),
    steps: wx === null ? null : [0, 3, 6, 9, 12].map((h) => {
      const w = h === 0 ? wind : windAt(wx, new Date(now.getTime() + h * HOUR))
      return { fromDeg: w?.fromDeg ?? null, calm: w !== null && w.fromDeg === null, at: now.getTime() + h * HOUR }
    }),
  }
  /* Drone: the wind at 400 ft now, against the kit's rated wind. */
  const dw = day === null ? null : day.wind.reduce<(typeof day.wind)[number] | null>((a, b) => (a === null || Math.abs(b.at.getTime() - now.getTime()) < Math.abs(a.at.getTime() - now.getTime()) ? b : a), null)
  const dTag = drone === null || dw === null ? null : droneTag(dw.highMps, drone.maxWindMps)
  const high = dw?.highMps ?? null
  const dSpeed = high === null ? null : `${Math.round(windIn(high, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`
  const dronePart: DronePart = {
    value: dTag !== null ? { text: dTag } : dSpeed === null ? null : { text: dSpeed },
    tag: null,
    line: dSpeed === null ? null : [{ text: `${dSpeed} at 400 ft${drone?.maxWindMps == null ? '' : ` · limit ${Math.round(windIn(drone.maxWindMps, units.wind) ?? 0)}`}` }],
    bars: brief.days.slice(0, 2).flatMap((d) => d.wind).filter((h) => h.at.getTime() + HOUR / 2 > now.getTime()).slice(0, 12).map((h) => ({ v: h.highMps === null ? null : (kt(h.highMps) ?? 0), on: false })),
    limit: drone?.maxWindMps == null ? null : kt(drone.maxWindMps),
  }
  const run = calmRun(day?.wind ?? [], now)
  const fishPart: FishPart = { run: run === null ? null : { from: run.from.getTime(), to: run.to.getTime() }, noWind: day === null || day.wind.every((w) => w.mps === null) }
  const temps = day === null ? [] : Array.from({ length: 24 }, (_, i) => at('temperature_2m', new Date(day.start.getTime() + i * HOUR + HOUR / 2))).filter((x): x is number => x !== null)
  const hourStart = Math.floor(now.getTime() / HOUR) * HOUR
  const weatherPart: WeatherPart = {
    tempC: at('temperature_2m', now),
    cond: fast !== null ? rangeWord(fast) : (cond?.word ?? null),
    hiC: temps.length === 0 ? null : Math.max(...temps),
    loC: temps.length === 0 ? null : Math.min(...temps),
    hours: wx === null ? null : Array.from({ length: 6 }, (_, i) => {
      const h = hourStart + i * HOUR
      const tt = i === 0 ? now : new Date(h + HOUR / 2)
      const c = skyCondition({ code: at('weather_code', tt), layers: { low: at('cloud_cover_low', tt), mid: at('cloud_cover_mid', tt), high: at('cloud_cover_high', tt) }, day: sunUp(tt), station: i === 0 ? freshSky(obs, now) : null })
      return { at: h, icon: c?.icon ?? null, tC: at('temperature_2m', tt) }
    }),
  }
  const st = brief.settled
  const skySettled = st.sky && stationNowAnswered(venue, now, online)
  const shown = useHomeParts(
    `${venue.lat.toFixed(3)},${venue.lon.toFixed(3)}`,
    {
      weather: { live: weatherPart, settled: st.sea },
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
  const fishShown = shown.fish?.data ?? null
  const moment = useMemo<Moment | null>(() => {
    const coast = surfShown?.coast === true
    const w = surfShown?.window ?? null
    const clean = coast && w !== null ? cleanMoment({ from: new Date(w.from), to: new Date(w.to), words: w.words, size: w.size }, now, timeZone) : null
    const fishRun = fishShown?.run ?? null
    const fish = fishMoment(fishRun === null ? null : { from: new Date(fishRun.from), to: new Date(fishRun.to) }, nextTurn === null ? null : { kind: nextTurn.kind, at: new Date(nextTurn.at) }, now, timeZone)
    const fun = surfShown?.fun ?? null
    const swell = coast ? swellMoment(fun === null || fun === 'now' ? fun : new Date(fun), null, now, timeZone) : null
    const moon = moonriseMoment(moonMoments(now, venue.lat, venue.lon, timeZone, 2), today, timeZone)
    const skyM = sky === null ? null : skyMoment({ kind: sky.kind, event: new Date(sky.event), call: sky.call, from: sky.from === null ? null : new Date(sky.from), to: sky.to === null ? null : new Date(sky.to), lookDeg: sky.lookDeg }, now, timeZone)
    return pickMoment([skyM, clean, fish, swell, moon], persona, now)
  }, [sky, surfShown, fishShown, nextTurn, now, timeZone, venue, persona, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const order = tileOrder(persona)

  return (
    <div className={`home homep home--${ground}`} role="dialog" aria-label="Home" data-persona={persona ?? 'none'}>
      {live === null || play.inPlay ? null : <LiveSkyDraw sky={live} />}
      <header className="homep__head">
        <button type="button" className="homep__spot home__spot" onClick={onSwitchSpot} disabled={onSwitchSpot === undefined} aria-label={`${placeName}: find a spot`}>
          <span className="homep__spotname home__spotname">{placeName}</span>
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
            <span className="hmoment__dot" aria-hidden="true" />
            <span className="hmoment__words">
              <span className="hmoment__eyebrow">{moment.eyebrow}</span>
              <span className="hmoment__line">{moment.line}</span>
            </span>
            <Chev />
          </button>
        )}
        <WeatherTile shown={shown.weather} now={now} timeZone={timeZone} units={units} onOpen={() => onOpen('weather')} />
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
  function tileOf(k: TileKind): TileBody {
    const clock = (d: Date) => formatClock(d, timeZone)
    if (k === 'surf') {
      const p = shown.surf
      if (p === null) return { label: 'Surf', value: null, line: null, pic: null, skeleton: true }
      return { label: 'Surf', tag: p.data.tag, value: p.data.value, line: aged(p) ?? p.data.line, pic: p.data.bars.length === 0 ? null : <Bars values={p.data.bars} floor={3} tone="surf" /> }
    }
    if (k === 'tide') {
      const p = shown.tide
      if (p === null) return { label: 'Tide', value: null, line: null, pic: null, skeleton: true }
      const turns = p.data.turns.map((x) => ({ at: new Date(x.at), feet: x.feet, kind: x.kind }))
      const next = turns.find((x) => x.at.getTime() > now.getTime()) ?? null
      const after = next === null ? null : (turns.find((x) => x.at.getTime() > next.at.getTime()) ?? null)
      const from = new Date(now.getTime() - 2 * HOUR)
      const to = new Date(now.getTime() + 10 * HOUR)
      const curve: TideSample[] = Array.from({ length: 73 }, (_, i) => new Date(from.getTime() + i * 10 * 60_000)).flatMap((t) => {
        const feet = tideAt(turns, t)
        return feet === null ? [] : [{ at: t, feet }]
      })
      return {
        label: 'Tide',
        value: next === null ? null : { text: `${next.kind === 'high' ? 'High' : 'Low'} ${short(next.at)}`, shared: { key: 'tide', value: `${next.kind} ${clock(next.at)}`.toLowerCase() } },
        line: aged(p) ?? (next === null ? null : [{ text: `then ${next.kind === 'high' ? 'falling' : 'rising'}${after === null ? '' : ` · ${after.kind} ${short(after.at)}`}` }]),
        pic: curve.length < 2 ? null : <TideCurve variant="strip" curve={curve} from={from} to={to} timeZone={timeZone} now={now} label={next === null ? 'The tide' : `The tide, ${next.kind === 'high' ? 'rising' : 'falling'} now`} />,
      }
    }
    if (k === 'wind') {
      const p = shown.wind
      if (p === null) return { label: 'Wind', value: null, line: null, pic: null, skeleton: true }
      return { label: 'Wind', value: p.data.value, line: aged(p) ?? p.data.line, pic: p.data.steps === null ? null : <Arrows steps={p.data.steps.map((x) => ({ ...x, at: new Date(x.at) }))} timeZone={timeZone} /> }
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
        pic: ev === null || c === null ? null : <SkyArc kind={c.kind} now={now} lit={skyStripLit(c.call)} venue={venue} />,
      }
    }
    if (k === 'fish') {
      const p = shown.fish
      if (p === null) return { label: 'Fish', value: null, line: null, pic: null, skeleton: true }
      const r = p.data.run === null ? null : { from: new Date(p.data.run.from), to: new Date(p.data.run.to) }
      const turn = nextTurn === null ? null : { kind: nextTurn.kind, at: new Date(nextTurn.at) }
      return {
        label: 'Fish',
        value: r !== null ? { text: spanWords(r.from, r.to, timeZone) } : p.data.noWind ? null : { text: 'None today' },
        line: aged(p) ?? ([r !== null ? 'calm water' : p.data.noWind ? null : 'wind 10 kt+', turn === null ? null : `${turn.kind} ${short(turn.at)}`].filter((x) => x !== null).map((text, i) => ({ text: i === 0 ? text : ` · ${text}` })) as Seg[]),
        pic: p.data.noWind ? null : <Track now={now} hours={12} run={r} turn={turn?.at ?? null} />,
      }
    }
    if (k === 'water') return { label: 'Water', water: { at: venue, unit: units.temperature }, value: null, line: null, pic: null }
    const p = shown.drone
    if (p === null) return { label: 'Drone', value: null, line: null, pic: null, skeleton: true }
    return { label: 'Drone', value: p.data.value, line: aged(p) ?? p.data.line, pic: p.data.bars.length === 0 ? null : <Bars values={p.data.bars} floor={15} tone="drone" limit={p.data.limit} /> }
  }
}

/** The old home's calm-water run (Home.tsx windowRows, fish): daylight or not, wind under 10 kt for 3 h or more, still to come. */
function calmRun(hours: readonly { at: Date; mps: number | null }[], now: Date): { from: Date; to: Date } | null {
  const r = bestRun(
    hours.filter((h) => h.at.getTime() > now.getTime()).map((h) => ({ at: new Date(h.at.getTime() - 1_800_000), value: h })),
    (h) => h.mps !== null && (kt(h.mps) ?? 99) < 10,
    3,
  )
  return r === null ? null : { from: r.from, to: r.to }
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

/** Bars, an hour each, the value up; `on` hours bright. A missing hour has no bar, never a zero one. */
function Bars({ values, floor, tone, limit = null }: { values: readonly { v: number | null; on: boolean }[]; floor: number; tone: 'surf' | 'drone'; limit?: number | null }) {
  const top = Math.max(floor, limit ?? 0, ...values.map((x) => x.v ?? 0)) * 1.1
  const w = 160 / values.length
  return (
    <svg className={`hpic hpic--bars hpic--${tone}`} viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden="true">
      {limit === null ? null : <line x1="0" x2="160" y1={40 - (limit / top) * 40} y2={40 - (limit / top) * 40} className="hpic__limit" />}
      {values.map((x, i) =>
        x.v === null ? null : <rect key={i} x={i * w + 1.5} y={40 - Math.max(3, (x.v / top) * 40)} width={Math.max(2, w - 3)} height={Math.max(3, (x.v / top) * 40)} rx="2" className={x.on ? 'hpic__bar hpic__bar--on' : 'hpic__bar'} />,
      )}
    </svg>
  )
}

/** Five arrows, now and every 3 h, each pointing where that hour's wind goes. */
function Arrows({ steps, timeZone }: { steps: readonly { fromDeg: number | null; calm: boolean; at: Date }[]; timeZone: string }) {
  return (
    <span className="hpic hpic--arrows" aria-hidden="true">
      {steps.map((s) => (
        <span key={s.at.getTime()} className="hpic__arrowcell">
          <svg viewBox="0 0 24 24" className="hpic__arrowsvg">
            {s.fromDeg === null ? (
              <circle cx="12" cy="12" r={s.calm ? 3 : 0} className="hpic__calm" />
            ) : (
              <g transform={`rotate(${(s.fromDeg + 180) % 360} 12 12)`} data-arrow-deg={Math.round((s.fromDeg + 180) % 360)}>
                <path d="M12 21V4M6.5 9.5L12 3.5l5.5 6" className="hpic__arrow" />
              </g>
            )}
          </svg>
          <span className="hpic__arrowat">{formatShortHour(s.at, timeZone)}</span>
        </span>
      ))}
    </span>
  )
}

/** The sun's arc, sunrise to sunset, the sun where it is now, or at the event to come; warm when the call is Likely or Possible. */
function SkyArc({ kind, now, lit, venue }: { kind: 'sunrise' | 'sunset'; now: Date; lit: boolean; venue: { lat: number; lon: number } }) {
  /* Where along the arc: the sun's height now when it is up, else the event's end of the arc. */
  const alt = getPosition(now, venue.lat, venue.lon).altitude
  const up = alt > 0
  const az = getPosition(now, venue.lat, venue.lon).azimuth
  /* East (rise) on the left, west (set) on the right: azimuth 90..270 across. */
  const share = up ? Math.max(0.04, Math.min(0.96, (az - 90) / 180)) : kind === 'sunset' ? 0.96 : 0.04
  const x = 4 + share * 152
  const y = 34 - Math.sin(share * Math.PI) * 26
  return (
    <svg className={`hpic hpic--sky${lit ? ' hpic--lit' : ''}`} viewBox="0 0 160 40" preserveAspectRatio="none" aria-hidden="true" data-sky-art={lit ? 'lit' : 'muted'}>
      <path d="M4 34 Q80 -18 156 34" className="hpic__arc" />
      <line x1="0" x2="160" y1="35" y2="35" className="hpic__horizon" />
      <circle cx={x} cy={y} r="5" className="hpic__sun" />
    </svg>
  )
}

/** The next 12 hours as a track: the calm run bright, the tide's turn a tick. */
function Track({ now, hours, run, turn }: { now: Date; hours: number; run: { from: Date; to: Date } | null; turn: Date | null }) {
  const span = hours * HOUR
  const x = (t: Date) => Math.max(0, Math.min(160, ((t.getTime() - now.getTime()) / span) * 160))
  return (
    <svg className="hpic hpic--track" viewBox="0 0 160 24" preserveAspectRatio="none" aria-hidden="true">
      <rect x="0" y="8" width="160" height="8" rx="4" className="hpic__trackbg" />
      {run === null ? null : <rect x={x(run.from)} y="8" width={Math.max(4, x(run.to) - x(run.from))} height="8" rx="4" className="hpic__run" />}
      {turn === null || turn.getTime() - now.getTime() > span ? null : <rect x={x(turn) - 1.5} y="3" width="3" height="18" rx="1.5" className="hpic__turn" />}
    </svg>
  )
}

/* ------------------------------------------------------------- weather */

function WeatherTile({ shown, now, timeZone, units, onOpen }: { shown: Shown<WeatherPart> | null; now: Date; timeZone: string; units: Units; onOpen: () => void }) {
  const deg = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const w = shown?.data ?? null
  const t = w?.tempC ?? null
  const start = Math.floor(now.getTime() / HOUR) * HOUR
  /* The six hours from this hour on; a kept answer's hours that have passed are not drawn as now's. */
  const hours = (w?.hours ?? []).filter((h) => h.at >= start).slice(0, 6)
  return (
    <button type="button" className="hwtile" data-tile="weather" data-loading={shown === null ? '' : undefined} onClick={onOpen} aria-label={`Weather: ${t === null ? (shown === null ? 'on its way' : 'no temperature') : deg(t)}${w?.cond == null ? '' : `, ${w.cond}`}`}>
      <span className="hwtile__left">
        <span className="htile__label">Weather</span>
        <span className="hwtile__temp num" data-shared="temp" data-value={t === null ? '' : deg(t)}>
          {shown === null ? <Skel /> : t === null ? '—' : deg(t)}
        </span>
        <span className="hwtile__line">
          {shown === null ? <Skel wide /> : shown.aged ? agoWords(now.getTime() - shown.at) : `${w?.cond ?? '—'} · H${deg(w?.hiC ?? null)} L${deg(w?.loC ?? null)}`}
        </span>
      </span>
      <span className="hwtile__hours" aria-hidden="true">
        {hours.map((h, i) => (
          <span key={h.at} className="hwtile__h">
            <span className="hwtile__at">{i === 0 && h.at === start ? 'Now' : formatShortHour(new Date(h.at), timeZone)}</span>
            {h.icon === null ? <span className="hwtile__icon">—</span> : <SkyIconSvg icon={h.icon as Parameters<typeof SkyIconSvg>[0]['icon']} className="hwtile__icon" />}
            <span className="hwtile__t num">{deg(h.tC)}</span>
          </span>
        ))}
      </span>
      <Chev />
    </button>
  )
}
