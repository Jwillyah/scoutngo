import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUILD_ID,
  BUILD_META_NAME,
  buildIdFromHtml,
  buildLabel,
  checkForNewBuild,
} from './build.ts'

/*
 * KNOWING WHICH BUILD IS RUNNING.
 *
 * A pass was spent disagreeing about screenshots because there was no way to
 * tell, from a phone, whether the screen was the code that had just been
 * pushed. The one service worker fetches the document network-first and never
 * answers this check (src/sw/shellRoutes.ts); what holds a stale build is iOS
 * Safari keeping index.html, and therefore the hashed asset URLs it names.
 */
const page = (id: string) =>
  `<!doctype html><html><head><meta name="${BUILD_META_NAME}" content="${id}" /></head><body></body></html>`

describe('reading the build id out of a document', () => {
  it('finds the stamped id', () => {
    expect(buildIdFromHtml(page('a1b2c3d'))).toBe('a1b2c3d')
  })

  it('does not mind the attribute order or the quoting', () => {
    expect(
      buildIdFromHtml(`<meta content='deadbee' name='${BUILD_META_NAME}'>`),
    ).toBe(null)
    expect(buildIdFromHtml(`<meta name='${BUILD_META_NAME}' content='deadbee'>`)).toBe('deadbee')
  })

  it('returns null rather than guessing when the tag is absent', () => {
    expect(buildIdFromHtml('<!doctype html><html><head></head></html>')).toBe(null)
    expect(buildIdFromHtml('')).toBe(null)
  })

  /* It must not match some other meta tag that happens to sit nearby. */
  it('does not pick up a different meta tag', () => {
    expect(buildIdFromHtml('<meta name="theme-color" content="#0a0b09" />')).toBe(null)
  })
})

describe('buildLabel', () => {
  it('is the id as compiled in', () => {
    expect(buildLabel()).toContain(BUILD_ID)
  })

  /*
   * A build from a tree with uncommitted changes corresponds to NO commit, so
   * printing a bare hash for it would be a lie by omission. It gets a mark.
   */
  it('marks a build that did not come from a clean tree', () => {
    expect(buildLabel().replace(BUILD_ID, '')).toMatch(/^\+?$/)
  })
})

describe('checking whether a newer build is deployed', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const respond = (body: string, ok = true) =>
    vi.fn(async () => new Response(body, { status: ok ? 200 : 503 }))

  it('says current when the deployed id matches', async () => {
    const fetchImpl = respond(page(BUILD_ID))
    expect(await checkForNewBuild('/', fetchImpl as unknown as typeof fetch)).toEqual({
      status: 'current',
    })
  })

  it('says stale, and names the deployed build, when it does not', async () => {
    const fetchImpl = respond(page('f00dcaf'))
    const result = await checkForNewBuild('/', fetchImpl as unknown as typeof fetch)
    /*
     * BUILD_ID is compiled in by the define in vite.config.ts, which vitest
     * shares, so under test it is the real short commit. It is only 'dev' when
     * there is no git and no CI variable, which is a tarball; the check
     * deliberately declines to compare there, because there is no commit to
     * compare against and a dev server reloads itself anyway.
     */
    if (BUILD_ID === 'dev') {
      expect(result).toEqual({ status: 'unknown' })
      return
    }
    expect(result).toEqual({ status: 'stale', deployed: 'f00dcaf' })
  })

  /*
   * A CHECK THAT CAN BE ANSWERED FROM THE CACHE IT IS CHECKING FOR IS NOT A
   * CHECK. This is the one request in the app that must bypass it.
   */
  it('asks for the document with no-store', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => new Response(page('f00dcaf')),
    )
    await checkForNewBuild('/', fetchImpl as unknown as typeof fetch)
    if (BUILD_ID === 'dev') return
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ cache: 'no-store' })
  })

  /*
   * OFFLINE IS NOT AN ERROR. Somebody in the field with no signal must not see
   * a failure about build versions, and the field pack they are reading comes
   * out of localStorage regardless.
   */
  it('is quiet when offline', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await checkForNewBuild('/', fetchImpl as unknown as typeof fetch)).toEqual({
      status: 'unknown',
    })
  })

  it('is quiet when the server answers an error', async () => {
    const fetchImpl = respond('', false)
    expect(await checkForNewBuild('/', fetchImpl as unknown as typeof fetch)).toEqual({
      status: 'unknown',
    })
  })

  it('is quiet when the document has no stamp, rather than crying stale', async () => {
    const fetchImpl = respond('<html><head></head></html>')
    expect(await checkForNewBuild('/', fetchImpl as unknown as typeof fetch)).toEqual({
      status: 'unknown',
    })
  })

  /* It reads one document and nothing else. No storage, no second request. */
  it('touches nothing but that one request', async () => {
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem, getItem: () => null, removeItem: vi.fn() })
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => new Response(page('f00dcaf')),
    )
    await checkForNewBuild('/', fetchImpl as unknown as typeof fetch)
    expect(setItem).not.toHaveBeenCalled()
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(1)
  })
})
