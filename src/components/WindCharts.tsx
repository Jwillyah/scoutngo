import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { windSide, type WindSide } from '../core/coastFacing.ts'
import { compassPoint } from '../core/field.ts'
import { formatHour, formatShortHour } from '../core/timezone.ts'
import { modelsAgreeing, hourIndexOf } from '../core/windDial.ts'
import type { WindStrip } from '../core/layerTimeline.ts'
import { chartSpan, hoursSaid, modelHours, stripHours, windGrid, windTrend, WIND_TABS } from '../core/windCharts.ts'
import { coastFacing } from '../lib/coast.ts'
import { agoWords, MAX_AGE_MS } from '../lib/nearWind.ts'
import { retrying } from '../lib/retrying.ts'
import { fetchBriefWind, type Hourly } from '../lib/tideSheetData.ts'
import { useStationObs } from '../lib/useStationObs.ts'
import { useWeatherEpoch } from '../lib/useWeatherStatus.ts'
import { windIn, windUnitLabel, type Units } from '../lib/units.ts'
import { calmDirection, windAt, windWords } from '../lib/windNow.ts'
import { fetchMeasuredWind, fetchWindModels, MODEL_NAME, WIND_MODELS } from '../lib/windModelsData.ts'
import { TapInPage, type TapInRow } from './TapInPage.tsx'
import { WindBar } from './WindBar.tsx'
import { WindHow, type FacingState, type WindData } from './WindPageV2.tsx'
import '../styles/windview.css'

/*
 * WIND › CHARTS (Batch SIMPLE-2, Section 5; board Wind_Charts). Wind is the
 * map; "Charts" beside "Map" at its top is this page, the tap-in skeleton:
 *
 *   hero    "NOW · CROSS-SHORE", the one wind now ("8 kt NNE"), the gusts and
 *           where the next 12 hours take it ("building to 13 kt by 3 AM")
 *   chart   the next 24 hours, the one wind bar (WindBar: bars, gust caps,
 *           arrows), drawn from the map layer's own strip at the spot when the
 *           map has it, so Map and Charts show the same bars; else from the
 *           five models' median
 *   grid    the wind by height, the next 12 hours (gnd, 100, 200, 400 ft),
 *           in the bars' colours
 *   rows    Station (the one the headline leans to, with its age) and Models
 *           (two of the five, and how many agree), then "More details ›": the
 *           Wind page v2, unchanged
 *
 * Map | Charts is the skeleton's own pill pair: "Map" (or a swipe right) goes
 * back to the map, nothing else (it never opens Plan a shoot).
 */
export interface WindChartsProps {
  venue: LatLon
  placeName: string
  timeZone: string
  units: Units
  ground: string
  onBack: () => void
  /** Map: back to the map's wind. */
  onMap: () => void
  /** "More details ›": the Wind page v2. */
  onMore: () => void
  /** The map's wind layer at the spot (its timeline's strip), or null when the marker is elsewhere or the layer has not drawn. */
  strip: WindStrip | null
}

