/* The privacy page's arithmetic: which host a request went to, and whether the list names it (PrivacyPage.tsx). */
import { HOSTS, type Host } from './hosts.ts'

export const CONTACT_EMAIL = 'privacy@example.com'
export const CONTACT_IS_PLACEHOLDER = true

/** A request's host, as the list names it: this app's own functions by their path. */
export function hostOf(url: string, ownOrigin: string): string | null {
  try {
    const u = new URL(url, ownOrigin)
    if (u.origin === ownOrigin) return u.pathname.startsWith('/api/') ? `this app (${u.pathname.split('/').slice(0, 3).join('/')})` : null
    return u.hostname
  } catch {
    return null
  }
}

/** Every host this page could be about: the list, plus the Overpass mirrors it names as one. */
const MIRRORS: Readonly<Record<string, string>> = { 'overpass.kumi.systems': 'overpass-api.de', 'overpass.private.coffee': 'overpass-api.de' }
export const listed = (host: string): Host | undefined => HOSTS.find((h) => h.host === (MIRRORS[host] ?? host))


/*
 * THE LIVE CHECK'S MEMORY, started when the app starts (main.tsx).
 *
 * The browser keeps only about 250 resource-timing entries and then drops
 * the rest: a map's tiles fill that in seconds, and the first version of the
 * live check, reading the buffer when the page opened, saw nothing after it
 * filled (29 Oct, WebKit). So the hosts are collected as requests finish, by
 * an observer, and the buffer is emptied whenever it fills. In memory only:
 * nothing is written, and a reload starts again.
 */
const seen = new Set<string>()
const seenListeners = new Set<() => void>()
let watching = false

function take(entries: readonly PerformanceEntry[]): void {
  const own = location.origin
  let added = false
  for (const e of entries) {
    const h = hostOf(e.name, own)
    if (h !== null && !seen.has(h)) {
      seen.add(h)
      added = true
    }
  }
  if (added) for (const l of seenListeners) l()
}

export function watchHosts(): void {
  if (watching || typeof performance === 'undefined' || typeof location === 'undefined') return
  watching = true
  try {
    take(performance.getEntriesByType('resource'))
    new PerformanceObserver((list) => take(list.getEntries())).observe({ type: 'resource', buffered: true })
    performance.addEventListener('resourcetimingbufferfull', () => {
      take(performance.getEntriesByType('resource'))
      performance.clearResourceTimings()
    })
  } catch {
    /* No resource timing here: the live check says it saw nothing. */
  }
}

export const seenHosts = (): string[] => [...seen].sort()

export function onSeenHosts(listener: () => void): () => void {
  seenListeners.add(listener)
  return () => seenListeners.delete(listener)
}
