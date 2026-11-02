import { describe, expect, it } from 'vitest'
import { shouldOpenBriefing } from '../src/lib/briefingOpen.ts'

/* The Today briefing opens by itself on every plain launch (Batch H, Section 2; Batch I, Section 1). */
const at = (pathname: string, hash = '', search = '', webdriver = false, standalone = true) => ({ location: { pathname, hash, search }, navigator: { webdriver, standalone } })

describe('when the briefing opens by itself', () => {
  it('on a plain launch, once the landing has been seen', () => {
    expect(shouldOpenBriefing(at('/'), true)).toBe(true)
    expect(shouldOpenBriefing(at('/'), false)).toBe(false)
  })
  it('in a Safari tab too (Batch I: the briefing is the front door)', () => {
    expect(shouldOpenBriefing(at('/', '', '', false, false), true)).toBe(true)
  })
  it('not with any query: a shared link, ?probe=1, ?calibration=1', () => {
    expect(shouldOpenBriefing(at('/', '', '?calibration=1'), true)).toBe(false)
    expect(shouldOpenBriefing(at('/', '', '?probe=1'), true)).toBe(false)
  })
  it('not on a shared plan, a deep path, or under automation', () => {
    expect(shouldOpenBriefing(at('/', '#p=abc'), true)).toBe(false)
    expect(shouldOpenBriefing(at('/field'), true)).toBe(false)
    expect(shouldOpenBriefing(at('/', '', '?brief=0'), true)).toBe(false)
    expect(shouldOpenBriefing(at('/', '', '', true), true)).toBe(false)
    expect(shouldOpenBriefing(null, true)).toBe(false)
  })
})
