import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { fogAt, fogLine, stationFog, type FogHour, type FogSpot, type FogStation, type FogWindow } from '../core/fogRisk.ts'
import { radarSample, rainNow, rainPhrase, type QuarterIn, type RadarSample, type RainNow, type RainStation } from '../core/rainNow.ts'
import { coastFacing } from './coast.ts'
import { fogModelHours } from './fogInputs.ts'
import type { Radar } from './stormData.ts'
import { fetchBriefQuarters, fetchBriefWind, type Hourly } from './tideSheetData.ts'
import { useStationObs, type StationReport } from './useStationObs.ts'
import { useWaterTemp } from './waterTemp.ts'
import { useWeatherEpoch } from './useWeatherStatus.ts'

/*
 * FOG AND RAIN AT A SPOT, FOR A SCREEN (Batch SIMPLE-3, Sections 1 and 1b).
 * One hook, so the home's weather tile, its moment card, the Weather page's
 * hero, the Day sheet's fog mark and the Sky pages all say the same fog and
 * the same rain. The rules are src/core/fogRisk.ts and src/core/rainNow.ts;
 * this only gathers their inputs from what the phone already holds:
 *
 *   the hours     the brief's one request (fetchBriefWind: air, dew point,
 *                 wind, visibility, low and mid cloud, rain), through the
 *                 weather store, so no second request
 *   the quarters  the same answer's minutely_15 (fetchBriefQuarters)
 *   the water     src/lib/waterTemp.ts, the Water tile's one reading
 *   the facing    the beach's (src/lib/coast.ts coastFacing), or the
 *                 caller's when it already has one (the briefing's)
 *   the stations  the airports' raw METARs the one station store brought
 *                 back (src/lib/useStationObs.ts reports)
 *   the radar     the caller's scan (useNowcast's Radar, with its grid), when
 *                 it has one; without it rain is read from the stations and
 *                 the minutely forecast alone. Never a second radar fetch.
 *
 * The API is held still for the Sky pages: useFogRain(spot, now, timeZone,
 * { radar?, facing? }) → { fog, fogAt, fogHigh, rain, rainLine, settled }.
 * Nothing is sent anywhere; the spot's coordinate only keys what is asked
 * already.
 */

export interface FogRain {
  /** The one fog line at now ("Fog on the beach", "Fog likely 5–9 AM"), the fog now and the windows ahead; null until the forecast has answered. */
  fog: { line: string | null; now: FogHour; windows: FogWindow[] } | null
  /** The fog risk at an instant; null before the forecast. */
  fogAt: (t: Date) => FogHour | null
  /** High fog in the hour starting at `hourStart` (the Day sheet's mark); null where it could not be said. */
  fogHigh: (hourStart: Date) => boolean | null
  /** Where the rain stands now; null until anything has answered. */
  rain: RainNow | null
  /** "Light rain now · ends ~11:50 PM", "Rain starts ~2:15 PM · light", "Showers nearby · moving NE"; null when dry or unknown. */
  rainLine: string | null
  /** The forecast has answered (or failed): what is null now stays null until it changes. */
  settled: boolean
}

export interface FogRainIn {
  spot: LatLon
  now: Date
  timeZone: string
  /** The brief's hours; null when it did not answer. */
  wx: Hourly | null
  quarters: readonly QuarterIn[] | null
  /** The beach's facing, null inland or unknown. */
  facing: number | null
  /** The spot's water, °C; null when unknown. */
  waterC: number | null
  reports: readonly StationReport[]
  radar: Radar | null
  settled: boolean
}

/** The airports' reports as the fog rules read them. None is on the water: an airport cannot downgrade sea fog (src/core/fogRisk.ts). */
export function fogStationsOf(reports: readonly StationReport[], now: Date): FogStation[] {
  return reports.map((r) => stationFog(r.raw, { id: r.id, km: r.km, onWater: false }, now)).filter((s): s is FogStation => s !== null)
}

