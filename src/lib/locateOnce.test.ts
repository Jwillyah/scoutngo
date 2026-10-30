import { afterEach, describe, expect, it, vi } from 'vitest'
import { locateOnce, locateWords, LOCATED_ZOOM, NO_PROMPT_MS } from './locateOnce.ts'

/*
 * Node has a `navigator` with no `geolocation` on it, which is exactly the
 * unsupported case, so each test that needs the API installs one and takes it
 * away again.
 */
const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator')

function install(geolocation: unknown) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { geolocation },
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  if (original === undefined) delete (globalThis as { navigator?: unknown }).navigator
  else Object.defineProperty(globalThis, 'navigator', original)
})

const denial = (code: number) => ({
  code,
  PERMISSION_DENIED: 1,
  POSITION_UNAVAILABLE: 2,
  TIMEOUT: 3,
})

describe('locateOnce', () => {
  it('asks once and does not leave a watch running', async () => {
    const getCurrentPosition = vi.fn((ok: (p: unknown) => void) => {
      ok({ coords: { latitude: 38.36, longitude: -75.6, accuracy: 850 }, timestamp: 0 })
    })
    const watchPosition = vi.fn()
    install({ getCurrentPosition, watchPosition })

    const result = await locateOnce()
    expect(result).toEqual({ status: 'ok', at: { lat: 38.36, lon: -75.6 }, accuracyMeters: 850 })
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    // watchPosition is the FIELD mode hook's business, not this one's.
    expect(watchPosition).not.toHaveBeenCalled()
  })

  /*
   * NOT high accuracy. This answers "which town", so the map has somewhere to
   * start. Spinning up GPS to choose an opening view would be asking the phone
   * for precision nothing then uses.
   */
  it('does not ask for a GPS grade fix', async () => {
    const getCurrentPosition = vi.fn(
      (
        ok: (p: unknown) => void,
        _fail: (e: unknown) => void,
        _options: PositionOptions,
      ) => void ok({ coords: { latitude: 1, longitude: 2, accuracy: 3 }, timestamp: 0 }),
    )
    install({ getCurrentPosition })
    await locateOnce()
    expect(getCurrentPosition.mock.calls[0][2].enableHighAccuracy).toBe(false)
  })

  /*
   * A REFUSAL IS AN ANSWER. It comes back as a state with a sentence, and
   * nothing else is attempted. The guarantee that nothing else is attempted is
   * in tests/noIpGeolocation.test.ts, which checks there is no such code to run.
   */
  it('reports a refusal as a state and does not retry', async () => {
    const getCurrentPosition = vi.fn((_ok: unknown, fail: (e: unknown) => void) => {
      fail(denial(1))
    })
    install({ getCurrentPosition })
    expect(await locateOnce(15_000, () => 0)).toEqual({ status: 'denied', prompted: false })
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  /*
   * THE THREE CODES, EACH ITS OWN REASON (field test, 30 Oct: "Use my
   * location" did nothing). A refusal faster than anyone could answer a
   * prompt means none was shown: Location Services is off for Safari.
   */
  it('tells a refusal with no prompt from one somebody answered', async () => {
    let t = 0
    const clock = () => t
    install({ getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => { t = 12; fail(denial(1)) } })
    const quick = await locateOnce(15_000, clock)
    expect(quick).toEqual({ status: 'denied', prompted: false })
    expect(locateWords(quick as Exclude<typeof quick, { status: 'ok' }>)).toBe('Location is off for Safari: Settings › Privacy & Security › Location Services › Safari Websites')
    t = 0
    install({ getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => { t = NO_PROMPT_MS + 2000; fail(denial(1)) } })
    const answered = await locateOnce(15_000, clock)
    expect(answered).toEqual({ status: 'denied', prompted: true })
    expect(locateWords(answered as Exclude<typeof answered, { status: 'ok' }>)).toMatch(/^Location not shared with this site: Settings › Apps › Safari › Location/)
  })

  it('reports no position and a timeout apart from a refusal, because they are different', async () => {
    install({ getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail(denial(2)) })
    expect(await locateOnce()).toEqual({ status: 'unavailable' })
    install({ getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail(denial(3)) })
    expect(await locateOnce()).toEqual({ status: 'timeout' })
    expect(locateWords({ status: 'timeout' })).toBe('No position within 15 s: Retry, or search for the place')
  })

  it('reports a browser without the API rather than throwing', async () => {
    install(undefined)
    expect(await locateOnce()).toEqual({ status: 'unsupported' })
  })

  it('never rejects, whatever comes back', async () => {
    install({
      getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail(denial(2)),
    })
    await expect(locateOnce()).resolves.toBeTruthy()
  })

  /*
   * NOTHING IS STORED. The coordinate is returned to the caller and that is
   * the end of it: no localStorage, no sessionStorage, no cookie.
   */
  it('writes the position nowhere', async () => {
    const setItem = vi.fn()
    const store = { setItem, getItem: () => null, removeItem: vi.fn() }
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { value: store, configurable: true })
    Object.defineProperty(globalThis, 'sessionStorage', { value: store, configurable: true })
    install({
      getCurrentPosition: (ok: (p: unknown) => void) =>
        ok({ coords: { latitude: 51.5, longitude: -0.1, accuracy: 2000 }, timestamp: 0 }),
    })

    await locateOnce()
    expect(setItem).not.toHaveBeenCalled()

    if (previous === undefined) delete (globalThis as { localStorage?: unknown }).localStorage
    else Object.defineProperty(globalThis, 'localStorage', previous)
  })

  it('frames a neighbourhood, not a doorstep', () => {
    // A wifi fix is good to a few kilometres, so this must not be street level.
    expect(LOCATED_ZOOM).toBeLessThan(15)
    expect(LOCATED_ZOOM).toBeGreaterThan(9)
  })

  it('says what to do for every outcome that is not a position', () => {
    const all = [{ status: 'denied', prompted: true }, { status: 'denied', prompted: false }, { status: 'unavailable' }, { status: 'timeout' }, { status: 'unsupported' }, { status: 'insecure' }] as const
    for (const r of all) {
      const words = locateWords(r)
      // A setting to change, Retry, or the search instead: never a dead end.
      expect(words).toMatch(/Settings ›|Retry|search/)
      expect(words).not.toMatch(/\bsafe\b|clear/i)
    }
  })
})
