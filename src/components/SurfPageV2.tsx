import { MarineLine } from './MarineLine.tsx'
import '../styles/surf.css'
import { useEffect, useMemo, useState } from 'react'
import { venueToday } from '../core/eventDay.ts'
import { PROVISIONAL_BELOW, regionEvidence, regionOf } from '../core/beachFactor.ts'
import { BEACH_CAP } from '../core/surf.ts'
import { LEAN_CAP_FT, SURF_FADE_MS } from '../core/surfNowcast.ts'
import { CHOP_WIND_KT, type SurfQuality } from '../core/surfCall.ts'

/** The pill's colour by quality: Fair the board's teal, Good its amber, the rest plain. */
const qualityClass = (q: SurfQuality): string => (q === 'Good' ? 'firing' : q === 'Fair' ? 'fun' : 'small')
import { PART_GONE_DEG, PERIOD_LONG_S, PERIOD_SHORT_S, PERIOD_SHORT_SHARE } from '../core/surfTransform.ts'
import { WEEK_BIAS_MIN_DAYS, weekBias, weekBiasLine } from '../core/weekBias.ts'
import { readWeekLog } from '../lib/weekBiasStore.ts'
import { type LatLon } from '../core/geo.ts'
import { camDistanceKnown, camsNear, type SkyCam } from '../core/skyCams.ts'
import { distanceMeters } from '../core/geo.ts'
import { BAND_FLOOR_FT, skillLine, UNTESTED_ERROR_FT, type SkillSample, type SpotStats } from '../core/spotSkill.ts'
import { forecastWord } from '../core/buoyHeadline.ts'
import { BUOY_MATCH_FT, camDistance, chartTopFt, cleanRuns, SURF_SPREAD_SOURCE } from '../core/surfRange.ts'
import { bestWindow, faceLight, type FaceLight } from '../core/surfShoot.ts'
import { buoyParts, partWords, rangeSizeWords } from '../core/surfReads.ts'
import { SURF_FIRING_FT, SURF_FUN_FT } from '../core/briefing.ts'
import { formatClock, formatShortHour, zonedTimeToUtc } from '../core/timezone.ts'
import { COAST_CAMS } from '../data/coastCams.ts'
import { shootPicked, useActivities } from '../lib/activities.ts'
import { buoyFaceFt } from '../core/spotSkill.ts'
import type { BuoyReading } from '../lib/buoy.ts'
import type { DetailId } from '../lib/detailTabs.ts'
import { readSkillBook } from '../lib/spotSkillStore.ts'
import { seaNow, surfNowFrom, surfObs, useSurfNow } from '../lib/useSurfNow.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import type { StationObs } from '../core/nowcast.ts'
import { spotKey } from '../core/spotSkill.ts'
import { buoyDots, buoyLean, dotsOutside, LEAN_BUOY_MAX_AGE_MS, FIRST_HOUR, LAST_HOUR, dayHours, rangeHourAt, type BuoyDot, type RangeHour } from '../lib/surfPageData.ts'
import { compass, metresToFeet } from '../lib/tideWords.ts'
import { getSunPosition } from '../core/sun.ts'
import type { Units } from '../lib/units.ts'
import { useSpotSkill } from '../lib/useSpotSkill.ts'
import type { SurfSea } from '../lib/useSurfSea.ts'
import { DCard, DetailShell } from './DetailShell.tsx'
import { FieldReportCard } from './FieldReportCard.tsx'
import { WaterLine } from './WaterLine.tsx'
import { WeekBars } from './SurfWeekBars.tsx'
import type { ReactNode } from 'react'
import { SURF_PAGE_OLD_FIRST } from '../config/flags.ts'
import { useTide } from '../lib/useTide.ts'
import { SurfTapIn } from './SurfTapIn.tsx'

