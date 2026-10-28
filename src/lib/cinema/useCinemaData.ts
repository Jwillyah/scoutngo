import { useEffect, useMemo, useState } from 'react'
import type { LatLon } from '../../core/geo.ts'
import { levelAt } from '../../core/tide.ts'
import { meanRange, waterNavd, type OffsetChoice } from '../../core/waterline.ts'
import { seaTestAround } from '../coast.ts'
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
const MASK_PX = 256

/* Where the ocean is, as a mask image around the venue, grown by two pixels so the beach itself (the ground against the water's height) draws the shore. */
export async function seaMask(venue: LatLon): Promise<{ url: string; halfM: number } | null> {
  const test = await seaTestAround(venue, SEA_MASK_HALF_M * Math.SQRT2)
  if (test === null) return null
  const sea = new Uint8Array(MASK_PX * MASK_PX)
  let any = false
  const mPerLat = 111_320
  const mPerLon = 111_320 * Math.cos((venue.lat * Math.PI) / 180)
  for (let j = 0; j < MASK_PX; j += 1) {
    for (let i = 0; i < MASK_PX; i += 1) {
      const east = ((i + 0.5) / MASK_PX - 0.5) * 2 * SEA_MASK_HALF_M
      const north = (0.5 - (j + 0.5) / MASK_PX) * 2 * SEA_MASK_HALF_M
      if (test({ lat: venue.lat + north / mPerLat, lon: venue.lon + east / mPerLon })) {
        sea[j * MASK_PX + i] = 1
        any = true
      }
    }
  }
  if (!any) return null
  const canvas = document.createElement('canvas')
  canvas.width = MASK_PX
  canvas.height = MASK_PX
  const ctx = canvas.getContext('2d')
  if (ctx === null) return null
  const img = ctx.createImageData(MASK_PX, MASK_PX)
  for (let j = 0; j < MASK_PX; j += 1) {
    for (let i = 0; i < MASK_PX; i += 1) {
      let on = false
      for (let dj = -2; dj <= 2 && !on; dj += 1) for (let di = -2; di <= 2 && !on; di += 1) on = sea[Math.min(MASK_PX - 1, Math.max(0, j + dj)) * MASK_PX + Math.min(MASK_PX - 1, Math.max(0, i + di))] === 1
      const v = on ? 255 : 0
      img.data.set([v, v, v, 255], (j * MASK_PX + i) * 4)
    }
  }
  ctx.putImageData(img, 0, 0)
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
