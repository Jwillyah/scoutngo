/**
 * Ground level preview for a position, from Google Street View.
 *
 * REAL IMAGERY OR NOTHING. This never falls back to a generated or illustrated
 * view. The entire value of this tool is being right about a place the shooter
 * has not seen, and a plausible fake sightline would be worse than no sightline:
 * it would look exactly as convincing as a true one and quietly send someone to
 * stand somewhere useless.
 *
 * Opt in, per position. Nothing is requested until the shooter asks for it.
 */
export const GROUND_VIEW_ENDPOINT = '/api/streetview'

export type GroundView =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; image: string }
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

export async function fetchGroundView(
  at: { lat: number; lon: number },
  heading: number,
  fov: number,
): Promise<GroundView> {
  let response: Response
  try {
    response = await fetch(groundViewUrl(at, heading, fov))
  } catch {
    return { status: 'error', message: 'Could not reach the ground view function.' }
  }

  const text = await response.text()
  let body: { status?: string; image?: string; message?: string }
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
    return { status: 'ok', image: body.image }
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
