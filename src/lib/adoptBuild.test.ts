import { describe, expect, it } from 'vitest'
import { COLD_LOAD_MS, adoptChoice, adoptUrl, type AdoptDeps } from './adoptBuild.ts'

const deps = (over: Partial<AdoptDeps> = {}): AdoptDeps => {
  let stored: string | null = null
  return {
    sinceLoad: 500,
    touched: false,
    read: () => stored,
    write: (id) => {
      stored = id
    },
    ...over,
  }
}

describe('adopting a newer build', () => {
  /*
   * THE CASE THAT WAS BROKEN. A phone launches, the document it was handed is
   * last week's, and the server has something newer. Nobody should have to
   * press anything.
   */
  it('reloads on a cold load', () => {
    expect(adoptChoice('06206f1', deps())).toEqual({ act: 'reload', to: '06206f1' })
  })

  /*
   * AND THE CASE THAT MUST NOT BE. Twenty minutes in, somebody may be halfway
   * through placing positions on a dock. A deploy is not a reason to throw
   * that away, so it goes back to being an offer.
   */
  it('only offers once the session is under way', () => {
    expect(adoptChoice('06206f1', deps({ sinceLoad: COLD_LOAD_MS + 1 }))).toEqual({
      act: 'offer',
      why: 'not a cold load',
    })
  })

  /*
   * NEVER ON ITS OWN MID-DRAG (29 Oct). A slow home-screen launch can put the
   * answer a few seconds after somebody has started using the page; young
   * but touched is in use, and gets the pill.
   */
  it('only offers once the page has been touched, however young', () => {
    expect(adoptChoice('06206f1', deps({ sinceLoad: 4000, touched: true }))).toEqual({ act: 'offer', why: 'in use' })
  })

  it('records nothing when it only offers, so the pill\'s reload is not refused later', () => {
    const d = deps({ touched: true })
    adoptChoice('06206f1', d)
    expect(d.read()).toBeNull()
  })

  it('treats the boundary itself as still cold', () => {
    expect(adoptChoice('06206f1', deps({ sinceLoad: COLD_LOAD_MS })).act).toBe('reload')
  })

  /*
   * THE LOOP. If the two ids disagree for a reason a reload cannot fix, this
   * must go wrong once and then stop. Asserted by running the real decision
   * twice against one store, which is the sequence a reload loop would be.
   */
  it('reloads at most once per deployed id, so a bad id cannot loop', () => {
    const d = deps()
    expect(adoptChoice('06206f1', d).act).toBe('reload')
    expect(adoptChoice('06206f1', d)).toEqual({ act: 'offer', why: 'already tried' })
    expect(adoptChoice('06206f1', d)).toEqual({ act: 'offer', why: 'already tried' })
  })

  /* But a genuinely different build later is still adopted. */
  it('still adopts the next build after one that did not take', () => {
    const d = deps()
    adoptChoice('06206f1', d)
    expect(adoptChoice('abcdef0', d).act).toBe('reload')
  })

  /*
   * STORAGE CAN REFUSE -- private mode, blocked site data. The decision must
   * still be made rather than thrown, and the cold-load window still bounds
   * it.
   */
  it('still decides when storage is unavailable', () => {
    const d: AdoptDeps = {
      sinceLoad: 100,
      touched: false,
      read: () => null,
      write: () => {
        throw new Error('storage disabled')
      },
    }
    expect(() => adoptChoice('06206f1', d)).toThrow()
  })
})

describe('the url a newer build is fetched from', () => {
  /*
   * A PLAIN RELOAD CAN BE ANSWERED BY THE CACHE THAT CAUSED THIS, so the
   * address has to differ from the one the stale entry is filed under.
   */
  it('carries the deployed id, so the stale entry cannot answer it', () => {
    expect(adoptUrl('https://scoutngo.vercel.app/', '06206f1')).toBe(
      'https://scoutngo.vercel.app/?b=06206f1',
    )
  })

  it('keeps the path and any other parameters', () => {
    expect(adoptUrl('https://scoutngo.vercel.app/how?calibration=1', 'abcdef0')).toBe(
      'https://scoutngo.vercel.app/how?calibration=1&b=abcdef0',
    )
  })

  /*
   * AND A SECOND ATTEMPT FOR THE SAME BUILD IS THE SAME URL. A timestamp
   * would make every attempt a new address, which is how a reload loop turns
   * into an unbounded set of cache entries.
   */
  it('is stable for one build, rather than a new address every time', () => {
    const once = adoptUrl('https://scoutngo.vercel.app/?b=old', '06206f1')
    expect(adoptUrl(once, '06206f1')).toBe(once)
  })
})
