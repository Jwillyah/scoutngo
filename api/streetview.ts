/*
 * ===========================================================================
 * THIS FUNCTION LOGS NOTHING. DELIBERATELY. Same rule as generate.ts.
 *
 * It receives a coordinate the shooter is considering standing on. That is the
 * same category of information as the venue itself, so it is never written to a
 * log, a database, or a file. Vercel retains function logs in its dashboard, which
 * is exactly why none are written. Debug with `vercel dev`, not with a log line.
 * ===========================================================================
 */

const META_URL = 'https://maps.googleapis.com/maps/api/streetview/metadata'
const IMAGE_URL = 'https://maps.googleapis.com/maps/api/streetview'
const SIZE = '640x400'

const num = (value: string | null): number | null => {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/*
 * A Vercel Web Handler. GET is the only export: this reads its input from the
 * query string, and Vercel answers any other method with 405 before this module
 * is reached.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const lat = num(url.searchParams.get('lat'))
  const lon = num(url.searchParams.get('lon'))
  const heading = num(url.searchParams.get('heading')) ?? 0
  const fov = Math.min(120, Math.max(10, num(url.searchParams.get('fov')) ?? 60))

  if (lat === null || lon === null) {
    return Response.json({ status: 'error', message: 'Missing lat or lon.' }, { status: 400 })
  }

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) {
    /*
     * Not an error. Ground view is optional, and the app must work without it.
     * A missing key is a state the UI explains, not a failure.
     */
    return Response.json({
      status: 'no-key',
      message: 'Add a Google Maps key to enable ground view.',
    })
  }

  const location = `${lat},${lon}`

  try {
    /*
     * Metadata first. It is free and it says whether there is any coverage here
     * before an image request is billed.
     */
    const meta = await fetch(`${META_URL}?location=${location}&key=${key}`)
    const metaBody = (await meta.json()) as { status?: string; date?: string }

    if (metaBody.status === 'ZERO_RESULTS' || metaBody.status === 'NOT_FOUND') {
      return Response.json({
        status: 'no-coverage',
        message: 'Google has no Street View imagery at this spot.',
      })
    }
    if (metaBody.status !== 'OK') {
      return Response.json({
        status: 'error',
        message: `Street View said ${metaBody.status ?? 'nothing usable'}.`,
      })
    }

    const image = await fetch(
      `${IMAGE_URL}?size=${SIZE}&location=${location}&heading=${heading.toFixed(1)}` +
        `&fov=${fov.toFixed(1)}&pitch=0&return_error_code=true&key=${key}`,
    )
    if (!image.ok) {
      return Response.json({
        status: 'error',
        message: `Street View image request failed (HTTP ${image.status}).`,
      })
    }

    /*
     * The capture date comes back on the metadata call already made above, as
     * "YYYY-MM". Passed through so the card can say how old the imagery is
     * without a second request and without anyone guessing. A Street View frame
     * from 2011 is a different claim about a place than one from last year.
     */
    const bytes = Buffer.from(await image.arrayBuffer()).toString('base64')
    return Response.json({
      status: 'ok',
      image: `data:image/jpeg;base64,${bytes}`,
      date: typeof metaBody.date === 'string' ? metaBody.date : undefined,
    })
  } catch {
    return Response.json({ status: 'error', message: 'Could not reach Street View.' })
  }
}
