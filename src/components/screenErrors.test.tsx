import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ScreenFailCard } from './ScreenBoundary.tsx'

/*
 * BATCH CORE, SECTION 2: 3D AND FLY ON THE IPHONE. The Fly failure of 14 Nov
 * did not reproduce on the Mac; the phone's own error now stays on the phone
 * for a screenshot (Settings › Debug › Last errors), each screen says when it
 * did not load, and a tab iOS reloads in 3D comes back on the map.
 */
const stub = () => {
  const make = () => {
    let store: Record<string, string> = {}
    return { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k], clear: () => void (store = {}) }
  }
  vi.stubGlobal('localStorage', make())
  vi.stubGlobal('sessionStorage', make())
}

describe('the last 20 errors, kept on the phone', () => {
  beforeEach(() => {
    stub()
    vi.resetModules()
  })
  it('keeps each with its time, screen and build; the oldest go after 20', async () => {
    const { readErrors, recordError, ERROR_LOG_MAX } = await import('../lib/errorLog.ts')
    for (let i = 0; i < 25; i += 1) recordError('Fly', `error ${i}`, new Date(Date.UTC(2026, 10, 16, 12, i)))
    const list = readErrors()
    expect(ERROR_LOG_MAX).toBe(20)
    expect(list).toHaveLength(20)
    expect(list[0].message).toBe('error 5')
    expect(list[19]).toMatchObject({ where: 'Fly', message: 'error 24', at: '2026-11-16T12:24:00.000Z' })
    expect(typeof list[19].build).toBe('string')
  })
  it('a long message is cut at 300 characters', async () => {
    const { readErrors, recordError } = await import('../lib/errorLog.ts')
    recordError('3D', 'x'.repeat(1000))
    expect(readErrors()[0].message).toHaveLength(300)
  })
  it('3D open when the page died (no pagehide): logged at start-up, once', async () => {
    const { diedIn, markScreenOpen, readErrors } = await import('../lib/errorLog.ts')
    markScreenOpen('3D')
    vi.resetModules()
    const again = await import('../lib/errorLog.ts')
    expect(again.diedIn()).toBe('3D')
    expect(again.diedIn()).toBe('3D')
    expect(readErrors().filter((e) => e.where === '3D')).toHaveLength(1)
    expect(diedIn).toBeTypeOf('function')
  })
})

describe('each screen says when it did not load', () => {
  it('the card: the screen, the message, where it is kept, Back', () => {
    const html = renderToStaticMarkup(<ScreenFailCard title="Fly didn't load" message="TypeError: x is undefined" onBack={() => {}} onWait={() => {}} />)
    expect(html).toContain('Fly didn&#x27;t load')
    expect(html).toContain('TypeError: x is undefined')
    expect(html).toContain('Settings › Debug › Last errors')
    expect(html).toContain('>Back<')
    expect(html).toContain('>Keep waiting<')
  })
})
