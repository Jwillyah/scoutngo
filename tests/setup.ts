import { afterAll, beforeEach } from 'vitest'
import { clearWeatherStore } from '../src/lib/weatherStore.ts'

/* The shared weather store keeps answers for the session (src/lib/weatherStore.ts); each test starts with none. */
beforeEach(async () => {
  await clearWeatherStore()
})

/*
 * THE NETWORK GUARD, FOR THE UNIT TESTS (docs/gate.md). Tests use saved
 * fixtures only: a fetch to any host but this machine is refused with the
 * host's name, so a test that quietly depended on a live service fails here
 * rather than on the day the service is down or rate-limits this IP. A test
 * that stubs fetch replaces this, which is the point of stubbing it.
 */
const realFetch = globalThis.fetch
const outside: string[] = []
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  let host = ''
  try {
    host = new URL(href, 'http://127.0.0.1/').hostname
  } catch {
    /* not a URL: let fetch say so */
  }
  if (host === '' || host === '127.0.0.1' || host === 'localhost') return realFetch(input, init)
  outside.push(href)
  throw new TypeError(`network guard: a test tried to reach ${host}; tests use saved fixtures only`)
}) as typeof fetch

afterAll(() => {
  if (outside.length > 0) throw new Error(`network guard: ${outside.length} request(s) to live hosts, first ${outside[0]}`)
})