const KIND_WORD: Record<WindSide, string> = { offshore: 'offshore', 'cross-offshore': 'cross-offshore', 'cross-shore': 'cross-shore', 'cross-onshore': 'cross-onshore', onshore: 'onshore' }
/** The two models the Models row names (the map's model chips), when they said something. */
const ROW_MODELS = ['gfs_hrrr', 'ecmwf_ifs025'] as const

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export function WindCharts({ venue, placeName, timeZone, units, ground, onBack, onMap, onMore, strip }: WindChartsProps) {
  const now = useMinute()
  const key = `${venue.lat},${venue.lon}`
  const [data, setData] = useState<{ key: string; value: WindData } | null>(null)
  const [facing, setFacing] = useState<{ key: string; value: FacingState } | null>(null)
  const [wx, setWx] = useState<{ key: string; value: Hourly | null } | null>(null)
  const epoch = useWeatherEpoch()
  /* The same asks as the Wind page v2 (and through the same stores): the five models, the stations, the beach. */
  useEffect(() => {
    let live = true
    const at = { lat: venue.lat, lon: venue.lon }
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
  const faceDeg = typeof face === 'number' ? face : null
  const stationObs = useStationObs(venue)
  /* The one wind now (src/lib/windNow.ts), the home's and the map readout's. */
  const told = windAt(wx !== null && wx.key === key ? wx.value : null, now, stationObs)
  const models = loaded?.models ?? null
  /* With no forecast answer for the one wind now, the five models' median this hour (the Wind page v2's own fallback); else nothing. */
  const i0 = models === null ? -1 : hourIndexOf(models.hours, now)
  const m0 = i0 < 0 || models === null ? null : (models.byLevel.ground[i0] ?? null)
  const shared = told ?? (m0 === null || m0.median === null ? null : { mps: m0.median, fromDeg: calmDirection(m0.median, m0.from), gustMps: m0.gust })
  const unit = units.wind
  const say = (mps: number | null) => {
    const v = windIn(mps, unit)
    return v === null ? '—' : `${Math.round(v)} ${windUnitLabel(unit)}`
  }

  const span = useMemo(() => chartSpan(now), [now])
  const fromStrip = useMemo(() => (strip === null ? null : stripHours(strip, span)), [strip, span])
  const hours = useMemo(() => {
    if (fromStrip !== null && hoursSaid(fromStrip) > 0) return fromStrip
    return models === null ? [] : modelHours(models.hours, models.byLevel.ground, span)
  }, [fromStrip, models, span])
  const source = fromStrip !== null && hoursSaid(fromStrip) > 0 ? 'map' : 'models'
  const grid = useMemo(() => (models === null ? null : windGrid(models.hours, models.byLevel.ground, models.byLevel['120m'], now)), [models, now])

  /* The hero: the one wind now, its side to the beach, the gusts, where the next 12 hours take it. */
  const side = shared === null || shared.fromDeg === null || faceDeg === null ? null : windSide(shared.fromDeg, faceDeg)
  const trend = windTrend(shared?.mps ?? null, hours, span, now)
  const trendWords = trend === null ? null : trend.kind === 'steady' ? 'steady the next 12 h' : `${trend.kind} to ${say(trend.mps)} by ${formatHour(trend.at as Date, timeZone)}`
  const sub = [shared?.gustMps == null ? null : `Gusts ${Math.round(windIn(shared.gustMps, unit) ?? 0)}`, trendWords].filter((x): x is string => x !== null).join(' · ')

  /* Station: the one the headline leans to (src/lib/useStationObs.ts), fresh only; else the page's own measured list. */
  const nearNow = stationObs !== null && now.getTime() - stationObs.at.getTime() <= MAX_AGE_MS ? stationObs : null
  const listed = loaded?.measured.find((m) => !m.source.startsWith('buoy')) ?? null
  const measured = listed !== null && now.getTime() - listed.at.getTime() <= MAX_AGE_MS ? listed : null
  const stationRow: TapInRow =
    nearNow !== null
      ? { label: 'Station', value: nearNow.label, detail: `${say(nearNow.rawMps)}${nearNow.fromDeg === null ? '' : ` ${compassPoint(nearNow.fromDeg)}`} · ${agoWords(nearNow.at, now)}`, shared: 'wind-station' }
      : measured !== null
        ? { label: 'Station', value: measured.source, detail: `${say(measured.mps)}${measured.fromDeg === null ? '' : ` ${compassPoint(measured.fromDeg)}`} · ${agoWords(measured.at, now)}`, shared: 'wind-station' }
        : { label: 'Station', value: '—', detail: loaded === null ? 'asking' : 'none reported in 75 min', shared: 'wind-station' }

  /* Models: two of the five by name at this hour, and how many of them all agree (within AGREE_MPS of the median). */
  const i = models === null ? -1 : hourIndexOf(models.hours, now)
  const named = models === null || i < 0 ? [] : ROW_MODELS.flatMap((m) => {
    const v = models.perModel[m]?.[i] ?? null
    return v === null ? [] : [`${MODEL_NAME[m]} ${Math.round(windIn(v, unit) ?? 0)}`]
  })
  const agree = models === null || i < 0 ? null : modelsAgreeing(WIND_MODELS.map((m) => models.perModel[m]?.[i] ?? null), models.byLevel.ground[i]?.median ?? null)
  const modelsRow: TapInRow = {
    label: 'Models',
    value: named.length === 0 ? '—' : named.join(' · '),
    detail: agree === null ? (models === null ? 'asking' : 'no speed said') : agree.agree === agree.of ? `${agree.of} agree` : `${agree.agree} of ${agree.of} agree`,
  }

  return (
    <TapInPage
      title="Wind"
      spot={placeName}
      ground={ground}
      kind="tipage--wind wcharts"
      onBack={onBack}
      how={<WindHow now={now} data={loaded} facing={face} unit={unit} lean={stationObs} timeZone={timeZone} />}
      safety="Forecasts can be wrong · look first"
      tabs={WIND_TABS}
      tab="charts"
      onTab={(id) => {
        if (id === 'map') onMap()
      }}
      hero={{
        eyebrow: side === null ? 'Now' : `Now · ${KIND_WORD[side]}`,
        value: shared === null ? (wx === null && loaded === null ? '…' : '—') : (windWords(shared, unit) ?? '—'),
        sub: sub === '' ? undefined : sub,
        shared: { key: 'wind', value: windWords(shared, unit) ?? '' },
        subData: { 'data-wind-trend': trend?.kind ?? 'none' },
      }}
      rows={[stationRow, modelsRow]}
      onMore={onMore}
    >
      {/* Two cards between the hero and the rows (the board's order): the bars, then the grid. */}
      <section className="tipage__card tipage__chart wcharts__bars" data-wind-chart={source} data-hours={hoursSaid(hours)}>
        <p className="wcharts__k">next 24 h · caps = gusts</p>
        <WindBar hours={hours} span={span} timeZone={timeZone} unit={unit} now={now} label={`The next 24 hours of wind in ${windUnitLabel(unit)}; caps are gusts; arrows point where it blows.`} />
      </section>
      <WindGridCard grid={grid} timeZone={timeZone} unit={unit} />
    </TapInPage>
  )
}

/** The wind by height, the next 12 hours: four rows, a cell an hour, the bars' colours; the speed in each cell for a screen reader and a long look. */
export function WindGridCard({ grid, timeZone, unit }: { grid: ReturnType<typeof windGrid> | null; timeZone: string; unit: Units['wind'] }) {
  const cols = grid?.hours.length ?? 0
  const columns = `3.4em repeat(${Math.max(1, cols)}, minmax(0, 1fr))`
  return (
    <section className="tipage__card wcharts__grid" aria-label={`Wind by height, the next 12 hours, ${windUnitLabel(unit)}`} data-wind-grid={cols}>
      <p className="wcharts__k wcharts__k--caps">By height · next 12 h</p>
      {grid === null || cols === 0 ? (
        <p className="wcharts__none">The models have not said yet.</p>
      ) : (
        <div className="wcharts__table" role="table">
          {grid.rows.map((row) => (
            <div key={row.ft} className="wcharts__row" role="row" style={{ gridTemplateColumns: columns }}>
              <span className="wcharts__rowk" role="rowheader">
                {row.ft === 0 ? 'gnd' : row.ft === 400 ? '400 ft' : row.ft}
              </span>
              {row.cells.map((c, k) => {
                const v = windIn(c.mps, unit)
                return (
                  <span key={grid.hours[k].getTime()} role="cell" className={`wcharts__cell${c.band === null ? ' wcharts__cell--none' : ` wcharts__cell--b${c.band}`}`} title={v === null ? '—' : `${Math.round(v)} ${windUnitLabel(unit)} at ${formatShortHour(grid.hours[k], timeZone)}`} aria-label={v === null ? '—' : `${Math.round(v)}`} />
                )
              })}
            </div>
          ))}
          <div className="wcharts__row wcharts__row--hours" role="row" style={{ gridTemplateColumns: columns }}>
            <span className="wcharts__rowk" />
            {grid.hours.map((h, k) => (
              <span key={h.getTime()} className="wcharts__hour num" role="columnheader">
                {k === 0 ? 'now' : k % 3 === 0 ? formatShortHour(h, timeZone) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