/*
 * SURF, HONEST (Batch N, Section 1; boards "DETAIL v2 · Surf").
 *
 *   headline   a RANGE ("1–2 ft"), never one number: the line this spot's
 *              record corrects and the band around it (src/core/spotSkill.ts
 *              correctedRange); the size in words, clean or messy, the
 *              wind's side, the period; the tag from the one scale (surfTag)
 *   today      the hours as a line in its likely range, the clean stretches
 *              shaded, now, and the buoy's readings as dots on top
 *   buoy       the nearest buoy's latest reading against the forecast's
 *              line at that hour
 *   cam        the nearest live cam looking at the water (a link out)
 *   week       seven days, each its biggest hour's range; days 4-7 faded
 *
 * Not on open water: the nearest surf beach, said, and its numbers (as the
 * home: src/lib/surfBeach.ts, within SAME_BEACH_KM is the venue's own sea).
 * Facts only; the app never says the water is safe or clear.
 */

export interface SurfPageV2Props {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  ground: string
  onBack: () => void
  onSwitch: (id: DetailId) => void
  onMap: () => void
  drone?: { name: string; maxWindMps: number | null } | null
}

const LIGHT_WORDS: Record<FaceLight, string> = {
  front: 'front-lit',
  side: 'side-lit',
  back: 'backlit, the lip glows',
  dark: 'no sun on it',
}

export function SurfPageV2({ venue, placeName, timeZone, units, ground, onBack, onSwitch, onMap }: SurfPageV2Props) {
  /* Batch SIMPLE-2, Section 4: the tap-in skeleton first; "More details ›" opens the old page below, unchanged (src/config/flags.ts SURF_PAGE_OLD_FIRST). */
  const [more, setMore] = useState(SURF_PAGE_OLD_FIRST)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  /* Batch Map A1/A2: the spot's surf beach and this hour's band, from the one hook the home and the menu read too. */
  /* Batch FIX, Section 3.1: the station's wind near now, as the home's surf reads it (src/lib/surfPageData.ts SurfObs). */
  const station = useStationObs(venue)
  /* Batch 3D, Section 3.2: the Surf page asks the other wave models too, so the bigger-swell log (scoutngo.swellWatch.v1) has them each day it is opened. */
  const surf = useSurfNow(venue, now, timeZone, units.distance === 'ft', placeName, station, true)
  const spot = surf.spot ?? venue
  const { sea, away: awayWords } = surf
  const ready = sea.marine !== null && sea.facingState !== 'loading' && sea.buoy !== null
  /* The check against the buoy (it writes the book; surf.stats reads it back). */
  useSpotSkill(ready ? spot : null, {
    marine: sea.marine,
    facingDeg: sea.facing,
    buoy: sea.buoy,
  })
  const skill = { key: spotKey(spot), stats: surf.stats }
  /* Read again on each render: a new sample re-renders through skill.stats. */
  const kept = skill.key === null ? [] : (readSkillBook()[skill.key]?.samples ?? [])
  const [picked] = useActivities()
  /* Batch Flow, Section 3: the spot's own beach's cam, and how far it is from the spot itself (it read "0.0 mi" measured from the beach). */
  const camNear = sea.facing === null ? null : (camsNear(spot, 'surf', COAST_CAMS, null, sea.facing)[0] ?? null)
  const cam = camNear === null ? null : { ...camNear, km: distanceMeters(venue, camNear.cam.at) / 1000 }
  const tide = useTide(venue, now)
  const how = <SurfHow sea={sea} stats={skill.stats} away={awayWords} placeName={placeName} spot={spot} today={venueToday(now, timeZone)} />

  if (!more) return <SurfTapIn now={now} timeZone={timeZone} venue={venue} spot={spot} placeName={awayWords?.name ?? placeName} sea={sea} stats={skill.stats} units={units} ground={ground} station={station} tide={tide} how={how} onBack={onBack} onMore={() => setMore(true)} />
  return (
    <DetailShell id="surf" ground={ground} onBack={SURF_PAGE_OLD_FIRST ? onBack : () => setMore(false)} onSwitch={onSwitch} onMap={onMap} how={how}>
      <SurfBody now={now} timeZone={timeZone} spot={spot} spotName={awayWords?.name ?? placeName} away={awayWords} sea={sea} stats={skill.stats} kept={kept} shoot={shootPicked(picked)} cam={cam} miles={units.distance === 'ft'} station={station} water={<WaterLine at={spot} unit={units.temperature} miles={units.distance === 'ft'} className="dhead__line" source />} />
    </DetailShell>
  )
}

