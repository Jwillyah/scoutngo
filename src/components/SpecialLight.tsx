import { useEffect, useMemo, useState } from 'react'
import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { nextEvents } from '../core/skyFire.ts'
import { fireVerdict, lookWindow } from '../core/fireOutlook.ts'
import { byDay, SPECIAL_NAME, type Special } from '../core/specialLight.ts'
import { formatClock } from '../core/timezone.ts'
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

export function SpecialLight({ venue, timeZone, at, onShowBow, onJump, place }: Props) {
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
  const now = useMemo(() => (list === 'loading' || list === null ? [] : list.filter((s) => s.from <= at && at < s.to)), [list, at])
  const days = useMemo(() => (list === 'loading' || list === null ? [] : byDay(list, (d) => isoDay(d, timeZone))), [list, timeZone])
  /* Today as of when the list was read, not as of each render. */
  const asked = answer?.asked ?? 0
  const today = isoDay(new Date(asked), timeZone)
  const tomorrow = isoDay(new Date(asked + 86_400_000), timeZone)
  const dayName = (day: string, sample: Date) => (day === today ? 'Today' : day === tomorrow ? 'Tomorrow' : weekday(sample, timeZone))
  const [bow, setBow] = useState<string | null>(null)
  const row = (s: Special, long: boolean) => {
    const id = `${s.kind}-${s.from.getTime()}`
    return (
      <li key={id} className={`spec__item spec__item--${s.kind}${long ? ' spec__item--long' : ''}`}>
        <button type="button" className="spec__open" onClick={() => onJump?.(s.from)} title={s.why}>
          <span className="spec__line">
            {name(s)} {s.word} {span(s.from, s.to)}
          </span>
          <span className="spec__sure num">
            {s.agree} of {s.of}
          </span>
        </button>
        {s.kind === 'rainbow' && onShowBow !== undefined ? (
          <button
            type="button"
            className="btn btn--small btn--quiet spec__bow"
            aria-pressed={bow === id}
            onClick={() => {
              const next = bow === id ? null : id
              setBow(next)
              onShowBow(next === null ? null : s)
            }}
          >
            {bow === id ? 'Hide the bow' : 'Show the bow'}
          </button>
        ) : null}
      </li>
    )
  }
  const strongDays = days.filter((d) => d.items.length > 0)
  const longDays = days.filter((d) => d.longShots.length > 0)

  return (
    <div className="spec">
      {list === 'loading' ? (
        <p className="spec__note">Reading five forecasts for the week…</p>
      ) : list === null ? (
        <p className="spec__note">The week’s forecast did not arrive, so there is nothing to look through.</p>
      ) : list.length === 0 ? (
        <p className="spec__note">Nothing special in the forecast this week: no fog, rainbow, god rays, iridescence or sky fire by these rules. The rules are in the “i”.</p>
      ) : (
        <>
          {now.length === 0 ? null : (
            <p className="spec__now">
              On now: {now.map((s) => `${name(s)} (${s.agree} of ${s.of}). ${s.why}`).join(' ')}
            </p>
          )}
          {strongDays.length === 0 ? <p className="spec__note">Nothing that half the models or more agree on this week.</p> : null}
          {strongDays.map((d) => (
            <section key={d.day} className="spec__day">
              <h4 className="spec__dayname">{dayName(d.day, d.items[0].from)}</h4>
              <ul className="spec__list">{d.items.map((s) => row(s, false))}</ul>
            </section>
          ))}
          {longDays.length === 0 ? null : (
            <section className="spec__long">
              <h4 className="spec__dayname">Long shots · fewer than half the models</h4>
              {longDays.map((d) => (
                <div key={d.day} className="spec__day">
                  <p className="spec__longday">{dayName(d.day, d.longShots[0].from)}</p>
                  <ul className="spec__list">{d.longShots.map((s) => row(s, true))}</ul>
                </div>
              ))}
            </section>
          )}
        </>
      )}
      <details className="spec__how">
        <summary aria-label="How these are found">i</summary>
        <p>
          Fog: dew point within 2°F of the air, wind under 6 kt, and the sea colder than the air (inland, radiation fog: no sea term). Rainbow: showers within 25 km and the sun up but under 42°; the bow is 42° round the point opposite the sun. God rays: low cloud 30–80% (scattered to broken) with the sun up to 25° behind it. Iridescence: thin mid or high cloud, 10–60%, with little low cloud and the sun up 5° or more; look within about 10° of the sun. Sky fire: its own three checks. Glassy water: a low tide within 90 minutes of sunrise and a light wind, as on the Tide sheet. Five models (GFS, ECMWF, ICON, GEM, HRRR); “likely” when 60% or more agree at the best hour; on the map only when half or more agree. A rule, not a promise: on 10 Mar 2026 the fog rule fired at Norfolk and no fog came.
        </p>
      </details>
    </div>
  )
}
