/**
 * WHICH BUILD IS RUNNING, AND WHETHER A NEWER ONE EXISTS.
 *
 * WHY THIS EXISTS. A pass was spent disagreeing about screenshots because
 * there was no way to tell, from a phone, whether the screen in front of you
 * was the code that had just been pushed.
 *
 * THERE IS NO SERVICE WORKER IN THIS APP. Not one line: no registration, no
 * workbox, no PWA plugin, nothing in the build output. So nothing here is
 * about a service worker cache. What actually holds a stale build is iOS
 * Safari, and a home-screen app more stubbornly still, keeping index.html and
 * therefore keeping the old hashed asset URLs it names.
 *
 * HOW THE CHECK WORKS. index.html is fetched with cache: 'no-store' and the
 * build id compiled into it is compared with the one compiled into the running
 * bundle. If they differ, a newer build is deployed and this one is stale. It
 * is a plain fetch, so it needs no new machinery and cannot itself be served
 * from a cache.
 *
 * OFFLINE FIELD PACKS ARE UNAFFECTED. They live in localStorage
 * (src/lib/fieldPack.ts) and are not touched by any of this: the check is one
 * request that fails quietly when there is no signal, and a reload is only
 * ever offered, never forced. Reloading on somebody mid-shoot would be the
 * worst thing this file could do.
 */

declare const __BUILD_ID__: string
declare const __BUILD_DIRTY__: boolean
declare const __BUILD_TIME__: string

/** The short commit this bundle was built from, or "dev". */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

/** True when the tree had uncommitted changes at build time. */
export const BUILD_DIRTY: boolean = typeof __BUILD_DIRTY__ === 'boolean' ? __BUILD_DIRTY__ : false

export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''

/**
 * What to show the user. The hash, with a mark when the build came from a
 * tree that had uncommitted changes, because that build does not correspond to
 * any commit and saying "a1b2c3d" would be a lie by omission.
 */
export function buildLabel(): string {
  return BUILD_DIRTY ? `${BUILD_ID}+` : BUILD_ID
}

/**
 * The marker the check reads out of index.html.
 *
 * A meta tag rather than the asset filenames: those are hashed per chunk, so
 * comparing them means parsing the document and guessing which script is the
 * entry. One tag whose content is the build id is unambiguous.
 */
export const BUILD_META_NAME = 'scoutngo-build'

export function buildIdFromHtml(html: string): string | null {
  /*
   * Deliberately a regex and not DOMParser. Parsing the document would run
   * nothing (DOMParser does not execute scripts) but it would still build a
   * second DOM for a one-line read, on a timer, on a phone.
   */
  const match = new RegExp(
    `<meta[^>]+name=["']${BUILD_META_NAME}["'][^>]+content=["']([^"']+)["']`,
    'i',
  ).exec(html)
  return match === null ? match : match[1]
}

export type BuildCheck =
  | { status: 'current' }
  | { status: 'stale'; deployed: string }
  /** Offline, or the request failed. Not an error worth showing anybody. */
  | { status: 'unknown' }

/**
 * Asks the server which build is deployed. Never throws.
 *
 * `cache: 'no-store'` on the request itself, because a check that can be
 * answered from the very cache it is checking for is not a check.
 */
export async function checkForNewBuild(
  url = '/',
  fetchImpl: typeof fetch = fetch,
): Promise<BuildCheck> {
  // A dev build has no commit to compare against, so there is nothing to say.
  if (BUILD_ID === 'dev') return { status: 'unknown' }
  try {
    const response = await fetchImpl(url, { cache: 'no-store' })
    if (!response.ok) return { status: 'unknown' }
    const deployed = buildIdFromHtml(await response.text())
    if (deployed === null || deployed === '') return { status: 'unknown' }
    return deployed === BUILD_ID ? { status: 'current' } : { status: 'stale', deployed }
  } catch {
    return { status: 'unknown' }
  }
}

/**
 * How often to look.
 *
 * Fifteen minutes. Often enough that a build pushed while someone is setting
 * up is noticed before they walk out of the door, rare enough to be invisible
 * on a phone's battery and on a data plan. The check is also run once on a
 * return to the foreground, which is when a phone that has been in a pocket
 * actually needs it.
 */
export const BUILD_CHECK_INTERVAL_MS = 15 * 60 * 1000
