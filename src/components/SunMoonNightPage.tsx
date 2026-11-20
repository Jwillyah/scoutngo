import '../styles/sky.css'
import '../styles/sky-sun-moon.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { compassPoint } from '../core/field.ts'
import type { LatLon } from '../core/geo.ts'
import { colorWords } from '../core/homeDay.ts'
import { localDate } from '../core/moonTimes.ts'
import { skyCallNow } from '../core/skyCall.ts'
import { eventDayWord } from '../core/skyPage.ts'
import {
  bigMoonriseLine,
  darkestNights,
  dayFromNow,
  dayRangeWords,
  dayWords,
  milkyWayLine,
  moonFortnight,
  moonTonight,
  nextBigMoonrise,
  nextShower,
  nightHeroWords,
  nightRead,
  northStarWords,
  opensOn,
  sunHero,
  sunHeightWords,
  sunHeroLine,
  sunsetGapWords,
  sunStrip,
  sunTonight,
  weekdayWord,
  type SmnTab,
  type TimelineRow,
} from '../core/sunMoonNight.ts'
import { milkyWayNight } from '../core/milkyWay.ts'
import { formatClock } from '../core/timezone.ts'
import { moonPhaseName } from '../lib/moonGlyph.ts'
import { useBriefing } from '../lib/useBriefing.ts'
import { MoonGlyph } from './MoonGlyph.tsx'
import { PageShell } from './PageShell.tsx'
import { SkyPage } from './SkyPage.tsx'
import { SKY_SUN_MOON_NIGHT_PAGE } from '../config/flags.ts'

/*
 * SUN · MOON · NIGHT (Batch DRONE, Section 4; boards SkySun, SkyMoon, SkyB2n),
 * in Look D, with the Sky page's pills. Opened from the Sky page's "Sun, moon,
 * night ›" and the home's Moon card. Every number is src/core/sunMoonNight.ts's,
 * held to a second ephemeris in its tests; this file draws.
 *
 *   Sun    the light now and how long it lasts, the sun's path; tonight's
 *          golden, sunset, blue hour, dark and moonrise; the Milky Way line;
 *          the next sunrise
 *   Moon   the phase drawn large, its rise, where and how lit; tonight's rise,
 *          highest and set; the next 14 evenings; the darkest nights; the next
 *          big moonrise and its plan (the map's Moonrise card)
 *   Night  the moon now, the Milky Way, the darkest window, the North Star,
 *          what comes next, the next meteor shower
 */
interface Props {
  venue: LatLon
  placeName: string
  timeZone: string
  now: Date
  /** Which tab it opens on; without one, the night's in the dark, else the sun's. */
  initial?: SmnTab
  onBack: () => void
  onMap?: () => void
  /** The map's Moonrise card (src/components/MoonriseCard.tsx), its plan for the next full moon. */
  onPlanMoonrise?: () => void
}

const TABS: { id: SmnTab; label: string }[] = [
  { id: 'sun', label: 'Sun' },
  { id: 'moon', label: 'Moon' },
  { id: 'night', label: 'Night' },
]

/** A small compass: north tick and a needle on the bearing. */
export function MiniCompass({ bearing, kind }: { bearing: number; kind: 'sun' | 'moon' }) {
  const r = (bearing * Math.PI) / 180
  return (
    <svg className={`smn__compass smn__compass--${kind}`} viewBox="0 0 28 28" role="img" aria-label={`toward the ${compassPoint(bearing)}`}>
      <circle cx="14" cy="14" r="12" className="smn__compass-ring" />
      <line x1="14" y1="2" x2="14" y2="5" className="smn__compass-n" />
      <line x1="14" y1="14" x2={14 + Math.sin(r) * 9} y2={14 - Math.cos(r) * 9} className="smn__compass-needle" />
    </svg>
  )
}

