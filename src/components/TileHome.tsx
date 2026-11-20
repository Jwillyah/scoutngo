import '../styles/home-tiles.css'
import { useEffect, useMemo, type ReactNode } from 'react'
import { getPosition } from 'suncalc'
import { droneTag, kt, surfOn, windTag } from '../core/briefing.ts'
import { bestRun, groundOf, sideWords, skyStripLit, spanWords } from '../core/homeDay.ts'
import { firstFun, tideAt } from '../core/homeCards.ts'
import { fishMoment, glassyMoment, moonriseMoment, pickMoment, skyMoment, swellMoment, tileOrder, type Moment, type TileKind } from '../core/homeTiles.ts'
import { localDate } from '../core/moonTimes.ts'
import { moonMoments } from '../core/moonNights.ts'
import { colorWords } from '../core/homeDay.ts'
import { skyCallNow } from '../core/skyCall.ts'
import { cloudRange, freshSky, rangeWord, skyCondition } from '../core/skyWord.ts'
import { formatClock, formatShortClock, formatShortHour } from '../core/timezone.ts'
import { compassPoint } from '../core/field.ts'
import { wetsuitWords } from '../core/waterTemp.ts'
import type { TideSample } from '../core/tide.ts'
import { useGoAlert } from '../lib/goAlert.ts'
import { useMarineAlerts } from '../lib/coastData.ts'
import { PERSONA_PILL, type Persona } from '../lib/persona.ts'
import { shareSkyWordNow } from '../lib/skyWordNow.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { formatTemperature, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { useBriefing, type BriefingDrone } from '../lib/useBriefing.ts'
import { useLiveSky } from '../lib/useLiveSky.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import { useStormPlay } from '../lib/useStormPlay.ts'
import { surfDayHours, surfLine, useSurfNow } from '../lib/useSurfNow.ts'
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

