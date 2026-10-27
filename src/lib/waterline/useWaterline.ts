import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../../core/geo.ts'
import { levelAt } from '../../core/tide.ts'
import { KIND_BAND, KIND_THIN, KIND_WET_SAND, meanRange, nearGround, waterNavd, waterlineMap, type OffsetChoice } from '../../core/waterline.ts'
import type { ScanContext } from '../lidar/applyScan.ts'
import { unmercator } from '../lidar/grid.ts'
import { KIND } from '../lidar/raster.ts'
import type { TideInfo } from '../useTide.ts'
import { offsetFor } from './datums.ts'

/*
 * THE WATERLINE FOR THE 2D MAP: the kept scan's ground, the tide at the time
 * on the bar, and the station offset (borrowed and said so, or the venue's
 * own), drawn as an image over the scanned patch. Band, wet sand between now
 * and low tide, and the thin-water strip at low tide; nothing over the sea or
 * where the scan measured no ground.
 */
export interface Waterline {
  choice: OffsetChoice
  widthFt: number | null
  /** The image, and its corners for MapLibre: top-left, top-right, bottom-right, bottom-left. */
  url: string
  coordinates: [[number, number], [number, number], [number, number], [number, number]]
  scanYear: number | null
}

/* The data colours: the tide's blue for the band and wet sand, the sun's amber for the reflection strip. */
const BAND: [number, number, number, number] = [108, 196, 255, 230]
const WET: [number, number, number, number] = [108, 196, 255, 90]
const THIN: [number, number, number, number] = [255, 213, 74, 120]

export function useWaterline(enabled: boolean, venue: LatLon | null, tide: TideInfo, scan: ScanContext | null, at: Date | null): Waterline | null | 'no-offset' {
  const [choice, setChoice] = useState<OffsetChoice | null | 'none'>(null)
  const station = tide.status === 'ok' ? tide.station : null
  const gt = tide.status === 'ok' ? meanRange(tide.predictions.extremes) : null
  useEffect(() => {
    if (!enabled || venue === null || station === null) return
    let live = true
    void offsetFor(venue, station, gt).then((c) => {
      if (live) setChoice(c ?? 'none')
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, venue?.lat, venue?.lon, station?.id])

  const feet = tide.status === 'ok' && at !== null ? levelAt(tide.predictions.curve, at) : null
  /* Recomputed when the water moves a centimetre, not on every frame of the time bar. */
  const levelCm = feet === null ? null : Math.round(feet * 30.48)
  const lowFeet = useMemo(() => {
    if (tide.status !== 'ok' || at === null) return null
    const near = tide.predictions.extremes.filter((e) => e.kind === 'low' && Math.abs(e.at.getTime() - at.getTime()) < 7 * 3_600_000)
    return near.length === 0 ? null : Math.min(...near.map((e) => e.feet))
  }, [tide, at])

  /* Measured ground only, once per scan: the sea's surface returns are not ground. A scan kept before the mask: what is not water on top. */
  const measured = useMemo(() => {
    if (scan === null) return null
    const r = scan.rasters
    if (r.ground === undefined) return (i: number) => r.kind[i] !== KIND.water && r.kind[i] !== KIND.none
    const near = nearGround(r.ground, r.width, r.height)
    return (i: number) => near[i] === 1
  }, [scan])

  return useMemo(() => {
    if (!enabled || scan === null || measured === null || levelCm === null || choice === null) return null
    if (choice === 'none') return 'no-offset'
    const r = scan.rasters
    const level = waterNavd(levelCm / 30.48, choice.offsetM)
    const low = lowFeet === null ? level : Math.min(level, waterNavd(lowFeet, choice.offsetM))
    /* The scan's cells are a ground metre each (raster.ts). */
    const m = waterlineMap({ width: r.width, height: r.height, cellM: 1, dtm: r.dtm }, level, low, choice.uncertaintyM, measured)
    const canvas = document.createElement('canvas')
    canvas.width = r.width
    canvas.height = r.height
    const ctx = canvas.getContext('2d')
    if (ctx === null) return null
    const img = ctx.createImageData(r.width, r.height)
    for (let i = 0; i < m.kind.length; i += 1) {
      const c = m.kind[i] === KIND_BAND ? BAND : m.kind[i] === KIND_THIN ? THIN : m.kind[i] === KIND_WET_SAND ? WET : null
      if (c !== null) img.data.set(c, i * 4)
    }
    ctx.putImageData(img, 0, 0)
    const tl = unmercator(r.minx, r.maxy)
    const br = unmercator(r.minx + r.width * r.cell, r.maxy - r.height * r.cell)
    return {
      choice,
      widthFt: m.widthFt,
      url: canvas.toDataURL('image/png'),
      coordinates: [
        [tl.lon, tl.lat],
        [br.lon, tl.lat],
        [br.lon, br.lat],
        [tl.lon, br.lat],
      ],
      scanYear: scan.scan.year,
    }
  }, [enabled, scan, measured, levelCm, lowFeet, choice])
}
