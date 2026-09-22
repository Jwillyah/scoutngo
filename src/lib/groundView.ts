/**
 * Ground level preview for a position, from Google Street View.
 *
 * REAL IMAGERY OR NOTHING. This never falls back to a generated or illustrated
 * view. The entire value of this tool is being right about a place the shooter
 * has not seen, and a plausible fake sightline would be worse than no sightline:
 * it would look exactly as convincing as a true one and quietly send someone to
 * stand somewhere useless.
 *
 * PER POSITION, ON A TAP. Opening a position card fetches that ONE position's
 * ground view. The bulk case, the field pack, sends every position at once and
 * stays behind its own labelled press. See the privacy section of README.md.
 */
export const GROUND_VIEW_ENDPOINT = '/api/streetview'

export type GroundView =
  | { status: 'idle' }
  | { status: 'loading' }
  /** `date` is Google's capture date, "YYYY-MM". Absent when they do not say. */
  | { status: 'ok'; image: string; date?: string }
  | { status: 'no-key'; message: string }
  | { status: 'no-coverage'; message: string }
  | { status: 'error'; message: string }

export function groundViewUrl(at: { lat: number; lon: number }, heading: number, fov: number) {
  const params = new URLSearchParams({
    lat: at.lat.toFixed(6),
    lon: at.lon.toFixed(6),
    heading: heading.toFixed(1),
    fov: fov.toFixed(1),
  })
  return `${GROUND_VIEW_ENDPOINT}?${params.toString()}`
}

/*
 * ONE REQUEST PER DISTINCT VIEW, PER SESSION.
 *
 * Reopening a card must not re-ask Google: that is a second billed image
 * request and a second disclosure of the same coordinate, both for a picture
 * the session already has.
 *
 * KEYED ON THE REQUEST URL, which is the exact set of parameters that decides
 * what comes back: latitude and longitude to six places, heading to one, field
 * of view to one. A position dragged even a metre, or re-aimed because the
 * subject moved, produces a different URL and therefore a different key, which
 * is correct: it is a different photograph.
 *
 * THE PROMISE IS CACHED, not the result, so two cards opening the same view at
 * once share one request rather than racing.
 *
 * Memory only, and gone on reload. The durable cache is the field pack, which
 * is explicit, on disk, and the shooter's decision.
 */
const cache = new Map<string, Promise<GroundView>>()

/*
 * A ceiling, because the images are base64 data URLs of about 60KB each and a
 * long session can open a lot of cards. Oldest out first; a re-opened card that
 * has been evicted simply fetches again.
 */
const CACHE_LIMIT = 40

/** Exposed for tests, and for anyone who needs a clean slate. */
export function clearGroundViewCache(): void {
  cache.clear()
}

export function groundViewCacheSize(): number {
  return cache.size
}

export async function fetchGroundView(
  at: { lat: number; lon: number },
  heading: number,
  fov: number,
): Promise<GroundView> {
  const key = groundViewUrl(at, heading, fov)
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const pending = requestGroundView(key)
  cache.set(key, pending)
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }

  /*
   * A TRANSIENT FAILURE IS NOT AN ANSWER, so it is not kept. `no-key` and
   * `no-coverage` are real, settled facts about this request and they stay
   * cached; a network error or a bad gateway would otherwise stick for the rest
   * of the session and the card would never recover.
   */
  const result = await pending
  if (result.status === 'error') cache.delete(key)
  return result
}

async function requestGroundView(url: string): Promise<GroundView> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return { status: 'error', message: 'Could not reach the ground view function.' }
  }

  const text = await response.text()
  let body: { status?: string; image?: string; message?: string; date?: string }
  try {
    body = JSON.parse(text) as typeof body
  } catch {
    return {
      status: 'error',
      message:
        response.status === 404 || text.startsWith('<')
          ? 'Ground view needs `vercel dev`, which serves the functions alongside the app.'
          : `Unexpected response (HTTP ${response.status}).`,
    }
  }

  if (body.status === 'ok' && typeof body.image === 'string') {
    return {
      status: 'ok',
      image: body.image,
      ...(typeof body.date === 'string' ? { date: body.date } : {}),
    }
  }
  if (body.status === 'no-key') {
    return { status: 'no-key', message: body.message ?? 'Add a Google Maps key to enable ground view.' }
  }
  if (body.status === 'no-coverage') {
    return {
      status: 'no-coverage',
      message: body.message ?? 'No Street View imagery at this spot.',
    }
  }
  return { status: 'error', message: body.message ?? 'Ground view failed.' }
}
