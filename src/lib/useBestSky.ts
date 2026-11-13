/*
 * WHERE'S THE COLOR: THE PAGE'S DATA (Batch BEST SKY, Sections 1-2). The next
 * sunrise or sunset, the grid's cloud at its hour (src/lib/bestSkyData.ts,
 * one question per tile), every point scored and the spots ranked on the
 * phone (src/core/bestSky.ts). Spots: the starter list in reach and your
 * saved spots. Distances and bearings from the spot you are on.
 */
import { useEffect, useMemo, useState } from 'react'
import { getPosition, getTimes } from 'suncalc'
import { RADII_MI, rankSpots, roundedCentre, scoreAt, scoreGrid, type RadiusMi, type RankedSpot, type ScoredPoint, type SpotIn } from '../core/bestSky.ts'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { STARTER_SPOTS } from '../data/bestSkySpots.ts'
import { fetchGrid } from './bestSkyData.ts'
import { fetchOsmSpots } from './bestSkyOsm.ts'
import { dedupeSpots } from '../core/osmSpots.ts'
import type { Drift } from '../core/satDrift.ts'

export interface BestSkyEvent {
  kind: 'sunrise' | 'sunset'
  at: Date
  azimuth: number
  /** The colour's window round it, and its deepest moment, by the clock of the sun (about 6 min one side, 16 the other). */
  colorFrom: Date
  colorTo: Date
  peak: Date
  /** Set up this long before. */
  setUp: Date
  dark: Date | null
}

export interface BestSky {
  status: 'loading' | 'ok' | 'failed'
  event: BestSkyEvent | null
  grid: ScoredPoint[]
  ranked: RankedSpot[]
  /** Where you are: the grid's score at the spot. */
  here: ScoredPoint | null
  asked: number
  satAt: Date | null
  /** The satellite was asked (within 3 h of the colour), whether or not it answered. */
  satAsked: boolean
  /** Batch NOW, Section 0.3: how the satellite's patch was carried to the color's time; null without one. */
  drift: Drift | null
}

const MIN = 60_000

/** The next sunrise or sunset after now (one still colouring, up to 20 min past, counts). */
export function nextColorEvent(at: LatLon, now: Date): BestSkyEvent | null {
  const out: BestSkyEvent[] = []
  for (const d of [0, 1]) {
    const t = getTimes(new Date(now.getTime() + d * 86_400_000), at.lat, at.lon)
    for (const kind of ['sunrise', 'sunset'] as const) {
      const e = t[kind]
      if (!(e instanceof Date) || Number.isNaN(e.getTime()) || e.getTime() < now.getTime() - 20 * MIN) continue
      const sunset = kind === 'sunset'
      const colorFrom = new Date(e.getTime() + (sunset ? -6 : -16) * MIN)
      const colorTo = new Date(e.getTime() + (sunset ? 16 : 6) * MIN)
      const dark = (sunset ? t.dusk : t.dawn) as Date | undefined
      out.push({ kind, at: e, azimuth: getPosition(e, at.lat, at.lon).azimuth, colorFrom, colorTo, peak: new Date(e.getTime() + (sunset ? 5 : -5) * MIN), setUp: new Date(colorFrom.getTime() - 10 * MIN), dark: dark instanceof Date && !Number.isNaN(dark.getTime()) ? dark : null })
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime())[0] ?? null
}

export function useBestSky(spot: LatLon | null, radius: RadiusMi, now: Date, saved: readonly { id: string; name: string; at: LatLon }[] = []): BestSky {
  const tenMin = Math.floor(now.getTime() / (10 * MIN))
  const event = useMemo(() => (spot === null ? null : nextColorEvent(spot, new Date(tenMin * 10 * MIN))), [spot?.lat, spot?.lon, tenMin]) // eslint-disable-line react-hooks/exhaustive-deps
  const key = spot === null || event === null ? null : `${spot.lat.toFixed(2)},${spot.lon.toFixed(2)}|${radius}|${event.at.getTime()}`
  const [got, setGot] = useState<{ key: string; grid: ScoredPoint[]; asked: number; satAt: Date | null; satAsked: boolean; failed: boolean; drift: Drift | null } | null>(null)
  /* Batch NOW, Section 0.4: the map's viewpoints, piers, boat ramps and parks on the water, beside the starter list. */
  const [osm, setOsm] = useState<{ key: string; spots: SpotIn[] } | null>(null)
  useEffect(() => {
    if (key === null || spot === null) return
    let live = true
    void fetchOsmSpots(roundedCentre(spot), radius * 1.609344)
      .then((r) => live && setOsm({ key, spots: r.spots }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (key === null || spot === null || event === null) return
    let live = true
    void fetchGrid(spot, radius, event.at)
      .then((g) => {
        if (live) setGot({ key, grid: scoreGrid(g.points, event.azimuth), asked: g.asked, satAt: g.satAt, satAsked: g.satAsked, failed: g.points.length === 0, drift: g.drift ?? null })
      })
      .catch(() => live && setGot({ key, grid: [], asked: 0, satAt: null, satAsked: false, failed: true, drift: null }))
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return useMemo((): BestSky => {
    if (got === null || got.key !== key || spot === null || event === null) return { status: 'loading', event, grid: [], ranked: [], here: null, asked: 0, satAt: null, satAsked: false, drift: null }
    const rKm = radius * 1.609344
    const starter = STARTER_SPOTS.filter((s) => distanceMeters(spot, s.at) / 1000 <= rKm)
    const mapSpots = osm === null || osm.key !== key ? [] : dedupeSpots(starter, osm.spots.filter((s) => distanceMeters(spot, s.at) / 1000 <= rKm), 300, distanceMeters)
    const spots: SpotIn[] = [
      ...starter,
      ...mapSpots,
      ...saved.filter((s) => distanceMeters(spot, s.at) / 1000 <= rKm).map((s) => ({ id: `saved-${s.id}`, name: s.name, at: s.at, facing: null, openDeg: 0, water: false, silhouette: null })),
    ]
    return { status: got.failed ? 'failed' : 'ok', event, grid: got.grid, ranked: rankSpots(got.grid, spots, event.azimuth, spot), here: scoreAt(got.grid, spot), asked: got.asked, satAt: got.satAt, satAsked: got.satAsked, drift: got.drift }
  }, [got, key, spot, event, radius, saved, osm])
}

export const DEFAULT_RADIUS: RadiusMi = RADII_MI[1]
