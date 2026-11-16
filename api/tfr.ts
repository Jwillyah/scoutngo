/*
 * ===========================================================================
 * THE FAA'S TEMPORARY FLIGHT RESTRICTIONS, WHOLE. THIS FUNCTION LOGS NOTHING
 * AND KEEPS NOTHING.
 *
 * WHY THERE IS A FUNCTION. tfr.faa.gov sends no CORS header, so a browser
 * cannot read its map service.
 *
 * WHAT IT RECEIVES: an empty POST ({}). No coordinate, nothing about the
 * user: it asks the FAA for every TFR shape in the country, and which one is
 * near the marker is worked out on the phone (src/core/faaLive.ts).
 *
 * WHAT IT RETURNS: {"status": "ok", "tfrs": <GeoJSON>} with each shape's
 * NOTAM key, title (which carries its dates), type and last change.
 * ===========================================================================
 */
export const TFR_WFS =
  'https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=TFR:V_TFR_LOC&maxFeatures=1000&outputFormat=application/json&srsname=EPSG:4326'

const KEEP = ['NOTAM_KEY', 'TITLE', 'LEGAL', 'LAST_MODIFICATION_DATETIME', 'STATE'] as const

/** The FAA's answer with only the fields the phone reads. */
export function trimTfrs(payload: unknown): { type: 'FeatureCollection'; features: unknown[] } | null {
  const features = (payload as { features?: unknown } | null)?.features
  if (!Array.isArray(features)) return null
  return {
    type: 'FeatureCollection',
    features: features.map((f: { geometry?: unknown; properties?: Record<string, unknown> | null }) => ({
      type: 'Feature',
      geometry: f?.geometry ?? null,
      properties: Object.fromEntries(KEEP.map((k) => [k, f?.properties?.[k] ?? null])),
    })),
  }
}

export async function POST(): Promise<Response> {
  try {
    const r = await fetch(TFR_WFS, { signal: AbortSignal.timeout(10_000) })
    if (!r.ok) return Response.json({ status: 'error', message: 'The FAA did not answer.' }, { status: 502 })
    const tfrs = trimTfrs(await r.json())
    if (tfrs === null) return Response.json({ status: 'error', message: 'The FAA answered with no TFR list.' }, { status: 502 })
    return Response.json({ status: 'ok', tfrs }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ status: 'error', message: 'The FAA did not answer.' }, { status: 502 })
  }
}
