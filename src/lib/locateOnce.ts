import type { LatLon } from '../core/geo.ts'

/**
 * Where the phone is, asked ONCE, because somebody tapped a button.
 *
 * Separate from useGeolocation, which watches continuously inside FIELD so the
 * walk-to line keeps up while you move. This is the other shape entirely: one
 * question, one answer, nothing left running.
 *
 * WHAT HAPPENS WHEN IT IS REFUSED: it says so, and that is all. There is no
 * second attempt through an IP lookup. An approximate position derived from an
 * IP address is user data, "no" is an answer, and the map simply stays where it
 * was. tests/noIpGeolocation.test.ts keeps that from being quietly improved.
 *
 * NOTHING IS STORED. The coordinate is returned to the caller, which moves the
 * camera with it, and then it is gone. It is not written to localStorage, not
 * put in a saved spot, and not sent anywhere.
 */
export type LocateResult =
  | { status: 'ok'; at: LatLon; accuracyMeters: number }
  | { status: 'denied' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string }

/** What the button says when each of those comes back. Said once, then dropped. */
export const LOCATE_MESSAGE: Record<Exclude<LocateResult['status'], 'ok'>, string> = {
  /*
   * Deliberately not "permission denied" or an instruction to go and change a
   * setting. The person meant to say no, or they did not, and either way the
   * search field is right there.
   */
  denied: 'No location shared. Search for the place instead.',
  unsupported: 'This browser cannot share a location. Search for the place instead.',
  error: 'No fix right now. Search for the place instead.',
}

const supported = (): boolean =>
  typeof navigator !== 'undefined' && navigator.geolocation !== undefined

/**
 * Never rejects. Every outcome is a state the caller renders, because a thrown
 * error here would be a blank button and no explanation.
 *
 * `enableHighAccuracy` is OFF. This answers "which town", so the map has
 * somewhere to start; it is not the walk-to-a-spot fix, and asking for GPS
 * precision to choose a starting view spins the radio for no reason.
 */
export function locateOnce(timeoutMs = 15_000): Promise<LocateResult> {
  if (!supported()) return Promise.resolve({ status: 'unsupported' })

  return new Promise<LocateResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          status: 'ok',
          at: { lat: position.coords.latitude, lon: position.coords.longitude },
          accuracyMeters: position.coords.accuracy,
        }),
      (error) =>
        resolve(
          error.code === error.PERMISSION_DENIED
            ? { status: 'denied' }
            : { status: 'error', message: LOCATE_MESSAGE.error },
        ),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60_000 },
    )
  })
}

/**
 * How tight to frame what comes back.
 *
 * A browser fix without high accuracy is good to a few hundred metres at best
 * and a few kilometres over wifi, so this is a neighbourhood, not a doorstep.
 * Framing it at street level would restate the earlier mistake in a new place:
 * a confident view of somewhere the app is only roughly sure about.
 */
export const LOCATED_ZOOM = 13
