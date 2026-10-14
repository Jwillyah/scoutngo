/*
 * ===========================================================================
 * THIS FUNCTION LOGS NOTHING. DELIBERATELY. Same rule as generate.ts.
 *
 * It receives what the shooter is typing into the venue search, one keystroke
 * at a time, and the coordinate their map is centred on. That is a live record
 * of where somebody is looking and what they are looking for, which is the same
 * category of information as the venue itself. It is never written to a log, a
 * database or a file. Vercel retains function logs in its dashboard, which is
 * exactly why none are written. Debug with `vercel dev`, not with a log line.
 *
 * THE TOKEN NEVER REACHES THE BROWSER. That is the whole reason this function
 * exists rather than calling Mapbox from the page: a public token in client
 * JavaScript is a public token anyone can lift and spend.
 * ===========================================================================
 */

const SUGGEST_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest'
const RETRIEVE_URL = 'https://api.mapbox.com/search/searchbox/v1/retrieve'

/** Mapbox caps this at 10. Six is what the dropdown can show without scrolling. */
const LIMIT = 6

const str = (value: string | null): string => (value === null ? '' : value.trim())

const num = (value: string | null): number | null => {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/*
 * A Vercel Web Handler. Two actions on one endpoint:
 *
 *   suggest   the autocomplete list, no coordinates
 *   retrieve  one chosen suggestion, with its coordinate
 *
 * SESSION TOKENS ARE THE BILLING UNIT. Mapbox charges per SESSION, not per
 * request: every /suggest sharing one session_token plus the /retrieve that
 * ends it is a single billable unit. So the client makes one UUID when the
 * field is focused and keeps it until a result is picked, which turns a typed
 * query of twenty keystrokes into one charge instead of twenty.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const token = process.env.MAPBOX_TOKEN

  if (!token) {
    /*
     * Not an error. The app works without Mapbox by falling back to Nominatim
     * and Photon, so this is a state the client handles rather than a failure.
     */
    return Response.json({ status: 'no-token' })
  }

  const action = url.searchParams.get('action') === 'retrieve' ? 'retrieve' : 'suggest'
  const session = str(url.searchParams.get('session'))
  if (session === '') {
    return Response.json({ status: 'error', message: 'Missing session token.' }, { status: 400 })
  }

  try {
    if (action === 'retrieve') {
      const id = str(url.searchParams.get('id'))
      if (id === '') {
        return Response.json({ status: 'error', message: 'Missing id.' }, { status: 400 })
      }
      const target = new URL(`${RETRIEVE_URL}/${encodeURIComponent(id)}`)
      target.searchParams.set('access_token', token)
      target.searchParams.set('session_token', session)
      const response = await fetch(target)
      if (!response.ok) {
        return Response.json({
          status: 'error',
          message: `Mapbox retrieve failed (HTTP ${response.status}).`,
        })
      }
      return Response.json({ status: 'ok', body: await response.json() })
    }

    const q = str(url.searchParams.get('q'))
    if (q === '') {
      return Response.json({ status: 'error', message: 'Missing q.' }, { status: 400 })
    }

    const target = new URL(SUGGEST_URL)
    target.searchParams.set('q', q.slice(0, 256))
    target.searchParams.set('access_token', token)
    target.searchParams.set('session_token', session)
    target.searchParams.set('limit', String(LIMIT))

    /*
     * Bias to where the map is looking. `proximity` ranks nearby results first
     * WITHOUT excluding anything, which is the behaviour wanted: a venue two
     * towns over should rank second, not vanish.
     */
    const lat = num(url.searchParams.get('lat'))
    const lon = num(url.searchParams.get('lon'))
    if (lat !== null && lon !== null) {
      target.searchParams.set('proximity', `${lon},${lat}`)
    }

    const response = await fetch(target)
    if (!response.ok) {
      return Response.json({
        status: 'error',
        message: `Mapbox suggest failed (HTTP ${response.status}).`,
      })
    }
    return Response.json({ status: 'ok', body: await response.json() })
  } catch {
    return Response.json({ status: 'error', message: 'Could not reach Mapbox.' })
  }
}
