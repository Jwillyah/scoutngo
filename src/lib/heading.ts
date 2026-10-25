/*
 * WHICH WAY THE PHONE IS POINTING, for a map that turns with you.
 *
 * iPHONE ASKS FIRST. Safari only gives orientation after
 * DeviceOrientationEvent.requestPermission() is called from a tap, so this is
 * started from the compass button and never on load. A refusal is an answer,
 * said in one sentence, and the map stays north up.
 *
 * NOTHING IS KEPT. The heading turns the map and is not stored or sent.
 *
 * Safari reports a compass heading directly (webkitCompassHeading, degrees
 * clockwise from north). Elsewhere an absolute `alpha` is counter-clockwise,
 * so the heading is 360 minus it; a relative alpha says nothing about north
 * and is refused rather than shown as if it were.
 */

export type HeadingStart =
  | { ok: true; stop: () => void }
  | { ok: false; reason: string }

interface OrientationLike {
  alpha: number | null
  absolute?: boolean
  webkitCompassHeading?: number
}

/** The compass heading an orientation event carries, or null when it carries none. */
export function headingOf(event: OrientationLike): number | null {
  if (typeof event.webkitCompassHeading === 'number' && Number.isFinite(event.webkitCompassHeading)) {
    return event.webkitCompassHeading
  }
  if (event.absolute === true && typeof event.alpha === 'number') {
    return (360 - event.alpha) % 360
  }
  return null
}

export async function startHeading(onHeading: (degrees: number) => void): Promise<HeadingStart> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return { ok: false, reason: 'This browser does not report which way the phone is facing.' }
  }
  const ask = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
    .requestPermission
  if (typeof ask === 'function') {
    try {
      if ((await ask()) !== 'granted') {
        return { ok: false, reason: 'Motion access was not allowed, so the map stays north up.' }
      }
    } catch {
      return { ok: false, reason: 'Motion access was not allowed, so the map stays north up.' }
    }
  }
  const listener = (event: Event) => {
    const heading = headingOf(event as unknown as OrientationLike)
    if (heading !== null) onHeading(heading)
  }
  /* The absolute event where the browser has it, the plain one elsewhere. */
  const name = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation'
  window.addEventListener(name, listener)
  return { ok: true, stop: () => window.removeEventListener(name, listener) }
}
