import { describe, expect, it } from 'vitest'
import { createConnectivity, OFFLINE_SPAN_MS, PROBE_EVERY_MS, PROBE_TIMEOUT_MS, RETRY_MS, type ConnectivityDeps } from './connectivity.ts'

/*
 * WHAT DECIDES "OFFLINE". At Virginia Beach on 27 Oct a phone on five bars of
 * 5G said OFFLINE: one failed request set it for the whole app. Now offline
 * is the app's own origin failing a check twice, and a success anywhere ends it.
 */
function harness(origin: 'up' | 'down' | 'hang', device = true) {
  let t = 0
  let timers: { at: number; fn: () => void; id: number }[] = []
  let next = 1
  const state = { origin, device, asked: 0 }
  const deps: ConnectivityDeps = {
    now: () => t,
    setTimeout: (fn, ms) => {
      const id = next++
      timers.push({ at: t + ms, fn, id })
      return id
    },
    clearTimeout: (id) => {
      timers = timers.filter((x) => x.id !== id)
    },
    deviceOnline: () => state.device,
    fetch: (_url, init) => {
      state.asked += 1
      if (state.origin === 'up') return Promise.resolve(new Response(null, { status: 200 }))
      if (state.origin === 'down') return Promise.reject(new TypeError('Load failed'))
      return new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    },
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))
  const advance = async (ms: number) => {
    const end = t + ms
    for (;;) {
      await flush()
      timers.sort((a, b) => a.at - b.at)
      const due = timers[0]
      if (due === undefined || due.at > end) break
      timers = timers.slice(1)
      t = due.at
      due.fn()
    }
    t = end
    await flush()
  }
  return { c: createConnectivity(deps), state, advance }
}

describe('connectivity', () => {
  it('one failed request with the origin answering stays online', async () => {
    const { c, state, advance } = harness('up')
    c.report(false)
    await advance(60_000)
    expect(c.isOnline()).toBe(true)
    expect(state.asked).toBe(1)
  })

  it('many sources failing at once ask the origin once', async () => {
    const { c, state, advance } = harness('up')
    for (let i = 0; i < 20; i += 1) c.report(false)
    await advance(1000)
    for (let i = 0; i < 20; i += 1) c.report(false)
    await advance(1000)
    expect(state.asked).toBe(1)
    expect(c.isOnline()).toBe(true)
  })

  it('Batch N: one failure is not offline, nor two; three spanning 30 s are', async () => {
    const { c, state, advance } = harness('down')
    c.report(false)
    await advance(RETRY_MS)
    expect(state.asked).toBe(2)
    expect(c.isOnline()).toBe(true)
    await advance(OFFLINE_SPAN_MS - RETRY_MS - 1)
    expect(c.isOnline()).toBe(true)
    await advance(1)
    expect(state.asked).toBe(3)
    expect(c.isOnline()).toBe(false)
  })

  it('the chain, not the wall clock: offline after the first failure and its two retries (the venue pack audit froze the page clock)', async () => {
    const { c, state, advance } = harness('down')
    c.report(false)
    await advance(RETRY_MS + 2 * RETRY_MS)
    expect(state.asked).toBe(3)
    expect(c.isOnline()).toBe(false)
  })

  it('checks asked for by other reports in between do not postpone the chain', async () => {
    const { c, advance } = harness('down', false)
    c.report(false)
    for (let k = 0; k < 6; k += 1) {
      await advance(5000)
      c.report(true)
    }
    await advance(1000)
    expect(c.isOnline()).toBe(false)
  })

  it('a hanging origin is offline only after three timed-out checks over 30 s', async () => {
    const { c, advance } = harness('hang')
    c.report(false)
    await advance(PROBE_TIMEOUT_MS + RETRY_MS + PROBE_TIMEOUT_MS)
    expect(c.isOnline()).toBe(true)
    await advance(2 * RETRY_MS + PROBE_TIMEOUT_MS)
    expect(c.isOnline()).toBe(false)
  })

  it('the device saying offline is not enough: one failed check with it is still online', async () => {
    const { c, advance } = harness('down', false)
    c.check()
    await advance(0)
    expect(c.isOnline()).toBe(true)
  })

  it('a success between failures starts the count again', async () => {
    const { c, state, advance } = harness('down')
    c.report(false)
    await advance(RETRY_MS)
    state.origin = 'up'
    await advance(2 * RETRY_MS)
    expect(c.isOnline()).toBe(true)
    state.origin = 'down'
    c.report(false)
    await advance(RETRY_MS)
    expect(c.isOnline()).toBe(true)
  })

  it('navigator.onLine false alone, with the origin answering, is online', async () => {
    const { c, advance } = harness('up', false)
    c.check()
    await advance(60_000)
    expect(c.isOnline()).toBe(true)
  })

  it('recovers without a reload: the next check that passes', async () => {
    const { c, state, advance } = harness('down')
    const seen: boolean[] = []
    c.onChange((o) => seen.push(o))
    c.report(false)
    await advance(OFFLINE_SPAN_MS)
    expect(c.isOnline()).toBe(false)
    state.origin = 'up'
    await advance(PROBE_EVERY_MS)
    expect(c.isOnline()).toBe(true)
    expect(seen).toEqual([false, true])
  })

  /* The race found on 27 Oct: a download in flight finished just after the network went. */
  it('a success landing while the phone says offline does not clear it; it checks instead', async () => {
    const { c, state, advance } = harness('down', false)
    c.check()
    await advance(OFFLINE_SPAN_MS)
    expect(c.isOnline()).toBe(false)
    const asked = state.asked
    c.report(true)
    await advance(0)
    expect(c.isOnline()).toBe(false)
    expect(state.asked).toBe(asked + 1)
  })

  it('recovers at once on any success', async () => {
    const { c, advance } = harness('down')
    c.report(false)
    await advance(OFFLINE_SPAN_MS)
    expect(c.isOnline()).toBe(false)
    c.report(true)
    expect(c.isOnline()).toBe(true)
  })
})
