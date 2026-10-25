/*
 * DOES THIS STORAGE SURVIVE CLEARING SAFARI?
 *
 * WHY THIS EXISTS. On iOS a Home Screen web app may keep its storage apart
 * from the Safari tab's, and if it does, clearing Safari's history and
 * website data would not touch the kit. That changes how the app should be
 * used -- but it must be TESTED on the phone, not assumed, and it cannot be
 * tested from a desktop.
 *
 * So the app carries the test. The first time a context (Home Screen or
 * Safari tab) runs, it writes a marker with the time. The About card shows
 * that time and which context this is. Clear Safari's data, reopen from the
 * Home Screen: the same time means the storage survived, a new time means it
 * was wiped and rewritten just now.
 *
 * A MARKER PER CONTEXT, because the two may or may not share storage and the
 * test is about exactly that.
 */

export const PROBE_KEY = 'scoutngo.storageProbe.v1'

export type LaunchContext = 'home-screen' | 'browser'

export interface ProbeMarker {
  writtenAt: string
  context: LaunchContext
}

export interface ProbeReading {
  context: LaunchContext
  marker: ProbeMarker
  /** True when the marker was written by THIS launch, so there was nothing before it. */
  writtenNow: boolean
}

export function launchContext(): LaunchContext {
  if (typeof window === 'undefined') return 'browser'
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches === true
  return iosStandalone || standalone ? 'home-screen' : 'browser'
}

const keyFor = (context: LaunchContext) => `${PROBE_KEY}.${context}`

/** Reads this context's marker, writing one if there is none. Null if storage refuses. */
export function readProbe(now: Date = new Date()): ProbeReading | null {
  const context = launchContext()
  try {
    const raw = localStorage.getItem(keyFor(context))
    const parsed = raw === null ? null : (JSON.parse(raw) as Partial<ProbeMarker>)
    if (parsed !== null && typeof parsed.writtenAt === 'string' && parsed.context === context) {
      return { context, marker: { writtenAt: parsed.writtenAt, context }, writtenNow: false }
    }
    const marker: ProbeMarker = { writtenAt: now.toISOString(), context }
    localStorage.setItem(keyFor(context), JSON.stringify(marker))
    return { context, marker, writtenNow: true }
  } catch {
    return null
  }
}
