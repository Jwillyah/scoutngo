import { describe, expect, it } from 'vitest'
import { calmDirection, markerModelFor, markerStrip, markerWindAt, pointModel, type MarkerWindIn, type PointSeriesLike } from './markerWind.ts'
import type { StationObs } from './nowcast.ts'

/*
 * Batch 3D, Section 4.1: the readout, the hour list and the z4 / z2 view read
 * one wind for a point and an hour (17 Nov live, Cape Henry, 12 PM: 5 kt, 8 kt
 * and 13 kt). The three paths are these calls, with the grids they were fed.
 */
const H = 3_600_000
const T0 = Date.parse('2026-11-17T12:00:00Z')
const times = Array.from({ length: 48 }, (_, i) => T0 + i * H)
/** A grid point whose wind is steady at `mps` from `from`. */
const pt = (lat: number, lon: number, mps: number, from: number): PointSeriesLike => ({ lat, lon, times, speed: times.map(() => mps), from: times.map(() => from), gust: times.map((_, i) => mps * 1.3 + (i === 0 ? 0 : 0)) })
/** The fine block around the marker: four 0.05 degree points, ~8 kt (4.1 m/s). */
const fine = [pt(36.9, -76, 4.1, 30), pt(36.9, -75.95, 4.1, 30), pt(36.95, -76, 4.1, 30), pt(36.95, -75.95, 4.1, 30)]
/** The view's grid at z4: a 1 degree step, 13 kt (6.7 m/s) from the model alone. */
const z4 = [pt(36, -76, 6.7, 90), pt(36, -75, 6.7, 90), pt(37, -76, 6.7, 90), pt(37, -75, 6.7, 90)]
/** The view's grid at z2: a coarser one still, 14 kt. */
const z2 = [pt(30, -80, 7.2, 100), pt(30, -70, 7.2, 100), pt(40, -80, 7.2, 100), pt(40, -70, 7.2, 100)]
const MARK = { lat: 36.92, lon: -75.98 }
const noon = new Date(T0)
const station = (): StationObs => ({ at: new Date(T0 - 7 * 60_000), mps: 2.6, fromDeg: 20, gustMps: 3.1 })

describe('one wind at the marker for a point and an hour', () => {
  it('the readout and every row of the hour list are the same call', () => {
    const i: MarkerWindIn = { model: markerModelFor(fine, z4, 1, MARK.lat, MARK.lon), obs: station(), anchor: null, now: new Date(T0 + 5 * 60_000) }
    const strip = markerStrip(i, times)
    expect(strip).not.toBeNull()
    times.forEach((t, k) => {
      const w = markerWindAt(i, new Date(t))
      expect(strip?.mps[k]).toBe(w?.mps ?? null)
      expect(strip?.gust[k]).toBe(w?.gustMps ?? null)
      expect(strip?.fromDeg[k]).toBe(w?.fromDeg ?? null)
    })
  })
  it('the same point and hour reads the same at z4 and at z2 once the fine block has come', () => {
    const at = (view: PointSeriesLike[]) => markerWindAt({ model: markerModelFor(fine, view, 1, MARK.lat, MARK.lon), obs: station(), anchor: null, now: noon }, noon)
    expect(at(z4)).toEqual(at(z2))
    expect(at(z4)).not.toBeNull()
  })
  it('the model alone is what was 8 kt, never the view\'s 13 kt', () => {
    const w = markerWindAt({ model: markerModelFor(fine, z4, 1, MARK.lat, MARK.lon), obs: null, anchor: null, now: noon }, noon)
    expect(Math.round((w?.mps ?? 0) * 1.9438)).toBe(8)
    const coarse = markerWindAt({ model: markerModelFor(null, z4, 1, MARK.lat, MARK.lon), obs: null, anchor: null, now: noon }, noon)
    expect(Math.round((coarse?.mps ?? 0) * 1.9438)).toBe(13)
  })
  it('a fresh station leans the hour that holds now, in the readout and in the list row alike', () => {
    const i: MarkerWindIn = { model: markerModelFor(fine, z4, 1, MARK.lat, MARK.lon), obs: station(), anchor: null, now: new Date(T0 + 5 * 60_000) }
    const raw = markerWindAt({ ...i, obs: null }, noon)
    const leaned = markerWindAt(i, noon)
    expect(leaned?.mps).toBeLessThan(raw?.mps ?? 0)
    expect(markerStrip(i, times)?.mps[0]).toBe(leaned?.mps)
    /* Far past the station's three hours the model is untouched. */
    const later = new Date(T0 + 8 * H)
    expect(markerWindAt(i, later)?.mps).toBe(markerWindAt({ ...i, obs: null }, later)?.mps)
  })
  it('a stale report leans nothing', () => {
    const old: StationObs = { ...station(), at: new Date(T0 - 3 * H) }
    const i: MarkerWindIn = { model: markerModelFor(fine, z4, 1, MARK.lat, MARK.lon), obs: old, anchor: null, now: noon }
    expect(markerWindAt(i, noon)).toEqual(markerWindAt({ ...i, obs: null }, noon))
  })
  it('the one wind now at the spot stands for the hour that holds now, in the readout and the list', () => {
    const anchor = { at: new Date(T0 + 20 * 60_000), wind: { mps: 2.6, fromDeg: 25, gustMps: 3.2 } }
    const i: MarkerWindIn = { model: markerModelFor(fine, z4, 1, MARK.lat, MARK.lon), obs: null, anchor, now: anchor.at }
    expect(markerWindAt(i, noon)).toEqual(anchor.wind)
    expect(markerWindAt(i, new Date(T0 + 50 * 60_000))).toEqual(anchor.wind)
    expect(markerStrip(i, times)?.mps[0]).toBe(2.6)
    /* The next hour is the model's. */
    expect(markerWindAt(i, new Date(T0 + H))?.mps).not.toBe(2.6)
  })
  it('calm has no direction, a grid with nothing here has no wind (a dash, not a zero)', () => {
    expect(calmDirection(1, 90)).toBeNull()
    expect(calmDirection(5, 90)).toBe(90)
    const far = pointModel(fine, 0.05, 10, 10)
    expect(far(noon)).toBeNull()
    expect(markerStrip({ model: far, obs: null, anchor: null, now: noon }, times)?.mps.every((v) => v === null)).toBe(true)
  })
})
