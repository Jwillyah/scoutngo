import { useMemo, useState } from 'react'
import { bearingBetween, distanceMeters, type LatLon } from '../core/geo.ts'
import { localDate } from '../core/moonTimes.ts'
import { getSunPosition } from '../core/sun.ts'
import { surfShape, type SurfShape } from '../core/surf.ts'
import { bestWindow, droneOverLineup, faceLight, hourQuality, lensDistance, LINEUP_FT, ratingWord, sizeWords, standToward, type FaceLight, type ShootHour } from '../core/surfShoot.ts'
import { formatClock, formatShortHour, zonedTimeToUtc } from '../core/timezone.ts'
import { buoyName, buoySea, buoySplit } from '../lib/buoyWords.ts'
import { buoyWords, CAM_MI, cleanestRun, namedTrains, nearestWithin } from '../core/surfWords.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { windToBeach } from '../core/coastFacing.ts'
import { windAtHeight, type LevelWind } from '../core/windProfile.ts'
import { surfAt } from '../lib/surfDay.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { compass, metresToFeet } from '../lib/tideWords.ts'
import type { TideSheetData } from '../lib/useTideSheet.ts'
import { formatRange, formatWind, type Units, formatTemperature } from '../lib/units.ts'
import { Page } from './Page.tsx'
import { SURF_LABEL } from './SurfRow.tsx'

/*
 * SURF: A FORECAST GOOD ENOUGH TO DECIDE WHETHER TO PADDLE OUT OR SET UP THE
 * TRIPOD (29 Oct), and what no surf app tells a shooter.
 *
 * Simple first: the rating in words and plain sizes, the hours of the day as
 * coloured blocks (green good, amber ok, grey poor, never red) with the
 * light on the faces marked, the best time to shoot in one line, where to
 * stand and how far off each lens, the drone over the lineup, seven days, the
 * cams. Advanced: the swell split into groundswell and windswell, the wind
 * by the hour, the buoy against the forecast, the water, the formula notes.
 *
 * ONE SECTION PER SOURCE, so another can be added without redoing it: the
 * forecast (Open-Meteo Marine and wind), the buoy (NDBC), the cams. Each
 * says where it is from. Every number is from src/core (surf.ts, surfShoot.ts).
 */
interface SurfPageProps {
  venue: LatLon
  at: Date
  timeZone: string
  units: Units
  data: TideSheetData
  /** Lenses in the bag, with the sensor's short side each is used on. */
  lenses: { name: string; focalMm: number; sensorShortMm: number }[]
  /** The drone's wind by height, its rating, and the ceiling here; null without a drone. */
  drone: { levels: readonly LevelWind[]; ratedMps: number | null; ceilingFt: number | null; name: string } | null
  onClose: () => void
}

const LIGHT_WORD: Record<FaceLight, string> = { front: 'front light', side: 'side light', back: 'backlit, the lip glows', dark: 'dark' }
const SHAPE_WORD: Record<SurfShape, string> = { Clean: 'clean', Bumpy: 'bumpy', Messy: 'messy' }

/* The light on the face as a mark of its own each (30 Oct: backlit looked like front-lit). */
const LIGHT_MARK = { front: '●', side: '◐', back: '◎', dark: '' } as const