/** THE ASSEMBLY, PURE (tests/useFogRain.test.ts on the 21-24 Nov recording). */
export function fogRainFrom(i: FogRainIn): FogRain {
  const stations = fogStationsOf(i.reports, i.now)
  const spot: FogSpot | null = i.wx === null ? null : { lat: i.spot.lat, lon: i.spot.lon, facingDeg: i.facing, waterC: i.facing === null ? null : i.waterC, hours: fogModelHours(i.wx), stations }
  const at = (t: Date): FogHour | null => (spot === null ? null : fogAt(spot, t))
  const fogHigh = (hourStart: Date): boolean | null => {
    const f = at(new Date(hourStart.getTime() + 1_800_000))
    return f === null || f.level === null ? null : f.level === 'high'
  }
  const rainStations: RainStation[] = stations.map((s) => ({ id: s.id, km: s.km, at: s.at, wx: s.wx }))
  const grid = i.radar?.grid ?? null
  const sample: RadarSample | null = i.radar == null || grid === null ? null : radarSample(grid, i.spot, i.radar.scanAt, i.radar.tracks)
  const anything = i.wx !== null || i.quarters !== null || stations.length > 0 || sample !== null
  const rain = anything ? rainNow({ now: i.now, stations: rainStations, radar: sample, quarters: i.quarters ?? [] }) : null
  return {
    fog: spot === null ? null : fogLine(spot, i.now, i.timeZone),
    fogAt: at,
    fogHigh,
    rain,
    rainLine: rain === null ? null : rainPhrase(rain, i.timeZone),
    settled: i.settled,
  }
}

/* The beach's facing, once per spot this session (the sea polygons can take seconds). */
const facings = new Map<string, Promise<number | null>>()
function facingOnce(spot: LatLon): Promise<number | null> {
  const k = `${spot.lat.toFixed(3)},${spot.lon.toFixed(3)}`
  let p = facings.get(k)
  if (p === undefined) {
    p = coastFacing(spot).then(
      (f) => (f === 'inland' || f === 'unavailable' ? null : f.facing),
      () => null,
    )
    facings.set(k, p)
  }
  return p
}

/** Asked again this often while a screen shows it; the weather store answers from what it holds. */
const REFRESH_MS = 10 * 60_000

/**
 * The fog and the rain at `spot`; null `spot` asks nothing. `opts.radar` is
 * the screen's radar scan (useNowcast), `opts.facing` the beach's facing when
 * the screen has it (undefined: looked up here).
 */
export function useFogRain(spot: LatLon | null, now: Date, timeZone: string, opts: { radar?: Radar | null; facing?: number | null } = {}): FogRain {
  const lat = spot?.lat ?? null
  const lon = spot?.lon ?? null
  const key = lat === null || lon === null ? null : `${lat.toFixed(3)},${lon.toFixed(3)}`
  const epoch = useWeatherEpoch()
  const [got, setGot] = useState<{ key: string; wx: Hourly | null; quarters: QuarterIn[] | null; settled: boolean } | null>(null)
  const [seen, setSeen] = useState<{ key: string; facing: number | null } | null>(null)
  const obs = useStationObs(spot)
  const water = useWaterTemp(spot)

  useEffect(() => {
    if (lat === null || lon === null || key === null) return
    let live = true
    const at = { lat, lon }
    const ask = () => {
      void Promise.all([fetchBriefWind(at).catch(() => null), fetchBriefQuarters(at).catch(() => null)]).then(([wx, quarters]) => {
        if (!live) return
        /* A failed refresh keeps what was had. */
        setGot((prev) => (prev !== null && prev.key === key && wx === null ? { ...prev, settled: true } : { key, wx, quarters, settled: true }))
      })
    }
    ask()
    const t = setInterval(ask, REFRESH_MS)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [key, lat, lon, epoch])

  const given = opts.facing
  useEffect(() => {
    if (given !== undefined || lat === null || lon === null || key === null) return
    let live = true
    void facingOnce({ lat, lon }).then((facing) => live && setSeen({ key, facing }))
    return () => {
      live = false
    }
  }, [given, key, lat, lon])

  const mine = got !== null && got.key === key ? got : null
  const facing = given !== undefined ? given : seen !== null && seen.key === key ? seen.facing : null
  const waterC = water.status === 'ok' ? water.reading.c : null
  const reports = obs?.reports ?? NONE
  const radar = opts.radar ?? null
  const minute = Math.floor(now.getTime() / 60_000)
  return useMemo(
    () =>
      lat === null || lon === null
        ? EMPTY
        : fogRainFrom({ spot: { lat, lon }, now: new Date(minute * 60_000), timeZone, wx: mine?.wx ?? null, quarters: mine?.quarters ?? null, facing, waterC, reports, radar, settled: mine?.settled ?? false }),
    [lat, lon, minute, timeZone, mine, facing, waterC, reports, radar],
  )
}

const NONE: readonly StationReport[] = []
const EMPTY: FogRain = { fog: null, fogAt: () => null, fogHigh: () => null, rain: null, rainLine: null, settled: false }
