import { describe, expect, it } from 'vitest'

describe('the menu Calendar row: the next marked day (Batch Polish 2, Section 2)', () => {
  it('"Thu · rainbow", the soonest still to come; "Today" for today; null for none', async () => {
    const { nextMarkWord } = await import('../src/core/skyPage.ts')
    const now = new Date('2026-11-11T15:00:00Z')
    const row = (kind: 'rainbow' | 'fog', iso: string) => ({ kind, at: new Date(iso), name: kind, why: 'x', word: 'likely' as const })
    expect(nextMarkWord([row('fog', '2026-11-14T11:00:00Z'), row('rainbow', '2026-11-12T21:00:00Z')], now, 'America/New_York')).toBe('Thu · rainbow')
    expect(nextMarkWord([row('fog', '2026-11-11T22:00:00Z')], now, 'America/New_York')).toBe('Today · fog')
    expect(nextMarkWord([], now, 'America/New_York')).toBeNull()
  })
})
