import '../styles/drone.css'
import { useEffect, useState } from 'react'
import { getPosition } from 'suncalc'
import { droneTag } from '../core/briefing.ts'
import type { LatLon } from '../core/geo.ts'
import { airColumn, arrowPath, bestTimeBar, calmWindow, NIGHT_STARS, PLANNED_FT, starsOut } from '../core/dronePage.ts'
import { groundOf } from '../core/homeDay.ts'
import { windAtFeet } from '../core/homeCards.ts'
import { formatClock } from '../core/timezone.ts'
import type { AirspaceAtPoint } from '../core/airspaceCard.ts'
import { airspaceAtPoint } from '../lib/airspaceAtPoint.ts'
import { fetchKp, kpWord } from '../lib/kp.ts'
import { keptFlightMinutes } from '../lib/preflight/usePreflight.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { useBriefing, type BriefingDrone } from '../lib/useBriefing.ts'
import { windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { PageShell } from './PageShell.tsx'

/*
 * THE DRONE PAGE (Batch Flow, Section 5; board D_Drone). Drone opens here
 * first, from the home's card and the menu's, not the 3D view.
 *
 *   headline   the wind at 400 ft, its tag, and the drone's own limit
 *              (Settings › My gear)
 *   the air    above the beach now: sky, sea, beach; the wind at the
 *              ground, 100, 200, 300 and 400 ft as arrows, length and colour
 *              by speed against the limit; the ceiling here (the FAA facility
 *              map's grid, the app's baked airspace) dashed; the planned
 *              height with the drone drawn there
 *   best time  the next 18 hours: dark · twilight · golden · calm · day
 *   tiles      Airspace · Battery · GPS (the planetary K index)
 *   buttons    Preflight · Fly it yourself (the 3D view)
 *
 * Every number is the code's (src/core/dronePage.ts); never "safe".
 */
interface DronePageProps {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  now: Date
  drone: BriefingDrone | null
  onBack: () => void
  onMap: () => void
  onPreflight: () => void
  onFly: () => void
}

export function DronePage({ venue, placeName, timeZone, units, now, drone, onBack, onMap, onPreflight, onFly }: DronePageProps) {
  const brief = useBriefing(venue, timeZone, now, true)
  const clock = (d: Date) => formatClock(d, timeZone)
  const speed = (mps: number | null) => (mps === null ? '—' : `${Math.round(windIn(mps, units.wind) ?? 0)}`)
  const unit = windUnitLabel(units.wind)
  const hours = brief.days.flatMap((d) => d.wind)
  const nearest = (t: Date) => (hours.length === 0 ? null : hours.reduce((a, b) => (Math.abs(b.at.getTime() - t.getTime()) < Math.abs(a.at.getTime() - t.getTime()) ? b : a)))
  const w = nearest(now)
  const limit = drone?.maxWindMps ?? null
  const rows = airColumn(w?.mps ?? null, w?.highMps ?? null, limit)
  const tag = drone === null || w === null ? null : droneTag(w.highMps, drone.maxWindMps)
  const alt = (t: Date) => getPosition(t, venue.lat, venue.lon).altitude
  const segs = bestTimeBar(now, 18, alt, (t) => {
    const h = nearest(t)
    return h === null ? null : windAtFeet(h.mps, h.highMps, PLANNED_FT)
  }, limit)
  const calm = calmWindow(segs)
  const span = segs.length === 0 ? 1 : segs[segs.length - 1].to.getTime() - segs[0].from.getTime()
  const sunrise = segs.find((s, i) => i > 0 && (s.band === 'twilight' || s.band === 'golden') && segs[i - 1].band === 'dark')
  /* The wind goes toward: arrows point right when it carries east. */
  const goesEast = w?.fromDeg == null ? true : Math.sin(((w.fromDeg + 180) * Math.PI) / 180) >= 0

  const [air, setAir] = useState<AirspaceAtPoint | null>(null)
  const [kp, setKp] = useState<{ kp: number } | null | 'loading'>('loading')
  useEffect(() => {
    let live = true
    void airspaceAtPoint(venue, 400).then((a) => live && setAir(a), () => undefined)
    void fetchKp().then((k) => live && setKp(k), () => live && setKp(null))
    return () => {
      live = false
    }
  }, [venue.lat, venue.lon]) // eslint-disable-line react-hooks/exhaustive-deps
  const ceilingFt = air?.gridCeilingFeet ?? null
  const controlled = (air?.classes ?? []).filter((c) => c !== 'E')
  const minutes = keptFlightMinutes()
  const ground = groundOf(alt(now), brief.wx === null ? null : hourlyAt(brief.wx, 'weather_code', now), false)
  const y = (ft: number) => 18 + (1 - ft / 450) * 138

  return (
    <PageShell
      kind="drpage"
      title="Drone"
      sub={`${placeName}${drone === null ? '' : ` · ${drone.name}`} · now`}
      ground={ground}
      onBack={onBack}
      onMap={onMap}
      how={
        <>
          <p>The wind at 400 ft is the forecast's at 120 m; the ground's at 10 m; 100 to 300 ft between them, on a log of the height. Colour: teal under {Math.round(0.6 * 100)}% of your drone's limit, amber up to it, orange past it.</p>
          <p>Your ceiling: the FAA facility map's grid here, from the app's baked airspace ({ceilingFt === null ? 'no grid cell here' : `${ceilingFt} ft`}). Part 107 tops out at 400 ft. Check airspace before you fly; this is not an authorization.</p>
          <p>Best time to fly: the sun's height (dark under −6°, twilight to 0°, golden to +6°), and calm where the wind at {PLANNED_FT} ft is under 60% of your drone's limit.</p>
          <p>GPS: NOAA's planetary K index; 5 and over is a geomagnetic storm, which degrades GPS.</p>
        </>
      }
    >
      <div className="drp__head">
        <div>
          <p className="drp__at">at 400 ft</p>
          <p className="drp__big num">{speed(w?.highMps ?? null)} {unit}</p>
        </div>
        <div className="drp__side">
          {tag === null ? null : <span className={`drp__tag drp__tag--${tag.toLowerCase().replace(/\s+/g, '-')}`}>{tag}</span>}
          <span className="drp__limit">{limit === null ? 'add your drone in Settings › My gear' : `your drone's limit ${speed(limit)} ${unit}`}</span>
        </div>
      </div>

      <section className="dcard drp__air" aria-label="The air above the beach, now">
        <p className="dcard__label">The air above the beach · now</p>
        <svg className="drp__pic" viewBox="0 0 300 200" role="img" aria-label={rows.map((r) => `${r.ft === 0 ? 'ground' : `${r.ft} ft`}: ${speed(r.mps)} ${unit}`).join(', ')}>
          <rect x="0" y="0" width="300" height="200" className={`drp__sky drp__sky--${alt(now) < -6 ? 'night' : 'day'}`} />
          {/* The board's night sky: a scatter of stars (drawn, not a star chart) when the sun is down past civil dusk. */}
          {starsOut(alt(now)) ? NIGHT_STARS.map(([sx, sy, sr]) => <circle key={`${sx},${sy}`} cx={sx} cy={sy} r={sr} className="drp__star" />) : null}
          <rect x="0" y="176" width="300" height="24" className="drp__sea" />
          <path d="M175 200 L196 172 Q240 160 300 166 L300 200 Z" className="drp__beach" />
          {rows.map((r) => (
            <g key={r.ft} transform={`translate(0 ${y(r.ft)})`}>
              <text x="6" y="4" className="drp__rowk">{r.ft === 0 ? 'gnd' : `${r.ft} ft`}</text>
              {[0, 1, 2].map((k) => {
                const len = 14 + r.length * 36
                const x0 = 62 + k * 60
                return (
                  /* Batch Polish 2, Section 5 (board D_Drone): a streak with a slight lift, the head at its end. */
                  <path key={k} d={arrowPath(x0, len, goesEast)} className={`drp__arrow drp__arrow--${r.role}`} />
                )
              })}
              <text x="294" y="4" textAnchor="end" className={`drp__rowv drp__rowv--${r.role}`}>{speed(r.mps)} {unit}</text>
            </g>
          ))}
          {ceilingFt === null || ceilingFt > 400 ? null : (
            <g>
              <line x1="0" x2="300" y1={y(ceilingFt)} y2={y(ceilingFt)} className="drp__ceiling" />
              <text x="60" y={y(ceilingFt) + 14} className="drp__ceilingk">your ceiling here · {ceilingFt} ft{controlled.length > 0 ? ' (LAANC)' : ''}</text>
            </g>
          )}
          <g transform={`translate(150 ${y(PLANNED_FT)})`}>
            <line x1="0" x2="0" y1="6" y2={y(0) - y(PLANNED_FT)} className="drp__plumb" />
            <ellipse cx="0" cy="0" rx="9" ry="5" className="drp__drone" />
            <path d="M-20 -4 h12 M8 -4 h12" className="drp__props" />
            <text x="26" y="4" className="drp__you">you · {PLANNED_FT} ft</text>
          </g>
        </svg>
      </section>

      <section className="dcard drp__best" aria-label="Best time to fly">
        <p className="dcard__label">Best time to fly</p>
        <div className="drp__bar" aria-hidden="true">
          {segs.map((s) => (
            <i key={s.from.getTime()} className={`drp__seg drp__seg--${s.band}`} style={{ flexBasis: `${((s.to.getTime() - s.from.getTime()) / span) * 100}%` }} />
          ))}
          <span className="drp__thumb" />
        </div>
        <p className="drp__marks num">
          <span>now</span>
          {sunrise === undefined ? null : <span>{clock(sunrise.from)} {sunrise.band === 'twilight' ? 'dawn' : 'sunrise'}</span>}
          <span className="drp__calm">{calm === null ? 'no calm window' : `calm ${clock(calm.from)}–${clock(calm.to)}`}</span>
          <span>{clock(new Date(now.getTime() + 18 * 3_600_000))}</span>
        </p>
      </section>

      <ul className="wtiles drp__tiles">
        <li className="wtile">
          <span className="wtile__label">Airspace</span>
          <span className="wtile__big">{air === null ? '…' : controlled.length > 0 ? `Class ${controlled[0]}` : 'None marked'}</span>
          <span className="wtile__line">{air === null ? 'reading' : ceilingFt !== null ? `LAANC ${ceilingFt} ft` : controlled.length > 0 ? 'no grid cell' : 'in the app’s data'}</span>
        </li>
        <li className="wtile">
          <span className="wtile__label">Battery</span>
          <span className="wtile__big num">{minutes} min</span>
          <span className="wtile__line">a pack (Preflight)</span>
        </li>
        <li className="wtile">
          <span className="wtile__label">GPS</span>
          <span className="wtile__big num">{kp === 'loading' ? '…' : kp === null ? 'Kp —' : `Kp ${Math.round(kp.kp)}`}</span>
          <span className="wtile__line">{kp === 'loading' ? 'reading' : kp === null ? 'not answered' : kpWord(kp.kp)}</span>
        </li>
      </ul>

      <div className="drp__buttons">
        <button type="button" className="btn btn--primary drp__btn" onClick={onPreflight}>
          Preflight
        </button>
        <button type="button" className="btn drp__btn" onClick={onFly}>
          Fly it yourself
        </button>
      </div>
    </PageShell>
  )
}

