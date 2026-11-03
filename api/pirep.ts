/*
 * ===========================================================================
 * PILOT REPORTS NEAR ONE STATION. THIS FUNCTION LOGS NOTHING AND KEEPS NOTHING.
 *
 * WHY THERE IS A FUNCTION. Pilots report cloud bases and tops (/SK), the one
 * source that has flown through the deck (Batch J, Section 1). The reports
 * are aviationweather.gov's, which sends no CORS header a browser can rely
 * on, so this passes the text on.
 *
 * WHAT IT RECEIVES: a four-character station id in a POST body ({"station":
 * "KNTU"}). No coordinate, nothing about the user. It asks for the last
 * three hours within 100 statute miles of that station, and returns the
 * reports' text, one per line.
 * ===========================================================================
 */
import { stationOf } from './metar.ts'

const SOURCE = 'https://aviationweather.gov/api/data/pirep'

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
    const r = await fetch(`${SOURCE}?id=${station}&distance=100&age=3&format=raw`, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return Response.json({ status: 'error', message: 'The PIREP service did not answer.' }, { status: 502 })
    const reports = (await r.text()).split('\n').map((l) => l.trim()).filter((l) => / UA /.test(l) || / UUA /.test(l)).slice(0, 60)
    return Response.json({ status: 'ok', reports }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ status: 'error', message: 'The PIREP service did not answer.' }, { status: 502 })
  }
}
