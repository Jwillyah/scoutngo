import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageNotLoaded } from '../components/PageNotLoaded.tsx'

/* Batch CORE, Section 7A (the offline walk, 16 Nov): a page whose code does not arrive never blanks the app. */
describe('a page loaded on demand, with no signal', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] })
  })
  it('the load fails: "This page needs a signal", and the phone\'s log keeps why', async () => {
    const { orNotLoaded } = await import('./lazyPage.ts')
    const { readErrors } = await import('./errorLog.ts')
    const got = await orNotLoaded(() => Promise.reject(new TypeError('Unable to preload CSS for /assets/SkyPage.css')), [0, 0])
    expect(got.default).toBe(PageNotLoaded)
    expect(readErrors().at(-1)).toMatchObject({ where: 'Page', message: 'TypeError: Unable to preload CSS for /assets/SkyPage.css' })
  })
  it('a dropped request is asked again: the page comes when a later try answers', async () => {
    const { orNotLoaded } = await import('./lazyPage.ts')
    const Real = () => null
    let tries = 0
    const got = await orNotLoaded(async () => {
      tries += 1
      if (tries < 3) throw new TypeError('Load failed')
      return { default: Real }
    }, [0, 0, 0])
    expect(got.default).toBe(Real)
    expect(tries).toBe(3)
  })
})

describe('pages fetched while there is signal (Batch DRONE, Section 6.1)', () => {
  it('a preloaded page is asked once, and opening it asks nothing more', async () => {
    const { lazyPage: lp, preloadPages } = await import('./lazyPage.ts')
    let asked = 0
    lp(async () => {
      asked += 1
      return { default: () => null }
    })
    await preloadPages()
    await preloadPages()
    expect(asked).toBe(1)
  })
  it('a preload that fails is forgotten: the page asks again when it opens', async () => {
    const { lazyPage: lp, preloadPages } = await import('./lazyPage.ts')
    let asked = 0
    lp(async () => {
      asked += 1
      if (asked === 1) throw new TypeError('Load failed')
      return { default: () => null }
    })
    await preloadPages()
    await preloadPages()
    expect(asked).toBe(2)
  })
  it('the 3D view is not preloaded', async () => {
    const { lazyPage: lp, preloadPages } = await import('./lazyPage.ts')
    let asked = 0
    lp(
      async () => {
        asked += 1
        return { default: () => null }
      },
      { preload: false },
    )
    await preloadPages()
    expect(asked).toBe(0)
  })
})