export interface SurfBodyProps {
  now: Date
  timeZone: string
  spot: LatLon
  spotName: string
  away: { name: string; far: string } | null
  sea: SurfSea
  stats: SpotStats
  /** This phone's checks at the spot (src/lib/spotSkillStore.ts). */
  kept: readonly SkillSample[]
  shoot: boolean
  cam: SkyCam | null
  /** Distances in miles (units.distance 'ft'), else km. */
  miles: boolean
  /** The station's report near now (src/lib/useStationObs.ts); absent or null: the forecast's wind alone. */
  station?: StationObs | null
  /** Batch FIX, Section 4: the header's water line ("Water 58° · 4/3", src/components/WaterLine.tsx). */
  water?: ReactNode
}


/** The page's body, from data in hand (rendered on its own in tests). */
export function SurfBody({ now, timeZone, spot, spotName, away, sea, stats, kept, shoot, cam, miles, station = null, water = null }: SurfBodyProps) {
  const clock = (t: Date) => formatClock(t, timeZone)
  const { marine, wind, facing, factor } = sea
  const today = venueToday(now, timeZone)
  /* Batch Beach, Section 2: the next 6 h lean to the live buoy (src/core/surfNowcast.ts), as the head does (surfNowFrom). */
  const nowMs = now.getTime()
  const shelter = sea.shelter ?? null
  const lean = useMemo(() => (marine === null ? null : buoyLean(marine, wind, sea.buoy, facing, stats, factor ?? BEACH_CAP, nowMs, sea.buoys ?? [], shelter)), [marine, wind, sea.buoy, sea.buoys, facing, stats, factor, nowMs, shelter])
  /* Batch FIX, Section 3.3: the chart's hours with the same measured wind and sea near now as the head (surfNowFrom). */
  const obs = useMemo(() => surfObs(sea, now, station), [sea, now, station])
  const hours = useMemo(() => (marine === null ? [] : dayHours(marine, wind, today, timeZone, facing, stats, factor, lean, shelter, obs)), [marine, wind, today, timeZone, facing, stats, factor, lean, shelter, obs])
  /* Batch TRUTH, Section 1: the head and the week strip read the day calls the home reads (useSurfNow's week, src/core/surfCall.ts). */
  const read = useMemo(() => surfNowFrom(sea, stats, now, timeZone, station), [sea, stats, now, timeZone, station])
  const week = read.week
  const head = read.now
  const headCall = week[0]?.call ?? null
  /* Batch QA, Section 0B: the period and the parts from one source (src/lib/useSurfNow.ts seaNow), the buoy card's own when the buoy is fresh. */
  const now0 = seaNow(sea, now, head?.periodS ?? null)
  const period = head === null ? null : now0.period
  const parts = now0.parts
  const partTop = Math.max(1, ...parts.slice(0, 2).map((p) => p.ft))
  const place = (
    <p className="dsurf__place">
      {spotName}
      {away === null ? '' : ` · nearest surf beach, ${away.far}`} · now
    </p>
  )

  if (marine === null) {
    const why = sea.status === 'loading' ? 'Asking for the sea forecast…' : sea.facingState === 'inland' ? 'No sea here: no surf to forecast.' : "The sea forecast didn't load · retrying"
    return (
      <>
        {place}
        <p className="dhead__big">—</p>
        <p className="dhead__line">{why}</p>
      </>
    )
  }

  /* Shoot only: the light on the face now, and the clean low-sun stretch (src/core/surfShoot.ts, as the old page). */
  const sunNow = getSunPosition(now, spot.lat, spot.lon)
  const lightNow = head === null ? null : faceLight(sunNow.azimuth, sunNow.altitude, head.fromDeg)
  const shootHours = hours.map((h) => {
    const p = getSunPosition(h.at, spot.lat, spot.lon)
    return {
      at: h.at,
      faceFt: h.centerFt,
      shape: h.shape,
      light: faceLight(p.azimuth, p.altitude, h.fromDeg),
      sunAltitude: p.altitude,
    }
  })
  const best = shoot ? bestWindow(shootHours.filter((h) => h.at.getTime() + 1_800_000 > now.getTime())) : null

  return (
    <>
      <div className="dsurf__head">
        {place}
        <div className="dsurf__bigrow">
          <p className="dhead__big" data-shared="surf">{headCall?.words ?? '—'}</p>
          {/* Batch DRONE, Section 1.4: in a chopping wind the quality words stand in for the tag: never "Rideable" in chop. */}
          {headCall === null ? null : <span className={`dsurf__tag dsurf__tag--${qualityClass(headCall.quality)}`}>{headCall.quality}</span>}
        </div>
        <p className="dhead__line">
          {headCall === null
            ? 'The forecast did not say for this hour'
            : [rangeSizeWords(headCall.lowFt, headCall.highFt), headCall.wind, period?.words ?? null].filter((x) => x !== null).join(' · ')}
        </p>
        {water}
        {/* Batch MAP2, Section 1 (board LOOKS · Surf, S7): the top two parts of the sea, each its own bar, height · period, and an arrow the way it goes. */}
        {parts.length === 0 ? null : (
          <div className="dsurf__parts" data-swell-parts>
            {parts.slice(0, 2).map((p) => (
              <div key={p.name} className="dsurf__part">
                <span className="dsurf__pname">{p.name}</span>
                <span className="dsurf__pbar" style={{ width: `${Math.max(12, Math.min(100, (p.ft / partTop) * 100)).toFixed(0)}%` }} />
                <span className="dsurf__pval">{partWords(p)}</span>
                {p.fromDeg === null ? null : <PartArrow fromDeg={p.fromDeg} />}
              </div>
            ))}
          </div>
        )}
        {shoot && head !== null && lightNow !== null ? (
          <p className="dhead__line">
            Light on the face: {LIGHT_WORDS[lightNow]}
            {best === null ? null : (
              <>
                {' · best to shoot '}
                <span className="dsurf__nowrap">
                  {clock(best.from)}–{clock(best.to)}
                </span>
              </>
            )}
          </p>
        ) : null}
      </div>

      <MarineLine venue={spot} />

      <DCard label="Today · range, not a promise">
        <TodayChart hours={hours} kept={kept} buoy={sea.buoy} facing={facing} factor={factor} now={now} today={today} timeZone={timeZone} />
      </DCard>

      <BuoyCard buoy={sea.buoy} facing={facing} factor={factor} marine={marine} stats={stats} clock={clock} wind={wind} />

      {cam === null ? null : (
        <DCard>
          <a className="dsurf__cam" href={cam.cam.url} target="_blank" rel="noreferrer noopener">
            <span className="dsurf__camtext">
              <b className="dsurf__val">See it yourself</b>
              <span className="dsurf__small">
                {cam.cam.name}
                {/* Batch DRONE, Section 6.7: only when the cam's own position is known; an anchor's distance is not the cam's. */}
                {camDistanceKnown(cam.cam) ? ` · ${camDistance(cam.km, miles)}` : ''}
                {cam.cam.facing === null ? '' : ` · faces ${compass(cam.cam.facing)}`}
                {cam.cam.access === 'paid' ? ' · paid' : ''}
              </span>
            </span>
            <span className="dsurf__chev" aria-hidden="true">
              ›
            </span>
          </a>
        </DCard>
      )}

      <DCard label="This week">
        <WeekBars week={week} />
        {/* Batch SIMPLE-3, Section 5.3: any wave model at 4 ft or more on a day we call under that (src/core/swellWatch.ts); a watch, never a size. */}
        {read.watch === null ? null : (
          <p className="hweek__watch dsurf__watch" data-swell-watch={read.watch.date}>
            {read.watch.words}
          </p>
        )}
      </DCard>

      {/* Batch Beach, Section 3: one tap after a session or a look; kept on this phone, calibrating this spot. */}
      <FieldReportCard
        spot={spotKey(spot)}
        at={spot}
        name={spotName}
        timeZone={timeZone}
        buoyFt={sea.buoy?.status === 'ok' && now.getTime() - sea.buoy.at.getTime() <= LEAN_BUOY_MAX_AGE_MS ? buoyFaceFt(sea.buoy, facing, BEACH_CAP) : null}
        now={() => Date.now()}
      />
    </>
  )
}

