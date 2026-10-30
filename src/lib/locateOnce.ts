import type { LatLon } from '../core/geo.ts'
import { logTouch } from './touchDebug.ts'

/**
 * Where the phone is, asked ONCE, because somebody tapped a button.
 *
 * Separate from useGeolocation, which watches continuously inside FIELD so the
 * walk-to line keeps up while you move. This is the other shape entirely: one
 * question, one answer, nothing left running.
 *
 * WHAT HAPPENS WHEN IT IS REFUSED: it says why, in one line, with the place
 * to change it, and the caller offers Retry. There is no second attempt
 * through an IP lookup. An approximate position derived from an IP address
 * is user data, "no" is an answer, and the map simply stays where it was.
 * tests/noIpGeolocation.test.ts keeps that from being quietly improved.
 *
 * WHY THE REASONS (field test, 30 Oct). "Use my location" did nothing: in
 * Plan the arrow's failure was dropped on the floor (`if not ok, return`,
 * and the top bar's note was wired to null), and Setup said one sentence
 * for every failure. The browser says which of three it was (1 refused,
 * 2 no position, 3 timed out). A refusal that comes back faster than a
 * person could answer a prompt means no prompt was shown: Location Services
 * is off for Safari's websites, in Settings, where no tap in the page can
 * reach. Every attempt goes to Settings › Debug's log with its code and how
 * long it took, so a phone that still does nothing can be read.
 *
 * NOTHING IS STORED. The coordinate is returned to the caller, which moves the
 * camera with it, and then it is gone. It is not written to localStorage, not
 * put in a saved spot, and not sent anywhere.
 */
export type LocateResult =
  | { status: 'ok'; at: LatLon; accuracyMeters: number }
  /** `prompted` false when the refusal came back too fast for a prompt to have been answered. */
  | { status: 'denied'; prompted: boolean }
  | { status: 'unavailable' }
  | { status: 'timeout' }
  | { status: 'unsupported' }
  /** Not on https: browsers give no location to an insecure page. */
  | { status: 'insecure' }

/** Faster than this, nobody answered a prompt: none was shown. */
export const NO_PROMPT_MS = 400

export const LOCATE_TIMEOUT_MS = 15_000

/** The one line for each failure. Plain words, the place to change it, and never a promise. */
export function locateWords(result: Exclude<LocateResult, { status: 'ok' }>): string {
  switch (result.status) {
    case 'denied':
      return result.prompted
        ? 'Location not shared with this site: Settings › Apps › Safari › Location › Ask, then Retry'
        : 'Location is off for Safari: Settings › Privacy & Security › Location Services › Safari Websites'
    case 'unavailable':
      return 'The phone has no position right now: Retry in the open, or search for the place'
    case 'timeout':
      return `No position within ${LOCATE_TIMEOUT_MS / 1000} s: Retry, or search for the place`
    case 'unsupported':
      return 'This browser cannot share a location: search for the place instead'
    case 'insecure':
      return 'Location needs the https address of this app: search for the place instead'
  }
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
export function locateOnce(timeoutMs = LOCATE_TIMEOUT_MS, now: () => number = () => performance.now()): Promise<LocateResult> {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    logTouch('locate: not a secure page, not asked')
    return Promise.resolve({ status: 'insecure' })
  }
  if (!supported()) {
    logTouch('locate: no navigator.geolocation')
    return Promise.resolve({ status: 'unsupported' })
  }
  const started = now()
  logTouch('locate: asked')
  return new Promise<LocateResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        logTouch(`locate: fix ±${Math.round(position.coords.accuracy)} m after ${Math.round(now() - started)} ms`)
        resolve({
          status: 'ok',
          at: { lat: position.coords.latitude, lon: position.coords.longitude },
          accuracyMeters: position.coords.accuracy,
        })
      },
      (error) => {
        const ms = Math.round(now() - started)
        logTouch(`locate: code ${error.code} (${error.message || 'no message'}) after ${ms} ms`)
        resolve(
          error.code === 1
            ? { status: 'denied', prompted: ms >= NO_PROMPT_MS }
            : error.code === 3
              ? { status: 'timeout' }
              : { status: 'unavailable' },
        )
      },
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
