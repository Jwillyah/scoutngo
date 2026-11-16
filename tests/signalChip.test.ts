import { describe, expect, it } from 'vitest'
import { signalChipWords, STALE_AFTER_MS } from '../src/core/signalChip.ts'

/* Batch CORE, Section 7A.6: one chip at the top, never a stack of banners. */
const clock = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
const t = Date.UTC(2026, 10, 16, 15, 10)
describe('the signal chip', () => {
  it('offline: "Offline · showing 15:10", what the screens show and from when', () => {
    expect(signalChipWords(false, t, t + 60_000, clock)).toBe('Offline · showing 15:10')
    expect(signalChipWords(false, null, t, clock)).toBe('Offline · nothing saved yet')
  })
  it('online with data older than 30 min: "Showing 15:10 · tap to refresh"; fresh: no chip', () => {
    expect(signalChipWords(true, t, t + STALE_AFTER_MS + 60_000, clock)).toBe('Showing 15:10 · tap to refresh')
    expect(signalChipWords(true, t, t + 10 * 60_000, clock)).toBeNull()
    expect(signalChipWords(true, null, t, clock)).toBeNull()
  })
})
