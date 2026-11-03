import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { droneTag, kt, lightSteps, colorTag, sunSide, bestOfWeek, type CallRead, type LightStep, type StepName, type Kind } from '../core/briefing.ts'
import { alertIcs, remindAt, wakeAt } from '../core/alertIcs.ts'
import { formatClock, formatShortHour } from '../core/timezone.ts'
import { useBriefing, type DayBrief } from '../lib/useBriefing.ts'
import { saveIcs } from '../lib/saveIcs.ts'
import { remember } from '../lib/callHistory.ts'
import { showGuide, useBestView } from '../lib/useBestView.ts'
import { bestViewOnMap } from '../core/bestView.ts'
import { camsForEvent } from '../core/skyCams.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { beachName } from '../lib/surfBeach.ts'
import { changeWords } from '../core/callChange.ts'
import { compass } from '../lib/tideWords.ts'
import { windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { MoonGlyph } from './MoonGlyph.tsx'

/*
 * THE TODAY BRIEFING (Batch H, Section 2). Open the app and know in three
 * seconds what is worth shooting today, tonight and this week near the pin.
 *
 * Three pages you swipe, with tabs and dots: Today, Tomorrow, This week.
 * The ground is the sky's own colour for the call, not a photo: a warm
 * sunset for Go, blue-grey for Maybe, slate for Skip. Glass cards, white
 * type, big light numbers; every 3-step scale runs less to more, left to
 * right. Every number is the code's (src/core/briefing.ts,
 * src/lib/useBriefing.ts); a dash where the forecast did not say.
 *
 * It fits 390 x 844 with nothing scrolled (scripts/audit-briefing.mjs).
 */
export interface BriefingDrone {
  name: string
  maxWindMps: number | null
}

interface BriefingProps {
  venue: { lat: number; lon: number }
  placeName: string
  timeZone: string
  units: Units
  drone: BriefingDrone | null
  now: Date
  onClose: () => void
  onOpenMap: () => void
  /** Batch I: the place name at the top switches the spot. */
  onSwitchSpot?: () => void
  /** Batch I: the Viewfinder, a front-row button. */
  onViewfinder?: () => void
  /** Which page opens: Today unless asked. */
  start?: 0 | 1 | 2
}

type Page = 0 | 1 | 2
const PAGES = ['Today', 'Tomorrow', 'This week'] as const
/** The conditions axis: 5 AM to 9 PM local, the hours you shoot. */
const AXIS_FROM_H = 5
const AXIS_HOURS = 16

const KIND_WORD: Record<Kind, string> = { sunrise: 'Sunrise', sunset: 'Sunset' }

export function Briefing({ venue, placeName, timeZone, units, drone, now, onClose, onOpenMap, onSwitchSpot, onViewfinder, start = 0 }: BriefingProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  const [page, setPage] = useState<Page>(start)
  const track = useRef<HTMLDivElement>(null)
  const clock = (d: Date | null) => (d === null ? '—' : formatClock(d, timeZone))

  /* Tabs and swipes are one thing: the tab scrolls the track, the track's scroll sets the tab. */
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

  const today = brief.days[0] ?? null
  const tomorrow = brief.days[1] ?? null
  const shown = page === 2 ? bestOfWeek(brief.days.flatMap((d) => [d.reads.sunrise, d.reads.sunset]).filter((r): r is CallRead => r !== null)) : (page === 0 ? today : tomorrow)?.call ?? null

  return (
    <div className={`brief brief--${tone(shown)}`} role="dialog" aria-label="Today briefing">
      <div className="brief__top">
        <div className="brief__tabs" role="tablist">
          {PAGES.map((p, i) => (
            <button key={p} type="button" role="tab" aria-selected={page === i} className={`brief__tab${page === i ? ' brief__tab--on' : ''}`} onClick={() => go(i as Page)}>
              {p}
            </button>
          ))}
        </div>
        <button type="button" className="brief__x" aria-label="Close the briefing" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="brief__track" ref={track}>
        <section className="brief__page" aria-label="Today">
          <DayPage day={today} which="today" placeName={placeName} venue={venue} timeZone={timeZone} units={units} drone={drone} now={now} facing={brief.facing} checkedAt={brief.checkedAt} clock={clock} onOpenMap={onOpenMap} onSwitchSpot={onSwitchSpot} onViewfinder={onViewfinder} loading={brief.status === 'loading'} settling={brief.status === 'loading' || brief.obsPending === true} />
        </section>
        <section className="brief__page" aria-label="Tomorrow">
          <DayPage day={tomorrow} which="tomorrow" placeName={placeName} venue={venue} timeZone={timeZone} units={units} drone={drone} now={now} facing={brief.facing} checkedAt={brief.checkedAt} clock={clock} onOpenMap={onOpenMap} onSwitchSpot={onSwitchSpot} onViewfinder={onViewfinder} loading={brief.status === 'loading'} />
        </section>
        <section className="brief__page" aria-label="This week">
          <WeekPage now={now} days={brief.days} timeZone={timeZone} units={units} clock={clock} placeName={placeName} loading={brief.status === 'loading'} />
        </section>
      </div>
      <div className="brief__dots" aria-hidden="true">
        {PAGES.map((p, i) => (
          <i key={p} className={page === i ? 'brief__dot brief__dot--on' : 'brief__dot'} />
        ))}
      </div>
    </div>
  )
}

/** The ground's colour: the call's (Go warm, Maybe blue-grey, Skip and no call slate). */
function tone(read: CallRead | null): 'go' | 'maybe' | 'skip' {
  return read?.call === 'Go' ? 'go' : read?.call === 'Maybe' ? 'maybe' : 'skip'
}

/* ------------------------------------------------------------- a 3-step scale */

function Scale({ steps, on, label }: { steps: readonly string[]; on: string | null; label: string }) {
  return (
    <span className="bscale" role="img" aria-label={`${label}: ${on ?? 'not known'}`}>
      <span className="bscale__word">{on ?? '—'}</span>
      <span className="bscale__bar" aria-hidden="true">
        {steps.map((s) => (
          <i key={s} className={s === on ? 'bscale__seg bscale__seg--on' : 'bscale__seg'} />
        ))}
      </span>
    </span>
  )
}

/* ------------------------------------------------------------------- glyphs */

const CameraGlyph = () => (
  <svg className="bbtn__glyph" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <circle cx="12" cy="13.5" r="3.5" />
    <path d="M8 7l1.5-2.5h5L16 7" />
  </svg>
)
const MapGlyph = () => (
  <svg className="bbtn__glyph" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M9 4l-6 2.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4zM9 4v13M15 6.5v13" />
  </svg>
)

const STEP_PATH: Record<StepName, ReactNode> = {
  Clear: (
    <>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  Golden: (
    <>
      <path d="M7 16a5 5 0 0 1 10 0" />
      <path d="M3 19h18M12 6v3M5.6 9.6l1.8 1.8M18.4 9.6l-1.8 1.8" />
    </>
  ),
  /* Batch J, Section 8: the three colour steps as a cloud and the sun under it: lit as the sun nears the horizon, deepest as it sets, the glow after it is gone. */
  Color: (
    <>
      <path d="M6.5 10.5h10a3 3 0 0 0 .4-6 4.5 4.5 0 0 0-8.7 1.1A2.5 2.5 0 0 0 6.5 10.5z" />
      <path d="M2 19h20M7 19a5 5 0 0 1 10 0M12 12.5v1.5" />
    </>
  ),
  Peak: (
    <>
      <path d="M6.5 10.5h10a3 3 0 0 0 .4-6 4.5 4.5 0 0 0-8.7 1.1A2.5 2.5 0 0 0 6.5 10.5z" />
      <path d="M2 19h20M9.5 19a2.5 2.5 0 0 1 5 0M8 15.5l-1.2-2.4M12 15v-2.6M16 15.5l1.2-2.4" />
    </>
  ),
  Glow: (
    <>
      <path d="M6.5 10.5h10a3 3 0 0 0 .4-6 4.5 4.5 0 0 0-8.7 1.1A2.5 2.5 0 0 0 6.5 10.5z" />
      <path d="M2 16h20M5 13.5h14" strokeDasharray="1.5 2" />
      <path d="M9 19.5h6" />
    </>
  ),

  Dark: <path d="M15 4a8 8 0 1 0 5 14A7 7 0 0 1 15 4z" />,
}

function StepIcon({ name }: { name: StepName }) {
  return (
    <svg className="bstep__icon" viewBox="0 0 24 24" aria-hidden="true">
      {STEP_PATH[name]}
    </svg>
  )
}

const ROW_PATH: Record<'surf' | 'wind' | 'tide' | 'drone', ReactNode> = {
  /* A breaking wave. */
  surf: <path d="M2 17c2.5 0 3.5-1.5 4.5-4C8 9 10.5 6 15 6c3 0 5 1.6 5 4-1.2-1-2.6-1.2-3.8-.6-1.6.8-1.7 3-.2 4.3 1.2 1 3 1.2 5 .3-1 2-3.3 3-6 3H2" />,
  wind: <path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h8" />,
  tide: <path d="M2 14c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2 5-1M2 19h20" />,
  drone: (
    <>
      <circle cx="5" cy="6" r="2.5" />
      <circle cx="19" cy="6" r="2.5" />
      <path d="M7 7.5l3 3h4l3-3M10 10.5v3h4v-3M12 13.5v4" />
    </>
  ),
}

function RowIcon({ kind }: { kind: keyof typeof ROW_PATH }) {
  return (
    <svg className="brow__icon" viewBox="0 0 24 24" aria-hidden="true">
      {ROW_PATH[kind]}
    </svg>
  )
}

/* ---------------------------------------------------------------- a day page */

interface DayPageProps {
  day: DayBrief | null
  which: 'today' | 'tomorrow'
  placeName: string
  venue: { lat: number; lon: number }
  timeZone: string
  units: Units
  drone: BriefingDrone | null
  now: Date
  facing: number | null
  checkedAt: number | null
  clock: (d: Date | null) => string
  onOpenMap: () => void
  onSwitchSpot?: () => void
  onViewfinder?: () => void
  loading: boolean
  /** The next event's call waits on the observations: do not note it yet. */
  settling?: boolean
}

function DayPage({ day, which, placeName, venue, timeZone, units, drone, now, checkedAt, clock, onOpenMap, onSwitchSpot, onViewfinder, loading, settling = false }: DayPageProps) {
  const read = day?.call ?? null
  const kind: Kind | null = read?.kind ?? null
  const verdict = day === null || kind === null ? null : day.verdicts[kind]
  const under = read?.peak != null && read.colorFrom !== null && read.colorTo !== null ? { from: read.colorFrom, to: read.colorTo, peak: read.peak } : null
  const steps: LightStep[] = day === null || read === null || kind === null ? [] : lightSteps(kind, read.event, venue.lat, venue.lon, verdict, under)
  const tag = colorTag(verdict)
  const callWord = read === null ? (loading ? '…' : '—') : read.call ?? '—'
  /* Batch J, Section 6: the call this phone showed last for the event, and its change ("Upgraded to Go at 4:52 PM from KNTU"). */
  const callKey = read === null || which !== 'today' || settling ? null : `${venue.lat.toFixed(2)},${venue.lon.toFixed(2)}|${read.kind}|${read.event.toISOString()}`
  /* Batch J, Section 5: where the colour will be, and which spots see it; a tap draws it on the map. */
  const skyCams = useMemo(() => (read === null || which !== 'today' ? { look: '', cams: [] } : camsForEvent(venue, read.event, COAST_CAMS)), [read, which, venue])
  const best = useBestView(which === 'today' && read !== null && read.call !== 'Skip' ? venue : null, read?.event ?? null)
  const change = useMemo(() => (callKey === null || read === null ? null : remember(callKey, read.event, read.call, read.by ?? null, now)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callKey, read?.call, read?.by])
  const why = read === null ? (loading ? 'Reading five forecasts…' : which === 'today' ? 'Both have passed today. Tomorrow’s sunrise is next.' : 'The forecast did not say.') : read.why
  const colour = read === null || read.colorFrom === null ? null : `Best color ${clock(read.colorFrom)} to ${clock(read.colorTo)} · be set up ${clock(read.setUp)}`

  /* The footer: when it was checked and when it looks again; tomorrow, the final call. */
  const sunrise = day?.events.sunrise ?? null
  const footer =
    which === 'today'
      ? `Checked ${checkedAt === null ? '—' : clock(new Date(checkedAt))} · next check ${read === null ? '—' : clock(nextCheck(read.event, now))}`
      : sunrise === null
        ? 'Final call an hour before, from the stations'
        : `Final call ${clock(wakeAt(sunrise))} from the stations`
  const wanted = read === null ? null : kind === 'sunrise' ? { word: 'Wake me', at: wakeAt(read.event) } : { word: 'Remind me', at: remindAt(read.event, read.setUp) }
  /* An alarm already past is no button. */
  const alarm = wanted !== null && wanted.at.getTime() > now.getTime() ? wanted : null
  const save = () => {
    if (read === null || alarm === null || kind === null) return
    const from = read.setUp ?? new Date(read.event.getTime() - 20 * 60_000)
    const to = read.colorTo ?? new Date(read.event.getTime() + 30 * 60_000)
    saveIcs(
      alertIcs({ title: `${KIND_WORD[kind]} at ${placeName}: ${read.call ?? 'no call'}`, from, to, alarmAt: alarm.at, description: `${read.why} ${colour ?? ''} Forecast from ScoutNGo; check again before you go.`.trim(), uid: `brief-${kind}-${read.event.toISOString()}@scoutngo`, stamp: new Date() }),
      `scoutngo-${kind}-${read.event.toISOString().slice(0, 10)}.ics`,
    )
  }

  return (
    <div className="bday">
      <div className="bcall">
        <p className="bcall__place">
          <button type="button" className="bcall__spot" onClick={onSwitchSpot} disabled={onSwitchSpot === undefined} aria-label={`${placeName}: switch spot`}>
            {placeName}
            <svg className="bcall__chev" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 4.5L6 8l3.5-3.5" />
            </svg>
          </button>
          {read === null || kind === null ? '' : ` · ${KIND_WORD[kind].toLowerCase()} ${clock(read.event)}`}
        </p>
        <p className="bcall__word">
          {callWord}
          {change === null ? null : <span className="bcall__changed">{changeWords(change, clock)}</span>}
        </p>
        <p className="bcall__why">{why}</p>
        {read?.gapLine == null ? null : <p className="bcall__gap">{read.gapLine}</p>}
        {colour === null ? null : <p className="bcall__when num">{colour}</p>}
      </div>

      <div className="bcard">
        <div className="bcard__head">
          <span className="bcard__title">Light</span>
          <Scale steps={['Flat', 'Some color', 'Big color']} on={tag} label="Color" />
        </div>
        <ol className="bsteps">
          {(steps.length === 0 ? (['Clear', 'Golden', 'Color', 'Peak', 'Glow', 'Dark'] as StepName[]).map((name) => ({ name, at: null })) : steps).map((s) => (
            <li key={s.name} className={`bstep${s.name === 'Peak' ? ' bstep--peak' : ''}`}>
              <StepIcon name={s.name} />
              <span className="bstep__name">{s.name}</span>
              <span className="bstep__at num">{s.at === null ? '—' : formatClock(s.at, timeZone).replace(/ [AP]M$/, '')}</span>
            </li>
          ))}
        </ol>
        {skyCams.cams.length === 0 ? null : (
          /* Batch J, Section 7: the nearest public cams looking toward the sun. LINK OUT ONLY: a link, nothing fetched. */
          <p className="bcams">
            {skyCams.look}:{' '}
            {skyCams.cams.map((c, i) => (
              <span key={c.cam.id}>
                {i === 0 ? '' : ' · '}
                <a href={c.cam.url} target="_blank" rel="noopener noreferrer">
                  {beachName(c.cam.name)} {c.where}
                </a>
              </span>
            ))}
          </p>
        )}
        {best === null ? null : (
          <button type="button" className="bview" onClick={() => { showGuide(bestViewOnMap(venue, best)); onOpenMap() }}>
            {best.line}
          </button>
        )}
      </div>

      {day === null ? null : <Conditions day={day} which={which} units={units} drone={drone} now={now} venue={venue} timeZone={timeZone} clock={clock} />}

      <div className="bfoot">
        <p className="bfoot__line num">{footer}</p>
        {/* Batch I (board "BATCH I · Today + Viewfinder"): Remind me · Viewfinder (white) · a round map button. */}
        <div className="bfoot__buttons">
          {alarm === null ? null : (
            <button type="button" className="bbtn" onClick={save}>
              {alarm.word} {clock(alarm.at)}
            </button>
          )}
          {onViewfinder === undefined ? null : (
            <button type="button" className="bbtn bbtn--main" onClick={onViewfinder}>
              <CameraGlyph /> Viewfinder
            </button>
          )}
          <button type="button" className="bbtn bbtn--round" onClick={onOpenMap} aria-label="Open the map">
            <MapGlyph />
          </button>
        </div>
      </div>
    </div>
  )
}

/** The next time the briefing looks again: every hour, then the stations two hours out, then an hour out. */
function nextCheck(event: Date, now: Date): Date {
  const twoOut = new Date(event.getTime() - 2 * 3_600_000)
  const oneOut = new Date(event.getTime() - 3_600_000)
  if (now < twoOut) return twoOut
  if (now < oneOut) return oneOut
  return new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000)
}

/* ------------------------------------------------------- the conditions card */

function Conditions({ day, which, units, drone, now, venue, timeZone, clock }: { day: DayBrief; which: 'today' | 'tomorrow'; units: Units; drone: BriefingDrone | null; now: Date; venue: { lat: number; lon: number }; timeZone: string; clock: (d: Date | null) => string }) {
  const from = day.start.getTime() + AXIS_FROM_H * 3_600_000
  const span = AXIS_HOURS * 3_600_000
  const x = (t: number) => Math.max(0, Math.min(100, ((t - from) / span) * 100))
  const rise = day.events.sunrise?.getTime() ?? null
  const set = day.events.sunset?.getTime() ?? null
  const nowX = which === 'today' && now.getTime() >= from && now.getTime() <= from + span ? x(now.getTime()) : null
  const ticks = [0, 3, 6, 9, 12, 15].map((h) => new Date(from + h * 3_600_000))
  const shade = (
    <>
      {rise === null ? null : <i className="bnight" style={{ left: 0, width: `${x(rise)}%` }} />}
      {set === null ? null : <i className="bnight" style={{ left: `${x(set)}%`, right: 0 }} />}
      {nowX === null ? null : <i className="bnow" style={{ left: `${nowX}%` }} />}
    </>
  )
  const faceMax = Math.max(4, ...day.surf.map((b) => b.faceFt))
  const gustMax = Math.max(15, ...day.wind.map((w) => kt(w.gustMps) ?? kt(w.mps) ?? 0))
  const wunit = windUnitLabel(units.wind)
  const atCall = day.call?.event ?? null
  const launch = day.call?.setUp ?? null
  const callWind = atCall === null ? null : day.wind.reduce((a, b) => (Math.abs(b.at.getTime() - atCall.getTime()) < Math.abs(a.at.getTime() - atCall.getTime()) ? b : a), day.wind[0])
  const dTag = drone === null ? null : droneTag(callWind?.highMps ?? null, drone.maxWindMps)
  const tide = day.tide
  const feet = tide === null ? [] : tide.curve.map((c) => c.feet)
  const lo = feet.length === 0 ? 0 : Math.min(...feet)
  const hi = feet.length === 0 ? 1 : Math.max(...feet)
  const y = (f: number) => 30 - ((f - lo) / Math.max(0.1, hi - lo)) * 26
  const tidePath = tide === null ? '' : tide.curve.filter((c) => c.at.getTime() >= from && c.at.getTime() <= from + span).map((c, i) => `${i === 0 ? 'M' : 'L'}${x(c.at.getTime()).toFixed(2)} ${y(c.feet).toFixed(2)}`).join(' ')

  return (
    <div className="bcard bcond">
      <div className="baxis num" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t.getTime()} style={{ left: `${x(t.getTime())}%` }}>
            {formatShortHour(t, timeZone)}
          </span>
        ))}
      </div>

      <div className="brow">
        <div className="brow__head">
          <RowIcon kind="surf" />
          <span className="brow__name">Surf</span>
          <span className="brow__words num">{day.surfWords ?? '—'}</span>
          <Scale steps={['Flat', 'Fun', 'Firing']} on={day.surfTag} label="Surf" />
        </div>
        <div className="brow__plot">
          {shade}
          {day.surf.map((b) => (
            <i key={b.at.getTime()} className={`bbar${b.clean ? ' bbar--clean' : ''}${nowX !== null && Math.abs(b.at.getTime() - now.getTime()) < 1_800_000 ? ' bbar--now' : ''}`} style={{ left: `${x(b.at.getTime() - 1_800_000)}%`, width: `${100 / AXIS_HOURS - 0.8}%`, height: `${Math.max(4, (b.faceFt / faceMax) * 100)}%` }} />
          ))}
        </div>
      </div>

      <div className="brow">
        <div className="brow__head">
          <RowIcon kind="wind" />
          <span className="brow__name">Wind</span>
          <span className="brow__words num">
            {day.windMaxKt === null ? '—' : `to ${Math.round(windIn(day.wind.reduce((a, b) => Math.max(a, b.mps ?? 0), 0), units.wind) ?? 0)}${day.gustMaxKt === null ? '' : `, gusts ${Math.round(windIn(day.wind.reduce((a, b) => Math.max(a, b.gustMps ?? 0), 0), units.wind) ?? 0)}`} ${wunit}`}
          </span>
          <Scale steps={['Offshore', 'Cross', 'Onshore']} on={day.windTag} label="Wind to the beach" />
        </div>
        <div className="brow__plot">
          {shade}
          {day.wind.map((w) => (
            <span key={w.at.getTime()} className="bwind" style={{ left: `${x(w.at.getTime() - 1_800_000)}%`, width: `${100 / AXIS_HOURS - 0.8}%` }}>
              <i className="bwind__gust" style={{ height: `${((kt(w.gustMps) ?? 0) / gustMax) * 100}%` }} />
              <i className="bwind__steady" style={{ height: `${((kt(w.mps) ?? 0) / gustMax) * 100}%` }} />
            </span>
          ))}
        </div>
        <div className="brow__arrows num" aria-hidden="true">
          {day.wind
            .filter((_, i) => i % 3 === 1)
            .map((w) => (
              <span key={w.at.getTime()} style={{ left: `${x(w.at.getTime())}%` }}>
                {w.fromDeg === null ? '·' : <i className="barrow" style={{ transform: `rotate(${(w.fromDeg + 180) % 360}deg)` }}>↑</i>}
                {w.mps === null ? '' : Math.round(windIn(w.mps, units.wind) ?? 0)}
                {w.gustMps === null ? '' : `g${Math.round(windIn(w.gustMps, units.wind) ?? 0)}`}
              </span>
            ))}
        </div>
      </div>

      <div className="brow">
        <div className="brow__head">
          <RowIcon kind="tide" />
          <span className="brow__name">Tide</span>
          <span className="brow__words num">
            {tide === null ? '—' : `${tide.nowFeet === null ? '' : `${tide.nowFeet.toFixed(1)} ft ${tide.rising === null ? '' : tide.rising ? 'rising' : 'falling'} · `}${tide.next === null ? '' : `${tide.next.kind === 'low' ? 'Low' : 'High'} ${clock(tide.next.at)}`}`}
          </span>
          <Scale steps={['Low', 'Mid', 'High']} on={tide?.level ?? null} label="Tide now" />
        </div>
        <div className="brow__plot brow__plot--tide">
          {shade}
          <svg viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
            <path d={tidePath} className="btide" vectorEffect="non-scaling-stroke" />
          </svg>
          {tide === null
            ? null
            : tide.marks
                .filter((m) => m.at.getTime() >= from && m.at.getTime() <= from + span)
                .map((m) => (
                  /* Batch J, Section 8: a label on the now line moves off it, to the side it is on. */
                  <span key={m.at.getTime()} className={`btide__mark btide__mark--${m.kind} num`} style={{ left: `${x(m.at.getTime())}%`, ...(nowX !== null && Math.abs(x(m.at.getTime()) - nowX) < 9 ? { transform: x(m.at.getTime()) < nowX ? 'translateX(calc(-100% - 4px))' : 'translateX(4px)' } : {}) }}>
                    {m.kind === 'low' ? 'L' : 'H'} {formatClock(m.at, timeZone).replace(/ [AP]M$/, '')}
                  </span>
                ))}
        </div>
      </div>

      {drone === null ? null : (
        <div className="brow brow--drone">
          <div className="brow__head">
            <RowIcon kind="drone" />
            <span className="brow__name">Drone</span>
            <span className="brow__words">{launch === null || atCall === null ? 'No light to fly for' : `Launch ${clock(launch).replace(/ [AP]M$/, '')} · fly ${sunSide(atCall, venue.lat, venue.lon, compass)}`}</span>
            <Scale steps={['Light wind', 'Breezy', 'Too windy']} on={dTag} label={`Wind for the ${drone.name}`} />
          </div>
          <p className="brow__small num">{callWind?.highMps == null ? 'Wind at 400 ft not forecast' : `${Math.round(windIn(callWind.highMps, units.wind) ?? 0)} ${wunit} at 400 ft`} · check airspace</p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ the week page */

function WeekPage({ days, timeZone, units, clock, placeName, loading, now }: { days: DayBrief[]; now: Date; timeZone: string; units: Units; clock: (d: Date | null) => string; placeName: string; loading: boolean }) {
  const all = useMemo(() => days.flatMap((d) => [d.reads.sunrise, d.reads.sunset]).filter((r): r is CallRead => r !== null), [days])
  const best = bestOfWeek(all)
  const [picked, setPicked] = useState<string | null>(null)
  const pickedDay = picked === null ? null : days.find((d) => d.iso === picked) ?? null
  const shown = pickedDay === null ? best : bestOfWeek([pickedDay.reads.sunrise, pickedDay.reads.sunset].filter((r): r is CallRead => r !== null)) ?? pickedDay.call
  const dayName = (d: DayBrief) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(new Date(d.start.getTime() + 12 * 3_600_000))
  const dayNum = (d: DayBrief) => new Intl.DateTimeFormat('en-US', { day: 'numeric', timeZone }).format(new Date(d.start.getTime() + 12 * 3_600_000))
  const surfMax = Math.max(4, ...days.map((d) => Math.max(0, ...d.surf.map((b) => b.faceFt))))
  const save = () => {
    if (shown === null) return
    const from = shown.setUp ?? new Date(shown.event.getTime() - 20 * 60_000)
    saveIcs(
      alertIcs({ title: `${KIND_WORD[shown.kind]} at ${placeName}: ${shown.call ?? 'no call'}`, from, to: shown.colorTo ?? new Date(shown.event.getTime() + 30 * 60_000), alarmAt: shown.kind === 'sunrise' ? wakeAt(shown.event) : remindAt(shown.event, shown.setUp), description: `${shown.why} A guess this far out: it changes daily. Forecast from ScoutNGo.`, uid: `brief-week-${shown.event.toISOString()}@scoutngo`, stamp: new Date() }),
      `scoutngo-${shown.kind}-${shown.event.toISOString().slice(0, 10)}.ics`,
    )
  }
  const cell = (r: CallRead | null) => <span className={`bwk__call bwk__call--${tone(r)}${r?.call == null ? ' bwk__call--none' : ''}`}>{r?.call ?? '—'}</span>

  return (
    <div className="bweek">
      <p className="bweek__title">{loading && days.length === 0 ? 'Reading the week…' : `${placeName} · the week`}</p>
      <div className="bwk" role="table" aria-label="The week">
        <div className="bwk__row bwk__row--head" role="row">
          <span className="bwk__label" />
          {days.map((d) => (
            <button key={d.iso} type="button" role="columnheader" className={`bwk__day${d.index >= 2 ? ' bwk__day--guess' : ''}${d.index === 2 ? ' bwk__day--cut' : ''}${picked === d.iso ? ' bwk__day--on' : ''}`} onClick={() => setPicked(picked === d.iso ? null : d.iso)}>
              <span className="bwk__dname">{dayName(d)}</span>
              <span className="bwk__dnum num">{dayNum(d)}</span>
              <span className="bwk__dots" aria-label={`${d.certainty} of 3 sure`}>
                {[1, 2, 3].map((n) => (
                  <i key={n} className={n <= d.certainty ? 'bwk__dot bwk__dot--on' : 'bwk__dot'} />
                ))}
              </span>
            </button>
          ))}
        </div>
        {(
          [
            ['Rise', (d: DayBrief) => cell(d.reads.sunrise)],
            ['Set', (d: DayBrief) => cell(d.reads.sunset)],
            [
              'Surf ft',
              (d: DayBrief) => {
                const m = d.surf.length === 0 ? null : Math.max(...d.surf.map((b) => b.faceFt))
                return (
                  <span className="bwk__surf">
                    <i className={`bwk__sbar${d.surfClean ? ' bwk__sbar--clean' : ''}`} style={{ height: `${m === null ? 0 : Math.max(3, Math.round((m / surfMax) * 26))}px` }} />
                    <span className="num">{m === null ? '—' : Math.round(m)}</span>
                  </span>
                )
              },
            ],
            [
              `Wind ${windUnitLabel(units.wind)}`,
              (d: DayBrief) => (
                <span className={`bwk__wind bwk__wind--${d.windLevel}`}>
                  {d.windFrom === null ? null : <i className="barrow" style={{ transform: `rotate(${(d.windFrom + 180) % 360}deg)` }}>↑</i>}
                  <span className="num">{d.windMaxKt === null ? '—' : Math.round(windIn(Math.max(...d.wind.map((w) => w.mps ?? 0)), units.wind) ?? 0)}</span>
                  <span className="bwk__small num">{d.windFrom === null ? '' : compass(d.windFrom)}</span>
                  <span className="bwk__small num">{d.gustMaxKt === null ? '' : `g${Math.round(windIn(Math.max(...d.wind.map((w) => w.gustMps ?? 0)), units.wind) ?? 0)}`}</span>
                  {d.windOffshore ? <i className="bwk__off" aria-label="offshore" /> : null}
                </span>
              ),
            ],
            [
              'Tide',
              (d: DayBrief) => {
                const t = d.tide
                if (t === null) return <span className="num">—</span>
                const f0 = d.start.getTime() + 6 * 3_600_000
                const f1 = d.start.getTime() + 19 * 3_600_000
                const pts = t.curve.filter((c) => c.at.getTime() >= f0 && c.at.getTime() <= f1)
                const fs = pts.map((p) => p.feet)
                const lo = Math.min(...fs)
                const hi = Math.max(...fs)
                const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(((p.at.getTime() - f0) / (f1 - f0)) * 40).toFixed(1)} ${(14 - ((p.feet - lo) / Math.max(0.1, hi - lo)) * 12).toFixed(1)}`).join(' ')
                const low = t.marks.find((m) => m.kind === 'low' && m.at.getTime() >= f0 && m.at.getTime() <= f1)
                const high = t.marks.find((m) => m.kind === 'high' && m.at.getTime() >= f0 && m.at.getTime() <= f1)
                const short = (at: Date) => formatClock(at, timeZone).replace(/:00/, '').replace(/ ([AP])M$/, (_, a: string) => a.toLowerCase())
                return (
                  <span className="bwk__tide">
                    <svg viewBox="0 0 40 16" aria-hidden="true">
                      <path d={path} className="btide" />
                    </svg>
                    <span className="bwk__small num">{low === undefined ? '' : `L ${short(low.at)}`}</span>
                    <span className="bwk__small num">{high === undefined ? '' : `H ${short(high.at)}`}</span>
                  </span>
                )
              },
            ],
            [
              'Moon',
              (d: DayBrief) => (
                <span className={`bwk__moon${d.moon.full ? ' bwk__moon--full' : ''}`}>
                  <MoonGlyph phase={d.moon.phase} size={16} strong={d.moon.full} />
                </span>
              ),
            ],
          ] as [string, (d: DayBrief) => ReactNode][]
        ).map(([label, render]) => (
          <div key={label} className="bwk__row" role="row">
            <span className="bwk__label" role="rowheader">
              {label}
            </span>
            {days.map((d) => (
              <span key={d.iso} role="cell" className={`bwk__cell${d.index >= 2 ? ' bwk__cell--guess' : ''}${d.index === 2 ? ' bwk__cell--cut' : ''}${picked === d.iso ? ' bwk__cell--on' : ''}`}>
                {render(d)}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="bweek__legend">After the dashed line: guesses that change daily. Dots: how sure. Bright surf, teal dot: offshore. Wind amber at 12 kt, orange at 18.</p>
      <div className="bcard bbest">
        <p className="bbest__head">{pickedDay === null ? 'Best of the week' : `${dayName(pickedDay)} ${dayNum(pickedDay)}`}</p>
        {shown === null ? (
          <p className="bbest__line">{loading ? 'Reading the week…' : 'Nothing worth the trip in the forecast this week.'}</p>
        ) : (
          <>
            <p className="bbest__line">
              <span className="bbest__call">{shown.call ?? '—'}</span> {new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(shown.event)} {KIND_WORD[shown.kind].toLowerCase()} {clock(shown.event)}
            </p>
            <p className="bbest__why">{shown.why}</p>
          </>
        )}
        <p className="bbest__tip">Tap a day to see it here.</p>
      </div>
      <div className="bfoot__buttons">
        {shown === null ? null : (
          <>
            {(shown.kind === 'sunrise' ? wakeAt(shown.event) : remindAt(shown.event, shown.setUp)).getTime() <= now.getTime() ? null : <button type="button" className="bbtn" onClick={save}>
              Remind me {new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(shown.event)}
            </button>}
            <button type="button" className="bbtn bbtn--main" onClick={save}>
              Add to calendar
            </button>
          </>
        )}
      </div>
    </div>
  )
}
