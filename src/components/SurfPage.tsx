import { useMemo, useState } from 'react'
import { CAMS, camKind } from '../data/cams.ts'
import { bearingBetween, distanceMeters, type LatLon } from '../core/geo.ts'
import { localDate } from '../core/moonTimes.ts'
import { getSunPosition } from '../core/sun.ts'
import { surfShape, type SurfShape } from '../core/surf.ts'
import { bestWindow, droneOverLineup, faceLight, hourQuality, lensDistance, LINEUP_FT, ratingWord, sizeWords, standToward, type FaceLight, type ShootHour } from '../core/surfShoot.ts'
import { formatClock, formatHour, zonedTimeToUtc } from '../core/timezone.ts'
import { windToBeach } from '../core/coastFacing.ts'
import { windAtHeight, type LevelWind } from '../core/windProfile.ts'
import { surfAt } from '../lib/surfDay.ts'
import { hourlyAt } from '../lib/tideSheetData.ts'
import { celsiusToF, compass, metresToFeet } from '../lib/tideWords.ts'
import type { TideSheetData } from '../lib/useTideSheet.ts'
import { formatRange, formatWind, type Units } from '../lib/units.ts'
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

  const cams = CAMS.filter((c) => camKind(c) === 'coast')
    .map((c) => ({ cam: c, m: distanceMeters(venue, c.at), bearing: bearingBetween(venue, c.at) }))
    .sort((a, b) => a.m - b.m)
    .slice(0, 3)

  /* The cleanest stretch of the day's wind, for Advanced. */
  const cleanest = (() => {
    let run: typeof hours = []
    let top: typeof hours = []
    for (const h of hours) {
      if (h.shape === 'Clean') run.push(h)
      else run = []
      if (run.length > top.length) top = [...run]
    }
    return top.length === 0 ? null : `${clock(top[0].at)}–${clock(new Date(top[top.length - 1].at.getTime() + 3_600_000))}`
  })()

  const lineupWind = drone === null ? null : windAtHeight(drone.levels, ((LINEUP_FT[0] + LINEUP_FT[1]) / 2) * 0.3048)
  const lineup = drone === null ? null : droneOverLineup(lineupWind?.speedMps ?? null, drone.ratedMps, drone.ceilingFt)

  const swellH = marine === null || now === null ? null : hourlyAt(marine, 'swell_wave_height', now.at)
  const swellT = marine === null || now === null ? null : hourlyAt(marine, 'swell_wave_period', now.at)
  const swellD = marine === null || now === null ? null : hourlyAt(marine, 'swell_wave_direction', now.at)
  const windH = marine === null || now === null ? null : hourlyAt(marine, 'wind_wave_height', now.at)
  const windT = marine === null || now === null ? null : hourlyAt(marine, 'wind_wave_period', now.at)
  const windD = marine === null || now === null ? null : hourlyAt(marine, 'wind_wave_direction', now.at)
  const water = marine === null || now === null ? null : hourlyAt(marine, 'sea_surface_temperature', now.at)
  /* Deep-water wave power, kW per metre of crest: 0.49 H² T (H in m, T in s). */
  const power = swellH === null || swellT === null ? null : 0.49 * swellH * swellH * swellT

  return (
    <Page title="Surf" className="spage" tabs={[{ id: 'simple', label: 'Simple' }, { id: 'advanced', label: 'Advanced' }]} tab={view} onTab={(t) => setView(t as 'simple' | 'advanced')} onClose={onClose}>
      {marine === null ? (
        <p className="spage__lead">{data.marine.status === 'loading' ? 'Asking for the sea forecast…' : data.facing.value === 'inland' ? 'No beach within reach of this venue: no surf to forecast.' : "The sea forecast didn't load."}</p>
      ) : view === 'simple' ? (
        <>
          <section className="spage__src" aria-label="Forecast">
            <p className="spage__lead">{now === null ? 'No forecast for this hour' : `${ratingWord(now.faceFt, now.shape)} · ${sizeWords(now.faceFt)}`}</p>
            <p className="spage__line">{best === null ? 'Best to shoot: no clean, low-sun hour today.' : `Best to shoot: ${clock(best.from)}–${clock(best.to)} · ${LIGHT_WORD[best.light].split(',')[0]} · ${SHAPE_WORD[best.shape]} · ${sizeWords(best.faceFt)}`}</p>
            <p className="spage__head">{dayWord}, hour by hour</p>
            <div className="spage__hours" role="img" aria-label="The day, hour by hour: green good, amber ok, grey poor; the light on the faces under each">
              {hours.map((h) => (
                <span key={h.at.getTime()} className={`spage__hour spage__hour--${h.quality}${now !== null && h.at.getTime() === now.at.getTime() ? ' spage__hour--now' : ''}`}>
                  <span className="spage__hourlabel num">{formatHour(h.at, timeZone)}</span>
                  <i className={`spage__light spage__light--${h.light}`} title={LIGHT_WORD[h.light]} />
                </span>
              ))}
            </div>
            <p className="spage__key">
              <i className="spage__hour--good spage__sw" /> good <i className="spage__hour--ok spage__sw" /> ok <i className="spage__hour--poor spage__sw" /> poor · light on the face: <i className="spage__light spage__light--front" /> front <i className="spage__light spage__light--side" /> side <i className="spage__light spage__light--back" /> backlit
            </p>
            {best === null ? null : (
              <p className="spage__line">
                Where to stand: {toward === null ? 'either side of the peak, the sun is straight off the beach' : `on the ${compass(toward)} side of the peak, the sun over your shoulder`}.{' '}
                {lenses.length === 0 ? '' : lenses.map((l) => { const d = lensDistance(l.focalMm, l.sensorShortMm); return `${l.name} ${formatRange(d.metres, units.distance)} (${d.from})` }).join(' · ')}
              </p>
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
          {cams.length === 0 ? null : (
            <section className="spage__src" aria-label="Cams">
              <div className="spage__cams">
                {cams.map(({ cam, m, bearing }) => (
                  <a key={cam.id} className="tides__cam" href={cam.url} target="_blank" rel="noreferrer noopener">
                    <span className="tides__camname">{cam.name}</span>
                    <span className="tides__small num">
                      {formatRange(m, units.distance)} {compass(bearing)}
                      {cam.access === 'paid' ? ' · paid' : ''}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="spage__src" aria-label="Forecast, in detail">
            <p className="spage__head">The swell, now</p>
            <p className="spage__line">
              Groundswell: <span className="num">{swellH === null ? '—' : `${metresToFeet(swellH).toFixed(1)} ft`} · {swellT === null ? '—' : `${Math.round(swellT)} s`} · {swellD === null ? '—' : `from ${compass(swellD)}`}</span>
            </p>
            <p className="spage__line">
              Windswell: <span className="num">{windH === null ? '—' : `${metresToFeet(windH).toFixed(1)} ft`} · {windT === null ? '—' : `${Math.round(windT)} s`} · {windD === null ? '—' : `from ${compass(windD)}`}</span>
            </p>
            <p className="spage__head">The wind by the hour{cleanest === null ? '' : `: cleanest ${cleanest}`}</p>
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
              {water === null ? '' : `Water ${Math.round(celsiusToF(water))}°F · `}
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
                  ? `Buoy ${data.buoy.buoy.id} at ${clock(data.buoy.at)}: ${metresToFeet(data.buoy.waveM).toFixed(1)} ft${data.buoy.periodS === null ? '' : `, ${Math.round(data.buoy.periodS)} s`}${data.buoy.fromDeg === null ? '' : ` from ${compass(data.buoy.fromDeg)}`}. Forecast for the hour: ${swellH === null ? '—' : `${metresToFeet(swellH).toFixed(1)} ft`}.`
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
