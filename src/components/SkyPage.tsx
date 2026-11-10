import '../styles/sky.css'
import { useEffect, useState } from 'react'
import { getPosition } from 'suncalc'
import { compassPoint } from '../core/field.ts'
import type { LatLon } from '../core/geo.ts'
import { leadLayer } from '../core/fireOutlook.ts'
import { groundOf } from '../core/homeDay.ts'
import { colorHeadline, lightMarks, plainChecks, plainReason, rareRows, type RareRow } from '../core/skyPage.ts'
import type { Special } from '../core/specialLight.ts'
import { formatClock } from '../core/timezone.ts'
import { fetchGlassWeek, fetchSpecialWeek, specialsFrom } from '../lib/specialLightData.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { useBriefing } from '../lib/useBriefing.ts'
import { PageShell } from './PageShell.tsx'

/*
 * THE SKY PAGE (Batch Pages, Section 3; board SkyPage). Its own page: from
 * the home's Sky card, the menu's Sky card and the map's Cloud and Golden
 * chips. The map's Sky sheet with its five tabs is gone.
 *
 *   toggle     Sunset · Sunrise, the next of each
 *   headline   "Color likely / possible / unlikely" (the home's call, the
 *              same read) and one plain reason
 *   checks     "Clouds to light up", "Gap at the horizon (WSW)", "Anything
 *              blocking the sun": the Sky color page's Canvas · Gap · Not
 *              blocked said plainly (src/core/skyPage.ts plainChecks)
 *   light      Golden · Set · Blue · Dark (sunrise: Blue · Glow · Rise ·
 *              Day), the sun's own heights
 *   rare       RARE LIGHT THIS WEEK: day and time, what, one line why, only
 *              what the numbers found (src/core/skyPage.ts RARE_KEPT); the
 *              icon-only week grid is gone
 *   buttons    Viewfinder · Calendar; at the foot "Color detail ›" and
 *              "Sun, moon, night ›" (the map's sheet, no tabs)
 */
interface SkyPageProps {
  venue: LatLon
  placeName: string
  timeZone: string
  now: Date
  onBack: () => void
  /** The round Map button (Batch Flow, Section 2). */
  onMap?: () => void
  onViewfinder?: () => void
  onCalendar: () => void
  /** On the map's sheet: the Sky color page in full (the colour clock, your log), or the sun, the moon and the night. */
  onDetail: (view: 'fire' | 'now') => void
}

type Kind = 'sunset' | 'sunrise'

