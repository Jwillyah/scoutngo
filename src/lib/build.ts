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
declare const __BUILD_PUSHED__: boolean
declare const __REPO_SLUG__: string

/** The short commit this bundle was built from, or "dev". */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'

/** True when the tree had uncommitted changes at build time. */
export const BUILD_DIRTY: boolean = typeof __BUILD_DIRTY__ === 'boolean' ? __BUILD_DIRTY__ : false

export const BUILD_TIME: string = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : ''

/**
 * Whether the commit this bundle was built from had been pushed anywhere.
 *
 * FALSE IS THE EXPENSIVE CASE. A local build of unpushed work looks exactly
 * like a deployed one, on the same laptop, serving the same screen, and that
 * is what cost three days of field reports made against code that had already
 * been replaced.
 */
export const BUILD_PUSHED: boolean =
  typeof __BUILD_PUSHED__ === 'boolean' ? __BUILD_PUSHED__ : false

/** owner/repo, read from the git remote at build time. Empty when there is none. */
export const REPO_SLUG: string = typeof __REPO_SLUG__ === 'string' ? __REPO_SLUG__ : ''

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


/**
 * WHETHER WHAT YOU ARE LOOKING AT IS BEHIND ORIGIN.
 *
 * THE GAP THIS CLOSES. checkForNewBuild above answers "is this phone holding a
 * stale copy of what is deployed". That is a real question and it has held.
 * It is not the question that cost three days, which was "is what is DEPLOYED
 * behind the repository": the deploy was four commits behind, the phone was
 * faithfully showing it, and every check in the app agreed that everything was
 * current, because by its own measure everything was.
 *
 * Nothing inside a deployed bundle can know about a commit that was never
 * pushed. But once it IS pushed, origin knows, and origin will answer without
 * a key for a public repository.
 *
 * WHAT IT SENDS. One request to api.github.com naming the repository, which is
 * already public. No venue coordinate, no plan, no identifier of any kind: the
 * URL is the same for every user of a given fork. This is the only request in
 * the app that is about the app rather than about the shoot, and it is the
 * reason the privacy line says what leaves the device is weather, tide, map
 * tiles and this.
 *
 * It fails quietly. No signal, a rate limit, a private fork: all of them are
 * 'unknown', which says so rather than claiming either answer.
 */
export type OriginCheck =
  | { status: 'current'; origin: string }
  /** origin has commits this build does not. The deploy is behind the repo. */
  | { status: 'behind'; origin: string; when: string | null }
  | { status: 'unknown'; reason: string }

export function originCommitsUrl(slug: string, branch = 'main'): string {
  return `https://api.github.com/repos/${slug}/commits/${branch}`
}

export async function checkOrigin(
  slug: string = REPO_SLUG,
  fetchImpl: typeof fetch = fetch,
): Promise<OriginCheck> {
  if (slug === '') return { status: 'unknown', reason: 'no repository is configured' }
  if (BUILD_ID === 'dev') return { status: 'unknown', reason: 'this is a dev build' }

  try {
    const response = await fetchImpl(originCommitsUrl(slug), {
      headers: { accept: 'application/vnd.github+json' },
      cache: 'no-store',
    })
    if (!response.ok) {
      return {
        status: 'unknown',
        reason: response.status === 403 ? 'the rate limit was reached' : 'origin did not answer',
      }
    }
    const body = (await response.json()) as {
      sha?: unknown
      commit?: { committer?: { date?: unknown } }
    }
    if (typeof body.sha !== 'string' || body.sha.length < 7) {
      return { status: 'unknown', reason: 'origin did not answer' }
    }
    const origin = body.sha.slice(0, 7)
    const when =
      typeof body.commit?.committer?.date === 'string' ? body.commit.committer.date : null
    return origin === BUILD_ID ? { status: 'current', origin } : { status: 'behind', origin, when }
  } catch {
    return { status: 'unknown', reason: 'there was no answer from origin' }
  }
}

/**
 * The whole truth about this build, in sentences, with nothing left to compare
 * by hand.
 *
 * "A stamp I have to compare by hand is a stamp I will not check, which is
 * exactly what happened." So the stamp states what it is, and separately
 * states whether it is the current one, and never makes the reader hold two
 * hashes in their head.
 */
export interface BuildFacts {
  id: string
  dirty: boolean
  pushed: boolean
}

/** The facts about the bundle actually running. */
export const THIS_BUILD: BuildFacts = {
  id: BUILD_ID,
  dirty: BUILD_DIRTY,
  pushed: BUILD_PUSHED,
}

/**
 * The whole truth about this build, in sentences, with nothing left to compare
 * by hand.
 *
 * "A stamp I have to compare by hand is a stamp I will not check, which is
 * exactly what happened." So the stamp states what it is, and separately
 * states whether it is the current one, and never makes the reader hold two
 * hashes in their head.
 *
 * THE BUILD FACTS ARE A PARAMETER, not read from the module constants, because
 * those are compiled in and differ between a dev run, a test run and a deploy.
 * A function whose output depends on the tree it was built from cannot be
 * asserted, and an untestable honesty check is the kind that quietly stops
 * being honest.
 */
export function buildStampLines(
  build: BuildFacts,
  origin: OriginCheck | null,
  deployed: BuildCheck,
): { tone: 'loss' | 'fact'; text: string }[] {
  const lines: { tone: 'loss' | 'fact'; text: string }[] = []

  if (build.id === 'dev') {
    return [{ tone: 'fact', text: 'A dev build. There is no commit behind this one.' }]
  }

  if (build.dirty) {
    lines.push({
      tone: 'loss',
      text: `Built from ${build.id} with uncommitted changes on top, so it matches no commit anywhere.`,
    })
  }

  if (!build.pushed) {
    lines.push({
      tone: 'loss',
      text: `Built from ${build.id}, which was never pushed. Nothing deployed contains this code, and nobody else can see it.`,
    })
  }

  if (deployed.status === 'stale') {
    lines.push({
      tone: 'loss',
      text: `You are running ${build.id}; ${deployed.deployed} is deployed. Reload to pick it up.`,
    })
  }

  if (origin?.status === 'behind') {
    lines.push({
      tone: 'loss',
      text: `This build is ${build.id}. Origin is on ${origin.origin}${
        origin.when === null ? '' : `, from ${origin.when.slice(0, 10)}`
      }. What you are looking at is behind the repository, so a field test now tests older code.`,
    })
  }

  /*
   * THE ONLY REASSURING LINE IN THIS FILE, and it requires every one of four
   * conditions. This is the message that cost three days by being IMPLIED when
   * it was not true, so it is never implied: it is said, or nothing is.
   */
  if (
    origin?.status === 'current' &&
    deployed.status !== 'stale' &&
    build.pushed &&
    !build.dirty
  ) {
    lines.push({ tone: 'fact', text: `Build ${build.id}, and it is the newest commit on origin.` })
  }

  if (origin?.status === 'unknown') {
    lines.push({
      tone: 'fact',
      text: `Build ${build.id}. Could not check it against origin: ${origin.reason}.`,
    })
  }

  return lines
}
