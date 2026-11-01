import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { locateAttempts, locateOnce } from '../src/lib/locateOnce.ts'

/* Settings › Debug lists every location ask with the browser's code (Batch C2). */
describe('the location attempts log', () => {
  it('keeps each ask with its error code and words', async () => {
    let t = 0
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (_ok: unknown, fail: (e: { code: number; message: string }) => void) => fail({ code: 1, message: 'User denied Geolocation' }) },
    })
    await locateOnce(1000, () => (t += 5))
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (_ok: unknown, fail: (e: { code: number; message: string }) => void) => fail({ code: 3, message: 'Timeout expired' }) },
    })
    await locateOnce(1000, () => (t += 9000))
    const [a, b] = locateAttempts().slice(-2)
    expect(a.code).toBe(1)
    expect(a.words).toMatch(/^code 1, refused, too fast for a prompt: off in Settings, after \d+ ms \(User denied Geolocation\)$/)
    expect(b.code).toBe(3)
    expect(b.words).toMatch(/^code 3, timed out, after \d+ ms/)
    vi.unstubAllGlobals()
  })

  it('is on the Settings page, under Debug', () => {
    const page = readFileSync('src/components/SettingsPage.tsx', 'utf8')
    expect(page).toContain('Location attempts')
    expect(page).toContain('useLocateAttempts()')
  })
})

describe('the Wind page button', () => {
  it('reads in normal case, 44 px', () => {
    const css = readFileSync('src/styles/app.css', 'utf8')
    const rule = /\.windp__card \{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toContain('text-transform: none')
    expect(rule).toContain('min-height: 44px')
  })
})
