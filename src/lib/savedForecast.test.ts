import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DIM_AFTER_HOURS,
  forecastAge,
  MARK_AFTER_HOURS,
  readForecast,
  SAVED_FORECAST_KEY,
  SAVED_FORECAST_LIMIT,
  saveForecast,
  tideKey,
  venueDayKey,
} from './savedForecast.ts'
import { clearPredictionCache, fetchPredictions } from './noaa.ts'

/* A Map-backed localStorage, so the store is tested against storage that keeps. */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => void map.delete(k),
    setItem: (k, v) => void map.set(k, String(v)),
  }
}

const NOW = new Date('2026-10-25T12:00:00Z')

describe('a saved forecast is never read without its age', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()))
  afterEach(() => vi.unstubAllGlobals())

  it('stores the payload with the time it arrived, and gives both back', () => {
    const key = venueDayKey(38.5195, -78.444, '2026-10-25', 'America/New_York')
    saveForecast(key, { hourly: { time: ['x'] } }, NOW)
    expect(readForecast(key)).toEqual({ payload: { hourly: { time: ['x'] } }, fetchedAt: NOW.toISOString() })
  })

  it('a different venue or day is a different entry', () => {
    saveForecast(venueDayKey(38.5195, -78.444, '2026-10-25', 'UTC'), 1, NOW)
    expect(readForecast(venueDayKey(38.5195, -78.444, '2026-10-26', 'UTC'))).toBeNull()
    expect(readForecast(venueDayKey(36.8466, -75.9741, '2026-10-25', 'UTC'))).toBeNull()
  })

  it('keeps a bounded number, dropping the oldest', () => {
    for (let i = 0; i < SAVED_FORECAST_LIMIT + 5; i += 1) saveForecast(`k${i}`, i, NOW)
    expect(readForecast('k0')).toBeNull()
    expect(readForecast(`k${SAVED_FORECAST_LIMIT + 4}`)?.payload).toBe(SAVED_FORECAST_LIMIT + 4)
  })

  it('an entry with no fetch time is not returned at all', () => {
    localStorage.setItem(SAVED_FORECAST_KEY, JSON.stringify([{ key: 'k', payload: 1 }]))
    expect(readForecast('k')).toBeNull()
  })
})

describe('how old, and how loudly that is said', () => {
  const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

  it(`plain up to ${MARK_AFTER_HOURS} h, marked past it, dimmed past ${DIM_AFTER_HOURS} h`, () => {
    expect(forecastAge(ago(3), NOW)).toMatchObject({ mark: 'plain', text: '3 h old' })
    expect(forecastAge(ago(13), NOW)).toMatchObject({ mark: 'marked', text: '13 h old' })
    expect(forecastAge(ago(37), NOW)).toMatchObject({ mark: 'dimmed', text: '37 h old' })
    expect(forecastAge(ago(72), NOW)).toMatchObject({ mark: 'dimmed', text: '3 days old' })
  })

  it('never says "now": a saved value is always some age', () => {
    expect(forecastAge(NOW.toISOString(), NOW).text).toBe('1 min old')
  })
})

describe('tide with no signal', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
    clearPredictionCache()
  })
  afterEach(() => vi.unstubAllGlobals())

  const hilo = {
    predictions: [
      { t: '2026-10-25 05:00', v: '0.207', type: 'L' },
      { t: '2026-10-25 11:23', v: '4.699', type: 'H' },
      { t: '2026-10-25 17:46', v: '0.264', type: 'L' },
    ],
  }

  it('reads the saved table and says it is saved', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(hilo), { status: 200 })),
    )
    const live = await fetchPredictions('8639168', new Date('2026-10-25T18:00:00Z'))
    expect(live.status === 'ok' && live.predictions.provenance.kind).toBe('live')

    clearPredictionCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const offline = await fetchPredictions('8639168', new Date('2026-10-25T18:00:00Z'))
    expect(offline.status).toBe('ok')
    if (offline.status !== 'ok') return
    expect(offline.predictions.provenance.kind).toBe('saved')
    /* Dates come back as Dates, not strings that compare wrongly against the scrubber. */
    expect(offline.predictions.extremes[0].at).toBeInstanceOf(Date)
    expect(offline.predictions.extremes.map((e) => e.feet)).toEqual([0.207, 4.699, 0.264])
  })

  it('with nothing saved, says so rather than blanking', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const out = await fetchPredictions('8639168', new Date('2026-10-25T18:00:00Z'))
    expect(out.status === 'unavailable' && out.reason).toMatch(/none is saved for this date/)
  })

  it('keys the saved table by station and date range', () => {
    expect(tideKey('8639168', '20261024', '20261026')).toBe('tide|8639168|20261024|20261026')
  })
})
