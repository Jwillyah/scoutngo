import { beforeEach, describe, expect, it, vi } from 'vitest'
import { askOverpass, BACKOFF_MS, OVERPASS_SERVERS, overpassInFlight, parseRetryAfter, resetOverpassClient } from './overpassClient.ts'

const ok = (body: unknown = { elements: [] }) => new Response(JSON.stringify(body), { status: 200 })
const status = (code: number, headers: Record<string, string> = {}) => new Response('', { status: code, headers })
const noSleep = vi.fn(async () => undefined)

describe('the one Overpass client', () => {
  beforeEach(() => {
    resetOverpassClient()
    noSleep.mockClear()
  })

  it('never has more than one request on the wire, however many are asked at once', async () => {
    let live = 0
    let most = 0
    const fetcher = vi.fn(async () => {
      live += 1
      most = Math.max(most, live)
      await new Promise((r) => setTimeout(r, 5))
      live -= 1
      return ok()
    })
    const asks = Array.from({ length: 5 }, () => askOverpass('q', { budgetMs: 5000, fetcher: fetcher as unknown as typeof fetch }))
    const answers = await Promise.all(asks)
    expect(answers.every((a) => a.ok)).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(5)
    expect(most).toBe(1)
    expect(overpassInFlight().peak).toBe(1)
  })

  it('tries overpass-api.de, then kumi.systems, then private.coffee', async () => {
    const asked: string[] = []
    const fetcher = vi.fn(async (url: string) => {
      asked.push(url)
      if (url !== OVERPASS_SERVERS[2]) throw new TypeError('Failed to fetch')
      return ok()
    })
    const answer = await askOverpass('q', { budgetMs: 5000, fetcher: fetcher as unknown as typeof fetch, sleep: noSleep })
    expect(asked).toEqual([...OVERPASS_SERVERS])
    expect(answer).toMatchObject({ ok: true, server: 'https://overpass.private.coffee/api/interpreter' })
    expect(noSleep).not.toHaveBeenCalled()
  })

  it('on 429 backs off and asks the same server again', async () => {
    let n = 0
    const fetcher = vi.fn(async () => (++n === 1 ? status(429) : ok()))
    const answer = await askOverpass('q', { budgetMs: 30_000, fetcher: fetcher as unknown as typeof fetch, sleep: noSleep })
    expect(answer).toMatchObject({ ok: true, server: OVERPASS_SERVERS[0] })
    expect(noSleep).toHaveBeenCalledWith(BACKOFF_MS)
  })

  it("waits as long as the server's Retry-After says, within reason", async () => {
    let n = 0
    const fetcher = vi.fn(async () => (++n === 1 ? status(429, { 'retry-after': '3' }) : ok()))
    await askOverpass('q', { budgetMs: 30_000, fetcher: fetcher as unknown as typeof fetch, sleep: noSleep })
    expect(noSleep).toHaveBeenCalledWith(3000)
  })

  it('on 504 twice from one server moves to the next', async () => {
    const asked: string[] = []
    const fetcher = vi.fn(async (url: string) => {
      asked.push(url)
      return url === OVERPASS_SERVERS[0] ? status(504) : ok()
    })
    const answer = await askOverpass('q', { budgetMs: 30_000, fetcher: fetcher as unknown as typeof fetch, sleep: noSleep })
    expect(asked).toEqual([OVERPASS_SERVERS[0], OVERPASS_SERVERS[0], OVERPASS_SERVERS[1]])
    expect(answer.ok).toBe(true)
  })

  it('says it failed, and why, when no server answers', async () => {
    const fetcher = vi.fn(async () => status(502))
    const answer = await askOverpass('q', { budgetMs: 30_000, fetcher: fetcher as unknown as typeof fetch, sleep: noSleep })
    expect(answer).toEqual({ ok: false, reason: 'Overpass returned HTTP 502.', timedOut: false })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('gives up when the budget runs out on a server that never answers', async () => {
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    )
    const started = Date.now()
    const answer = await askOverpass('q', { budgetMs: 80, fetcher: hang as unknown as typeof fetch })
    expect(answer).toMatchObject({ ok: false, timedOut: true, reason: 'Overpass did not answer in time.' })
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('takes a 200 that says the query ran out of time as a failure, and asks the next server', async () => {
    const asked: string[] = []
    const fetcher = vi.fn(async (url: string) => {
      asked.push(url)
      return url === OVERPASS_SERVERS[0]
        ? ok({ elements: [{ type: 'way', id: 1 }], remark: 'runtime error: Query timed out in "query" at line 3 after 46 seconds.' })
        : ok({ elements: [] })
    })
    const answer = await askOverpass('q', { budgetMs: 30_000, fetcher: fetcher as unknown as typeof fetch, sleep: noSleep })
    expect(asked).toEqual([OVERPASS_SERVERS[0], OVERPASS_SERVERS[1]])
    expect(answer).toMatchObject({ ok: true, server: OVERPASS_SERVERS[1] })
  })

  it('reads Retry-After in seconds', () => {
    expect(parseRetryAfter('7')).toBe(7000)
    expect(parseRetryAfter(null)).toBeNull()
    expect(parseRetryAfter('soon')).toBeNull()
  })
})
