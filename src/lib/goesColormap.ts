import { parseGoesColormap, type GoesLegend } from '../core/goesLegend.ts'
import type { GoesBand } from '../core/goes.ts'

/**
 * THE COLOUR TABLE, FETCHED FROM NASA GIBS.
 *
 * The URL is the one GIBS links from its own WMTS capabilities for this layer,
 * under the colormap metadata role. Taking it from there rather than
 * constructing it from the layer name is deliberate: the colormap is named
 * after the PRODUCT, not the layer, so Band13_Clean_Infrared's table lives at
 * Clean_Longwave_Infrared_Window_Band.xml and guessing would have 404'd. It
 * did, on the first attempt.
 *
 * ONLY THE INFRARED BAND HAS ONE. The visible layer's capabilities block
 * carries no colormap link at all, because a visible band is greyscale
 * reflectance with no scale to key, and its tiles arrive as greyscale PNG
 * while the infrared's arrive as RGBA. Asking for one would be asking for
 * something that does not exist.
 */
export const GIBS_COLORMAP_URL: Record<GoesBand, string | null> = {
  infrared:
    'https://gibs.earthdata.nasa.gov/colormaps/v1.3/Clean_Longwave_Infrared_Window_Band.xml',
  visible: null,
}

export type ColormapResult =
  | { status: 'ok'; legend: GoesLegend }
  /** This band has no published table, which is a state and not a failure. */
  | { status: 'none' }
  | { status: 'unavailable'; reason: string }

const cache = new Map<GoesBand, ColormapResult>()

/**
 * Fetched once per session and kept in memory.
 *
 * A colour table does not change between frames, so re-fetching it as the
 * scrubber moves would be forty kilobytes a tick for a fixed answer.
 */
export async function fetchGoesLegend(
  band: GoesBand,
  fetchImpl: typeof fetch = fetch,
): Promise<ColormapResult> {
  const held = cache.get(band)
  if (held !== undefined) return held

  const url = GIBS_COLORMAP_URL[band]
  if (url === null) {
    const result: ColormapResult = { status: 'none' }
    cache.set(band, result)
    return result
  }

  try {
    const response = await fetchImpl(url)
    if (!response.ok) {
      /* Not cached: a 503 now does not mean there is no table tomorrow. */
      return { status: 'unavailable', reason: `GIBS returned HTTP ${response.status}.` }
    }
    const legend = parseGoesColormap(await response.text())
    if (legend === null) {
      return { status: 'unavailable', reason: 'The colour table could not be read.' }
    }
    const result: ColormapResult = { status: 'ok', legend }
    cache.set(band, result)
    return result
  } catch {
    return { status: 'unavailable', reason: 'Could not reach NASA GIBS for the colour table.' }
  }
}

/** For tests, and for a session that wants a fresh fetch. */
export function clearLegendCache(): void {
  cache.clear()
}
