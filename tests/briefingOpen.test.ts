import { describe, expect, it } from 'vitest'
import { shouldOpenBriefing } from '../src/lib/briefingOpen.ts'

/* The Today briefing opens by itself on a plain launch of the home-screen app only (Batch H, Section 2). */
const at = (pathname: string, hash = '', search = '', webdriver = false, standalone = true) => ({ location: { pathname, hash, search }, navigator: { webdriver, standalone } })

describe('when the briefing opens by itself', () => {
  it('on a plain launch, once the landing has been seen', () => {
    expect(shouldOpenBriefing(at('/'), true)).toBe(true)
    expect(shouldOpenBriefing(at('/'), false)).toBe(false)
  })
  it('not in a Safari tab: there it is Menu › Today', () => {
    expect(shouldOpenBriefing(at('/', '', '', false, false), true)).toBe(false)
    expect(shouldOpenBriefing({ ...at('/', '', '', false, false), matchMedia: () => ({ matches: true }) }, true)).toBe(true)
  })
  it('not on a shared plan, a deep path, or under automation', () => {
    expect(shouldOpenBriefing(at('/', '#p=abc'), true)).toBe(false)
    expect(shouldOpenBriefing(at('/field'), true)).toBe(false)
    expect(shouldOpenBriefing(at('/', '', '?brief=0'), true)).toBe(false)
    expect(shouldOpenBriefing(at('/', '', '', true), true)).toBe(false)
    expect(shouldOpenBriefing(null, true)).toBe(false)
  })
})
