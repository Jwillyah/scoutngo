import { useMemo, useState, type ReactNode } from 'react'
import { getMoonIllumination, getTimes } from 'suncalc'
import { moonTimesOnLocalDay } from '../core/moonTimes.ts'
import { findAlignments, targetAltitude, type AlignMode, type Body } from '../core/alignment.ts'
import { compassWord } from '../core/compassWords.ts'
import type { LatLon } from '../core/geo.ts'
import { rankNights, type MilkyWayNight } from '../core/milkyWay.ts'
import { nightSky, tonightMoment, type SkyThing } from '../core/nightSky.ts'
import { SEASON_NAME, seasonLines, type SeasonLine } from '../core/seasons.ts'
import { getSunArc, getSunPosition } from '../core/sun.ts'
import { formatClock } from '../core/timezone.ts'
import { SKY_TABS, type SkyTab } from '../lib/skyTab.ts'

/*
 * THE SKY, FIVE WAYS, PICTURE FIRST.
 *
 *   Tonight   a panorama of the night: moon, Milky Way core, the celestial
 *             pole, any meteor radiant near its peak
 *   Sun       today's sunrise, sunset and the sun now on a compass; find the
 *             days the sun sits behind a pin
 *   Moon      its phase as a disc, its rise and set; find the days the moon
 *             sits behind or on top of a pin
 *   Calendar  the next 30 nights ranked for the Milky Way, as bars
 *   Seasons   the year's sunrise and sunset bearings at this place
 *
 * Every position, time and score is from src/core; this only draws, and a
 * tap on a result jumps the time bar there.
 */
interface SkyCardProps {
  venue: LatLon
  timeZone: string
  timeZoneAbbr: string
  at: Date
  tab: SkyTab
  onTab: (tab: SkyTab) => void
  onJump: (at: Date) => void
  /** The pin to align with. Shared with the sun search. */
  target: LatLon | null
  picking: boolean
  onPickTarget: () => void
  /** The existing list of showers and moons, shown under the calendar. */
  events: ReactNode
  /** Opens the moonrise shot list. */
  onPlanMoonrise?: () => void
  /** The exposure playground, drawn on the Exposure page. */
  exposure?: ReactNode
  /** The Now screen: what the sky is doing where you are standing. It used to be its own menu item. */
  onOpenNow?: () => void
}

const DEG = Math.PI / 180

/* A compass rose of radius r at the centre, rays by bearing. */
function Compass({ rays, marks }: { rays: { bearing: number; cls: string; label?: string }[]; marks?: { bearing: number; altitude: number; cls: string }[] }) {
  const r = 70
  const at = (bearing: number, length: number) => [80 + Math.sin(bearing * DEG) * length, 80 - Math.cos(bearing * DEG) * length]
  return (
    <svg className="skyc__pic" viewBox="0 0 160 160" role="img" aria-label="Compass with the bearings below">
      <circle cx={80} cy={80} r={r} className="skyc__ring" />
      {['N', 'E', 'S', 'W'].map((l, i) => {
        const [x, y] = at(i * 90, r + 8)
        return (
          <text key={l} x={x} y={y + 3} textAnchor="middle" className="skyc__cardinal">
            {l}
          </text>
        )
      })}
      {rays.map((ray) => {
        const [x, y] = at(ray.bearing, r)
        return <line key={`${ray.cls}-${ray.bearing}`} x1={80} y1={80} x2={x} y2={y} className={ray.cls} />
      })}
      {(marks ?? []).map((m) => {
        /* Higher in the sky is nearer the centre. */
        const [x, y] = at(m.bearing, r * (1 - Math.max(0, m.altitude) / 90))
        return <circle key={m.cls} cx={x} cy={y} r={6} className={m.cls} />
      })}
    </svg>
  )
}