/* ------------------------------------------------------------ the chart */

const W = 340
const H = 118
const PAD = { l: 22, r: 6, t: 6, b: 16 }

function TodayChart({ hours, kept, buoy, facing, factor, now, today, timeZone }: { hours: RangeHour[]; kept: readonly SkillSample[]; buoy: BuoyReading | null; facing: number | null; factor?: number; now: Date; today: string; timeZone: string }) {
  const from = zonedTimeToUtc(today, `${String(FIRST_HOUR).padStart(2, '0')}:00`, timeZone)?.getTime() ?? null
  const to = zonedTimeToUtc(today, `${String(LAST_HOUR + 1).padStart(2, '0')}:00`, timeZone)?.getTime() ?? null
  if (hours.length === 0 || from === null || to === null) return <p className="dsurf__small">The forecast did not say for today's hours.</p>
  const inDay: BuoyDot[] = buoyDots(kept, buoy, facing, from, to, factor)
  const outside = dotsOutside(hours, inDay)
  const top = chartTopFt([...hours.map((h) => h.range.highFt), ...inDay.map((d) => d.faceFt)])
  const x = (t: number) => PAD.l + ((t - from) / (to - from)) * (W - PAD.l - PAD.r)
  const y = (ft: number) => PAD.t + (1 - Math.min(ft, top) / top) * (H - PAD.t - PAD.b)
  const pts = (key: 'lowFt' | 'highFt' | 'centerFt') => hours.map((h) => `${x(h.at.getTime()).toFixed(1)},${y(h.range[key]).toFixed(1)}`)
  const band = `M${pts('highFt').join('L')}L${pts('lowFt').reverse().join('L')}Z`
  const runs = cleanRuns(hours.map((h) => ({ at: h.at.getTime() - 1_800_000, clean: h.clean })))
  const n = now.getTime()
  const ticks = ['05:00', '08:00', '11:00', '14:00', '17:00', '20:00'].map((t) => zonedTimeToUtc(today, t, timeZone)).filter((t): t is Date => t !== null)
  const mid = top / 2
  return (
    <>
      <svg className="dsurf__chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Today's surf, ${hours.length} hours: the forecast line in its likely range; clean hours shaded; buoy readings as dots`}>
        {runs.map((r) => (
          <g key={r.from}>
            <rect className="dsurf__clean" x={x(Math.max(r.from, from))} y={PAD.t} width={Math.max(0, x(Math.min(r.to, to)) - x(Math.max(r.from, from)))} height={H - PAD.t - PAD.b} rx={4} />
            {x(Math.min(r.to, to)) - x(Math.max(r.from, from)) >= 30 ? (
              <text className="dsurf__axis dsurf__axis--clean" x={(x(Math.max(r.from, from)) + x(Math.min(r.to, to))) / 2} y={PAD.t + 10} textAnchor="middle">
                clean
              </text>
            ) : null}
          </g>
        ))}
        {[0, mid, top].map((v) => (
          <g key={v}>
            <line className="dsurf__grid" x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} />
            <text className="dsurf__axis" x={PAD.l - 4} y={y(v) + 3} textAnchor="end">
              {Number.isInteger(v) ? v : v.toFixed(1)}
            </text>
          </g>
        ))}
        {ticks.map((t) => (
          <text key={t.getTime()} className="dsurf__axis" x={x(t.getTime())} y={H - 3} textAnchor="middle">
            {formatShortHour(t, timeZone)}
          </text>
        ))}
        <path className="dsurf__band" d={band} />
        <polyline className="dsurf__fline" points={pts('centerFt').join(' ')} />
        {n >= from && n <= to ? (
          <g>
            <line className="dsurf__now" x1={x(n)} x2={x(n)} y1={PAD.t} y2={H - PAD.b} />
          </g>
        ) : null}
        {inDay.map((d) => (
          <circle key={d.at.getTime()} className="dsurf__dot" cx={x(d.at.getTime())} cy={y(d.faceFt)} r={4}>
            <title>{`Buoy ${d.faceFt.toFixed(1)} ft`}</title>
          </circle>
        ))}
      </svg>
      {outside.length === 0 ? null : (
        <p className="dsurf__small" data-surf-outside>
          {outside
            .map((o) => `Buoy at ${formatClock(o.dot.at, timeZone)}, ${o.dot.faceFt.toFixed(1)} ft, ${o.side} the likely range (${o.lowFt.toFixed(1)}–${o.highFt.toFixed(1)} ft)`)
            .join(' · ')}
          . The range is the forecast’s; the buoy is what the sea did, and the forecast missed {outside.length === 1 ? 'that hour' : 'those hours'}.
        </p>
      )}
      <p className="dsurf__legend">
        <i className="dsurf__key dsurf__key--line" /> forecast <i className="dsurf__key dsurf__key--band" /> likely range <i className="dsurf__key dsurf__key--dot" /> buoy, as beach faces · ft
      </p>
    </>
  )
}

