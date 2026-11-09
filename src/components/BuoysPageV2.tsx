import type { LatLon } from '../core/geo.ts'
import { AIMED_TOLERANCE_DEG, FORECAST_TOLERANCE_FRACTION, FORECAST_TOLERANCE_M, G, versusForecast } from '../core/swellTravel.ts'
import { fitView, inView, viewTiles } from '../core/tileView.ts'
import { formatClock } from '../core/timezone.ts'
import type { BuoyReading } from '../lib/buoy.ts'
import { BUOY_WITHIN_KM, BUOYS_SHOWN, SAME_WATER_DEG } from '../lib/buoy.ts'
import { buoyRows, headlineRow, shortBuoyName, travelWords, waveHeight, type BuoyRow, type OkBuoy } from '../lib/buoyPageWords.ts'
import { buoySplit } from '../lib/buoyWords.ts'
import type { DetailId } from '../lib/detailTabs.ts'
import { IMAGERY_TEMPLATE } from '../lib/offlineSources.ts'
import { hourlyAt, type Hourly } from '../lib/tideSheetData.ts'
import { tileUrl } from '../lib/tileRange.ts'
import { compass } from '../lib/tideWords.ts'
import { formatRange, type Units } from '../lib/units.ts'
import { useBuoyPage } from '../lib/useBuoyPage.ts'
import { DCard, DetailShell } from './DetailShell.tsx'

/*
 * BUOYS, v2 (Batch N, Section 4; board docs/mockups/Detail2B.png). The 2-3
 * nearest NDBC buoys on the water the beach faces (src/lib/buoy.ts), in the
 * new home's look:
 *
 *   headline   "Near <spot>", the biggest reading, its period and direction,
 *              and the nearest buoy against the spot's own wave forecast
 *   map        Esri imagery, dimmed, a few tiles (src/core/tileView.ts): a pin
 *              per buoy with "id · height · period", a dotted line to the spot
 *   list       each buoy's latest reading and its time, and the open-water
 *              travel time to the spot, only when its waves are headed for the
 *              spot (src/core/swellTravel.ts)
 *
 * Only what the buoys sent: a missing period or direction is left out, never filled.
 */

