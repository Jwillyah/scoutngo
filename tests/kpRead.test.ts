import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchKp, KP_URL, latestKp, readKeptKp, resetKpForTests } from '../src/lib/kp.ts'

/*
 * THE Kp ROW ON THE PHONE (Batch FIX, Section 6.7). 17 Nov: "Kp not received
 * · NOAA did not answer". The endpoint answers 200 with
 * `access-control-allow-origin: *` (one curl -I, 17 Nov), so not CORS. The
 * reader took one shape only, and one miss was kept as "no value" for three
 * hours. The fetches here are recorded answers (tests/setup.ts refuses the
 * network).
 */
const TABLE = [['time_tag', 'Kp', 'a_running', 'station_count'], ['2026-11-17 06:00:00.000', '2.00', '7', '8'], ['2026-11-17 09:00:00.000', '2.33', '9', '8']]
const KEYED = [
  { time_tag: '2026-11-17T06:00:00', Kp: 2.0, a_running: 7, station_count: 8 },
  { time_tag: '2026-11-17T09:00:00', Kp: 2.33, a_running: 9, station_count: 8 },
]

const answer = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch
const fails = (async () => {
  throw new TypeError('Load failed')
}) as unknown as typeof fetch

describe("NOAA's file, in either shape", () => {
  it('the table: a header row, then [time_tag, Kp, …]', () => {
    expect(latestKp(TABLE)).toEqual({ kp: 2.33, at: '2026-11-17 09:00:00.000' })
  })
  it('keyed records: { time_tag, Kp, … }', () => {
    expect(latestKp(KEYED)).toEqual({ kp: 2.33, at: '2026-11-17T09:00:00' })
    expect(latestKp([{ time_tag: '2026-11-17T09:00:00', kp_index: 3 }])).toEqual({ kp: 3, at: '2026-11-17T09:00:00' })
  })
  it('the last row with a value; nothing from anything else', () => {
    expect(latestKp([...KEYED, { time_tag: '2026-11-17T12:00:00', Kp: null }])).toEqual({ kp: 2.33, at: '2026-11-17T09:00:00' })
    expect(latestKp({})).toBeNull()
    expect(latestKp([['time_tag', 'Kp']])).toBeNull()
  })
})

describe('the last value is kept, and a miss is not', () => {
  let store: Map<string, string>
  beforeEach(() => {
    store = new Map()
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) })
    resetKpForTests()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('never received, NOAA silent: null (the row is hidden)', async () => {
    expect(await fetchKp(fails)).toBeNull()
    expect(readKeptKp()).toBeNull()
  })

  it('received once, then NOAA silent: the kept value, marked kept, with its time tag', async () => {
    expect(await fetchKp(answer(KEYED))).toEqual({ kp: 2.33, at: '2026-11-17T09:00:00', kept: false })
    resetKpForTests()
    expect(await fetchKp(fails)).toEqual({ kp: 2.33, at: '2026-11-17T09:00:00', kept: true })
    resetKpForTests()
    expect(await fetchKp(answer({ error: 'x' }, false))).toEqual({ kp: 2.33, at: '2026-11-17T09:00:00', kept: true })
  })

  it('a miss is asked again after 10 minutes, not 3 hours', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T12:00:00Z') })
    let asked = 0
    const counting = (async (url: string) => {
      asked += 1
      expect(url).toBe(KP_URL)
      throw new TypeError('Load failed')
    }) as unknown as typeof fetch
    await fetchKp(counting)
    await fetchKp(counting)
    expect(asked).toBe(1)
    vi.setSystemTime(new Date('2026-11-17T12:11:00Z'))
    expect(await fetchKp(answer(TABLE))).toEqual({ kp: 2.33, at: '2026-11-17 09:00:00.000', kept: false })
  })

  it('the request carries nothing about the user or the spot', () => {
    expect(KP_URL).toBe('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
  })
})