/* ------------------------------------------------------------ the buoy */

function BuoyCard({ buoy, facing, factor, marine, wind, stats, clock }: { buoy: BuoyReading | null; facing: number | null; factor?: number; marine: SurfSea['marine']; wind: SurfSea['wind']; stats: SpotStats; clock: (t: Date) => string }) {
  if (buoy === null)
    return (
      <DCard label="Nearest buoy">
        <p className="dsurf__line">Asking the nearest buoy…</p>
      </DCard>
    )
  if (buoy.status !== 'ok')
    return (
      <DCard label="Nearest buoy">
        <p className="dsurf__line">{buoy.reason === "The buoy didn't load." ? "The buoy didn't load · retrying" : buoy.reason}</p>
      </DCard>
    )
  const face = buoyFaceFt(buoy, facing, factor)
  const there = marine === null ? null : rangeHourAt(marine, wind, buoy.at, facing, stats, factor)
  const name = buoy.buoy.name
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/,\s*[A-Z]{2}$/, '')
    .trim()
  const period = buoy.periodS === null ? null : `${Math.round(buoy.periodS)} s`
  const split = buoyParts(buoy.split)
  return (
    <DCard className="dsurf__buoy">
      <span className="dsurf__buoyicon" aria-hidden="true" />
      <div className="dsurf__buoytext">
        <p className="dsurf__line">
          {/* Batch MAP2, Section 1 (9 Nov: "Buoy reads 5.5 ft" for a buoy reading 3.3 ft): what the buoy reads, raw; the beach's faces worked from it have their own line. */}
          <b className="dsurf__val" data-buoy-raw>Buoy reads {metresToFeet(buoy.waveM).toFixed(1)} ft</b>
          {period === null ? '' : ` · ${period}`}
        </p>
        {face === null ? null : (
          <p className="dsurf__small" data-buoy-faces>
            As faces at this beach ≈ {face.toFixed(1)} ft{there === null ? ' · the forecast did not say for that hour' : forecastWord(face, there.centerFt) === null ? '' : ` · ${forecastWord(face, there.centerFt)}`}
          </p>
        )}
        {split.length === 0 ? null : <p className="dsurf__small">{split.map((p) => `${p.name.toLowerCase()} ${partWords(p)}${p.fromDeg === null ? '' : ` ${compass(p.fromDeg)}`}`).join(' · ')}</p>}
        <p className="dsurf__small">
          {name} {buoy.buoy.id} · {clock(buoy.at)}
          {face === null ? ' · no period or direction: not set against the forecast' : ''}
        </p>
      </div>
    </DCard>
  )
}

