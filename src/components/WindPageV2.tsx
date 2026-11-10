import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { squareThumbUrl } from '../lib/thumb.ts'
import { CIRCLE_M, windToBeach, type WindToBeach } from '../core/coastFacing.ts'
import { compassPoint } from '../core/field.ts'
import { STABILITY_WORD } from '../core/localWind.ts'
import { formatClock, formatHour, formatShortHour } from '../core/timezone.ts'
import { overRated, windTo } from '../core/windModels.ts'
import { AGREE_MPS, beachLine, hourIndexOf, cardinalBoxes, DIAL_C, DIAL_SIZE, dialLabels, dialSectors, modelsAgreeing, RING_R, sectorPath, windFlip } from '../core/windDial.ts'
import { coastFacing } from '../lib/coast.ts'
import { retrying } from '../lib/retrying.ts'
import { fetchBriefWind, type Hourly } from '../lib/tideSheetData.ts'
import { useWeatherEpoch } from '../lib/useWeatherStatus.ts'
import { calmDirection, isCalm, windAt, windWords, type WindNow } from '../lib/windNow.ts'
import { useStationObs, type StationNow } from '../lib/useStationObs.ts'
import type { DetailId } from '../lib/detailTabs.ts'
import { formatRange, formatWind, windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { fetchMeasuredWind, fetchWindModels, MODEL_NAME, WIND_MODELS, type Measured, type WindModels } from '../lib/windModelsData.ts'
import { DCard, DetailShell } from './DetailShell.tsx'

/*
 * WIND, v2 (Batch N, Section 3; board "DETAIL v2 · Wind"). The new home's
 * look: speed, direction, onshore or offshore and the gusts in one headline;
 * a compass with THIS beach drawn at its real angle, tinted by what a wind
 * from each side does to it, and an arrow where the wind goes; the
 * next 12 hours as arrows coloured the same way, with the hour it turns;
 * tiles for 400 ft (when a drone is in play), the nearest station now and
 * how far apart the five models are.
 *
 * ONE ONSHORE / OFFSHORE: windToBeach (src/core/coastFacing.ts) for the tag,
 * the dial's tint (src/core/windDial.ts asks it per degree) and the hours.
 * The facing is the map tiles' (src/lib/coast.ts coastFacing).
 */
export interface WindPageV2Props {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  ground: string
  onBack: () => void
  onSwitch: (id: DetailId) => void
  onMap: () => void
  /** Shown as the 400 ft tile only when given: the lead passes it when showsDrone (src/lib/activities.ts) holds. */
  drone?: { name: string; maxWindMps: number | null } | null
  /** Batch Flow, Section 6: Map, the map's moving wind at the spot. */
  onWindMap?: () => void
}

/** null while asking; 'inland' with no sea in reach; 'unavailable' when the tiles did not load. */
export type FacingState = number | 'inland' | 'unavailable' | null

export interface WindData {
  models: WindModels | null
  measured: Measured[]
}

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function WindPageV2({ venue, placeName, timeZone, units, ground, onBack, onSwitch, onMap, drone = null, onWindMap }: WindPageV2Props) {
  const now = useMinute()
  const key = `${venue.lat},${venue.lon}`
  const [data, setData] = useState<{ key: string; value: WindData } | null>(null)
  const [facing, setFacing] = useState<{ key: string; value: FacingState } | null>(null)
  const [wx, setWx] = useState<{ key: string; value: Hourly | null } | null>(null)
  const epoch = useWeatherEpoch()
  useEffect(() => {
    let live = true
    const at = { lat: venue.lat, lon: venue.lon }
    /* Batch Map A3/A4: the models are asked again (5 s, 20 s, 60 s, and when the network comes back) until they arrive; the page shows the one wind now meanwhile. */
    const stop = retrying(async () => {
      const [models, measured] = await Promise.all([fetchWindModels(at).catch(() => null), fetchMeasuredWind(at).catch(() => [])])
      if (live) setData({ key, value: { models, measured } })
      return models !== null
    })
    void coastFacing(at)
      .then((f) => {
        if (live) setFacing({ key, value: typeof f === 'string' ? f : f.facing })
      })
      .catch(() => {
        if (live) setFacing({ key, value: 'unavailable' })
      })
    return () => {
      live = false
      stop()
    }
  }, [key, venue.lat, venue.lon])
  /* The one wind now (src/lib/windNow.ts): the briefing's wind through the forecast cache, as the home reads it. */
  useEffect(() => {
    let live = true
    void fetchBriefWind({ lat: venue.lat, lon: venue.lon })
      .catch(() => null)
      .then((h) => {
        if (live) setWx((prev) => (h === null && prev !== null && prev.key === key ? prev : { key, value: h }))
      })
    return () => {
      live = false
    }
  }, [key, venue.lat, venue.lon, epoch])
  const loaded = data !== null && data.key === key ? data.value : null
  const face = facing !== null && facing.key === key ? facing.value : null
  /* Batch MAP2, Section 2: leaned toward a station within 15 km that reported in the last hour, as the home. */
  const stationObs = useStationObs(venue)
  const shared = windAt(wx !== null && wx.key === key ? wx.value : null, now, stationObs)
  return (
    <DetailShell id="wind" ground={ground} onBack={onBack} onSwitch={onSwitch} onMap={onMap} how={<WindHow now={now} data={loaded} facing={face} unit={units.wind} lean={stationObs} timeZone={timeZone} />}>
      {onWindMap === undefined ? null : (
        /* Batch Flow, Section 6 (boards D_Wind, D_WindMap): Data here; Map is the map's moving wind at the spot. */
        <div className="ui-seg dwind__mode" role="tablist" aria-label="Data or map">
          <button type="button" role="tab" aria-selected className="ui-seg__opt ui-seg__opt--on">
            Data
          </button>
          <button type="button" role="tab" aria-selected={false} className="ui-seg__opt" onClick={onWindMap}>
            Map
          </button>
        </div>
      )}
      <WindContent now={now} data={loaded} facing={face} placeName={placeName} timeZone={timeZone} units={units} drone={drone} shared={shared} photo={squareThumbUrl(venue)} />
    </DetailShell>
  )
}

const KIND_WORD: Record<WindToBeach, string> = { offshore: 'Offshore', cross: 'Cross-shore', onshore: 'Onshore' }
const STRIP_HOURS = 12
/** One arrow every this many hours across the twelve: six, as on the board. */
const STRIP_STEP = 2

export function WindContent({ now, data, facing, placeName, timeZone, units, drone, shared = null, photo = null }: { now: Date; data: WindData | null; facing: FacingState; placeName: string; timeZone: string; units: Units; drone: { name: string; maxWindMps: number | null } | null; shared?: WindNow | null; photo?: string | null }) {
  const unit = units.wind
  const say = (mps: number | null) => {
    const v = windIn(mps, unit)
    return v === null ? '—' : `${Math.round(v)} ${windUnitLabel(unit)}`
  }
  const face = typeof facing === 'number' ? facing : null
  const models = data?.models ?? null
  const i = models === null ? -1 : hourIndexOf(models.hours, now)
  /* Calm has no direction (src/lib/windNow.ts calmDirection; Batch QA, Section 0B): no arrow, no side, under 3 kt. */
  const hour0 = models === null || i < 0 ? null : models.byLevel.ground[i]
  const hour = hour0 === null || hour0 === undefined ? hour0 : { ...hour0, from: calmDirection(hour0.median, hour0.from) }
  const kicker = <p className="dwind__kick">{placeName === '' ? 'Now' : `${placeName} · now`}</p>

  if (data === null || models === null || hour === null) {
    /* Batch Map A4: never a dash and a blank page. The one wind now (the home's) when it is here, the beach on the dial, and that the models are still being asked. */
    const sKind = shared === null || shared.fromDeg === null || face === null ? null : windToBeach(shared.fromDeg, face)
    return (
      <>
        <div className="dhead">
          {kicker}
          <p className="dhead__big" data-shared="wind" data-value={windWords(shared, unit) ?? ''}>
            {shared === null ? '—' : say(shared.mps)}
          </p>
          <p className="dhead__line" data-wind-headline>
            {shared === null ? '' : `${shared.fromDeg === null ? (isCalm(shared.mps) ? 'Light and variable' : 'No one direction') : `from the ${compassPoint(shared.fromDeg)}`}${sKind === null ? '' : ` · ${KIND_WORD[sKind].toLowerCase()}`}${shared.gustMps === null ? '' : ` · gusts ${say(shared.gustMps)}`}`}
          </p>
          <p className="dhead__line dwind__wait" role="status">
            {data === null ? 'Reading five forecasts…' : 'Models still loading · retrying'}
          </p>
        </div>
        {shared === null ? null : (
          <div className="dwind__dialbox">
            <Dial facing={face} fromDeg={shared.fromDeg} />
          </div>
        )}
      </>
    )
  }

  const kind = hour.from === null || face === null ? null : windToBeach(hour.from, face)
  /* Batch Map A2: the headline is the one wind now (the home's); the models draw the rest. */
  const headFrom = shared === null ? hour.from : shared.fromDeg
  const headGust = shared === null ? hour.gust : shared.gustMps
  const headKind = headFrom === null || face === null ? null : windToBeach(headFrom, face)
  const hours = models.byLevel.ground.slice(i, i + STRIP_HOURS).map((r0, k) => {
    const r = { ...r0, from: calmDirection(r0.median, r0.from) }
    return { at: models.hours[i + k], r, kind: r.from === null || face === null ? null : windToBeach(r.from, face) }
  })
  const flip = windFlip(hours)
  const shown = hours.filter((_, k) => k % STRIP_STEP === 0)
  const at400 = models.byLevel['120m'][i]
  const station = data.measured.find((m) => !m.source.startsWith('buoy')) ?? null
  const agree = modelsAgreeing(
    Object.values(models.perModel).map((s) => s[i] ?? null),
    hour.median,
  )
  const rated = drone?.maxWindMps ?? null

  return (
    <>
      <div className="dhead">
        {kicker}
        <p className="dhead__big" data-shared="wind" data-value={windWords(shared ?? { mps: hour.median ?? 0, fromDeg: hour.from, gustMps: hour.gust }, unit) ?? ''}>
          {say(shared?.mps ?? hour.median)}
          {kind === null ? null : <span className={`dwind__tag dwind__tag--${kind}`}>{KIND_WORD[kind]}</span>}
        </p>
        <p className="dhead__line" data-wind-headline>
          {headFrom === null ? (isCalm(shared?.mps ?? hour.median) ? 'Light and variable' : 'No one direction') : `from the ${compassPoint(headFrom)}`}
          {headKind === null ? '' : ` · ${KIND_WORD[headKind].toLowerCase()}`}
          {headGust === null ? '' : ` · gusts ${say(headGust)}`}
        </p>
      </div>

      <div className="dwind__dialbox">
        <Dial facing={face} fromDeg={headFrom} photo={photo} />
        <p className="dwind__note">
          {face === null
            ? facing === 'inland'
              ? `No beach within ${formatRange(CIRCLE_M, units.distance)} to draw · arrow points where the wind goes`
              : facing === 'unavailable'
                ? 'The map tiles for the beach didn\'t load · arrow points where the wind goes'
                : 'Finding the beach… · arrow points where the wind goes'
            : 'dashed line = the beach · arrow points where the wind goes'}
        </p>
      </div>

      <DCard label="Next 12 hours" className="dwind__hours">
        <div className="dwind__strip">
          {shown.map(({ at, r, kind: k }, n) => (
            <div key={at.getTime()} className={`dwind__h${k === null ? '' : ` dwind__h--${k}`}`} data-kind={k ?? 'none'}>
              <span className="dwind__ht">{n === 0 ? 'now' : formatShortHour(at, timeZone)}</span>
              <svg viewBox="-8 -8 16 16" className="dwind__ha" aria-hidden="true">
                {r.from === null ? <circle r={2} /> : <path d="M0 -7 L4.5 4 L0 1.5 L-4.5 4 Z" transform={`rotate(${windTo(r.from).toFixed(0)})`} />}
              </svg>
              <span className="dwind__hs">{r.median === null ? '—' : Math.round(windIn(r.median, unit) ?? 0)}</span>
            </div>
          ))}
        </div>
        {face === null ? null : (
          <p className="dwind__flip" data-flip={flip?.to ?? 'none'}>
            {flip === null ? (kind === null ? '' : `${KIND_WORD[kind]} all 12 hours`) : `Turns ${KIND_WORD[flip.to].toLowerCase()} around ${formatHour(flip.at, timeZone)}`}
          </p>
        )}
      </DCard>

      <DCard className="dwind__tiles">
        {drone === null ? null : (
          <div className="dwind__tile">
            <p className="dcard__label">At 400 ft</p>
            <p className="dwind__big">{say(at400?.median ?? null)}</p>
            {rated !== null && overRated(at400?.median ?? null, rated) ? <p className="dwind__line">over rated {say(rated)}</p> : null}
          </div>
        )}
        <div className="dwind__tile">
          <p className="dcard__label">{station === null ? 'Station' : `Station ${station.source}`}</p>
          <p className="dwind__big">{station === null ? '—' : `${say(station.mps)}${station.fromDeg === null ? '' : ` ${compassPoint(station.fromDeg)}`}`}</p>
          <p className="dwind__line">{station === null ? 'none answered' : formatClock(station.at, timeZone)}</p>
        </div>
        <div className="dwind__tile">
          <p className="dcard__label">Models</p>
          <p className="dwind__big">{agree === null ? '—' : agree.agree === agree.of ? `${agree.of} agree` : `${agree.agree} of ${agree.of}`}</p>
          <p className="dwind__line">{agree === null ? 'no speed said' : `within ${say(AGREE_MPS)}`}</p>
        </div>
      </DCard>
    </>
  )
}

/** The compass: the tint from windToBeach, the letters, the beach (dashed), offshore and onshore, and the arrow where the wind goes. */
export function Dial({ facing, fromDeg, photo = null }: { facing: number | null; fromDeg: number | null; photo?: string | null }) {
  const labels = facing === null ? [] : dialLabels(facing)
  const line = facing === null ? null : beachLine(facing)
  /* The picture shows once it has loaded; a failed one is never drawn (WebKit draws a broken-image mark in its place). */
  const [shown, setShown] = useState<{ url: string; ok: boolean } | null>(null)
  const state = shown !== null && shown.url === photo ? shown.ok : null
  return (
    <svg className="dwind__dial" viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`} role="img" aria-label={fromDeg === null ? 'Compass' : `Compass: the wind comes from the ${compassPoint(fromDeg)} and goes toward the ${compassPoint(windTo(fromDeg))}`}>
      <circle className="dwind__face" cx={DIAL_C} cy={DIAL_C} r={RING_R} />
      {photo === null || state === false ? null : (
        /* Batch Flow, Section 6 (board D_Wind): the spot from above, faded, under the dial: the real coastline under the beach line. */
        <>
          <clipPath id="dialClip">
            <circle cx={DIAL_C} cy={DIAL_C} r={RING_R} />
          </clipPath>
          <image href={photo} x={DIAL_C - RING_R} y={DIAL_C - RING_R} width={RING_R * 2} height={RING_R * 2} clipPath="url(#dialClip)" className={`dwind__photo${state === true ? ' dwind__photo--on' : ''}`} preserveAspectRatio="xMidYMid slice" onLoad={() => setShown({ url: photo, ok: true })} onError={() => setShown({ url: photo, ok: false })} />
        </>
      )}
      {facing === null
        ? null
        : dialSectors(facing).map((s) => (
            <path key={s.start} className={`dwind__sector dwind__sector--${s.kind}`} d={sectorPath(s)} data-kind={s.kind} />
          ))}
      <circle className="dwind__ring" cx={DIAL_C} cy={DIAL_C} r={RING_R} />
      {line === null ? null : <line className="dwind__beach" {...line} data-beach />}
      {cardinalBoxes().map((c) => (
        <text key={c.text} className="dwind__card" x={c.x} y={c.y} textAnchor="middle" dominantBaseline="central">
          {c.text}
        </text>
      ))}
      {labels.map((l) => (
        <text key={l.text} className={`dwind__lab dwind__lab--${l.text}`} x={l.x} y={l.y} textAnchor="middle" dominantBaseline="central" data-label={l.text}>
          {l.text}
        </text>
      ))}
      {fromDeg === null ? null : (
        /* Where the wind GOES: from the rim it comes from, through the middle, to the rim it blows toward. */
        <g transform={`rotate(${windTo(fromDeg).toFixed(1)} ${DIAL_C} ${DIAL_C})`} className="dwind__arrow" data-to={Math.round(windTo(fromDeg))}>
          <line x1={DIAL_C} y1={DIAL_C + RING_R - 6} x2={DIAL_C} y2={DIAL_C - RING_R + 22} />
          <path d={`M${DIAL_C} ${DIAL_C - RING_R + 6} L${DIAL_C + 9} ${DIAL_C - RING_R + 24} L${DIAL_C - 9} ${DIAL_C - RING_R + 24} Z`} />
          <circle cx={DIAL_C} cy={DIAL_C} r={6} />
        </g>
      )}
    </svg>
  )
}

/** "How we got this": the models, 400 ft and the air's state, the station, the beach. */
export function WindHow({ now, data, facing, unit, lean = null, timeZone = 'UTC' }: { now: Date; data: WindData | null; facing: FacingState; unit: Units['wind']; lean?: StationNow | null; timeZone?: string }) {
  const models = data?.models ?? null
  const i = models === null ? -1 : hourIndexOf(models.hours, now)
  const aloft = models === null || i < 0 ? null : models.aloft[i]
  const stations = data?.measured ?? []
  return (
    <>
      {/* Batch MAP2, Section 2. */}
      <p>
        Now: the forecast's wind{lean === null ? ', no station within 15 km reported in the last hour.' : `, leaned toward ${lean.id}'s report at ${formatClock(lean.at, timeZone)} (${formatWind(lean.mps, unit)}); the lean fades back to the forecast over three hours.`}
      </p>
      <p>Models: {WIND_MODELS.map((m) => MODEL_NAME[m]).join(', ')}, through Open-Meteo: the next 12 hours and the spread are their median (the big number is the wind now, above). “Agree”: a model’s ground speed within {formatWind(AGREE_MPS, unit)} of that median.</p>
      <p>Direction: the circular mean of where the models say it comes from. Arrows point where it goes. Gusts: the highest any model gives.</p>
      <p>
        400 ft: the models’ 120 m level.
        {aloft === null ? '' : ` This hour about ${aloft.factor.toFixed(1)}× the ground wind (${STABILITY_WORD[aloft.cls]}, exponent ${aloft.alpha.toFixed(2)}), from the sun’s height, the cloud and the wind.`}
        {models === null || models.filled120.length === 0 ? '' : ` ${models.filled120.join(' and ')} has no 120 m level: the ground wind times that factor.`}
      </p>
      <p>
        Station: {stations.length === 0 ? 'none answered.' : stations.map((s) => `${s.source} (${s.source.startsWith('buoy') ? 'NOAA buoy' : 'METAR via api.weather.gov'})`).join(', ')}
        {stations.length === 0 ? '' : '. Measured, not forecast.'}
      </p>
      <p>
        Beach: {typeof facing === 'number' ? `faces ${compassPoint(facing)} (${Math.round(facing)}°), from the map tiles’ sea around this spot.` : facing === 'inland' ? 'no sea within 1.5 km.' : 'not known.'} Onshore: from within 45° of straight off the sea. Offshore: within 45° of straight off the land. Between: cross-shore.
      </p>
    </>
  )
}
