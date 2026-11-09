/*
 * THE NETWORK, AS THIS PHONE SAW IT (Batch N, Section 0 E1: "cellular still
 * fails"). Every fetch the page makes is noted here as it finishes: when,
 * which host and path, the status or the error's name, how long. In memory
 * only, for this session, and never the query string (it can hold the
 * rounded spot): nothing is kept or sent. A hidden triple tap on the home's
 * date shows the last few (NetDebug in Home.tsx), so a screenshot on
 * cellular says which request failed and how.
 */
export interface NetEntry {
  at: number
  host: string
  path: string
  /** HTTP status, or the error's name ("TypeError", "TimeoutError", "AbortError"). */
  status: number | string
  ms: number
}

const MAX = 60
const entries: NetEntry[] = []
let installed = false

export function netEntries(): readonly NetEntry[] {
  return entries
}

export function noteNet(e: NetEntry): void {
  entries.push(e)
  if (entries.length > MAX) entries.splice(0, entries.length - MAX)
}

/** Host and path of a request, never its query. */
export function wherePart(url: string, origin: string): { host: string; path: string } {
  try {
    const u = new URL(url, origin)
    /* Batch MAP2, Section 4: a path can hold a place (weather.gov's /points/36.84,-75.97); its decimals are masked, so a screenshot of these lines says nothing about where. */
    const path = u.pathname.replace(/-?\d+\.\d+/g, '#')
    return { host: u.origin === origin ? 'this app' : u.host, path: path.length > 28 ? `${path.slice(0, 27)}…` : path }
  } catch {
    return { host: '?', path: '' }
  }
}

/** Wraps the page's fetch once, at start-up (main.tsx). */
export function watchNet(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return
  installed = true
  const real = window.fetch.bind(window)
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const t0 = performance.now()
    const where = wherePart(url, location.origin)
    try {
      const r = await real(input, init)
      noteNet({ at: Date.now(), ...where, status: r.status, ms: Math.round(performance.now() - t0) })
      return r
    } catch (error) {
      noteNet({ at: Date.now(), ...where, status: error instanceof Error ? error.name : 'error', ms: Math.round(performance.now() - t0) })
      throw error
    }
  }
}

/** The debug lines: the network as the phone reports it, then the last requests, newest first. */
export function netLines(now: number, deviceOnline: boolean, appOnline: boolean, swControlled: boolean, connection: string | null, n = 8): string[] {
  const ok = entries.filter((e) => typeof e.status === 'number' && e.status < 400).length
  const head = `device ${deviceOnline ? 'online' : 'OFFLINE'} · app ${appOnline ? 'online' : 'OFFLINE'} · sw ${swControlled ? 'on' : 'off'}${connection === null ? '' : ` · ${connection}`} · ${ok}/${entries.length} ok`
  const rows = [...entries]
    .reverse()
    .slice(0, n)
    .map((e) => `${Math.round((now - e.at) / 1000)}s ago ${e.host}${e.path} → ${e.status} ${e.ms}ms`)
  return [head, ...rows]
}

/*
 * BATCH MAP2, SECTION 4: "COPY DEBUG". The last COPY_N requests as plain
 * text to paste into a message: how long ago, the host, the status and how
 * long it took. Not the path (a map tile's path is a map cell) and never the
 * query: nothing about where the phone or the spot is.
 */
export const COPY_N = 30
export function netCopyText(now: number, head: string, n = COPY_N): string {
  const rows = [...entries]
    .reverse()
    .slice(0, n)
    .map((e) => `${Math.round((now - e.at) / 1000)}s ago · ${e.host} · ${e.status} · ${e.ms} ms`)
  return [head, ...rows].join('\n')
}
