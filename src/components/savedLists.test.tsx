import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

/* Saved lists the offline packs (size, day, delete) and the past shoots (Batch C2). */
const PACK = { id: 'p1', lat: 36.84, lon: -75.97, name: 'Virginia Beach Fishing Pier', day: '2026-10-30', timeZone: 'America/New_York', areaId: 'a1', savedAt: '2026-10-29T21:14:00Z', tileBytes: 41_200_000, dataBytes: 300_000, keys: [], data: { day: true, hours: true, marine: true, tideDays: 7, tideStation: 'x', scan: false } }
const SHOOT = { id: 's1', at: '2026-10-30T11:42:00Z', lat: 36.84, lon: -75.97, heading: null, focal35: null, aboveTakeoffM: null, camera: 'DJI Air 3S', said: { sunAltitude: 2, sunAzimuth: 110, light: null, golden: true, event: 'sunrise', minutesFromEvent: 12, fire: 'likely' }, outcome: 'fired' }

vi.mock('../lib/venuePack.ts', () => ({ loadPacks: () => [PACK], onPacksChanged: () => () => {}, packBytes: (p: typeof PACK) => p.tileBytes + p.dataBytes, deletePack: async () => {} }))
vi.mock('../lib/truthLog.ts', () => ({ readTruthLog: () => [SHOOT] }))

const { SavedLists } = await import('./SavedLists.tsx')
const { dayWords, shootLine } = await import('../lib/savedWords.ts')

describe('Saved', () => {
  const text = renderToStaticMarkup(<SavedLists />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

  it('lists each offline pack with its size, its day, when it was saved, and Delete', () => {
    expect(text).toContain('Offline packs')
    expect(text).toContain('Virginia Beach Fishing Pier')
    expect(text).toContain('41.5 MB · for 30 Oct 2026 · saved 29 Oct 2026')
    expect(text).toContain('Delete')
  })

  it('lists the past shoots from the truth loop, in words', () => {
    expect(text).toContain('Past shoots')
    expect(text).toContain('DJI Air 3S')
    expect(shootLine(SHOOT as never)).toBe('30 Oct 2026 · 12 min after sunrise · sky fire said likely · you said fired')
  })

  it('a day is a day, never a time', () => {
    expect(dayWords('2026-11-01T03:00:00Z')).toBe('1 Nov 2026')
    expect(dayWords('nonsense')).toBe('—')
  })
})