export function SurfPage({ venue, at, timeZone, units, data, lenses, drone, onClose }: SurfPageProps) {
  const [view, setView] = useState<'simple' | 'advanced'>('simple')
  const marine = data.marine.value === 'inland' ? null : data.marine.value
  const wind = data.wind.value
  const facing = data.facing.value === null || data.facing.value === 'inland' ? null : data.facing.value.facing
  const clock = (t: Date) => formatClock(t, timeZone)
  /*
   * THE DAY SHOWN: the day on the time bar, while the forecast still covers
   * its daylight; else the first day it does (in the evening, today's hours
   * have gone). Said in the strip's heading, never silently.
   */
  const date = useMemo(() => {
    const today = localDate(at, timeZone)
    if (marine === null || marine.times.length === 0) return today
    const covers = (d: string) => {
      const noon = zonedTimeToUtc(d, '12:00', timeZone)
      return noon !== null && surfAt(marine, noon, facing) !== null
    }
    if (covers(today)) return today
    for (let i = 1; i <= 7; i += 1) {
      const d = new Date(Date.parse(`${today}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
      if (covers(d)) return d
    }
    return today
  }, [marine, at, timeZone, facing])
  const dayWord = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))

  /* The day, hour by hour, from 05:00 to 20:00 at the venue. */
  const hours = useMemo(() => {
    if (marine === null) return []
    const out: (ShootHour & { quality: ReturnType<typeof hourQuality>; windMps: number | null; windFrom: number | null; swellFrom: number })[] = []
    for (let h = 5; h <= 20; h += 1) {
      const t = zonedTimeToUtc(date, `${String(h).padStart(2, '0')}:30`, timeZone)
      if (t === null) continue
      const s = surfAt(marine, t, facing)
      if (s === null) continue
      const w = wind === null ? null : hourlyAt(wind, 'wind_speed_10m', t)
      const wf = wind === null ? null : hourlyAt(wind, 'wind_direction_10m', t)
      const shape = w === null || wf === null ? null : surfShape(w, wf, facing)
      const sun = getSunPosition(t, venue.lat, venue.lon)
      out.push({ at: t, faceFt: s.estimate.faceFt, shape, light: faceLight(sun.azimuth, sun.altitude, s.fromDeg), sunAltitude: sun.altitude, quality: hourQuality(s.estimate.faceFt, shape), windMps: w, windFrom: wf, swellFrom: s.fromDeg })
    }
    return out
  }, [marine, wind, facing, date, timeZone, venue.lat, venue.lon])

  const now = hours.reduce<(typeof hours)[number] | null>((best, h) => (best === null || Math.abs(h.at.getTime() - at.getTime()) < Math.abs(best.at.getTime() - at.getTime()) ? h : best), null)
  const best = bestWindow(hours)
  const sunAtBest = best === null ? null : getSunPosition(best.from, venue.lat, venue.lon)
  const toward = best === null || facing === null || sunAtBest === null ? null : standToward(sunAtBest.azimuth, facing)

  /* Seven days: each day's best hour in daylight. */
  const week = useMemo(() => {
    if (marine === null) return []
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.parse(`${date}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
      let top: { q: ReturnType<typeof hourQuality>; ft: number } | null = null
      for (let h = 6; h <= 18; h += 2) {
        const t = zonedTimeToUtc(d, `${String(h).padStart(2, '0')}:00`, timeZone)
        const s = t === null ? null : surfAt(marine, t, facing)
        if (s === null || t === null) continue
        const w = wind === null ? null : hourlyAt(wind, 'wind_speed_10m', t)
        const wf = wind === null ? null : hourlyAt(wind, 'wind_direction_10m', t)
        const q = hourQuality(s.estimate.faceFt, w === null || wf === null ? null : surfShape(w, wf, facing))
        const rank = { good: 2, ok: 1, poor: 0 }
        if (top === null || rank[q] > rank[top.q] || (rank[q] === rank[top.q] && s.estimate.faceFt > top.ft)) top = { q, ft: s.estimate.faceFt }
      }
      return { date: d, top }
    })
  }, [marine, wind, facing, date, timeZone])

  /* The three nearest public cams within 30 mi (src/data/coastCams.ts): Wrightsville showed Ocracoke, 120 mi off (30 Oct). */
  const cams = nearestWithin(COAST_CAMS, (c) => distanceMeters(venue, c.at)).map(({ cam, m }) => ({ cam, m, bearing: bearingBetween(venue, cam.at) }))

  /* The cleanest stretch: offshore hours first, else cross-shore, never onshore (src/core/surfWords.ts). */
  const cleanest = (() => {
    const run = cleanestRun(hours.map((h) => ({ at: h.at, cls: h.windFrom === null || facing === null ? null : windToBeach(h.windFrom, facing) })))
    return run === null ? null : `${clock(run.from)}–${clock(run.to)}, ${run.cls === 'offshore' ? 'offshore' : 'cross-shore'}`
  })()

  const lineupWind = drone === null ? null : windAtHeight(drone.levels, ((LINEUP_FT[0] + LINEUP_FT[1]) / 2) * 0.3048)
  const lineup = drone === null ? null : droneOverLineup(lineupWind?.speedMps ?? null, drone.ratedMps, drone.ceilingFt)

  const swellH = marine === null || now === null ? null : hourlyAt(marine, 'swell_wave_height', now.at)
  const swellT = marine === null || now === null ? null : hourlyAt(marine, 'swell_wave_period', now.at)
  const windH = marine === null || now === null ? null : hourlyAt(marine, 'wind_wave_height', now.at)
  const windT = marine === null || now === null ? null : hourlyAt(marine, 'wind_wave_period', now.at)
  const windD = marine === null || now === null ? null : hourlyAt(marine, 'wind_wave_direction', now.at)
  const water = marine === null || now === null ? null : hourlyAt(marine, 'sea_surface_temperature', now.at)
  /* The buoy measures the whole sea, so it is set against the whole sea's height, not the swell's alone. */
  const waveH = marine === null || now === null ? null : hourlyAt(marine, 'wave_height', now.at)
  const train = (h: string, p: string, d: string) => {
    if (marine === null || now === null) return null
    const height = hourlyAt(marine, h, now.at)
    const period = hourlyAt(marine, p, now.at)
    return height === null || period === null ? null : { heightM: height, periodS: period, fromDeg: hourlyAt(marine, d, now.at) }
  }
  const trains = namedTrains([
    train('swell_wave_height', 'swell_wave_period', 'swell_wave_direction'),
    train('secondary_swell_wave_height', 'secondary_swell_wave_period', 'secondary_swell_wave_direction'),
    train('tertiary_swell_wave_height', 'tertiary_swell_wave_period', 'tertiary_swell_wave_direction'),
  ])
  /* Deep-water wave power, kW per metre of crest: 0.49 H² T (H in m, T in s). */
  const power = swellH === null || swellT === null ? null : 0.49 * swellH * swellH * swellT

  /* The buoys on the water this beach faces, each with its time and the swell and wind waves apart (Batch H); in Simple, which scrolls; Advanced is one screen (scripts/audit-overflow.mjs) and keeps its one buoy line. */
  const buoysSection = data.buoys === null || !data.buoys.some((b) => b.status === 'ok') ? null : (
            <section className="spage__src" aria-label="Buoys">
              <p className="spage__head">Buoys</p>
              <ul className="buoys">
                {data.buoys.map((b) =>
                  b.status !== 'ok' ? null : (
                    <li key={b.buoy.id} className="buoys__row">
                      <span className="buoys__name">{buoyName(b)}</span>
                      <span className="buoys__sea num">
                        {buoySea(b)} · {clock(b.at)}
                      </span>
                      {buoySplit(b) === null ? null : <span className="buoys__split num">{buoySplit(b)}</span>}
                    </li>
                  ),
                )}
              </ul>
              <p className="spage__small">NDBC, each buoy's latest reading; the swell and wind waves from its spectral file.</p>
            </section>
          )
  return (
    <Page title="Surf" className="spage" tabs={[{ id: 'simple', label: 'Simple' }, { id: 'advanced', label: 'Advanced' }]} tab={view} onTab={(t) => setView(t as 'simple' | 'advanced')} onClose={onClose}>
      {marine === null ? (
        <p className="spage__lead">{data.marine.status === 'loading' ? 'Asking for the sea forecast…' : data.facing.value === 'inland' ? 'No beach within reach of this venue: no surf to forecast.' : "The sea forecast didn't load."}</p>
      ) : view === 'simple' ? (
        <>
          <section className="spage__src" aria-label="Forecast">
            {/* ONE SIZE SOURCE, ONE SET OF WORDS (30 Oct): both lines read the same hours through sizeWords, and each says which hours it is about. */}
            <p className="spage__lead">{now === null ? 'No forecast for this hour' : `${ratingWord(now.faceFt, now.shape)} · ${sizeWords(now.faceFt)} at ${clock(now.at)}`}</p>
            <p className="spage__line">{best === null ? 'Best to shoot: no clean, low-sun hour today.' : `Best to shoot: ${clock(best.from)}–${clock(best.to)} · ${LIGHT_WORD[best.light].split(',')[0]} · ${SHAPE_WORD[best.shape]} · ${sizeWords(best.faceFt)} at the biggest`}</p>
            <p className="spage__head">{dayWord}, hour by hour</p>
            <div className="spage__hours" role="img" aria-label="The day, hour by hour: green good, amber ok, grey poor; the light on the faces under each">
              {hours.map((h) => (
                <span key={h.at.getTime()} className={`spage__hour spage__hour--${h.quality}${now !== null && h.at.getTime() === now.at.getTime() ? ' spage__hour--now' : ''}`}>
                  <span className="spage__hourlabel num">{formatShortHour(h.at, timeZone)}</span>
                  <i className={`spage__light spage__light--${h.light}`} title={LIGHT_WORD[h.light]} aria-hidden="true">
                    {LIGHT_MARK[h.light]}
                  </i>
                </span>
              ))}
            </div>
            <p className="spage__key">
              <i className="spage__hour--good spage__sw" /> good <i className="spage__hour--ok spage__sw" /> ok <i className="spage__hour--poor spage__sw" /> poor · light on the face: <i className="spage__light spage__light--front">{LIGHT_MARK.front}</i> front <i className="spage__light spage__light--side">{LIGHT_MARK.side}</i> side <i className="spage__light spage__light--back">{LIGHT_MARK.back}</i> backlit
            </p>
            {best === null ? null : (
              <>
                <p className="spage__line">Where to stand: {toward === null ? 'either side of the peak, the sun straight off the beach' : `the ${compass(toward)} side of the peak, sun over your shoulder`}.</p>
                {lenses.length === 0 ? null : (
                  <ul className="spage__lenses num">
                    {lenses.map((l) => {
                      const d = lensDistance(l.focalMm, l.sensorShortMm)
                      return <li key={l.name}>{l.name} {formatRange(d.metres, units.distance)} ({d.from})</li>
                    })}
                  </ul>
                )}
              </>
            )}
            {drone === null || lineup === null ? null : (
              <p className="spage__line">
                Drone over the lineup ({LINEUP_FT[0]}–{LINEUP_FT[1]} ft): wind {lineupWind?.speedMps == null ? 'not forecast' : formatWind(lineupWind.speedMps, units.wind)}
                {lineup.wind === 'over' ? `, over the ${drone.name}'s rating` : lineup.wind === 'within' ? `, within the ${drone.name}'s rating` : ''}
                {' · '}
                {lineup.ceiling === 'room' ? `ceiling ${drone.ceilingFt} ft leaves room` : lineup.ceiling === 'tight' ? `ceiling ${drone.ceilingFt} ft: tight` : lineup.ceiling === 'none' ? `ceiling ${drone.ceilingFt} ft: no lineup shot without approval` : 'outside the LAANC grid: 400 ft at most; check the airspace yourself'}
              </p>
            )}
            <div className="spage__week" role="img" aria-label="Seven days, each day's best">
              {week.map((d) => (
                <span key={d.date} className={`spage__day spage__hour--${d.top?.q ?? 'poor'}`}>
                  <span className="num">{new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${d.date}T12:00:00Z`))}</span>
                  <span className="num">{d.top === null ? '—' : `${Math.round(d.top.ft)} ft`}</span>
                </span>
              ))}
            </div>
            <p className="spage__small">{SURF_LABEL} Open-Meteo Marine, seven days.</p>
          </section>
          {buoysSection}
          <section className="spage__src" aria-label="Cams">
            {cams.length === 0 ? (
              <p className="spage__small">No public cams within {CAM_MI} mi.</p>
            ) : (
              <div className="spage__cams">
                {cams.map(({ cam, m, bearing }) => (
                  <a key={cam.id} className="tides__cam" href={cam.url} target="_blank" rel="noreferrer noopener">
                    <span className="tides__camname">{cam.name}</span>
                    <span className="tides__small num">
                      {formatRange(m, units.distance)} {compass(bearing)}
                      {cam.facing === null ? '' : ` · looks ${compass(cam.facing)}`}
                      {cam.access === 'paid' ? ' · paid' : ''}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <section className="spage__src" aria-label="Forecast, in detail">
            <p className="spage__head">The swell, now</p>
            {trains.length === 0 ? <p className="spage__line">No swell in the forecast for this hour.</p> : null}
            {trains.map((t) => (
              <p key={t.rank} className="spage__line">
                {t.rank}
                {t.groundswell ? ' groundswell' : ''}: <span className="num">{metresToFeet(t.heightM).toFixed(1)} ft · {Math.round(t.periodS)} s · {t.fromDeg === null ? '—' : `from ${compass(t.fromDeg)}`}</span>
              </p>
            ))}
            <p className="spage__line">
              Wind waves: <span className="num">{windH === null ? '—' : `${metresToFeet(windH).toFixed(1)} ft`} · {windT === null ? '—' : `${Math.round(windT)} s`} · {windD === null ? '—' : `from ${compass(windD)}`}</span>
            </p>
            <p className="spage__head">The wind by the hour{cleanest === null ? (facing === null ? '' : ': no offshore or cross-shore hour today') : `: cleanest ${cleanest}`}</p>
            <div className="spage__winds" role="img" aria-label="Wind by the hour, its height the speed: green offshore, amber cross, grey onshore">
              {hours.map((h) => (
                <span
                  key={h.at.getTime()}
                  className={`spage__wind spage__wind--${h.windFrom === null || facing === null ? 'unknown' : windToBeach(h.windFrom, facing)}`}
                  style={{ height: `${Math.max(6, Math.min(100, ((h.windMps ?? 0) / 10) * 100))}%` }}
                />
              ))}
            </div>
            <p className="spage__key">
              <i className="spage__wind--offshore spage__sw" /> offshore <i className="spage__wind--cross spage__sw" /> cross <i className="spage__wind--onshore spage__sw" /> onshore, by the hour, 05 to 20
            </p>
            <p className="spage__small num">
              {water === null ? '' : `Water ${formatTemperature(water, units.temperature)} · `}
              {power === null ? '' : `swell energy ${power.toFixed(1)} kW per metre of wave · `}
              {facing === null ? '' : `beach faces ${compass(facing)}`}
            </p>
          </section>
          <section className="spage__src" aria-label="Buoy">
            <p className="spage__head">The buoy against the forecast</p>
            <p className="spage__line num">
              {data.buoy === null
                ? 'Asking the nearest buoy…'
                : data.buoy.status === 'ok'
                  ? `${buoyWords(metresToFeet(data.buoy.waveM), waveH === null ? null : metresToFeet(waveH)) ?? 'No forecast for the hour to set it against'}. Buoy ${data.buoy.buoy.id} at ${clock(data.buoy.at)}${data.buoy.periodS === null ? '' : `, ${Math.round(data.buoy.periodS)} s`}${data.buoy.fromDeg === null ? '' : ` from ${compass(data.buoy.fromDeg)}`}.`
                  : data.buoy.reason}
            </p>
            <p className="spage__small">NDBC, the buoy's latest reading.</p>
          </section>
          <section className="spage__src" aria-label="How it is worked out">
            <p className="spage__small">
              Faces from the offshore swell by the breaking-height relation on a 1:50 beach, angled by the swell's direction to the beach (src/core/surf.ts). Clean is light or offshore wind; messy onshore at 10 kt or more. The light on a face is the sun's bearing against the way the wave travels: within 60° of it, front-lit; within 60° of the sea behind it, backlit. Lens distances frame a 3 m wave and rider on the sensor's short side. Not a surf report.
            </p>
          </section>
        </>
      )}
    </Page>
  )
}