export function SunView({ venue, timeZone, now, sunsetCall, sunriseCall }: { venue: LatLon; timeZone: string; now: Date; sunsetCall: string | null; sunriseCall: string | null }) {
  const clock = (d: Date) => formatClock(d, timeZone)
  const hero = sunHero(now, venue.lat, venue.lon)
  const strip = sunStrip(now, venue.lat, venue.lon)
  const tonight = sunTonight(now, venue.lat, venue.lon, timeZone)
  const mw = tonight.date === null ? null : milkyWayNight(tonight.date, venue.lat, venue.lon, timeZone)
  const tonightWord = tonight.sunset === null ? 'Tonight' : eventDayWord(tonight.sunset, 'sunset', now, timeZone)
  const sunriseWord = tonight.sunrise === null ? 'Tomorrow' : eventDayWord(tonight.sunrise.at, 'sunrise', now, timeZone)
  const W = 300
  const H = 110
  return (
    <>
      <section className="dcard smn__hero smn__hero--sun" aria-label="The light now">
        <p className="dcard__label smn__kicker num">Right now · {clock(now)}</p>
        <p className="smn__title" data-phase={hero.phase}>{hero.word}</p>
        <p className="smn__line num">{sunHeroLine(hero, clock, now) || 'The sun does not rise or set here today.'}</p>
        <svg className="smn__strip" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The sun's path round now, ${compassPoint(hero.azimuth)}`}>
          <line x1="0" x2={W} y1={strip.horizonY * H} y2={strip.horizonY * H} className="smn__strip-horizon" />
          {strip.ticks.map((t) => (
            <text key={t.label} x={t.x * W} y={Math.min(H - 2, strip.horizonY * H + 14)} textAnchor="middle" className="smn__strip-tick">
              {t.label}
            </text>
          ))}
          <polyline points={strip.path.map((p) => `${(p.x * W).toFixed(1)},${(p.y * H).toFixed(1)}`).join(' ')} className="smn__strip-path" />
          <circle cx={strip.sun.x * W} cy={strip.sun.y * H} r="7" className="smn__strip-sun" />
        </svg>
        <p className="smn__chips">
          <span className="smn__chip num">{sunHeightWords(hero.altitude)}</span>
          {sunsetCall === null ? null : <span className="smn__chip">{sunsetCall}</span>}
        </p>
      </section>

      <section className="smn__section" aria-label={tonightWord}>
        <p className="dcard__label smn__head">{tonightWord}</p>
        {tonight.rows.length === 0 ? (
          <p className="smn__none">The sun does not set here tonight.</p>
        ) : (
          <ol className="smn__rows">
            {tonight.rows.map((r) => (
              <TimelineItem key={`${r.kind}${r.at.getTime()}`} row={r} clock={clock} />
            ))}
          </ol>
        )}
        {mw === null ? null : <p className="smn__note">{milkyWayLine(mw, clock)}</p>}
      </section>

      {tonight.sunrise === null ? null : (
        <section className="smn__section" aria-label={sunriseWord}>
          <p className="dcard__label smn__head">{sunriseWord}</p>
          <div className="dcard smn__card">
            <span className="smn__card-icon smn__card-icon--rise" aria-hidden="true" />
            <span className="smn__card-text">
              <b className="num">
                Sunrise {clock(tonight.sunrise.at)} · {compassPoint(tonight.sunrise.azimuth)}
              </b>
              {sunriseCall === null ? null : <span>{sunriseCall}</span>}
            </span>
            <MiniCompass bearing={tonight.sunrise.azimuth} kind="sun" />
          </div>
        </section>
      )}
    </>
  )
}

function TimelineItem({ row, clock }: { row: TimelineRow; clock: (d: Date) => string }) {
  return (
    <li className={`smn__row smn__row--${row.state}`} data-kind={row.kind}>
      <span className="smn__time num">{clock(row.at)}</span>
      <span className={`smn__dot smn__dot--${row.kind}`} aria-hidden="true" />
      <span className="smn__what">
        {row.label}
        {row.lit === null ? '' : ` · ${Math.round(row.lit * 100)}%`}
      </span>
      {row.azimuth === null ? <span /> : <MiniCompass bearing={row.azimuth} kind={row.kind === 'moonrise' ? 'moon' : 'sun'} />}
    </li>
  )
}

