import '../styles/sky.css'
import { useEffect, useState } from 'react'
import { getPosition } from 'suncalc'
import { compassPoint } from '../core/field.ts'
import type { LatLon } from '../core/geo.ts'
import { leadLayer } from '../core/fireOutlook.ts'
import { colorWords, groundOf } from '../core/homeDay.ts'
import { colorHeadline, eventDayWord, lightMarks, lightTimeline, nextEvent, nowShare, plainChecks, plainReason, rareRows, sideView, type RareRow } from '../core/skyPage.ts'
import type { Special } from '../core/specialLight.ts'
import { formatClock } from '../core/timezone.ts'
import { fetchGlassWeek, fetchSpecialWeek, specialsFrom } from '../lib/specialLightData.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { useBriefing } from '../lib/useBriefing.ts'
import { useStationNow } from '../lib/useStationNow.ts'
import { layersWords } from '../core/metar.ts'
import { stationCloudWord } from '../core/cloudWords.ts'
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
  /* Batch Polish 2, Section 1: the nearest station's sky is this page's, not the map's strip (the strip follows the time bar; a station reports now). */
  const station = useStationNow(venue, now, typeof navigator === 'undefined' ? false : navigator.onLine)
  const clock = (d: Date | null) => (d === null ? '—' : formatClock(d, timeZone))
  /*
   * THE NEXT OF EACH, NEVER ONE THAT HAS PASSED (Batch Flow, Section 4;
   * field 9 Nov 8:31 PM: tonight's sunset, gone, and "This morning's light").
   * The clock is App's, put right whenever the app comes back to the front
   * (a phone that slept left it hours behind).
   */
  const realNow = now
  const days = { sunset: nextEvent(brief.days, 'sunset', realNow), sunrise: nextEvent(brief.days, 'sunrise', realNow) }
  const soonest: Kind = days.sunrise?.events.sunrise != null && days.sunset?.events.sunset != null && days.sunrise.events.sunrise < days.sunset.events.sunset ? 'sunrise' : 'sunset'
  const [picked, setPicked] = useState<Kind | null>(null)
  const kind = picked ?? soonest
  const day = days[kind]
  const event = day?.events[kind] ?? null
  const read = day?.reads[kind] ?? null
  const verdict = day?.verdicts[kind] ?? null
  const az = event === null ? null : getPosition(event, venue.lat, venue.lon).azimuth
  const lead = verdict === null ? null : leadLayer(verdict)
  const checks = plainChecks(lead, az === null ? '—' : compassPoint(az))
  const marks = event === null ? [] : lightMarks(kind, event, (t) => getPosition(t, venue.lat, venue.lon).altitude)
  const segs = event === null ? [] : lightTimeline(kind, event, marks, read?.colorFrom ?? null, read?.colorTo ?? null)
  const thumb = nowShare(segs, realNow)
  const side = verdict === null ? null : sideView(verdict.sky.layers, event === null ? 0 : getPosition(event, venue.lat, venue.lon).altitude, lead?.layer ?? null)
  const dayWordOf = (k: Kind) => {
    const e = days[k]?.events[k] ?? null
    return e === null ? (k === 'sunset' ? 'Sunset' : 'Sunrise') : eventDayWord(e, k, realNow, timeZone)
  }
  const segSpan = segs.length === 0 ? 1 : segs[segs.length - 1].to.getTime() - segs[0].from.getTime()

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
      <p>The light: the sun's height, golden from +6°, blue from −4°, dark from −6° (civil dusk); the colour window is the call's own, else the 20 minutes round the event. The side view draws each deck at its height and how much of the sky it covers toward the sun; a lit deck is warm.</p>
      <p>Rare light: five models' hours, by written rules. Fog: dew point within 2°F of the air and wind under 6 kt. Rainbow: showers within 25 km opposite the sun, the sun under 42°. Light rays: low cloud 30–80% with the sun under 25°. Mirror water: a low tide within 90 minutes of sunrise and a light wind. A rule, not a promise.</p>
    </>
  )

  return (
    <PageShell
      kind="spage"
      title="Sky"
      sub={`${placeName} · ${event === null ? 'now' : dayWordOf(kind).toLowerCase()}`}
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
      {/* Batch Flow, Section 4 (board D_Sky): Tonight · Tomorrow, the next sunset and sunrise, each by its own day. */}
      <div className="ui-seg spage__seg" role="tablist" aria-label="Sunset or sunrise">
        {/* In the order they come: at night the morning is first. */}
        {(soonest === 'sunrise' ? (['sunrise', 'sunset'] as const) : (['sunset', 'sunrise'] as const)).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} className={`ui-seg__opt${kind === k ? ' ui-seg__opt--on' : ''}`} onClick={() => setPicked(k)}>
            {dayWordOf(k)}
          </button>
        ))}
      </div>
      <p className="spage__event num" {...(event !== null && kind === 'sunset' && picked === null ? { 'data-shared': 'sunset', 'data-value': `sunset ${clock(event)}`.toLowerCase() } : {})}>
        {event === null ? '—' : `${kind === 'sunset' ? 'Sunset' : 'Sunrise'} ${clock(event)}`}
        {az === null ? '' : ` · looking ${compassPoint(az)}`}
      </p>
      <p className="spage__head" data-shared={picked === null ? 'skycall' : 'skycall-picked'} data-value={colorWords(read?.call ?? null) ?? ''}>{brief.status === 'loading' && read === null ? '…' : colorHeadline(read?.call ?? null)}</p>
      <p className="spage__why">{plainReason(read?.why ?? null) ?? (brief.status === 'loading' ? 'Reading the forecast…' : 'The forecast did not say.')}</p>

      <section className="dcard spage__side" aria-label="The sky toward the sun">
        <p className="dcard__label">The sky toward the sun</p>
        {side === null ? (
          <p className="spage__none">The models along the line toward the sun have not answered.</p>
        ) : (
          <svg className="spage__sidepic" viewBox="0 0 300 150" role="img" aria-label={checks.map((c) => `${c.label}: ${c.value}`).join('. ')}>
            {side.layers.map((l) => (
              <g key={l.layer}>
                <line x1="0" x2="300" y1={l.y * 150} y2={l.y * 150} className="spage__lvl" />
                <text x="4" y={l.y * 150 - 4} className="spage__lvlk">
                  {l.layer.toUpperCase()} {Math.round((l.heightM * 3.28084) / 1000)}K{l.cover === null ? '' : ` · ${Math.round(l.cover)}%`}
                </text>
                {l.canvas ? <ellipse cx="200" cy={l.y * 150} rx="95" ry="9" className={`spage__deck${l.lit ? ' spage__deck--lit' : ''}`} /> : null}
              </g>
            ))}
            <line x1="0" x2="300" y1={0.92 * 150} y2={0.92 * 150} className="spage__horizon" />
            {side.path === null ? null : <line x1={side.path.from.x * 300} y1={side.path.from.y * 150} x2={side.path.to.x * 300} y2={side.path.to.y * 150} className="spage__ray" />}
            <circle cx={side.sun.x * 300} cy={side.sun.y * 150} r="10" className="spage__sun" />
            {event === null ? null : (
              <text x={side.sun.x * 300 + 16} y={side.sun.y * 150 - 6} className="spage__sunk">
                sun {clock(event)}{az === null ? '' : ` · ${Math.round(az)}°`}
              </text>
            )}
          </svg>
        )}
        <p className="spage__gap">{read?.gapLine ?? checks.map((c) => `${c.label.replace(/ \(.*\)$/, '')}: ${c.value}`).join(' · ')}</p>
        {station === null ? null : <p className="spage__station">{`${station.sky.station} now: ${stationCloudWord(station.sky) ?? 'not said'} · ${layersWords(station.sky)}`}</p>}
      </section>

      <section className="dcard spage__light" aria-label={`${dayWordOf(kind)}'s light`}>
        <p className="spage__marks num">
          {segs.map((g) => (
            <span key={g.key} className="spage__mark">
              <span>{g.label}</span>
              <b>{g.key === 'color' ? `${clock(g.from)}–${clock(g.to)}` : clock(g.from)}</b>
            </span>
          ))}
        </p>
        <div className="spage__bar" aria-hidden="true">
          {segs.map((g) => (
            <i key={g.key} className={`spage__seg2 spage__seg2--${g.key}`} style={{ flexBasis: `${((g.to.getTime() - g.from.getTime()) / segSpan) * 100}%` }} />
          ))}
          {thumb === null ? null : <span className="spage__thumb" style={{ left: `${thumb * 100}%` }} />}
        </div>
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
