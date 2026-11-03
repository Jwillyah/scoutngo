/*
 * ===========================================================================
 * THE NATIONAL HURRICANE CENTER'S ACTIVE STORMS. THIS FUNCTION LOGS NOTHING
 * AND KEEPS NOTHING.
 *
 * WHY THERE IS A FUNCTION. nhc.noaa.gov sends no CORS header, so a browser
 * cannot read CurrentStorms.json or a storm's wind-speed probabilities.
 *
 * WHAT IT RECEIVES: an empty POST ({}) for the list of active storms, or
 * {"pws": "<an nhc.noaa.gov text product URL from that list>"} for one
 * storm's wind-speed probability text. No coordinate, nothing about the
 * user: which storm is near the venue is worked out on the phone.
 * ===========================================================================
 */
const STORMS = 'https://www.nhc.noaa.gov/CurrentStorms.json'

/** Only an NHC text product's URL is passed on. */
export function pwsOf(body: unknown): string | null {
  const u = (body as { pws?: unknown } | null)?.pws
  if (typeof u !== 'string') return null
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && url.hostname === 'www.nhc.noaa.gov' && /^\/text\/[\w/+.-]+$/.test(url.pathname) && url.search === '' ? url.toString() : null
  } catch {
    return null
  }
}

/** The text of an NHC page: what is inside its <pre>, tags taken out. */
export function preText(html: string): string {
  const pre = /<pre[^>]*>([\s\S]*?)<\/pre>/i.exec(html)?.[1] ?? html
  return pre.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ status: 'error', message: 'Expected a JSON body.' }, { status: 400 })
  }
  const pws = pwsOf(body)
  if ((body as { pws?: unknown } | null)?.pws !== undefined && pws === null) return Response.json({ status: 'error', message: 'Expected an nhc.noaa.gov text product URL.' }, { status: 400 })
  try {
    const r = await fetch(pws ?? STORMS, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return Response.json({ status: 'error', message: 'The NHC did not answer.' }, { status: 502 })
    if (pws !== null) return Response.json({ status: 'ok', text: preText(await r.text()) }, { headers: { 'cache-control': 'no-store' } })
    return Response.json({ status: 'ok', storms: await r.json() }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ status: 'error', message: 'The NHC did not answer.' }, { status: 502 })
  }
}
