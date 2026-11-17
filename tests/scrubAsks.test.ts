import { beforeEach, describe, expect, it, vi } from 'vitest'
import { barSpan, HOUR_MS, scrubDays } from '../src/core/layerTimeline.ts'
import { fetchVenueDay, fetchVenueHour, parseWind } from '../src/lib/forecast.ts'
import { fetchModelLows, modelLowsAsk } from '../src/lib/skyFireData.ts'
import { setForecastEdge } from '../src/lib/weatherStore.ts'

/*
 * NO REQUEST WHILE SCRUBBING (Batch FIX, Section 2.6). Measured on 17 Nov
 * (measurements/2026-11-17-scrub-fps-tide-1x.md): a 3 s drag on the map's bar
 * sent 9 requests to Open-Meteo, the wind by height (useWind, one per venue
 * day) and the five models' low cloud (PlanMode's chip, one per GMT day),
 * each asked again as the thumb crossed into a new day. Here the thumb is
 * driven hour by hour across the whole bar and back, through the same calls
 * those two make for each hour, against a stand-in Open-Meteo that counts.
 * The browser measure (scripts/measure-scrub-fps.mjs, "requests during the
 * drag") needs the gate's server; this is the same count without it.
 */
const TZ = 'America/New_York'
const SPOT = { lat: 36.84, lon: -75.97 }
const NOW = new Date('2026-11-17T12:05:00Z') /* Tue 7:05 AM EST */

/** Answers any of the two requests with the hours it asked for, and counts. */
function standIn() {
  const asked: string[] = []
  const f = vi.fn(async (input: RequestInfo | URL) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    asked.push(href)
    const u = new URL(href)
    const start = u.searchParams.get('start_date') ?? ''
    const end = u.searchParams.get('end_date') ?? ''
    const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
    const time = Array.from({ length: days * 24 }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * HOUR_MS).toISOString().slice(0, 13) + ':00')
    const names = (u.searchParams.get('hourly') ?? '').split(',')
    const models = (u.searchParams.get('models') ?? '').split(',').filter(Boolean)
    const cols = models.length > 1 ? names.flatMap((n) => models.map((m) => `${n}_${m}`)) : names
    return new Response(JSON.stringify({ hourly: Object.fromEntries([['time', time], ...cols.map((c) => [c, time.map(() => 4)])]) }), { status: 200 })
  })
  return { f: f as unknown as typeof fetch, asked }
}

/** Every hour of the bar, left to right and back: the drag. */
function dragHours(): Date[] {
  const span = barSpan(NOW, TZ)
  const out: Date[] = []
  for (let i = 0; i < span.hours; i += 1) out.push(new Date(span.from.getTime() + i * HOUR_MS))
  return [...out, ...out.reverse()]
}

beforeEach(() => {
  setForecastEdge(null)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

describe('scrubbing the bar asks nothing', () => {
  it('the range: 48 h back and the bar five days on', () => {
    expect(scrubDays('2026-11-17')).toEqual({ start: '2026-11-15', end: '2026-11-21' })
    expect(scrubDays('2026-11-17', 1)).toEqual({ start: '2026-11-14', end: '2026-11-22' })
  })

  it('before (one request per day), the drag asked again at each new day: the measured shape', async () => {
    const { f, asked } = standIn()
    for (const at of dragHours()) await fetchVenueDay(SPOT, at, TZ, f)
    /* Five venue days on the bar (Tue to Sat), one request each; the way back is kept. */
    expect(new Set(asked).size).toBe(5)
  })

  it('the wind by height: one request when the spot opens, none for the 240 hours of the drag', async () => {
    const { f, asked } = standIn()
    const first = await fetchVenueHour(SPOT, NOW, TZ, NOW, f)
    expect(first.status).toBe('ok')
    expect(asked).toHaveLength(1)
    let read = 0
    for (const at of dragHours()) {
      const r = await fetchVenueHour(SPOT, at, TZ, NOW, f)
      if (r.status === 'ok' && parseWind(r.payload, at, TZ).status === 'ok') read += 1
    }
    expect(asked).toHaveLength(1)
    /* Every hour was read from the one answer (failure-modes B: the count, not only the silence). */
    expect(read).toBe(240)
    expect(new URL(asked[0]).searchParams.get('start_date')).toBe('2026-11-15')
    expect(new URL(asked[0]).searchParams.get('end_date')).toBe('2026-11-21')
  })

  it("the models' low cloud: one request for the range, none as the thumb crosses midnight (GMT)", async () => {
    const { f, asked } = standIn()
    const keys = new Set<string>()
    for (const at of [NOW, ...dragHours()]) {
      const ask = modelLowsAsk(at, NOW)
      /* PlanMode asks again only when the key changes: count the asks it would make. */
      if (!keys.has(ask.key)) {
        keys.add(ask.key)
        const got = await fetchModelLows(SPOT, ask.start, f, ask.end)

        /* 48 h back, the bar's five days, a GMT day more each side. */
        expect(got?.hours.length).toBe(9 * 24)
      }
    }
    expect(keys.size).toBe(1)
    expect(asked).toHaveLength(1)
  })

  it('an hour outside the range (a shoot next month) is still its own day', async () => {
    const { f, asked } = standIn()
    await fetchVenueHour(SPOT, new Date('2026-12-12T20:00:00Z'), TZ, NOW, f)
    expect(new URL(asked[0]).searchParams.get('start_date')).toBe('2026-12-12')
    expect(modelLowsAsk(new Date('2026-12-12T20:00:00Z'), NOW)).toEqual({ key: '2026-12-12|2026-12-12', start: '2026-12-12', end: '2026-12-12' })
  })
})