/* The night as a panorama: bearing across, height up. */
function Panorama({ things }: { things: SkyThing[] }) {
  const w = 320
  const h = 120
  const x = (az: number) => (az / 360) * w
  const y = (alt: number) => h - (Math.max(0, alt) / 90) * h
  return (
    <svg className="skyc__pic skyc__pic--wide" viewBox={`0 0 ${w} ${h + 16}`} role="img" aria-label="Tonight's sky, north to north, with the list below">
      <rect x={0} y={0} width={w} height={h} className="skyc__night" />
      <line x1={0} x2={w} y1={h} y2={h} className="skyc__horizon" />
      {['N', 'E', 'S', 'W', 'N'].map((l, i) => (
        <text key={`${l}-${i}`} x={(i * w) / 4} y={h + 13} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'} className="skyc__cardinal">
          {l}
        </text>
      ))}
      {things
        .filter((t) => t.altitude > 0)
        .map((t) => (
          <g key={t.name} transform={`translate(${x(t.azimuth)} ${y(t.altitude)})`} className={`skyc__thing skyc__thing--${t.kind}`}>
            {t.kind === 'moon' ? <circle r={7} opacity={0.35 + 0.65 * (t.illumination ?? 0)} /> : t.kind === 'core' ? <ellipse rx={12} ry={5} /> : t.kind === 'pole' ? <path d="M0 -6V6M-6 0H6" /> : <path d="M0 0l-9 -9M0 0l9 -9M0 0V-12" />}
          </g>
        ))}
    </svg>
  )
}

/* The moon's phase as a lit disc: the terminator is an ellipse whose width follows the lit fraction. */
function MoonDisc({ fraction, waxing }: { fraction: number; waxing: boolean }) {
  const r = 50
  const k = Math.abs(1 - 2 * fraction) * r
  const litRight = waxing
  const sweepOuter = litRight ? 1 : 0
  const sweepInner = fraction > 0.5 ? (litRight ? 1 : 0) : litRight ? 0 : 1
  const d = `M80 ${80 - r} A${r} ${r} 0 0 ${sweepOuter} 80 ${80 + r} A${k} ${r} 0 0 ${sweepInner} 80 ${80 - r}Z`
  return (
    <svg className="skyc__pic" viewBox="0 0 160 160" role="img" aria-label={`Moon ${Math.round(fraction * 100)} percent lit`}>
      <circle cx={80} cy={80} r={r} className="skyc__moondark" />
      <path d={d} className="skyc__moonlit" />
    </svg>
  )
}

