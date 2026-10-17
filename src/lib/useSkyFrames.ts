import { useEffect, useMemo, useRef, useState } from 'react'
import { hasSatellite, type SkyLayerKind } from '../core/skyLayer.ts'
import type { ForecastCell } from '../core/cloudGrid.ts'
import type { LatLon } from '../core/geo.ts'
import { FORECAST_OPACITY, skySourceFor, type SkySource } from '../core/skyTime.ts'
import { fetchCloudGrid } from './forecast.ts'
import { snapToFrame } from './goesLayer.ts'

/**
 * WHAT THE SKY LAYER SHOWS FOR THE SCRUBBED MOMENT.
 *
 * Past and now get a real GOES frame; the future gets the Open-Meteo cloud
 * grid. The split is at now and it is never blended: see src/core/skyTime.ts.
 *
 * FRAMES LIVE IN MEMORY FOR THIS SESSION ONLY. Nothing here writes to
 * localStorage, nothing goes into a field pack, and the only cache is the
 * browser's own for tile images plus the small map below for grid responses.
 * Reload and it is all gone, which is the right lifetime for a picture of the
 * weather.
 */
export interface SkyState {
  source: SkySource
  /** The frame to draw, or null when the future is being shown. */
  frameAt: Date | null
  /** The forecast cells, empty unless the future is being shown. */
  cells: ForecastCell[]
  /** How solid to draw them. Zero past a week, where nothing is drawn. */
  opacity: number
  /** Why there is no forecast, when there is not. */
  forecastProblem: string | null
}

export function useSkyFrames(
  venue: LatLon | null,
  scrubbedAt: Date | null,
  timeZone: string | null,
  enabled: boolean,
  /**
   * WHICH LAYER IS BEING SHOWN, because it decides whether the model grid is
   * needed at all.
   *
   * CLOUD has a photograph for now and the past, so the grid is only fetched
   * for the future. WIND HAS NO PHOTOGRAPH AT ANY TIME: there is no satellite
   * image of wind at 200 feet, so the grid is the only source there is and it
   * is fetched for every hour, including ones already past.
   *
   * Without this the wind layer drew nothing except for future hours, which
   * on a map looks exactly like a layer that does not work.
   */
  layer: SkyLayerKind = 'cloud',
): SkyState {
  const [cells, setCells] = useState<ForecastCell[]>([])
  const [forecastProblem, setProblem] = useState<string | null>(null)

  /*
   * Session-only, and keyed on the venue and the HOUR: the grid is a forecast
   * for an hour, so dragging the scrubber inside one hour must not refetch
   * twenty-five points. Never persisted.
   */
  const grids = useRef(new Map<string, ForecastCell[]>())

  const source = useMemo(
    () =>
      scrubbedAt === null
        ? null
        : skySourceFor(scrubbedAt, new Date(), (at) => snapToFrame(at)),
    [scrubbedAt],
  )

  const hourKey =
    venue === null || scrubbedAt === null
      ? null
      : `${venue.lat.toFixed(3)},${venue.lon.toFixed(3)}|${scrubbedAt.toDateString()}|${scrubbedAt.getHours()}`

  const wantForecast =
    enabled &&
    source !== null &&
    (hasSatellite(layer) ? source.kind === 'forecast' && source.draw : true)

  useEffect(() => {
    if (!wantForecast || venue === null || scrubbedAt === null || timeZone === null) {
      setCells([])
      setProblem(null)
      return
    }
    if (hourKey === null) return

    const held = grids.current.get(hourKey)
    if (held !== undefined) {
      setCells(held)
      setProblem(null)
      return
    }

    let live = true
    void fetchCloudGrid(venue, scrubbedAt, timeZone).then((result) => {
      if (!live) return
      if (result.status !== 'ok') {
        setCells([])
        setProblem(result.reason)
        return
      }
      const next = result.cells.map((cell) => ({
        at: cell.at,
        cover: cell.cover,
        wind: cell.wind,
      }))
      grids.current.set(hourKey, next)
      setCells(next)
      setProblem(null)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantForecast, hourKey, timeZone])

  const fallback: SkySource = { kind: 'forecast', hoursAhead: 0, trust: 'near', draw: false }
  const resolved = source ?? fallback

  return {
    source: resolved,
    frameAt: resolved.kind === 'satellite' ? resolved.frameAt : null,
    /*
     * The wind grid is shown whatever the clock says, because wind has no
     * satellite frame to prefer over it.
     */
    cells: hasSatellite(layer) ? (resolved.kind === 'forecast' ? cells : []) : cells,
    opacity: resolved.kind === 'forecast' ? FORECAST_OPACITY[resolved.trust] : 1,
    forecastProblem,
  }
}
