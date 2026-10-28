import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../../core/geo.ts'
import { levelAt } from '../../core/tide.ts'
import { meanRange, waterNavd, type OffsetChoice } from '../../core/waterline.ts'
import { COAST_ZOOM } from '../coast.ts'
import { boxAround, tilesInBox } from '../tileRange.ts'
import { loadVectorTile, oceanFeatures, pierFeatures, vectorExtent } from '../vectorTiles.ts'
import type { TilePoint } from '../../core/oceanMask.ts'
import { fetchMarine, fetchSkyHours, fetchWindMonth, hourlyAt, type Hourly } from '../tideSheetData.ts'
import type { TideInfo } from '../useTide.ts'
import { offsetFor } from '../waterline/datums.ts'
import type { CinemaInputs } from '../../three/cinema.ts'

/*
 * WHAT THE CINEMATIC PREVIEW DRAWS FROM, asked only while Preflight is open:
 * the sea (Open-Meteo Marine), the wind and the sky's cloud and visibility
 * (Open-Meteo), where the ocean is (the map tiles) and the water's height
 * (the NOAA tide with the station offset, src/lib/waterline/). Each is
 * optional: what is missing is drawn plainly, never made up, and the water
 * with no known offset sits at 0 m and the preview says so.
 */
export const SEA_MASK_HALF_M = 6000
/* 1024 across 12 km: 11.7 m a pixel. It was 256 (47 m), and the shore drew in 47 m stairs and a pier 8 m wide could not be cut out of it. */
const MASK_PX = 1024
/* The sea grown by this many pixels (23 m) under the beach, so the ground against the water's height draws the shore. */
const GROW_PX = 2
/* Piers are looked for this far from the venue, from the zoom-14 tiles: the pier, and its neighbours along a beach. */
const PIER_SEARCH_M = 2000
const PIER_ZOOM = 14
/* A pier mapped as a line, drawn this wide. */
const PIER_LINE_M = 10

/*
 * WHERE THE OCEAN IS, as a mask image around the venue: the map's ocean
 * (OpenMapTiles water, class ocean) drawn white on black, grown a little
 * under the beach, with the piers (transportation, class pier) cut back out.
 * The pier at Virginia Beach is only in the photograph, at the sea floor;
 * drawn water over the map's ocean hid it (28 Oct).
 */