export function MoonView({ venue, timeZone, now, onPlanMoonrise }: { venue: LatLon; timeZone: string; now: Date; onPlanMoonrise?: () => void }) {
  const clock = (d: Date) => formatClock(d, timeZone)
  const m = moonTonight(now, venue.lat, venue.lon, timeZone)
  const days = moonFortnight(now, timeZone)
  const dark = darkestNights(now, timeZone)
  const big = nextBigMoonrise(now, venue.lat, venue.lon, timeZone)
  const today = localDate(now, timeZone)
  const dayOf = (d: Date) => (localDate(d, timeZone) === today ? '' : ` · ${weekdayWord(localDate(d, timeZone))}`)
  const pct = Math.round(m.lit * 100)
  return (
    <>
      <section className="dcard smn__hero smn__hero--moon" aria-label="The moon">
        <div className="smn__heroText">
          <p className="dcard__label smn__kicker">{m.up ? 'Up now' : m.rise === null ? 'The moon' : dayFromNow(m.rise.at, now, timeZone)}</p>
          <p className="smn__title num">{m.up ? (m.set === null ? 'Up all night' : `Sets ${clock(m.set.at)}`) : m.rise === null ? 'No moonrise' : `Rises ${clock(m.rise.at)}`}</p>
          <p className="smn__line num">
            {m.up ? (m.set === null ? '' : `${compassPoint(m.set.azimuth)} · `) : m.rise === null ? '' : `${compassPoint(m.rise.azimuth)} · `}
            {pct}% lit
          </p>
          <p className="smn__phase">{moonPhaseName(m.phase)}</p>
        </div>
        <span className="smn__bigmoon">
          <MoonGlyph phase={m.phase} size={96} strong />
        </span>
        <p className="smn__chips">
          {m.up || m.afterSunsetMin === null ? null : <span className="smn__chip num">{sunsetGapWords(m.afterSunsetMin)}</span>}
          <span className="smn__chip">{m.bright ? 'Too bright for the Milky Way' : 'Under half lit'}</span>
        </p>
      </section>

      <section className="smn__section" aria-label="Tonight's moon">
        <p className="dcard__label smn__head">Tonight&rsquo;s moon</p>
        <ol className="smn__rows">
          {m.rise === null ? null : (
            <li className={`smn__row smn__row--${m.up ? 'past' : 'next'}`}>
              <span className="smn__time num">{clock(m.rise.at)}</span>
              <span className="smn__dot smn__dot--moonrise" aria-hidden="true" />
              <span className="smn__what">Moonrise{dayOf(m.rise.at)}</span>
              <MiniCompass bearing={m.rise.azimuth} kind="moon" />
            </li>
          )}
          {m.highest === null ? null : (
            <li className="smn__row smn__row--next">
              <span className="smn__time num">{clock(m.highest.at)}</span>
              <span className="smn__dot smn__dot--moon" aria-hidden="true" />
              <span className="smn__what num">
                Highest · {Math.round(m.highest.altitude)}° up{dayOf(m.highest.at)}
              </span>
              <MiniCompass bearing={m.highest.azimuth} kind="moon" />
            </li>
          )}
          {m.set === null ? null : (
            <li className="smn__row smn__row--next">
              <span className="smn__time num">{clock(m.set.at)}</span>
              <span className="smn__dot smn__dot--moon" aria-hidden="true" />
              <span className="smn__what">Moonset{dayOf(m.set.at)}</span>
              <MiniCompass bearing={m.set.azimuth} kind="moon" />
            </li>
          )}
        </ol>
      </section>

      <section className="smn__section" aria-label="The next two weeks">
        <p className="dcard__label smn__head">Next 2 weeks</p>
        <ol className="smn__phases">
          {days.map((d) => (
            <li key={d.date} className="smn__phaseday">
              <span>{weekdayWord(d.date)}</span>
              <MoonGlyph phase={d.phase} size={28} />
              <span className="num">{Math.round(d.lit * 100)}%</span>
            </li>
          ))}
        </ol>
        {dark === null ? null : (
          <p className="smn__note smn__note--dark">
            Darkest nights {dayRangeWords(dark.from, dark.to)} · new moon {dayWords(localDate(dark.newMoon, timeZone))}
          </p>
        )}
      </section>

      {big === null ? null : (
        <section className="dcard smn__big" aria-label="Next big moonrise">
          <span className="smn__bigglyph" aria-hidden="true">
            <MoonGlyph phase={0.5} size={44} />
          </span>
          <span className="smn__card-text">
            <span className="dcard__label">Next big moonrise</span>
            <b>{dayWords(big.date)} · full moon</b>
            <span className="num">{bigMoonriseLine(big, clock)}</span>
          </span>
          {onPlanMoonrise === undefined ? null : (
            <button type="button" className="btn btn--primary smn__plan" onClick={onPlanMoonrise}>
              Plan
            </button>
          )}
        </section>
      )}
    </>
  )
}