export function SkyPage({ venue, placeName, timeZone, now, onBack, onMap, onViewfinder, onCalendar, onDetail }: SkyPageProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  const clock = (d: Date | null) => (d === null ? '—' : formatClock(d, timeZone))
  /* The next of each: the first day whose event is still to come. */
  const next = (k: Kind) => brief.days.find((d) => d.events[k] !== null && (d.events[k] as Date).getTime() > now.getTime() - 20 * 60_000) ?? null
  const days = { sunset: next('sunset'), sunrise: next('sunrise') }
  const soonest: Kind = days.sunrise?.events.sunrise != null && days.sunset?.events.sunset != null && days.sunrise.events.sunrise < days.sunset.events.sunset ? 'sunrise' : 'sunset'
  const [picked, setPicked] = useState<Kind | null>(null)
  const kind = picked ?? soonest
  const day = days[kind]
  const event = day?.events[kind] ?? null
  const read = day?.reads[kind] ?? null
  const verdict = day?.verdicts[kind] ?? null
  const az = event === null ? null : getPosition(event, venue.lat, venue.lon).azimuth
  const checks = plainChecks(verdict === null ? null : leadLayer(verdict), az === null ? '—' : compassPoint(az))
  const marks = event === null ? [] : lightMarks(kind, event, (t) => getPosition(t, venue.lat, venue.lon).altitude)
  const span = marks.length === 4 && marks[0].at !== null && marks[3].at !== null ? marks[3].at.getTime() - marks[0].at.getTime() : null
  const share = (a: Date | null, b: Date | null) => (span === null || a === null || b === null || span <= 0 ? 25 : Math.max(8, ((b.getTime() - a.getTime()) / span) * 100))

  /* The week's rare light: five models' rules and the glassy mornings (at a coast). */
  const [rare, setRare] = useState<{ key: string; rows: RareRow[] | null } | null>(null)
  const key = `${venue.lat},${venue.lon}`
  useEffect(() => {
    let live = true
    void (async () => {
      const week = await fetchSpecialWeek(venue).catch(() => null)
      const list: Special[] = week === null ? [] : specialsFrom(week.week, venue, week.seaCAt)
      const glass = brief.facing === null ? [] : await fetchGlassWeek(venue, new Date()).catch(() => [])
      if (live) setRare({ key, rows: week === null && glass.length === 0 ? null : rareRows([...list, ...glass], new Date()) })
    })()
    return () => {
      live = false
    }
  }, [key, brief.facing]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = rare === null || rare.key !== key ? 'loading' : rare.rows
  const dayWord = (d: Date) => {
    const iso = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x)
    return iso(d) === iso(now) ? 'Today' : new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(d)
  }
  const ground = groundOf(getPosition(now, venue.lat, venue.lon).altitude, brief.wx === null ? null : hourlyAt(brief.wx, 'weather_code', now), false)

  const how = (
    <>
      <p>The call: the same read as the home's Sky card, from six weather models along the line toward the sun, and from the stations in the hours before.</p>
      <p>Clouds to light up: cloud 30–90% over you and toward the sun, at the height the light reaches. Gap at the horizon: whether the light gets through to it, along 400 km toward the {kind}. Anything blocking: a thicker deck under it, over you, at 70% or more.</p>
      <p>Tonight's light: the sun's height, Golden from +6°, Blue from −4°, Dark from −6° (civil dusk).</p>
      <p>Rare light: five models' hours, by written rules. Fog: dew point within 2°F of the air and wind under 6 kt. Rainbow: showers within 25 km opposite the sun, the sun under 42°. Light rays: low cloud 30–80% with the sun under 25°. Mirror water: a low tide within 90 minutes of sunrise and a light wind. A rule, not a promise.</p>
    </>
  )

  return (
    <PageShell
      kind="spage"
      title="Sky"
      sub={`${placeName} · now`}
      ground={ground}
      onBack={onBack}
      onMap={onMap}
      how={how}
      foot={
        <>
          <button type="button" className="dpage__link" onClick={() => onDetail('fire')}>
            Color detail ›
          </button>
          <button type="button" className="dpage__link" onClick={() => onDetail('now')}>
            Sun, moon, night ›
          </button>
        </>
      }
    >
      <div className="ui-seg spage__seg" role="tablist" aria-label="Sunset or sunrise">
        {(['sunset', 'sunrise'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`ui-seg__opt${kind === k ? ' ui-seg__opt--on' : ''}`} onClick={() => setPicked(k)}>
            {k === 'sunset' ? 'Sunset' : 'Sunrise'} {clock(days[k]?.events[k] ?? null)}
          </button>
        ))}
      </div>
      <p className="spage__head">{brief.status === 'loading' && read === null ? '…' : colorHeadline(read?.call ?? null)}</p>
      <p className="spage__why">{plainReason(read?.why ?? null) ?? (brief.status === 'loading' ? 'Reading the forecast…' : 'The forecast did not say.')}</p>

      <ul className="spage__checks">
        {checks.map((c) => (
          <li key={c.label} className="spage__check">
            <span>{c.label}</span>
            <b>{c.value}</b>
          </li>
        ))}
      </ul>

      <section className="dcard spage__light" aria-label={kind === 'sunset' ? "Tonight's light" : "This morning's light"}>
        <p className="dcard__label">{kind === 'sunset' ? "Tonight's light" : "This morning's light"}</p>
        <div className={`spage__bar spage__bar--${kind}`} aria-hidden="true">
          {marks.slice(0, 3).map((m, i) => (
            <i key={m.label} style={{ flexBasis: `${share(m.at, marks[i + 1].at)}%` }} />
          ))}
          <i style={{ flexBasis: '14%' }} />
        </div>
        <p className="spage__marks num">
          {marks.map((m) => (
            <span key={m.label} className="spage__mark">
              <span>{m.label}</span>
              <b>{clock(m.at)}</b>
            </span>
          ))}
        </p>
      </section>

      <section className="dcard spage__rare" aria-label="Rare light this week">
        <p className="dcard__label">Rare light this week</p>
        {rows === 'loading' ? (
          <p className="spage__none">Reading five forecasts for the week…</p>
        ) : rows === null ? (
          <p className="spage__none">The week's forecast did not arrive.</p>
        ) : rows.length === 0 ? (
          <p className="spage__none">Nothing rare in the forecast this week.</p>
        ) : (
          <ul className="spage__rows">
            {rows.map((r) => (
              <li key={`${r.kind}${r.at.getTime()}`} className="spage__row">
                <span className="spage__when num">
                  {dayWord(r.at)} {clock(r.at)}
                </span>
                <span className="spage__what">
                  <b>{r.name}</b>
                  <span>{r.why}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="spage__buttons">
        {onViewfinder === undefined ? null : (
          <button type="button" className="btn btn--primary spage__btn" onClick={onViewfinder}>
            Viewfinder
          </button>
        )}
        <button type="button" className="btn spage__btn" onClick={onCalendar}>
          Calendar ›
        </button>
      </div>
    </PageShell>
  )
}
