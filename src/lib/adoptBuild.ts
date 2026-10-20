/*
 * A COLD LOAD ADOPTS A NEWER BUILD BY ITSELF.
 *
 * WHAT WAS WRONG. The app could tell it was stale and could fix it, and did
 * neither without being asked. checkForNewBuild found the newer id and
 * NewBuildNotice offered a button; if nobody pressed it, the next launch
 * loaded the same stale document and offered the same button again. A phone
 * could sit on a build from a week ago indefinitely while the server had
 * something newer the whole time, which is what "no push will ever reach
 * them" means in practice.
 *
 * THERE IS NO SERVICE WORKER AND NO CACHE STORAGE IN THIS APP -- checked,
 * not assumed: no registration, no workbox, no PWA plugin, and no sw.js on
 * the deployed site. The offline feature is field packs in localStorage,
 * which are data and not code. What holds a stale build is the browser's own
 * document cache, and on iOS a home-screen app launching its start_url is
 * the stubborn case.
 *
 * SO THE FIX IS ABOUT THE DOCUMENT. index.html names the hashed bundle URLs,
 * so a fresh document is the whole of it: get one, and the new code follows
 * on its own.
 *
 * WHY A COLD LOAD AND NOT EVERY CHECK. Replacing the document throws away
 * whatever is on screen. Seconds after launch there is nothing to throw away.
 * Twenty minutes in, somebody may be standing on a dock halfway through
 * setting up, and that case stays an offer -- which is the behaviour the
 * notice was written for and is not being taken away.
 */

/** How long after load a reload still counts as "nothing to lose". */
export const COLD_LOAD_MS = 10_000

/**
 * Remembers which deployed id this tab has already reloaded for.
 *
 * THE LOOP THIS PREVENTS. If the document's id and the bundle's id ever
 * disagreed for a reason a reload cannot fix -- a half-finished deploy, a CDN
 * serving two versions, a build that stamped two different ids -- then every
 * load would see "stale", reload, and see it again. Recording the id we
 * reloaded for means that goes wrong exactly once per tab and then falls back
 * to the notice, which says what is happening instead of spinning.
 *
 * sessionStorage, not localStorage: a genuinely new deploy tomorrow must be
 * adopted, and a fresh tab is a fresh decision.
 */
const KEY = 'scoutngo.adopted.v1'

export interface AdoptDeps {
  /** Milliseconds since this document started loading. */
  sinceLoad: number
  /** Reads the id this tab has already reloaded for, or null. */
  read: () => string | null
  /** Records the id being reloaded for. */
  write: (id: string) => void
}

export type AdoptChoice =
  | { act: 'reload'; to: string }
  | { act: 'offer'; why: 'not a cold load' | 'already tried' }

/**
 * Whether to adopt the deployed build now, or leave it to the notice.
 *
 * PURE, AND THAT IS THE POINT. The decision is the part that can be wrong in
 * a way nobody notices -- reloading mid-shoot, or looping -- so it is a
 * function of three inputs with no clock, no storage and no window in it, and
 * it is tested directly.
 */
export function adoptChoice(deployed: string, deps: AdoptDeps): AdoptChoice {
  if (deps.read() === deployed) return { act: 'offer', why: 'already tried' }
  if (deps.sinceLoad > COLD_LOAD_MS) return { act: 'offer', why: 'not a cold load' }
  deps.write(deployed)
  return { act: 'reload', to: deployed }
}

/**
 * The URL to load the newer build from.
 *
 * A PLAIN RELOAD CAN BE ANSWERED BY THE CACHE THAT CAUSED THIS. The parameter
 * makes it a different URL, which the stale entry cannot satisfy. It carries
 * the id rather than a timestamp so the address bar says something true, and
 * so a second attempt for the same build is the same URL rather than an
 * endless series of new ones.
 */
export function adoptUrl(href: string, deployed: string): string {
  const url = new URL(href)
  url.searchParams.set('b', deployed)
  return url.toString()
}

/** The browser-facing wiring. Separated so the decision above stays testable. */
export function browserAdoptDeps(): AdoptDeps {
  return {
    sinceLoad: typeof performance === 'undefined' ? 0 : performance.now(),
    read: () => {
      try {
        return window.sessionStorage.getItem(KEY)
      } catch {
        /* Private mode, or storage disabled. Treat it as "not tried yet": the
         * cold-load window is then the only guard, which is the weaker of the
         * two but still bounded. */
        return null
      }
    },
    write: (id) => {
      try {
        window.sessionStorage.setItem(KEY, id)
      } catch {
        /* Nothing to do. The cold-load window still bounds this. */
      }
    },
  }
}