export function NightView({ venue, timeZone, now }: { venue: LatLon; timeZone: string; now: Date }) {
  const clock = (d: Date) => formatClock(d, timeZone)
  const n = nightRead(now, venue.lat, venue.lon, timeZone)
  const words = nightHeroWords(n)
  const shower = nextShower(now, timeZone)
  const next = n.next[0] ?? null
  return (
    <>
      <section className="dcard smn__hero smn__hero--night" aria-label="The night">
        <div className="smn__heroText">
          <p className="dcard__label smn__kicker num">{n.isNow ? `Now · ${clock(now)}` : `Tonight · dark ${clock(n.at)}`}</p>
          <p className="smn__title num">{words.title}</p>
          <p className="smn__line num">{words.line}</p>
        </div>
        <span className="smn__bigmoon smn__bigmoon--small">
          <MoonGlyph phase={n.moon.phase} size={64} />
        </span>
        <p className="smn__chips">
          {n.nextGolden === null ? null : <span className="smn__chip num">Next golden: {clock(n.nextGolden)}</span>}
        </p>
      </section>

      <section className="dcard smn__facts" aria-label="Tonight's sky">
        <dl className="smn__dl">
          <div className="smn__fact">
            <dt>Next</dt>
            <dd className="num">{next === null ? '—' : `${next.label} ${clock(next.at)}`}</dd>
          </div>
          <div className="smn__fact">
            <dt>Moon</dt>
            <dd className="num">
              {n.moon.up ? 'up' : 'down'} · {Math.round(n.moon.lit * 100)}% lit
            </dd>
          </div>
          <div className="smn__fact">
            <dt>Milky Way</dt>
            <dd className="num">{n.milkyWay.window === null ? 'no, not tonight' : `yes, ${clock(n.milkyWay.window.from)}–${clock(n.milkyWay.window.to)}`}</dd>
          </div>
          <div className="smn__fact">
            <dt>Darkest</dt>
            <dd className="num">{n.darkest === null ? 'no full dark with the moon down' : `${clock(n.darkest.from)}–${clock(n.darkest.to)}, moon down`}</dd>
          </div>
          <div className="smn__fact">
            <dt>North Star</dt>
            <dd className="num">{northStarWords(n.north)}</dd>
          </div>
          <div className="smn__fact">
            <dt>Meteors</dt>
            <dd className="num">{shower === null ? '—' : `${shower.shower.name} · nights of ${dayRangeWords(shower.nights[0], shower.nights[1])} · moon ${Math.round(shower.lit * 100)}% lit`}</dd>
          </div>
        </dl>
      </section>
      {n.milkyWay.window === null ? <p className="smn__note">{milkyWayLine(n.milkyWay, clock)}</p> : null}
      {n.next.length > 1 ? (
        <section className="smn__section" aria-label="Coming up">
          <p className="dcard__label smn__head">Coming up</p>
          <ol className="smn__rows">
            {n.next.slice(0, 6).map((e) => (
              <li key={`${e.kind}${e.at.getTime()}`} className="smn__row smn__row--next">
                <span className="smn__time num">{clock(e.at)}</span>
                <span className={`smn__dot smn__dot--${e.kind === 'moonrise' || e.kind === 'moonset' ? 'moon' : e.kind === 'golden' ? 'golden' : 'dark'}`} aria-hidden="true" />
                <span className="smn__what">{e.label}</span>
                <span />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  )
}

/*
 * FOLDED INTO THE SKY PAGE (Batch SIMPLE-2, Section 4): with
 * SKY_SUN_MOON_NIGHT_PAGE off (src/config/flags.ts) a call that opens this
 * page opens Sky › Night instead (the home's Moon tile); the old page is
 * below, whole, and comes back with the flag.
 */
export function SunMoonNightPage(props: Props) {
  if (SKY_SUN_MOON_NIGHT_PAGE) return <SunMoonNightPageOld {...props} />
  const { venue, placeName, timeZone, now, onBack, onMap } = props
  return <SkyPage venue={venue} placeName={placeName} timeZone={timeZone} now={now} onBack={onBack} onMap={onMap} onCalendar={() => undefined} initialTab="night" />
}

export function SunMoonNightPageOld({ venue, placeName, timeZone, now, initial, onBack, onMap, onPlanMoonrise }: Props) {
  const brief = useBriefing(venue, timeZone, now, true)
  const opened = useMemo(() => initial ?? opensOn(sunHero(now, venue.lat, venue.lon).phase), [initial, now, venue])
  const [picked, setPicked] = useState<SmnTab | null>(null)
  const tab = picked ?? opened
  /*
   * Batch FIX, Section 5.2: the three are swipe pages, as the Sky and Drone
   * pages' (a snapping row, the pill naming the page in view); a tap on the
   * pill slides to its page.
   */
  const track = useRef<HTMLDivElement>(null)
  const index = (t: SmnTab) => TABS.findIndex((x) => x.id === t)
  const go = (t: SmnTab) => {
    setPicked(t)
    const el = track.current
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
    if (el !== null) el.scrollTo({ left: index(t) * el.clientWidth, behavior: still ? 'auto' : 'smooth' })
  }
  useEffect(() => {
    const el = track.current
    if (el === null) return
    el.scrollLeft = index(tab) * el.clientWidth
    const onScroll = () => {
      const t = TABS[Math.round(el.scrollLeft / Math.max(1, el.clientWidth))]?.id
      if (t !== undefined) setPicked(t)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const callWord = (k: 'sunset' | 'sunrise') => colorWords(skyCallNow(brief.days, now, venue, k)?.call ?? null)
  const how = (
    <>
      <p>The light: the sun&rsquo;s height, golden from +6°, blue hour from −4°, dark from −6°, as on the Sky page. Sunrise and sunset are the sun&rsquo;s centre at −0.833°.</p>
      <p>The moon: rise and set on this place&rsquo;s own day, the upper limb on the horizon; % lit is the share of the disc the sun lights. Darkest nights: the moon under 20% lit at midnight.</p>
      <p>Every time here is worked twice, by suncalc and by a second ephemeris written from Meeus, and the two are held within 5 minutes in the app&rsquo;s tests.</p>
      <p>The Milky Way: the core 5° up with the sun 18° down and the moon down or under half lit. Meteor showers: the International Meteor Organization&rsquo;s peak dates, the night before and the night of.</p>
    </>
  )
  return (
    <PageShell kind="spage smn" title="Sun · Moon · Night" sub={`${placeName} · ${dayWords(localDate(now, timeZone))}`} ground="night" onBack={onBack} onMap={onMap} how={how} footInScroll>
      <div className="ui-seg spage__seg smn__seg" role="tablist" aria-label="Sun, moon or night">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ui-seg__opt${tab === t.id ? ' ui-seg__opt--on' : ''}`} onClick={() => go(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="smn__track" ref={track} data-sideways>
        <section className="smn__page" aria-label="Sun" data-smn-page="sun" aria-hidden={tab !== 'sun'}>
          <SunView venue={venue} timeZone={timeZone} now={now} sunsetCall={callWord('sunset')} sunriseCall={callWord('sunrise')} />
        </section>
        <section className="smn__page" aria-label="Moon" data-smn-page="moon" aria-hidden={tab !== 'moon'}>
          <MoonView venue={venue} timeZone={timeZone} now={now} onPlanMoonrise={onPlanMoonrise} />
        </section>
        <section className="smn__page" aria-label="Night" data-smn-page="night" aria-hidden={tab !== 'night'}>
          <NightView venue={venue} timeZone={timeZone} now={now} />
        </section>
      </div>
    </PageShell>
  )
}