export function TileHome({ venue, placeName, timeZone, units, drone, now, persona, onClose, onOpenMap, onMenu, onSwitchSpot, onPersona, onOpen }: TileHomeProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  /* Batch CORE, Section 1.4: the Go alert, from the one sky call (the old home's, kept). */
  const call = skyCallNow(brief.days.slice(0, 2), now, venue)
  useGoAlert(call, now, timeZone)
  const obs = useStationObs(venue)
  const surf = useSurfNow(venue, now, timeZone, units.distance === 'ft', placeName, obs, 'daily')
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

  /* ----------------------------------------------------- the moment */
  const today = localDate(now, timeZone)
  const moment = useMemo<Moment | null>(() => {
    const coast = brief.facing !== null && surf.away === null
    const hours = brief.days.slice(0, 2).flatMap((d) => d.wind)
    const sizeAt = (t: Date) => {
      const h = surf.series.reduce<(typeof surf.series)[number] | null>((a, b) => (a === null || Math.abs(b.at.getTime() - t.getTime()) < Math.abs(a.at.getTime() - t.getTime()) ? b : a), null)
      return h === null ? null : `${Math.max(0, Math.round(h.range.lowFt))}–${Math.max(1, Math.round(h.range.highFt))} ft`
    }
    const glassy = coast ? glassyMoment({ hours, facing: brief.facing, daylight: sunUp, now, timeZone, sizeAt }) : null
    const run = calmRun(day?.wind ?? [], now)
    const turn = brief.turns.find((x) => x.at.getTime() > now.getTime()) ?? null
    const fish = fishMoment(run, turn, now, timeZone)
    const pts = surfDayHours(surf.series, timeZone).map((h) => ({ at: h.at, ft: h.centerFt, fun: surfOn(h.tag) }))
    const swell = coast ? swellMoment(firstFun(pts, now), null, now, timeZone) : null
    const moon = moonriseMoment(moonMoments(now, venue.lat, venue.lon, timeZone, 2), today, timeZone)
    return pickMoment([skyMoment(call, now, timeZone), glassy, fish, swell, moon], persona)
  }, [brief, surf, call, now, timeZone, venue, persona, today, day]) // eslint-disable-line react-hooks/exhaustive-deps

  const order = tileOrder(persona)
  const loading = brief.status === 'loading'

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
        <WeatherTile wx={wx} now={now} venue={venue} timeZone={timeZone} units={units} cond={fast !== null ? rangeWord(fast) : (cond?.word ?? null)} dayStart={day?.start ?? null} obs={obs} loading={loading} onOpen={() => onOpen('weather')} />
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

  /* ----------------------------------------------------- each tile */
  function tileOf(k: TileKind): TileBody {
    const dash = loading ? '…' : '—'
    const clock = (d: Date) => formatClock(d, timeZone)
    const short = (d: Date) => formatShortClock(d, timeZone)
    if (k === 'surf') {
      const c = surf.week[0]?.call ?? null
      const tag = c === null ? null : (c.quality ?? c.size)
      const line = surf.away !== null ? `nearest: ${surf.away.name} · ${surf.away.far}` : surfLine(surf.sea, surf.now, now)
      const hours = surf.series.filter((h) => h.at.getTime() + HOUR / 2 > now.getTime()).slice(0, 12)
      return {
        label: 'Surf',
        tag,
        value: c === null ? dash : <span data-shared="surf">{c.words}</span>,
        line,
        pic: hours.length === 0 ? null : <Bars values={hours.map((h) => ({ v: h.centerFt, on: surfOn(h.tag) }))} floor={3} tone="surf" />,
      }
    }
    if (k === 'tide') {
      const next = brief.turns.find((x) => x.at.getTime() > now.getTime()) ?? null
      const after = next === null ? null : (brief.turns.find((x) => x.at.getTime() > next.at.getTime()) ?? null)
      const from = new Date(now.getTime() - 2 * HOUR)
      const to = new Date(now.getTime() + 10 * HOUR)
      const curve: TideSample[] = Array.from({ length: 73 }, (_, i) => new Date(from.getTime() + i * 10 * 60_000)).flatMap((t) => {
        const feet = tideAt(brief.turns, t)
        return feet === null ? [] : [{ at: t, feet }]
      })
      return {
        label: 'Tide',
        value: next === null ? dash : <span data-shared="tide" data-value={`${next.kind} ${clock(next.at)}`.toLowerCase()}>{`${next.kind === 'high' ? 'High' : 'Low'} ${short(next.at)}`}</span>,
        line: next === null ? null : `then ${next.kind === 'high' ? 'falling' : 'rising'}${after === null ? '' : ` · ${after.kind} ${short(after.at)}`}`,
        pic: curve.length < 2 ? null : <TideCurve variant="strip" curve={curve} from={from} to={to} timeZone={timeZone} now={now} label={next === null ? 'The tide' : `The tide, ${next.kind === 'high' ? 'rising' : 'falling'} now`} />,
      }
    }
    if (k === 'wind') {
      const said = windWords(wind, units.wind)
      const side = wind?.fromDeg == null ? null : windTag(wind.fromDeg, brief.facing)
      const steps = [0, 3, 6, 9, 12].map((h) => (h === 0 ? wind : windAt(wx, new Date(now.getTime() + h * HOUR))))
      return {
        label: 'Wind',
        value: said === null ? dash : <span data-shared="wind">{said}</span>,
        line: [gustWords(wind, units.wind), side === null ? null : sideWords(side)].filter((x) => x !== null).join(' · ') || null,
        pic: wx === null ? null : <Arrows steps={steps.map((w, i) => ({ fromDeg: w?.fromDeg ?? null, calm: w !== null && w.fromDeg === null, at: new Date(now.getTime() + [0, 3, 6, 9, 12][i] * HOUR) }))} timeZone={timeZone} />,
      }
    }
    if (k === 'sky') {
      const said = colorWords(call?.call ?? null)
      const ev = call?.event ?? null
      const lit = skyStripLit(call?.call ?? null)
      return {
        label: 'Sky',
        value: said === null ? dash : <span data-shared="skycall" data-value={said}>{said.replace(/^color /, '').replace(/^./, (x) => x.toUpperCase())}</span>,
        line:
          ev === null || call === null ? null : (
            <>
              <span {...(call.kind === 'sunset' && call.dayIndex === 0 ? { 'data-shared': 'sunset', 'data-value': `sunset ${clock(ev)}`.toLowerCase() } : {})}>{`${call.kind} ${short(ev)}`}</span>
              {` · look ${compassPoint(call.lookDeg)}`}
            </>
          ),
        pic: ev === null || call === null ? null : <SkyArc kind={call.kind} event={ev} now={now} lit={lit} venue={venue} />,
      }
    }
    if (k === 'fish') {
      const run = calmRun(day?.wind ?? [], now)
      const turn = brief.turns.find((x) => x.at.getTime() > now.getTime()) ?? null
      const noWind = day === null || day.wind.every((w) => w.mps === null)
      return {
        label: 'Fish',
        value: run !== null ? spanWords(run.from, run.to, timeZone) : noWind ? dash : 'None today',
        line: [run !== null ? 'calm water' : noWind ? null : 'wind 10 kt+', turn === null ? null : `${turn.kind} ${short(turn.at)}`].filter((x) => x !== null).join(' · ') || null,
        pic: noWind ? null : <Track now={now} hours={12} run={run} turn={turn?.at ?? null} />,
      }
    }
    if (k === 'water') return { label: 'Water', water: { at: venue, unit: units.temperature }, value: dash, line: null, pic: null }
    /* Drone: the wind at 400 ft now, against the kit's rated wind. */
    const w = day === null ? null : day.wind.reduce<(typeof day.wind)[number] | null>((a, b) => (a === null || Math.abs(b.at.getTime() - now.getTime()) < Math.abs(a.at.getTime() - now.getTime()) ? b : a), null)
    const tag = drone === null || w === null ? null : droneTag(w.highMps, drone.maxWindMps)
    const high = w?.highMps ?? null
    const speed = high === null ? null : `${Math.round(windIn(high, units.wind) ?? 0)} ${windUnitLabel(units.wind)}`
    const ahead = brief.days.slice(0, 2).flatMap((d) => d.wind).filter((h) => h.at.getTime() + HOUR / 2 > now.getTime()).slice(0, 12)
    return {
      label: 'Drone',
      value: tag ?? (speed === null ? dash : speed),
      line: speed === null ? null : `${speed} at 400 ft${drone?.maxWindMps == null ? '' : ` · limit ${Math.round(windIn(drone.maxWindMps, units.wind) ?? 0)}`}`,
      pic: ahead.length === 0 ? null : <Bars values={ahead.map((h) => ({ v: h.highMps === null ? null : (kt(h.highMps) ?? 0), on: false }))} floor={15} tone="drone" limit={drone?.maxWindMps == null ? null : kt(drone.maxWindMps)} />,
    }
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
  value: ReactNode
  line: ReactNode
  pic: ReactNode
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

function Tile({ kind, label, tag = null, value, line, pic, water, onOpen }: TileBody & { kind: TileKind; onOpen: () => void }) {
  return (
    <button type="button" className={`htile htile--${kind}`} data-tile={kind} onClick={onOpen}>
      <span className="htile__head">
        <span className="htile__label">{label}</span>
        {tag === null ? null : <span className="htile__tag">{tag}</span>}
        <Chev />
      </span>
      {water !== undefined ? <WaterReadout at={water.at} unit={water.unit} /> : (
        <>
          <span className="htile__value">{value}</span>
          {line === null || line === '' ? null : <span className="htile__line">{line}</span>}
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
        {s.status === 'loading' ? '…' : c === null ? '—' : formatTemperature(c, unit).replace(/°[FC]$/, '°')}
      </span>
      <span className="htile__line">{s.status === 'none' ? 'no water temp here' : suit === null ? (s.status === 'loading' ? 'asking the stations' : null) : `${suit} typical`}</span>
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
function SkyArc({ kind, event, now, lit, venue }: { kind: 'sunrise' | 'sunset'; event: Date; now: Date; lit: boolean; venue: { lat: number; lon: number } }) {
  /* Where along the arc: the sun's height now when it is up, else the event's end of the arc. */
  const alt = getPosition(now, venue.lat, venue.lon).altitude
  const up = alt > 0
  const az = getPosition(now, venue.lat, venue.lon).azimuth
  /* East (rise) on the left, west (set) on the right: azimuth 90..270 across. */
  const share = up ? Math.max(0.04, Math.min(0.96, (az - 90) / 180)) : kind === 'sunset' ? 0.96 : 0.04
  const x = 4 + share * 152
  const y = 34 - Math.sin(share * Math.PI) * 26
  void event
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

function WeatherTile({ wx, now, venue, timeZone, units, cond, dayStart, obs, loading, onOpen }: { wx: ReturnType<typeof useBriefing>['wx']; now: Date; venue: { lat: number; lon: number }; timeZone: string; units: Units; cond: string | null; dayStart: Date | null; obs: ReturnType<typeof useStationObs>; loading: boolean; onOpen: () => void }) {
  const at = (n: string, t: Date) => (wx === null ? null : hourlyAt(wx, n, t))
  const deg = (c: number | null) => formatTemperature(c, units.temperature).replace(/°[FC]$/, '°')
  const t = at('temperature_2m', now)
  const temps = dayStart === null ? [] : Array.from({ length: 24 }, (_, i) => at('temperature_2m', new Date(dayStart.getTime() + i * HOUR + HOUR / 2))).filter((x): x is number => x !== null)
  const hi = temps.length === 0 ? null : Math.max(...temps)
  const lo = temps.length === 0 ? null : Math.min(...temps)
  const start = Math.floor(now.getTime() / HOUR) * HOUR
  const hours = Array.from({ length: 6 }, (_, i) => new Date(start + i * HOUR))
  return (
    <button type="button" className="hwtile" data-tile="weather" onClick={onOpen} aria-label={`Weather: ${t === null ? 'no temperature yet' : deg(t)}${cond === null ? '' : `, ${cond}`}`}>
      <span className="hwtile__left">
        <span className="htile__label">Weather</span>
        <span className="hwtile__temp num" data-shared="temp" data-value={t === null ? '' : deg(t)}>
          {t === null ? (loading ? '…' : '—') : deg(t)}
        </span>
        <span className="hwtile__line">
          {cond ?? '—'} · H{deg(hi)} L{deg(lo)}
        </span>
      </span>
      <span className="hwtile__hours" aria-hidden="true">
        {wx === null
          ? null
          : hours.map((h, i) => {
              const tt = i === 0 ? now : new Date(h.getTime() + HOUR / 2)
              const c = skyCondition({ code: at('weather_code', tt), layers: { low: at('cloud_cover_low', tt), mid: at('cloud_cover_mid', tt), high: at('cloud_cover_high', tt) }, day: getPosition(tt, venue.lat, venue.lon).altitude > -0.8, station: i === 0 ? freshSky(obs, now) : null })
              return (
                <span key={h.getTime()} className="hwtile__h">
                  <span className="hwtile__at">{i === 0 ? 'Now' : formatShortHour(h, timeZone)}</span>
                  {c === null ? <span className="hwtile__icon">—</span> : <SkyIconSvg icon={c.icon} className="hwtile__icon" />}
                  <span className="hwtile__t num">{deg(at('temperature_2m', tt))}</span>
                </span>
              )
            })}
      </span>
      <Chev />
    </button>
  )
}
