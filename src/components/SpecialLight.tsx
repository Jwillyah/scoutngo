import { useEffect, useMemo, useState } from 'react'
import { getPosition } from 'suncalc'
import type { LatLon } from '../core/geo.ts'
import { fireVerdict, nextEvents } from '../core/skyFire.ts'
import { SPECIAL_NAME, specialLine, type Special } from '../core/specialLight.ts'
import { formatClock } from '../core/timezone.ts'
import { fetchFirePaths, nearestHour, pathsAt } from '../lib/skyFireData.ts'
import { fetchGlassWeek, fetchSpecialWeek, specialsFrom } from '../lib/specialLightData.ts'

/*
 * SPECIAL LIGHT THIS WEEK (Sky › Special): fog, rainbows, god rays from the
 * rules in src/core/specialLight.ts, and the next Sky fire, in time order.
 * Each: when, how many models agree, one line of why. A rainbow can be shown
 * on the map, as the bow's arc opposite the sun.
 */
interface Props {
  venue: LatLon
  timeZone: string
  at: Date
  /** Show a rainbow's bow on the map (null clears it). */
  onShowBow?: (s: Special | null) => void
  /** Jump the app to a time. */
  onJump?: (at: Date) => void
}

const dayWord = (d: Date, timeZone: string) => new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d)

export function SpecialLight({ venue, timeZone, at, onShowBow, onJump }: Props) {
  const key = `${venue.lat},${venue.lon}`
  const [answer, setAnswer] = useState<{ key: string; list: Special[] | null } | null>(null)
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
        const v = paths.length === 0 ? null : fireVerdict(paths)
        if (v !== null && v.word !== 'unlikely') {
          fires.push({ kind: 'fire', from: new Date(event.getTime() - 20 * 60_000), to: new Date(event.getTime() + 15 * 60_000), agree: v.agree, of: v.of, word: v.word, why: `At ${kind}: cloud to light and a way in for the light, by Sky fire’s three checks.` })
        }
      }
      const glass = await fetchGlassWeek(venue, new Date()).catch(() => [])
      const extra = [...fires, ...glass]
      if (live) setAnswer({ key, list: list === null ? (extra.length === 0 ? null : extra) : [...list, ...extra].sort((a, b) => a.from.getTime() - b.from.getTime()) })
    })()
    return () => {
      live = false
    }
  }, [venue, key])
  const list = answer === null || answer.key !== key ? 'loading' : answer.list
  /* Both ends with AM or PM: a bare "5:00" is a time on the wrong clock to half the day (scripts/audit-clock.mjs). */
  const span = (a: Date, b: Date) => `${dayWord(a, timeZone)} ${formatClock(a, timeZone)}–${formatClock(b, timeZone)}`
  const now = useMemo(() => (list === 'loading' || list === null ? [] : list.filter((s) => s.from <= at && at < s.to)), [list, at])
  const [bow, setBow] = useState<number | null>(null)

  return (
    <div className="spec">
      {list === 'loading' ? (
        <p className="spec__note">Reading five forecasts for the week…</p>
      ) : list === null ? (
        <p className="spec__note">The week’s forecast did not arrive, so there is nothing to look through.</p>
      ) : list.length === 0 ? (
        <p className="spec__note">Nothing special in the forecast this week: no fog, rainbow, god rays or sky fire by these rules. The rules are in the “i”.</p>
      ) : (
        <>
          {now.length === 0 ? null : <p className="spec__now">On now: {now.map((s) => SPECIAL_NAME[s.kind]).join(', ')}</p>}
          <ul className="spec__list">
            {list.map((s, i) => (
              <li key={`${s.kind}-${s.from.getTime()}`} className={`spec__item spec__item--${s.kind}`}>
                <button type="button" className="spec__open" onClick={() => onJump?.(s.from)}>
                  <span className="spec__line">{specialLine(s, span)}</span>
                  <span className="spec__sure num">{s.agree} of {s.of} models</span>
                  <span className="spec__why">{s.why}</span>
                </button>
                {s.kind === 'rainbow' && onShowBow !== undefined ? (
                  <button
                    type="button"
                    className="btn btn--small btn--quiet spec__bow"
                    aria-pressed={bow === i}
                    onClick={() => {
                      const next = bow === i ? null : i
                      setBow(next)
                      onShowBow(next === null ? null : s)
                    }}
                  >
                    {bow === i ? 'Hide the bow' : 'Show the bow on the map'}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
      <details className="spec__how">
        <summary aria-label="How these are found">i</summary>
        <p>
          Fog: dew point within 2°F of the air, wind under 6 kt, and the sea colder than the air (inland, radiation fog: no sea term). Rainbow: showers within 25 km and the sun up but under 42°; the bow is 42° round the point opposite the sun. God rays: low cloud 30–80% with the sun up to 25° behind it. Sky fire: its own three checks. Glassy water: a low tide within 90 minutes of sunrise and a light wind, as on the Tide sheet. Five models (GFS, ECMWF, ICON, GEM, HRRR); “likely” when 60% or more agree at the best hour. A rule, not a promise: on 10 Mar 2026 the fog rule fired at Norfolk and no fog came.
        </p>
      </details>
    </div>
  )
}
