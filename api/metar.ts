/*
 * ===========================================================================
 * ONE STATION'S LATEST METAR. THIS FUNCTION LOGS NOTHING AND KEEPS NOTHING.
 *
 * WHY THERE IS A FUNCTION. weather.gov's latest observation usually carries
 * the METAR text, and when it does the phone reads it there. When it does
 * not, aviationweather.gov has it, and sends no CORS header a browser can
 * rely on, so this passes that one line on.
 *
 * WHAT IT RECEIVES: a four-character station id in a POST body ({"station":
 * "KNTU"}), or up to MAX_STATIONS of them ({"stations": ["KSFQ", ...]}: the
 * gap watch's stations along the sun's line, Batch J). No coordinate,
 * nothing about the user.
 * ===========================================================================
 */
const SOURCE = 'https://aviationweather.gov/api/data/metar'

export function stationOf(body: unknown): string | null {
  const station = typeof (body as { station?: unknown } | null)?.station === 'string' ? (body as { station: string }).station.toUpperCase() : ''
  return /^[A-Z][A-Z0-9]{3}$/.test(station) ? station : null
}

export const MAX_STATIONS = 12

/** The station list of a body, each a valid id, at most MAX_STATIONS; null when there is none. */
export function stationsOf(body: unknown): string[] | null {
  const list = (body as { stations?: unknown } | null)?.stations
  if (!Array.isArray(list)) return null
  const ids = list.map((x) => (typeof x === 'string' ? x.toUpperCase() : '')).filter((x) => /^[A-Z][A-Z0-9]{3}$/.test(x))
  return ids.length === 0 ? null : [...new Set(ids)].slice(0, MAX_STATIONS)
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ status: 'error', message: 'Expected a JSON body.' }, { status: 400 })
  }
  const many = stationsOf(body)
  if (many !== null) {
    try {
      const r = await fetch(`${SOURCE}?ids=${many.join(',')}&format=raw&hours=2`, { signal: AbortSignal.timeout(8000) })
      if (!r.ok) return Response.json({ status: 'error', message: 'The METAR service did not answer.' }, { status: 502 })
      const lines = (await r.text()).split('\n').map((l) => l.trim()).filter((l) => l !== '')
      /* The latest of each: the service lists newest first. */
      const metars = many.flatMap((id) => {
        const m = lines.find((l) => l.startsWith(`${id} `) || l.startsWith(`METAR ${id} `) || l.startsWith(`SPECI ${id} `))
        return m === undefined ? [] : [m]
      })
      return Response.json({ status: 'ok', metars }, { headers: { 'cache-control': 'no-store' } })
    } catch {
      return Response.json({ status: 'error', message: 'The METAR service did not answer.' }, { status: 502 })
    }
  }
  const station = stationOf(body)
  if (station === null) return Response.json({ status: 'error', message: 'Expected a four-character station id.' }, { status: 400 })
  try {
    const r = await fetch(`${SOURCE}?ids=${station}&format=raw&hours=2`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return Response.json({ status: 'error', message: 'The METAR service did not answer.' }, { status: 502 })
    const metar = (await r.text()).split('\n').map((l) => l.trim()).find((l) => l.startsWith(station) || l.startsWith(`METAR ${station}`) || l.startsWith(`SPECI ${station}`))
    if (metar === undefined) return Response.json({ status: 'none' }, { status: 404 })
    return Response.json({ status: 'ok', metar }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ status: 'error', message: 'The METAR service did not answer.' }, { status: 502 })
  }
}
