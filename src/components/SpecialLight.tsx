import { packRow } from '../core/weekRow.ts'
import { useEffect, useMemo, useState } from 'react'
import { getPosition, getTimes } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { nextEvents } from '../core/skyFire.ts'
import { fireVerdict, lookWindow } from '../core/fireOutlook.ts'
import { byDay, SPECIAL_NAME, type Special } from '../core/specialLight.ts'
import { formatClock, writeClock, zoneOffsetMs } from '../core/timezone.ts'
import { fetchFirePaths, nearestHour, pathsAt } from '../lib/skyFireData.ts'
import { fetchGlassWeek, fetchSpecialWeek, specialsFrom } from '../lib/specialLightData.ts'
import { specialName, type Place } from '../lib/placeGroups.ts'

/*
 * SPECIAL LIGHT THIS WEEK (Sky › Special): fog, rainbows, god rays from the
 * rules in src/core/specialLight.ts, and the next Sky fire, in time order.
 * A rainbow can be shown on the map, as the bow's arc opposite the sun.
 *
 * BY DAY, SHORT (1 Nov): the same god rays every morning made a long list.
 * Today, Tomorrow, then weekdays; one line an item; overlapping windows of a
 * kind merged; at most three a day, the most likely first (src/core/
 * specialLight.ts byDay). Under half the models: greyed, under Long shots.
 * The why of whatever is on now is the line above the list.
 */
interface Props {
  venue: LatLon
  timeZone: string
  at: Date
  /** Show a rainbow's bow on the map (null clears it). */
  onShowBow?: (s: Special | null) => void
  /** Jump the app to a time. */
  onJump?: (at: Date) => void
  /** Coast or inland (src/lib/placeGroups.ts): glassy water only at the coast, fog is valley fog inland. */
  place?: Place
}

const isoDay = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const weekday = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d)

