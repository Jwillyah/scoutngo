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
 * "KNTU"}). No coordinate, nothing about the user.
 * ===========================================================================
 */
const SOURCE = 'https://aviationweather.gov/api/data/metar'

export function stationOf(body: unknown): string | null {
  const station = typeof (body as { station?: unknown } | null)?.station === 'string' ? (body as { station: string }).station.toUpperCase() : ''
  return /^[A-Z][A-Z0-9]{3}$/.test(station) ? station : null
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ status: 'error', message: 'Expected a JSON body.' }, { status: 400 })
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