function Finder({
  body,
  venue,
  target,
  picking,
  onPickTarget,
  onJump,
  clock,
  timeZone,
}: {
  body: Body
  venue: LatLon
  target: LatLon | null
  picking: boolean
  onPickTarget: () => void
  onJump: (at: Date) => void
  clock: (at: Date) => string
  timeZone: string
}) {
  const [mode, setMode] = useState<AlignMode>('set')
  const [heightText, setHeightText] = useState('')
  const height = Number(heightText)
  const results = useMemo(() => {
    if (target === null) return null
    if (mode === 'height' && !(height > 0)) return null
    return findAlignments({
      observer: venue,
      target,
      body,
      mode,
      ...(mode === 'height' ? { altitudeDeg: targetAltitude(venue, target, height) } : {}),
      from: new Date(),
      limit: 12,
    })
  }, [target, mode, height, body, venue])
  const name = body === 'sun' ? 'sun' : 'moon'
  return (
    <div className="skyc__finder">
      <p className="skyc__head">Find the {name} behind a pin</p>
      <div className="btn-row">
        <button type="button" className="btn btn--small" onClick={onPickTarget} aria-pressed={picking}>
          {picking ? 'Tap the map for the pin' : target === null ? 'Pick the pin' : 'Move the pin'}
        </button>
      </div>
      <div className="skyc__modes" role="group" aria-label="Which moment">
        {(['rise', 'set', 'height'] as const).map((m) => (
          <button key={m} type="button" className={`skyc__mode${mode === m ? ' skyc__mode--on' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
            {m === 'rise' ? 'Rising' : m === 'set' ? 'Setting' : 'On top of it'}
          </button>
        ))}
      </div>
      {mode === 'height' ? (
        <label className="field">
          <span className="field__label">How tall the thing at the pin is, in metres</span>
          <input className="input" inputMode="decimal" value={heightText} onChange={(e) => setHeightText(e.target.value)} />
        </label>
      ) : null}
      {results === null ? (
        <p className="skyc__note">{target === null ? 'Pick a pin on the map first.' : 'Give its height to search.'}</p>
      ) : results.length === 0 ? (
        <p className="skyc__note">The {name} does not line up with that pin in the next twelve months.</p>
      ) : (
        <ul className="skyc__list">
          {results.map((r) => (
            <li key={r.at.getTime()}>
              <button type="button" className="skyc__row" onClick={() => onJump(r.at)}>
                <span className="num">
                  {r.at.toLocaleDateString('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric' })} {clock(r.at)}
                </span>
                <span className="skyc__why num">
                  {Math.round(r.altitude)}° up, {r.offsetDegrees >= 0 ? '+' : ''}
                  {r.offsetDegrees.toFixed(1)}° off the pin
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SkyCard({ venue, timeZone, timeZoneAbbr, at, tab, onTab, onJump, target, picking, onPickTarget, events, onPlanMoonrise, onOpenNow, exposure }: SkyCardProps) {
  const clock = (d: Date) => `${formatClock(d, timeZone)}`
  const finderProps = { venue, target, picking, onPickTarget, onJump, clock, timeZone }

  const tonight = useMemo(() => {
    const when = tonightMoment(at, venue.lat, venue.lon)
    return { when, things: nightSky(when, venue.lat, venue.lon) }
  }, [at, venue])
  const nights = useMemo<MilkyWayNight[]>(() => (tab === 'calendar' ? rankNights(venue.lat, venue.lon, at, 30, timeZone) : []), [tab, venue, at, timeZone])
  const seasons = useMemo<SeasonLine[]>(() => (tab === 'seasons' ? seasonLines(at.getUTCFullYear(), venue.lat, venue.lon, at) : []), [tab, venue, at])

  const where = (t: SkyThing) =>
    t.altitude <= 0 ? 'below the horizon' : `${compassWord(t.azimuth)}, ${Math.round(t.altitude)}° up`

  let body: ReactNode = null
  if (tab === 'exposure') {
    body = exposure ?? null
  } else if (tab === 'tonight') {
    body = (
      <>
        {onOpenNow === undefined ? null : (
          <button type="button" className="btn btn--small skyc__now" onClick={onOpenNow}>
            Now, where I am
          </button>
        )}
        <Panorama things={tonight.things} />
        <p className="skyc__note num">Drawn for {clock(tonight.when)} {timeZoneAbbr}, the middle of tonight's dark.</p>
        <ul className="skyc__facts">
          {tonight.things.map((t) => (
            <li key={t.name}>
              <span className={`skyc__key skyc__key--${t.kind}`} aria-hidden="true" />
              <span>
                {t.name}: <span className="num">{where(t)}</span>
                {t.kind === 'moon' ? <span className="num">, {Math.round((t.illumination ?? 0) * 100)}% lit</span> : null}
                {t.kind === 'pole' && t.azimuth === 0 ? '. Polaris is within a degree of it.' : null}
              </span>
            </li>
          ))}
        </ul>
      </>
    )
  } else if (tab === 'sun') {
    const arc = getSunArc(at, venue.lat, venue.lon)
    const now = getSunPosition(at, venue.lat, venue.lon)
    const t = getTimes(at, venue.lat, venue.lon)
    body = (
      <>
        <Compass
          rays={[
            ...(arc.sunrise === null ? [] : [{ bearing: arc.sunrise.azimuth, cls: 'skyc__ray skyc__ray--rise' }]),
            ...(arc.sunset === null ? [] : [{ bearing: arc.sunset.azimuth, cls: 'skyc__ray skyc__ray--set' }]),
          ]}
          marks={now.altitude > 0 ? [{ bearing: now.azimuth, altitude: now.altitude, cls: 'skyc__sun' }] : []}
        />
        <dl className="skyc__facts skyc__facts--pairs num">
          <div><dt>Sunrise</dt><dd>{arc.sunrise === null ? '—' : `${clock(arc.sunrise.at)}, ${Math.round(arc.sunrise.azimuth)}°`}</dd></div>
          <div><dt>Golden hour</dt><dd>{t.goldenHour instanceof Date && !Number.isNaN(t.goldenHour.getTime()) ? `from ${clock(t.goldenHour)}` : '—'}</dd></div>
          <div><dt>Sunset</dt><dd>{arc.sunset === null ? '—' : `${clock(arc.sunset.at)}, ${Math.round(arc.sunset.azimuth)}°`}</dd></div>
          <div><dt>Now on the bar</dt><dd>{now.altitude > 0 ? `${compassWord(now.azimuth)}, ${Math.round(now.altitude)}° up` : 'below the horizon'}</dd></div>
        </dl>
        <Finder body="sun" {...finderProps} />
      </>
    )
  } else if (tab === 'moon') {
    const ill = getMoonIllumination(at)
    const times = moonTimesOnLocalDay(at, venue.lat, venue.lon, timeZone)
    const ok = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime())
    body = (
      <>
        <MoonDisc fraction={ill.fraction} waxing={ill.phase < 0.5} />
        <dl className="skyc__facts skyc__facts--pairs num">
          <div><dt>Lit</dt><dd>{Math.round(ill.fraction * 100)}%, {ill.phase < 0.5 ? 'growing' : 'shrinking'}</dd></div>
          <div><dt>Moonrise</dt><dd>{ok(times.rise) ? clock(times.rise) : 'not today'}</dd></div>
          <div><dt>Moonset</dt><dd>{ok(times.set) ? clock(times.set) : 'not today'}</dd></div>
        </dl>
        {onPlanMoonrise === undefined ? null : (
          <button type="button" className="btn btn--small skyc__moonrise" onClick={onPlanMoonrise}>
            Plan this moonrise
          </button>
        )}
        <Finder body="moon" {...finderProps} />
      </>
    )
  } else if (tab === 'calendar') {
    const best = Math.max(1, ...nights.map((n) => n.score))
    const byDate = [...nights].sort((a, b) => a.date.localeCompare(b.date))
    body = (
      <>
        <p className="skyc__head">Milky Way, the next 30 nights</p>
        <ol className="skyc__bars" aria-label="Nights by date, the bar is the score">
          {byDate.map((n) => (
            <li key={n.date}>
              <button
                type="button"
                className="skyc__bar"
                disabled={n.window === null}
                onClick={() => (n.window === null ? undefined : onJump(n.window.from))}
                aria-label={`${n.date}: score ${n.score}. ${n.reason}`}
              >
                <span className="skyc__bardate num">{n.date.slice(5)}</span>
                <span className="skyc__barfill" style={{ width: `${(n.score / best) * 100}%` }} />
                <span className="skyc__barscore num">{n.score}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="skyc__note">
          Dark means the sun 18° or more down, the core at least 5° up, and the moon down or under half lit. Tap a night to put the time bar on its first good minute.
        </p>
        {nights[0] === undefined ? null : (
          <p className="skyc__note">
            Best: <span className="num">{nights[0].date}</span>. {nights[0].reason}
          </p>
        )}
        {/* The showers and moons for 90 days, folded: the 30 bars are this page's picture. */}
        <details className="skyc__more">
          <summary className="skyc__head">Showers and moons, next 90 days</summary>
          {events}
        </details>
      </>
    )
  } else {
    body = (
      <>
        <Compass
          rays={seasons.flatMap((s) => [
            ...(s.sunrise === null ? [] : [{ bearing: s.sunrise, cls: `skyc__ray skyc__ray--${s.day}` }]),
            ...(s.sunset === null ? [] : [{ bearing: s.sunset, cls: `skyc__ray skyc__ray--${s.day}` }]),
          ])}
        />
        <dl className="skyc__facts skyc__facts--pairs num">
          {seasons.map((s) => (
            <div key={s.day}>
              <dt>
                <span className={`skyc__key skyc__key--${s.day}`} aria-hidden="true" /> {SEASON_NAME[s.day]}
                {s.day === 'today' ? null : `, ${s.date.toLocaleDateString('en-GB', { timeZone, day: 'numeric', month: 'short' })}`}
              </dt>
              <dd>
                rises {s.sunrise === null ? '—' : `${Math.round(s.sunrise)}°`}, sets {s.sunset === null ? '—' : `${Math.round(s.sunset)}°`}
              </dd>
            </div>
          ))}
        </dl>
      </>
    )
  }

  return (
    <div className="skyc">
      <div className="skyc__tabs" role="tablist" aria-label="Sky">
        {SKY_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`skyc__tab${tab === t.id ? ' skyc__tab--on' : ''}`} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">{body}</div>
    </div>
  )
}