export function SpecialLight({ venue, timeZone, onShowBow, onJump, place }: Props) {
  const key = `${venue.lat},${venue.lon}`
  const [answer, setAnswer] = useState<{ key: string; list: Special[] | null; asked: number } | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      const week = await fetchSpecialWeek(venue)
      const list = week === null ? null : specialsFrom(week.week, venue, week.seaCAt)
      /* Sky fire, the next sunrise and sunset, as its own verdict (src/core/skyFire.ts). */
      const events = nextEvents(new Date(), venue)
      const fires: Special[] = []
      for (const kind of ['sunrise', 'sunset'] as const) {
        const event = events[kind]
        if (event === null) continue
        const data = await fetchFirePaths(venue, getPosition(event, venue.lat, venue.lon).azimuth, event.toISOString().slice(0, 10))
        const paths = data === null ? [] : pathsAt(data, nearestHour(event))
        const v = paths.length === 0 ? null : fireVerdict(paths, { event, kind, venue })
        /* The window is the colour clock's glow, the same arithmetic as the verdict (src/core/fireOutlook.ts). */
        const w = v === null ? null : lookWindow(v)
        if (v !== null && v.word !== 'unlikely' && w !== null) {
          fires.push({ kind: 'fire', from: w.from, to: w.to, agree: v.agree, of: v.of, word: v.word, why: `At ${kind}: cloud to light and a way in for the light, by Sky fire’s three checks.` })
        }
      }
      /* Glassy water is a coast thing: not asked inland. */
      const glass = place === 'inland' ? [] : await fetchGlassWeek(venue, new Date()).catch(() => [])
      const extra = [...fires, ...glass]
      if (live) setAnswer({ key, asked: Date.now(), list: list === null ? (extra.length === 0 ? null : extra) : [...list, ...extra].sort((a, b) => a.from.getTime() - b.from.getTime()) })
    })()
    return () => {
      live = false
    }
  }, [venue, key, place])
  const list = answer === null || answer.key !== key ? 'loading' : answer.list
  /* Both ends with AM or PM: a bare "5:00" is a time on the wrong clock to half the day (scripts/audit-clock.mjs). */
  const span = (a: Date, b: Date) => `${formatClock(a, timeZone)}–${formatClock(b, timeZone)}`
  const name = (s: Special) => (s.kind === 'fog' ? specialName('fog', place) : SPECIAL_NAME[s.kind])
  const days = useMemo(() => (list === 'loading' || list === null ? [] : byDay(list, (d) => isoDay(d, timeZone))), [list, timeZone])
  /* Today as of when the list was read, not as of each render. */
  const asked = answer?.asked ?? 0
  const today = isoDay(new Date(asked), timeZone)
  const tomorrow = isoDay(new Date(asked + 86_400_000), timeZone)
  const dayName = (day: string, sample: Date) => (day === today ? 'Today' : day === tomorrow ? 'Tmrw' : weekday(sample, timeZone))
  const [bow, setBow] = useState<string | null>(null)
  const [how, setHow] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const idOf = (s: Special) => `${s.kind}-${s.from.getTime()}`
  /* Seven rows from today, each with its own sunrise and sunset; the items on it, strong and long shots alike. */
  const rows = useMemo(() => {
    if (asked === 0) return []
    return Array.from({ length: 7 }, (_, i) => {
      const noon = new Date(asked + i * 86_400_000)
      const day = isoDay(noon, timeZone)
      const t = getTimes(noon, venue.lat, venue.lon)
      const d = days.find((x) => x.day === day)
      const items = [...(d?.items ?? []).map((s) => ({ s, long: false })), ...(d?.longShots ?? []).map((s) => ({ s, long: true }))].sort((a, b) => a.s.from.getTime() - b.s.from.getTime())
      return { day, sample: noon, sunrise: t.sunrise, sunset: t.sunset, items: weekLanes(items.map((x) => ({ ...x, at: (localMinutes(x.s.from, timeZone) + localMinutes(x.s.to, timeZone, true)) / 2 }))) }
    })
  }, [asked, days, timeZone, venue])
  const all = rows.flatMap((r) => r.items.map((x) => x.s))
  const sel = all.find((s) => idOf(s) === picked) ?? null
  const pct = (minutes: number) => `${(Math.max(0, Math.min(1440, minutes)) / 1440) * 100}%`

  return (
    <div className="spec">
      <div className="spec__top">
        <h3 className="spec__title">This week</h3>
        <button type="button" className="spec__i" aria-label="How these are found" aria-expanded={how} onClick={() => setHow((v) => !v)}>
          i
        </button>
      </div>
      {!how ? null : <div className="spec__how">{/* The "i" sits by the heading now (Batch H, 2 Nov: it floated alone under the list). */}
        <p>Tap an icon for its window. Greyed: under half the models.</p>
        <p>
          Only windows you can shoot through, two hours at most, tied to their cause hour by hour. Fog: dew point within 2°F of the air, wind under 6 kt, and the sea colder than the air (inland, radiation fog: no sea term); said where it forms or lifts in the light, not the night it sits through. Rainbow: showers within 25 km on the side opposite the sun, the sun up but under 42° and not hidden by low cloud; the bow is 42° round the point opposite the sun. God rays: low cloud 30–80% (scattered to broken) with the sun up to 25° behind it. Iridescence: thin mid or high cloud, 10–60%, with little low cloud and the sun up 5° or more; look within about 10° of the sun. Sky fire: its own three checks, its glow. Glassy water: a low tide within 90 minutes of sunrise and a light wind, as on the Tide sheet. The rest: the best two hours of each run, the most models first, then the lower sun. Five models (GFS, ECMWF, ICON, GEM, HRRR); “likely” when 60% or more agree at the best hour; on the map only when half or more agree. A rule, not a promise: on 10 Mar 2026 the fog rule fired at Norfolk and no fog came.
        </p>
      </div>}
      {list === 'loading' ? (
        <p className="spec__note">Reading five forecasts for the week…</p>
      ) : list === null ? (
        <p className="spec__note">The week’s forecast did not arrive, so there is nothing to look through.</p>
      ) : (
        <>
          {/*
            * THE WEEK AS A PICTURE (Batch G, Section 5): one row a day, a 24 h
            * track with the night shaded and sunrise and sunset marked, and an
            * icon on the hours each thing happens. Fewer than half the models:
            * greyed. Tap one for one line, and Go there.
            */}
          <ol className="wk" aria-label="Special light this week, hour by hour">
            {rows.map((r) => {
              /* Batch J, Section 8: one row a day, icons only; a thing at the same hour as another sits beside it, not under. */
              const lanes = 1
              const placed = packRow(r.items.map((x) => x.at / 14.4))
              const rise = r.sunrise instanceof Date && !Number.isNaN(r.sunrise.getTime()) ? localMinutes(r.sunrise, timeZone) : null
              const set = r.sunset instanceof Date && !Number.isNaN(r.sunset.getTime()) ? localMinutes(r.sunset, timeZone) : null
              return (
                <li key={r.day} className="wk__day">
                  <span className="wk__name">{dayName(r.day, r.sample)}</span>
                  <div className="wk__track" style={{ height: `${lanes * 44}px` }}>
                    {rise === null ? null : <span className="wk__night" style={{ left: 0, width: pct(rise) }} />}
                    {set === null ? null : <span className="wk__night" style={{ left: pct(set), right: 0 }} />}
                    {rise === null ? null : <span className="wk__sun" style={{ left: pct(rise) }} aria-hidden="true" />}
                    {set === null ? null : <span className="wk__sun" style={{ left: pct(set) }} aria-hidden="true" />}
                    {r.items.map(({ s, long }, k) => (
                      <button
                        key={idOf(s)}
                        type="button"
                        className={`wk__icon wk__icon--${s.kind}${long ? ' wk__icon--long' : ''}${picked === idOf(s) ? ' wk__icon--on' : ''}`}
                        style={{ left: `${placed[k]}%`, top: 0 }}
                        aria-pressed={picked === idOf(s)}
                        aria-label={`${name(s)} ${s.word}, ${dayName(r.day, r.sample)} ${span(s.from, s.to)}, ${s.agree} of ${s.of} models`}
                        onClick={() => setPicked(picked === idOf(s) ? null : idOf(s))}
                      >
                        <SpecialIcon kind={s.kind} />
                      </button>
                    ))}
                  </div>
                  {sel === null || !r.items.some((x) => x.s === sel) ? null : (
                    <div className="wk__detail" role="status">
                  <p className="wk__line">
                    <b>
                      {name(sel)} {sel.word}
                    </b>{' '}
                    {weekday(sel.from, timeZone)} {span(sel.from, sel.to)} · {sel.agree} of {sel.of} models · {sel.why}
                  </p>
                  <div className="btn-row">
                    <button type="button" className="btn btn--small" onClick={() => onJump?.(sel.from)}>
                      Go there
                    </button>
                    {sel.kind === 'rainbow' && onShowBow !== undefined ? (
                      <button
                        type="button"
                        className="btn btn--small btn--quiet"
                        aria-pressed={bow === idOf(sel)}
                        onClick={() => {
                          const next = bow === idOf(sel) ? null : idOf(sel)
                          setBow(next)
                          onShowBow(next === null ? null : sel)
                        }}
                      >
                        {bow === idOf(sel) ? 'Hide the bow' : 'Show the bow'}
                      </button>
                    ) : null}
                  </div>
                </div>
                  )}
                </li>
              )
            })}
          </ol>
          <p className="wk__axis num" aria-hidden="true">
            {[0, 6, 12, 18, 0].map((h, i) => (
              <span key={i}>{writeClock(h, 0)}</span>
            ))}
          </p>
          {sel === null && all.length === 0 ? <p className="spec__note">Nothing special in the forecast this week by these rules.</p> : null}
        </>
      )}
    </div>
  )
}