/* ------------------------------------------------------------ how we got this */

export function SurfHow({ sea, stats, away, placeName, spot, today }: { sea: SurfSea; stats: SpotStats; away: { name: string; far: string } | null; placeName: string; spot?: LatLon; today?: string }) {
  const region = spot === undefined ? null : regionOf(spot)
  /* Batch DRONE, Section 1.7: this phone's week of calls against each day's own (src/core/weekBias.ts). */
  const bias = spot === undefined || today === undefined ? null : weekBias(readWeekLog(spotKey(spot)), today)
  const evidence = regionEvidence(region)
  const b = sea.buoy?.status === 'ok' ? sea.buoy : null
  return (
    <>
      {away === null ? null : (
        <p>
          Spot: {away.name}, the nearest surf beach, {away.far} from {placeName}. Its sea, its numbers.
        </p>
      )}
      <p>Forecast: Open-Meteo Marine, one model. The swell (height, period, direction), the whole sea (wave height, period, direction), by the hour.</p>
      <p>Wind: Open-Meteo, 10 m, by the hour.</p>
      <p>
        Faces: the sea part by part (each swell and the wind waves), each by its own period and direction at this beach
        {sea.facing === null ? '' : ` facing ${compass(sea.facing)}`}: a short-period sea breaks smaller ({Math.round(PERIOD_SHORT_SHARE * 100)}% of its height at {PERIOD_SHORT_S} s and under, all of it from {PERIOD_LONG_S} s), a sea at an angle reaches the beach with less of its energy (none from about {PART_GONE_DEG}° off). The parts combine by energy, times {(sea.factor ?? BEACH_CAP).toFixed(2)}: {region === null ? 'no region with a look at the beach yet' : `${region.name}, from ${evidence.looks} ${evidence.looks === 1 ? 'look' : 'looks'} at the beach set against the buoy${evidence.provisional ? `, provisional until ${PROVISIONAL_BELOW}` : ''}`}
        {sea.shelter == null ? '' : '; a jetty here, its size and its lee from the looks kept for it'}.
      </p>
      <p>Now and the next {SURF_FADE_MS / 3_600_000} h: the forecast leans to the buoys' face here, each buoy worked the same way, weighed by how much of its sea heads for this beach; all the way at the reading and back to the forecast {SURF_FADE_MS / 3_600_000} h after it, and never more than {LEAN_CAP_FT} ft when the buoys disagree with each other or the forecast. The tag reads the leaned number.</p>
      <p>
        Likely range: the spread is {SURF_SPREAD_SOURCE}, with this spot's error against the buoy ({UNTESTED_ERROR_FT} ft assumed until it has a record). At least {BAND_FLOOR_FT} ft each way.
      </p>
      <p>
        Buoy check: NDBC{b === null ? '' : ` ${b.buoy.id}`}, its latest reading, part by part, broken at this beach by the same formula. Within {BUOY_MATCH_FT} ft of the line is "in line".
      </p>
      <p>Buoy dots: that reading, and the ones this phone checked here earlier today, once an hour while the app was open.</p>
      <p>This spot: {skillLine(stats, 'ft')}.</p>
      <p>
        The week, checked:{' '}
        {bias === null ? `this phone keeps its seven-day calls here; after ${WEEK_BIAS_MIN_DAYS} days, how far each day ahead ran from the day's own call shows here` : `each day's early calls against its own call on the day (leaned to the buoy), in bins of a foot: ${weekBiasLine(bias)}`}.
      </p>
      <p>
        Tags: Flat under {SURF_FUN_FT} ft, Fun {SURF_FUN_FT}–{SURF_FIRING_FT} ft, Firing {SURF_FIRING_FT} ft and up and clean; messy onshore drops a step. Clean: wind under 5 kt, offshore, or cross-offshore under 8 kt. Messy: onshore, 10 kt or more. Wind of {CHOP_WIND_KT} kt or more from cross-shore round to onshore chops it: never clean, and "Poor · choppy" or "Fair · textured" in place of the tag.
      </p>
      <p>An estimate from an offshore forecast, not a surf report.</p>
    </>
  )
}

/*
 * The way a part of the sea goes (Batch FIX, Section 1.3). The glyph's head
 * was drawn at the bottom and then turned by from + 180, so it pointed back
 * the way the sea came from: 44099's NE wind sea drew an arrow to the NE.
 * The head is at the top now, where every other arrow in the app has it,
 * and the turn is the way it goes (src/components/arrowBearings.test.tsx).
 */
export function PartArrow({ fromDeg }: { fromDeg: number }) {
  const to = (((fromDeg + 180) % 360) + 360) % 360
  return (
    <svg className="dsurf__parrow" viewBox="-8 -8 16 16" aria-label={`from ${compass(fromDeg)}`}>
      <path d="M0 6 L0 -6 M-3.5 -2.5 L0 -6 L3.5 -2.5" transform={`rotate(${to})`} data-to={Math.round(to)} />
    </svg>
  )
}