export interface BuoysPageV2Props {
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

export function BuoysPageV2({ venue, placeName, timeZone, units, ground, onBack, onSwitch, onMap }: BuoysPageV2Props) {
  const data = useBuoyPage(venue)
  return (
    <DetailShell id="buoys" ground={ground} onBack={onBack} onSwitch={onSwitch} onMap={onMap} how={<BuoysHow venue={venue} buoys={data.buoys} units={units} />}>
      <BuoysBody venue={venue} placeName={placeName} timeZone={timeZone} units={units} buoys={data.buoys} marine={data.marine} marineFailed={data.marineFailed} />
    </DetailShell>
  )
}

/* ------------------------------------------------------------------ body */

interface BodyProps {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  buoys: BuoyReading[] | null
  marine: Hourly | 'inland' | null
  marineFailed: boolean
}

export function BuoysBody({ venue, placeName, timeZone, units, buoys, marine, marineFailed }: BodyProps) {
  const rows = buoyRows(buoys, venue)
  const near = <p className="dhead__line dbuoy__near">{placeName === '' ? 'Near the spot' : `Near ${placeName}`}</p>
  if (buoys === null) {
    return (
      <div className="dbuoy__head">
        {near}
        <p className="dhead__line">Asking the nearest buoys…</p>
      </div>
    )
  }
  const top = headlineRow(rows)
  if (top === null) {
    const first = buoys[0]
    return (
      <div className="dbuoy__head">
        {near}
        <p className="dhead__big">—</p>
        <p className="dhead__line">{first?.status === 'none' ? first.reason : 'No buoy reading.'}</p>
      </div>
    )
  }
  const how = [top.b.periodS === null ? null : `${Math.round(top.b.periodS)} s`, top.b.fromDeg === null ? null : `from the ${compass(top.b.fromDeg)}`].filter((x) => x !== null).join(' ')
  return (
    <>
      <div className="dbuoy__head">
        {near}
        <p className="dhead__big">{waveHeight(top.b.waveM, units)}</p>
        <p className="dhead__line">{how === '' ? 'biggest reading' : `biggest reading · ${how}`}</p>
        <ForecastLine nearest={rows[0].b} marine={marine} marineFailed={marineFailed} timeZone={timeZone} units={units} />
      </div>
      <section className="dbuoy__mapcard" aria-label="Where the buoys are">
        <BuoyMap venue={venue} rows={rows} units={units} />
      </section>
      <DCard className="dbuoy__listcard">
        <ul className="dbuoy__list">
          {rows.map(({ b, leg }) => (
            <li key={b.buoy.id} className="dbuoy__row">
              <span className={`dbuoy__dot${leg.aimed ? '' : ' dbuoy__dot--off'}`} aria-hidden="true" />
              <span className="dbuoy__what">
                <span className="dbuoy__name">
                  <b>{shortBuoyName(b)}</b> <span className="dbuoy__dim">{b.buoy.id}</span>
                </span>
                <span className="dbuoy__read">
                  {[waveHeight(b.waveM, units), b.periodS === null ? null : `${Math.round(b.periodS)} s`, b.fromDeg === null ? null : `from ${compass(b.fromDeg)}`, formatClock(b.at, timeZone, units.clock)].filter((x) => x !== null).join(' · ')}
                </span>
              </span>
              {leg.minutes === null ? null : (
                <span className="dbuoy__eta">
                  <b>{travelWords(leg.minutes)}</b>
                  <span> to reach you</span>
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="dbuoy__foot">Travel time from swell period and distance · NDBC</p>
      </DCard>
    </>
  )
}

/** "Running smaller than forecast", from the nearest buoy against the spot's own wave forecast at the hour it read. */
function ForecastLine({ nearest, marine, marineFailed, timeZone, units }: { nearest: OkBuoy; marine: Hourly | 'inland' | null; marineFailed: boolean; timeZone: string; units: Units }) {
  let line: string
  if (marine === 'inland') line = 'No sea forecast here to compare'
  else if (marine === null) line = marineFailed ? 'The sea forecast didn’t load' : 'Asking the sea forecast…'
  else {
    const f = hourlyAt(marine, 'wave_height', nearest.at)
    const v = versusForecast(nearest.waveM, f)
    line =
      v === null
        ? `The forecast did not say for ${formatClock(nearest.at, timeZone, units.clock)}`
        : `${v === 'smaller' ? 'Running smaller than forecast' : v === 'bigger' ? 'Running bigger than forecast' : 'Running about as forecast'} · ${nearest.buoy.id} ${waveHeight(nearest.waveM, units)}, beach ${waveHeight(f, units)}`
  }
  return <p className="dhead__line dbuoy__vs">{line}</p>
}

/* ------------------------------------------------------------------ map */

/* The map box, in SVG units: the card scales it to its width. */
const MAP_W = 360
const MAP_H = 250
const MAP_PAD = 40
/* At most this many 256 px tiles; a 360 x 250 box never needs more than 6. */
export const MAP_TILE_CAP = 6
const MAP_ZOOMS: readonly [number, number] = [5, 12]
/* The pills' text, in SVG units: an approximate advance per character for the width of the pill. */
const PILL_FONT = 11
const PILL_CHAR = 6.4
const PILL_H = 20

interface Pill {
  r: BuoyRow
  p: { x: number; y: number }
  x: number
  y: number
  w: number
  text: string
}

function BuoyMap({ venue, rows, units }: { venue: LatLon; rows: BuoyRow[]; units: Units }) {
  const view = fitView([venue, ...rows.map((r) => r.b.buoy.at)], MAP_W, MAP_H, MAP_PAD, MAP_ZOOMS[0], MAP_ZOOMS[1], MAP_TILE_CAP)
  if (view === null) return null
  const tiles = viewTiles(view).slice(0, MAP_TILE_CAP)
  const spot = inView(view, venue)
  /* Each pill above its pin (below when the pin is near the top), kept in the box, and moved off any pill already placed. */
  const pills: Pill[] = []
  for (const r of rows) {
    const p = inView(view, r.b.buoy.at)
    const text = [r.b.buoy.id, waveHeight(r.b.waveM, units), r.b.periodS === null ? null : `${Math.round(r.b.periodS)} s`].filter((x) => x !== null).join(' · ')
    const w = text.length * PILL_CHAR + 16
    const x = Math.max(4, Math.min(MAP_W - 4 - w, p.x - w / 2))
    let y = p.y - 14 - PILL_H < 4 ? p.y + 14 : p.y - 14 - PILL_H
    for (const q of pills) if (Math.abs(q.y - y) < PILL_H + 2 && x < q.x + q.w && q.x < x + w) y = y > q.y ? q.y + PILL_H + 4 : q.y - PILL_H - 4
    pills.push({ r, p, x, y: Math.max(2, Math.min(MAP_H - PILL_H - 2, y)), w, text })
  }
  return (
    <svg className="dbuoy__map" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label="Map of the buoys and the spot">
      {tiles.map((t) => (
        <image key={`${t.z}/${t.x}/${t.y}`} href={tileUrl(IMAGERY_TEMPLATE, t)} x={t.dx} y={t.dy} width={256} height={256} />
      ))}
      <rect width={MAP_W} height={MAP_H} className="dbuoy__shade" />
      {pills.map(({ r, p }) => (
        <line key={`l${r.b.buoy.id}`} x1={p.x} y1={p.y} x2={spot.x} y2={spot.y} className={`dbuoy__path${r.leg.aimed ? '' : ' dbuoy__path--off'}`} />
      ))}
      {pills.map(({ r, p }) => (
        <g key={`p${r.b.buoy.id}`}>
          <circle cx={p.x} cy={p.y} r={11} className="dbuoy__halo" />
          <circle cx={p.x} cy={p.y} r={5.5} className={`dbuoy__pin${r.leg.aimed ? '' : ' dbuoy__pin--off'}`} />
        </g>
      ))}
      {pills.map(({ r, x, y, w, text }) => (
        <g key={`t${r.b.buoy.id}`}>
          <rect x={x} y={y} width={w} height={PILL_H} rx={PILL_H / 2} className="dbuoy__pill" />
          <text x={x + w / 2} y={y + PILL_H / 2 + PILL_FONT * 0.36} textAnchor="middle" className="dbuoy__label">
            {text}
          </text>
        </g>
      ))}
      <circle cx={spot.x} cy={spot.y} r={7} className="dbuoy__spot" />
      <text x={MAP_W - 6} y={MAP_H - 6} textAnchor="end" className="dbuoy__attr">
        Imagery: Esri
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ how */

export function BuoysHow({ venue, buoys, units }: { venue: LatLon; buoys: BuoyReading[] | null; units: Units }) {
  const rows = buoyRows(buoys, venue)
  return (
    <>
      <p>NOAA NDBC, each buoy’s latest reading, through this app’s /api/buoy (it sends a buoy number, never the spot).</p>
      <p>
        Up to {BUOYS_SHOWN} of the nearest buoys within {BUOY_WITHIN_KM} km on the water the beach faces (within {SAME_WATER_DEG}° of its facing).
      </p>
      {rows.map(({ b, leg }) => (
        <p key={b.buoy.id}>
          {shortBuoyName(b)} ({b.buoy.id}): {formatRange(leg.meters, units.distance)}, bearing {Math.round(leg.bearingToSpot)}° to the spot{buoySplit(b) === null ? '' : `; ${buoySplit(b)}`}.
        </p>
      ))}
      <p>Height is the significant wave height (WVHT), period the dominant period (DPD), direction where those waves come from (MWD). The big number is the biggest of these buoys’ heights.</p>
      <p>
        Travel time: deep-water group speed cg = g·T / 4π (g = {G} m/s², T the dominant period); 10 s is 7.8 m/s. Open water only: the last shallow stretch is slower.
      </p>
      <p>Shown only when the waves’ heading (MWD + 180°) is within {AIMED_TOLERANCE_DEG}° of the bearing from the buoy to the spot; the other buoys’ pins and lines are grey.</p>
      <p>
        Smaller / bigger: the nearest buoy against the spot’s own Open-Meteo Marine wave height at the hour the buoy read, not the forecast at the buoy. Same within {FORECAST_TOLERANCE_M} m or {Math.round(FORECAST_TOLERANCE_FRACTION * 100)}%, whichever is larger.
      </p>
      <p>Map: Esri World Imagery, dimmed, at most {MAP_TILE_CAP} tiles.</p>
    </>
  )
}
