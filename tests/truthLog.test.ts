import { describe, expect, it } from 'vitest'
import { entryFromPhoto, hitRate, readTruthLog, truthFile, withEntries, writeTruthLog, TRUTH_KEY, type TruthEntry } from '../src/lib/truthLog.ts'
import { FIRST_ENTRY, type FireEntry } from '../src/lib/fireLog.ts'
import type { PhotoMeta } from '../src/lib/compare/photoMeta.ts'

/* A drone frame at the Virginia Beach pier on 29 Oct, facing a little north of the sunrise. */
const meta = (over: Partial<PhotoMeta> = {}): PhotoMeta => ({
  make: 'DJI', model: 'Air 3S', takenLocal: '2026:10:29 07:40:12', offset: '-04:00', focalMm: 9, focal35: 24, width: 4032, height: 3024,
  lat: 36.8435575, lon: -75.9713104, aboveTakeoffM: 60, gimbalYaw: 100, gimbalPitch: -5, gimbalRoll: 0, software: null, stitched: false, crop: null,
  ...over,
})
const shown: FireEntry = { ...FIRST_ENTRY, id: 'x', forecast: 'Fire likely' }

describe('a photo against what the app said', () => {
  it('reads time, place, heading and lens, and works out the sun for that minute', () => {
    const e = entryFromPhoto(meta(), 'America/New_York', [shown]) as TruthEntry
    expect(e.at).toBe('2026-10-29T11:40:12.000Z')
    expect(e.heading).toBe(100)
    expect(e.focal35).toBe(24)
    expect(e.aboveTakeoffM).toBe(60)
    expect(e.said.event).toBe('sunrise')
    expect(e.said.minutesFromEvent).toBeGreaterThan(10)
    expect(e.said.sunAltitude).toBeGreaterThan(0)
    /* Facing about the sun's bearing at 7:40: backlit, in golden hour. */
    expect(e.said.light).toBe('backlit')
    expect(e.said.golden).toBe(true)
    /* What this phone showed beforehand for that sunrise. */
    expect(e.said.fire).toBe('Fire likely')
    expect(e.outcome).toBeNull()
  })

  it('says which part of the file is missing rather than guessing', () => {
    expect(entryFromPhoto(meta({ lat: null, lon: null }), 'UTC', [])).toEqual({ missing: 'where it was taken (no GPS in the file)' })
    expect(entryFromPhoto(meta({ takenLocal: null }), 'UTC', [])).toEqual({ missing: 'when it was taken (no date in the file)' })
    const noHeading = entryFromPhoto(meta({ gimbalYaw: null }), 'America/New_York', []) as TruthEntry
    expect(noHeading.said.light).toBeNull()
    expect(noHeading.said.fire).toBeNull()
  })

  it('keeps the numbers, never the picture', () => {
    const e = entryFromPhoto(meta(), 'America/New_York', [shown]) as TruthEntry
    expect(JSON.stringify(e)).not.toMatch(/data:image|base64/)
  })
})

describe('your hit rate, from this phone only', () => {
  const e = entryFromPhoto(meta(), 'America/New_York', [shown]) as TruthEntry
  it('counts a shoot once, and how often it fired when Sky fire said so', () => {
    const a = { ...e, outcome: 'fired' as const }
    const b = { ...e, id: 'b', at: '2026-10-29T11:41:00.000Z', outcome: 'fired' as const }
    const c = { ...e, id: 'c', at: '2026-10-30T11:41:00.000Z', outcome: 'nothing' as const }
    const r = hitRate(withEntries([], [a, b, c]))
    expect(r.shoots).toBe(2)
    expect(r.firesaid).toBe(2)
    expect(r.firedWhenSaid).toBe(1)
    expect(r.photos).toBe(3)
  })

  it('round-trips through the phone’s storage and exports as a file of its own', () => {
    const store = new Map<string, string>()
    const s = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(writeTruthLog([e], s)).toBe(true)
    expect(store.has(TRUTH_KEY)).toBe(true)
    expect(readTruthLog(s)).toEqual([e])
    expect(JSON.parse(truthFile([e])).entries).toHaveLength(1)
  })
})

describe('a generated drone file reads like a real one', () => {
  it('testJpeg gives the reader what a DJI frame gives it', async () => {
    const { testJpeg } = await import('../src/lib/compare/testJpeg.ts')
    const { readPhotoMeta } = await import('../src/lib/compare/photoMeta.ts')
    const bytes = testJpeg({ taken: '2026:10:29 07:40:12', lat: 36.8435575, lon: -75.9713104, yaw: 100, aboveTakeoffM: 60 })
    const m = readPhotoMeta(bytes.buffer as ArrayBuffer)
    expect([m.make, m.takenLocal, m.gimbalYaw, m.aboveTakeoffM]).toEqual(['DJI', '2026:10:29 07:40:12', 100, 60])
    expect(m.lat).toBeCloseTo(36.8435575, 6)
  })
})