/* Minutes since local midnight in the venue's zone; `end` reads midnight as 1440, the end of the day. */
function localMinutes(d: Date, timeZone: string, end = false): number {
  const m = Math.floor((((d.getTime() + zoneOffsetMs(d, timeZone)) % 86_400_000) + 86_400_000) % 86_400_000 / 60_000)
  return end && m === 0 ? 1440 : m
}

/* Icons closer than a 44 px target on a ~300 px track (about 3 h) go on the next lane down. */
const LANE_MIN = 210
function weekLanes<T extends { at: number }>(items: T[]): (T & { lane: number })[] {
  const ends: number[] = []
  return items.map((x) => {
    let lane = ends.findIndex((e) => x.at - e >= LANE_MIN)
    if (lane < 0) lane = ends.length
    ends[lane] = x.at
    return { ...x, lane }
  })
}

/* The six things, as small pictures. */
function SpecialIcon({ kind }: { kind: Special['kind'] }) {
  return (
    <svg viewBox="0 0 24 24" className="wk__glyph" aria-hidden="true">
      {kind === 'fog' ? (
        <path d="M3 9h18M5 13h14M3 17h18" />
      ) : kind === 'rainbow' ? (
        <>
          <path d="M3 18a9 9 0 0 1 18 0" />
          <path d="M7 18a5 5 0 0 1 10 0" />
        </>
      ) : kind === 'rays' ? (
        <>
          <path d="M5 7h14" />
          <path d="M9 9l-4 11M12 9v11M15 9l4 11" />
        </>
      ) : kind === 'iridescence' ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M4 8c3-3 13-3 16 0M4 16c3 3 13 3 16 0" />
        </>
      ) : kind === 'fire' ? (
        <>
          <path d="M3 17h18" />
          <path d="M7 17a5 5 0 0 1 10 0" />
          <path d="M4 10c4-3 12-3 16 0" />
        </>
      ) : (
        <path d="M3 10c3-2 6 2 9 0s6-2 9 0M3 15c3-2 6 2 9 0s6-2 9 0" />
      )}
    </svg>
  )
}
