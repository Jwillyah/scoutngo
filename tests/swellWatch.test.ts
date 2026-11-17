import { describe, expect, it } from 'vitest'
import { logWatch, swellWatch, watchFor, WATCH_CALL_MAX_FT, WATCH_FT, WATCH_KEEP_DAYS } from '../src/core/swellWatch.ts'
import { keepWatch, readWatchLog, SWELL_WATCH_KEY } from '../src/lib/swellWatchStore.ts'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'
import { WATCH_MODEL } from '../src/lib/surfPageData.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { capeHenryAt, recordedDay, seaAt, TZ, VB } from './surfReplay.ts'

/*
 * THE BIGGER-SWELL WATCH (Batch FIX, Section 3.4). 17 Nov: Surfline 5-7 /
 * 6-8 ft for Mon 23 Nov from a SE low, ours 1-2 on day 7.
 */
const weekday = (iso: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))
const R = (model: string, faceFt: number) => ({ model, read: 'part by part', faceFt })

describe('the watch', () => {
  it(`a reading of ${WATCH_FT} ft or more on a day we call ${WATCH_CALL_MAX_FT} or under: one chip, the first such day`, () => {
    const w = swellWatch(
      [
        { date: '2026-11-17', callHighFt: 1, readings: [R('A', 1)] },
        { date: '2026-11-22', callHighFt: 3, readings: [R('A', 5)] },
        { date: '2026-11-23', callHighFt: 2, readings: [R('A', 2), R('B', 4.2)] },
      ],
      weekday,
    )
    expect(w?.date).toBe('2026-11-23')
    expect(w?.words).toBe('Possible bigger swell Mon · models disagree · low confidence')
  })

  it('from one model read two ways it says "readings", never "models"', () => {
    const w = swellWatch([{ date: '2026-11-23', callHighFt: 2, readings: [R('A', 2), { model: 'A', read: 'the whole sea as one', faceFt: 4 }] }], weekday)
    expect(w?.words).toBe('Possible bigger swell Mon · readings disagree · low confidence')
  })

  it('nothing under 4 ft, a call over 2, no call, or past the week: no chip', () => {
    expect(swellWatch([{ date: '2026-11-23', callHighFt: 2, readings: [R('A', 3.99)] }], weekday)).toBe(null)
    expect(swellWatch([{ date: '2026-11-23', callHighFt: 3, readings: [R('A', 6)] }], weekday)).toBe(null)
    expect(swellWatch([{ date: '2026-11-23', callHighFt: null, readings: [R('A', 6)] }], weekday)).toBe(null)
    const eight = Array.from({ length: 8 }, (_, i) => ({ date: `2026-11-${17 + i}`, callHighFt: 1, readings: i === 7 ? [R('A', 6)] : [] }))
    expect(swellWatch(eight, weekday)).toBe(null)
  })

  it('never a size and never "safe" or "clear"', () => {
    const w = swellWatch([{ date: '2026-11-23', callHighFt: 2, readings: [R('A', 7)] }], weekday)
    expect(w?.words).not.toMatch(/\d|safe|clear/i)
  })
})

describe('17 Nov 7:05 AM, the week the phone had: what the app holds says no chip', () => {
  const d = recordedDay('tests/data/surf-2026-11-17')
  const now = new Date('2026-11-17T12:05:00Z')
  const read = surfNowFrom(seaAt(d, VB, now), spotStats([], 0), now, TZ, capeHenryAt(now, VB.facing)?.obs ?? null)

  it('one model, read two ways, for each of the seven days', () => {
    expect(read.week.length).toBe(7)
    for (const day of read.week) expect(new Set((day.readings ?? []).map((r) => r.model))).toEqual(new Set([WATCH_MODEL]))
  })

  it('Mon 23 Nov: our call 1-2, and the top reading at the beach under 4 ft, so no chip (Surfline had 5-7)', () => {
    const mon = read.week.find((x) => x.date === '2026-11-23')
    expect(mon?.call?.words).toBe('1–2 ft')
    const top = Math.max(...(mon?.readings ?? []).map((r) => r.faceFt))
    expect(top).toBeGreaterThan(1)
    expect(top).toBeLessThan(WATCH_FT)
    expect(read.watch).toBe(null)
  })
})

describe('the daily log, on this phone', () => {
  const mem = new Map<string, string>()
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }

  it('one row per made day and day watched, kept three weeks; a second write the same day replaces the first', () => {
    keepWatch('36.83,-75.97', '2026-11-17', [{ date: '2026-11-23', callLowFt: 1, callHighFt: 2, topFt: 2.04 }], 1, store)
    keepWatch('36.83,-75.97', '2026-11-17', [{ date: '2026-11-23', callLowFt: 1, callHighFt: 2, topFt: 2.11 }], 2, store)
    keepWatch('36.83,-75.97', '2026-11-18', [{ date: '2026-11-23', callLowFt: 2, callHighFt: 3, topFt: 2.6 }], 3, store)
    expect([...mem.keys()]).toEqual([SWELL_WATCH_KEY])
    const rows = watchFor(readWatchLog('36.83,-75.97', store), '2026-11-23')
    expect(rows).toEqual([
      { made: '2026-11-17', date: '2026-11-23', callLowFt: 1, callHighFt: 2, topFt: 2.1 },
      { made: '2026-11-18', date: '2026-11-23', callLowFt: 2, callHighFt: 3, topFt: 2.6 },
    ])
  })

  it(`rows made more than ${WATCH_KEEP_DAYS} days back go`, () => {
    const log = logWatch([{ made: '2026-10-01', date: '2026-10-05', callLowFt: 0, callHighFt: 1, topFt: 1 }], '2026-11-17', [])
    expect(log).toEqual([])
  })

  it('a broken store reads as an empty log', () => {
    const bad = { getItem: () => '{not json', setItem: () => undefined }
    expect(readWatchLog('x', bad)).toEqual([])
  })
})
