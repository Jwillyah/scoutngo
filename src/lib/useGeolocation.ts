import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'

/**
 * Where the phone is, for the walk-to line.
 *
 * EVERY FAILURE IS A STATE, and each one gets said out loud. Permission refused,
 * no signal under a bridge, a browser without the API at all: a blank space
 * where a distance should be reads as a broken app, and this is used by someone
 * who has no time to work out which.
 */
export type GeoState =
  | { status: 'unsupported' }
  | { status: 'locating' }
  | { status: 'denied' }
  | { status: 'error'; message: string }
  | { status: 'ok'; at: LatLon; accuracyMeters: number; at_: Date }

const supported = (): boolean =>
  typeof navigator !== 'undefined' && navigator.geolocation !== undefined

/**
 * Only mounted inside FIELD, so there is no `active` flag: the watch starts when
 * the mode opens and is cleared when it closes. Support is decided at
 * initialisation rather than in an effect, so the hook never sets state
 * synchronously during one and never triggers a cascading render.
 */
export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>(() =>
    supported() ? { status: 'locating' } : { status: 'unsupported' },
  )

  useEffect(() => {
    if (!supported()) return

    const id = navigator.geolocation.watchPosition(
      (position) => {
        setState({
          status: 'ok',
          at: { lat: position.coords.latitude, lon: position.coords.longitude },
          accuracyMeters: position.coords.accuracy,
          at_: new Date(position.timestamp),
        })
      },
      (error) => {
        setState(
          error.code === error.PERMISSION_DENIED
            ? { status: 'denied' }
            : {
                status: 'error',
                message:
                  error.code === error.TIMEOUT
                    ? 'No GPS fix yet. Open sky helps.'
                    : 'Position unavailable right now.',
              },
        )
      },
      /*
       * High accuracy on, because the whole point is walking to a spot. The
       * maximumAge allows a fix a few seconds old rather than blocking on a
       * fresh one, which matters when moving between positions.
       */
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    )

    return () => navigator.geolocation.clearWatch(id)
  }, [])

  return state
}
