/*
 * ===========================================================================
 * THE FORECAST CACHE. THIS FUNCTION LOGS NOTHING AND KEEPS NOTHING BUT THE
 * CDN'S OWN HTTP CACHE OF OPEN-METEO'S ANSWERS.
 *
 * WHY (Batch M, Section 1: "fails on cellular data"). Open-Meteo's free tier
 * limits each IP address (600 calls a minute, 5,000 an hour, 10,000 a day; a
 * request for many points or models counts as many). On a phone network
 * hundreds of phones leave from one address (carrier NAT), so the phone was
 * refused for what other people's apps had asked. The phone now asks here;
 * the CDN answers the same question (the same rounded spot, the same models,
 * the same hour) from its cache for everyone, and only a new question
 * reaches Open-Meteo. measurements/2026-11-08-cellular.md has the diagnosis.
 *
 * WHAT IT RECEIVES: an Open-Meteo request, its host and path in `om` and its
 * parameters as they are, every latitude and longitude already rounded to 2
 * decimals by the phone (about a kilometre; anything finer is refused here,
 * so a precise coordinate can never be cached or passed on), and `hr`, the
 * UTC hour, so each hour is a new cache entry. Nothing about the user.
 *
 * KEY. OPEN_METEO_API_KEY (Vercel environment, not set): with it, the
 * request goes to Open-Meteo's customer hosts with the key. Without it, the
 * free hosts, as the phone asked before.
 * ===========================================================================
 */
export const config = { runtime: 'edge' }

/** Hosts and paths passed on; nothing else. */
export const ALLOWED: Record<string, string> = {
  'api.open-meteo.com/v1/forecast': 'api.open-meteo.com',
  'marine-api.open-meteo.com/v1/marine': 'marine-api.open-meteo.com',
  'air-quality-api.open-meteo.com/v1/air-quality': 'air-quality-api.open-meteo.com',
  'ensemble-api.open-meteo.com/v1/ensemble': 'ensemble-api.open-meteo.com',
  'previous-runs-api.open-meteo.com/v1/forecast': 'previous-runs-api.open-meteo.com',
}
/** The colour path for sunrise and sunset in one question: 16 points. */
export const MAX_POINTS = 16
/** The hour the phone names may differ from the server's by this much (clocks, a slow request). */
export const HOUR_SLACK_H = 2
/** Kept at the CDN for the hour; a stale copy may be served while the next is fetched. */
export const S_MAXAGE = 3600
export const SWR = 600
const COORD = /^-?\d{1,3}(\.\d{1,2})?$/

export type Checked = { ok: true; upstream: string; cacheable: boolean } | { ok: false; status: number; message: string }

/** The Open-Meteo URL to ask, or why not. Pure: no network, no clock but `now`. */
export function upstreamFor(href: string, now: Date, key: string | null = null): Checked {
  const u = new URL(href)
  if (u.search.length > 4000) return { ok: false, status: 414, message: 'Too long.' }
  const om = u.searchParams.get('om') ?? ''
  const host = ALLOWED[om]
  if (host === undefined) return { ok: false, status: 400, message: 'Not a forecast this app asks for.' }
  const hr = u.searchParams.get('hr') ?? ''
  const hrAt = /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hr) ? Date.parse(`${hr}:00:00Z`) : Number.NaN
  /* A phone whose clock is off still gets its forecast, only not from or into the cache: no stray hour becomes a cache entry. */
  const cacheable = Number.isFinite(hrAt) && Math.abs(hrAt - now.getTime()) <= HOUR_SLACK_H * 3_600_000
  const lat = (u.searchParams.get('latitude') ?? '').split(',')
  const lon = (u.searchParams.get('longitude') ?? '').split(',')
  if (lat.length !== lon.length || lat.length > MAX_POINTS || ![...lat, ...lon].every((v) => COORD.test(v))) {
    return { ok: false, status: 400, message: 'Expected up to 16 points, each rounded to 2 decimals.' }
  }
  const out = new URLSearchParams()
  for (const [k, v] of u.searchParams) if (k !== 'om' && k !== 'hr' && k !== 'apikey') out.append(k, v)
  if (key !== null && key !== '') out.set('apikey', key)
  const path = om.slice(om.indexOf('/'))
  return { ok: true, cacheable, upstream: `https://${key !== null && key !== '' ? `customer-${host}` : host}${path}?${out.toString()}` }
}

const json = (status: number, body: unknown, cache: string) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': cache } })

export async function GET(request: Request): Promise<Response> {
  const key = typeof process !== 'undefined' ? (process.env.OPEN_METEO_API_KEY ?? null) : null
  const checked = upstreamFor(request.url, new Date(), key)
  if (!checked.ok) return json(checked.status, { error: true, reason: checked.message }, 'no-store')
  let r: Response
  try {
    r = await fetch(checked.upstream, { signal: AbortSignal.timeout(9000) })
  } catch {
    return json(504, { error: true, reason: 'Open-Meteo did not answer.' }, 'no-store')
  }
  const body = await r.text()
  /* Only a good answer is cached; a refusal (429) or an error passes through, uncached, with its reason. */
  const keep = r.ok && checked.cacheable
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': keep ? 'public, max-age=0, must-revalidate' : 'no-store' }
  if (keep) headers['vercel-cdn-cache-control'] = `max-age=${S_MAXAGE}, stale-while-revalidate=${SWR}`
  return new Response(body, { status: r.status, headers })
}