export async function seaMask(venue: LatLon): Promise<{ url: string; halfM: number } | null> {
  const canvas = document.createElement('canvas')
  canvas.width = MASK_PX
  canvas.height = MASK_PX
  const ctx = canvas.getContext('2d')
  if (ctx === null) return null
  const mPerLat = 111_320
  const mPerLon = 111_320 * Math.cos((venue.lat * Math.PI) / 180)
  const pxPerM = MASK_PX / (2 * SEA_MASK_HALF_M)
  /* A tile's point to the mask's pixel. */
  const toPx = (tx: number, ty: number, z: number, extent: number, p: TilePoint): [number, number] => {
    const n = 2 ** z
    const lon = ((tx + p.x / extent) / n) * 360 - 180
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + p.y / extent)) / n))) * 180) / Math.PI
    return [MASK_PX / 2 + (lon - venue.lon) * mPerLon * pxPerM, MASK_PX / 2 - (lat - venue.lat) * mPerLat * pxPerM]
  }
  const trace = (tx: number, ty: number, z: number, extent: number, rings: TilePoint[][]) => {
    for (const ring of rings) {
      ring.forEach((p, i) => {
        const [x, y] = toPx(tx, ty, z, extent, p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.closePath()
    }
  }
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, MASK_PX, MASK_PX)
  let any = false
  for (const id of tilesInBox(boxAround(venue, SEA_MASK_HALF_M * Math.SQRT2), COAST_ZOOM)) {
    const tile = await loadVectorTile({ z: COAST_ZOOM, x: id.x, y: id.y })
    if (tile === null) return null
    const extent = vectorExtent(tile)
    for (const rings of oceanFeatures(tile)) {
      any = true
      ctx.beginPath()
      trace(id.x, id.y, COAST_ZOOM, extent, rings)
      ctx.fillStyle = '#fff'
      ctx.fill('evenodd')
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = GROW_PX * 2
      ctx.stroke()
    }
  }
  if (!any) return null
  /* The piers, cut out: polygons filled, lines stroked PIER_LINE_M wide. */
  for (const id of tilesInBox(boxAround(venue, PIER_SEARCH_M), PIER_ZOOM)) {
    const tile = await loadVectorTile({ z: PIER_ZOOM, x: id.x, y: id.y })
    if (tile === null) continue
    const extent = vectorExtent(tile)
    const piers = pierFeatures(tile)
    ctx.fillStyle = '#000'
    ctx.strokeStyle = '#000'
    for (const rings of piers.polygons) {
      ctx.beginPath()
      trace(id.x, id.y, PIER_ZOOM, extent, rings)
      ctx.fill('evenodd')
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.lineWidth = Math.max(2, PIER_LINE_M * pxPerM)
    ctx.lineCap = 'round'
    for (const line of piers.lines) {
      ctx.beginPath()
      line.forEach((p, i) => {
        const [x, y] = toPx(id.x, id.y, PIER_ZOOM, extent, p)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }
  }
  return { url: canvas.toDataURL('image/png'), halfM: SEA_MASK_HALF_M }
}

interface Loaded {
  marine: Hourly | null
  wind: Hourly | null
  sky: Hourly | null
  mask: { url: string; halfM: number } | null
  offset: OffsetChoice | null
}

export function useCinemaData(open: boolean, venue: LatLon | null, tide: TideInfo, at: Date): CinemaInputs | null {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null
  const station = tide.status === 'ok' ? tide.station : null
  const gt = tide.status === 'ok' ? meanRange(tide.predictions.extremes) : null
  useEffect(() => {
    if (!open || lat === null || lon === null) return
    let live = true
    const v = { lat, lon }
    void Promise.all([
      fetchMarine(v).catch(() => null),
      fetchWindMonth(v).catch(() => null),
      fetchSkyHours(v).catch(() => null),
      seaMask(v).catch(() => null),
      station === null ? Promise.resolve(null) : offsetFor(v, station, gt).catch(() => null),
    ]).then(([m, w, s, mask, off]) => {
      if (live) setLoaded({ marine: m?.value ?? null, wind: w?.value ?? null, sky: s?.value ?? null, mask, offset: off })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lat, lon, station?.id])

  /* To the hour: the forecast is hourly, and the preview need not rebuild as the bar moves. */
  const hour = Math.round(at.getTime() / 3_600_000)
  const feet = tide.status === 'ok' ? levelAt(tide.predictions.curve, at) : null
  const levelCm = feet === null ? null : Math.round(feet * 30.48)
  return useMemo(() => {
    if (!open || loaded === null || lat === null || lon === null) return null
    const when = new Date(hour * 3_600_000)
    const m = loaded.marine
    const w = loaded.wind
    const s = loaded.sky
    const pick = (h: Hourly | null, ...names: string[]) => {
      if (h === null) return null
      for (const n of names) {
        const v = hourlyAt(h, n, when)
        if (v !== null) return v
      }
      return null
    }
    const low = pick(s, 'cloud_cover_low')
    const mid = pick(s, 'cloud_cover_mid')
    const high = pick(s, 'cloud_cover_high')
    const vis = pick(s, 'visibility')
    return {
      sea: {
        heightM: pick(m, 'wave_height'),
        periodS: pick(m, 'swell_wave_period', 'wave_period'),
        fromDeg: pick(m, 'swell_wave_direction', 'wave_direction'),
        windMps: pick(w, 'wind_speed_10m'),
        windFromDeg: pick(w, 'wind_direction_10m'),
      },
      waterLevelM: loaded.offset === null || levelCm === null ? null : waterNavd(levelCm / 30.48, loaded.offset.offsetM),
      cover: low === null && mid === null && high === null ? null : { low, mid, high },
      visibilityKm: vis === null ? null : vis / 1000,
      seaMask: loaded.mask,
      seed: Math.round(lat * 1000) * 7919 + Math.round(lon * 1000) * 104_729 + hour,
    }
  }, [open, loaded, lat, lon, hour, levelCm])
}
