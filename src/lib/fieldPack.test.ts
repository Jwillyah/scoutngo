import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FIELD_PACK_KEY,
  clearPack,
  fingerprintPlan,
  loadPack,
  packMatches,
  revivePack,
  savePack,
  windowKeyOf,
  type FieldPack,
} from './fieldPack.ts'
import type { PlannedPosition } from './plan.ts'

const VENUE = { lat: 38.364236, lon: -75.605912 }

/** Only the fields the fingerprint reads. */
const planned = (over: Record<string, unknown> = {}) =>
  ({
    position: {
      id: 'pos-1',
      number: 1,
      at: { lat: 38.3648, lon: -75.6059 },
      lensId: 'sony-200-600',
      focalLength: 400,
      shot: 'Boats hitting the pilings.',
      risk: '',
      angleRationale: '',
      platform: 'ground',
      altitudeFeet: 0,
      moved: false,
      ...over,
    },
  }) as unknown as PlannedPosition

const WINDOW = {
  start: new Date('2026-09-12T15:00:00Z'),
  end: new Date('2026-09-12T19:00:00Z'),
  timeZone: 'America/New_York',
}

/*
 * This runtime exposes a `localStorage` object with no methods on it, so the
 * real thing cannot be exercised here. An in-memory stand-in makes the storage
 * paths testable, including the quota failure, which is the one that must never
 * pass silently.
 */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('fingerprintPlan', () => {
  const base = fingerprintPlan(VENUE, windowKeyOf(WINDOW), [planned()])

  it('is stable for an unchanged plan', () => {
    expect(fingerprintPlan(VENUE, windowKeyOf(WINDOW), [planned()])).toBe(base)
  })

  /*
   * A PACK FROM A DIFFERENT PLAN IS WORSE THAN NO PACK: it shows yesterday's
   * positions with today's confidence. Each of these is a different place to
   * stand or a different thing to shoot, so each must retire the pack.
   */
  it('changes when a position moves, even slightly', () => {
    const moved = planned({ at: { lat: 38.3649, lon: -75.6059 } })
    expect(fingerprintPlan(VENUE, windowKeyOf(WINDOW), [moved])).not.toBe(base)
  })

  it('changes when the venue moves', () => {
    expect(fingerprintPlan({ lat: 39, lon: -75 }, windowKeyOf(WINDOW), [planned()])).not.toBe(base)
  })

  it('changes when the window changes', () => {
    const later = { ...WINDOW, end: new Date('2026-09-12T20:00:00Z') }
    expect(fingerprintPlan(VENUE, windowKeyOf(later), [planned()])).not.toBe(base)
  })

  it('changes when the optic or focal length changes', () => {
    expect(fingerprintPlan(VENUE, windowKeyOf(WINDOW), [planned({ focalLength: 300 })])).not.toBe(base)
    expect(fingerprintPlan(VENUE, windowKeyOf(WINDOW), [planned({ lensId: 'sony-75-300' })])).not.toBe(base)
  })

  it('changes when positions are added or removed', () => {
    expect(fingerprintPlan(VENUE, windowKeyOf(WINDOW), [planned(), planned({ id: 'pos-2' })])).not.toBe(base)
    expect(fingerprintPlan(VENUE, windowKeyOf(WINDOW), [])).not.toBe(base)
  })

  /* Floating point noise must not retire a pack that is really still valid. */
  it('tolerates noise below a tenth of a metre', () => {
    const jittered = planned({ at: { lat: 38.3648 + 1e-9, lon: -75.6059 - 1e-9 } })
    expect(fingerprintPlan(VENUE, windowKeyOf(WINDOW), [jittered])).toBe(base)
  })

  it('handles a plan with no venue yet', () => {
    expect(fingerprintPlan(null, 'no-window', [])).toContain('no-venue')
  })
})

const pack = (over: Partial<FieldPack> = {}): FieldPack => ({
  version: 1,
  madeAt: '2026-09-17T12:00:00.000Z',
  fingerprint: 'fp',
  venue: VENUE,
  positions: [],
  ...over,
})

describe('savePack and loadPack', () => {
  it('round trips a pack', () => {
    expect(savePack(pack()).status).toBe('ok')
    expect(loadPack()?.fingerprint).toBe('fp')
  })

  it('returns null when nothing is stored', () => {
    expect(loadPack()).toBeNull()
  })

  it('clears a stored pack', () => {
    savePack(pack())
    expect(loadPack()).not.toBeNull()
    clearPack()
    expect(loadPack()).toBeNull()
  })

  it('treats a pack from another version as absent', () => {
    localStorage.setItem(FIELD_PACK_KEY, JSON.stringify({ ...pack(), version: 99 }))
    expect(loadPack()).toBeNull()
  })

  it('treats unreadable storage as absent rather than throwing', () => {
    localStorage.setItem(FIELD_PACK_KEY, 'not json')
    expect(loadPack()).toBeNull()
  })

  /*
   * A pack that failed to save must never look like one that succeeded: the
   * shooter would walk out believing they have offline photos and find out at
   * the venue that they do not.
   */
  it('reports a quota failure instead of failing silently', () => {
    const quota = new DOMException('full', 'QuotaExceededError')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw quota
    })
    const result = savePack(
      pack({
        positions: [
          { groundView: { status: 'ok', image: 'data:image/jpeg;base64,AAA' } },
        ] as never,
      }),
    )
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.reason).toMatch(/storage/i)
  })

  /* Dropping the photos still leaves a pack that works offline for everything else. */
  it('retries without images when the quota is hit, and says which it got', () => {
    let calls = 0
    vi.spyOn(localStorage, 'setItem').mockImplementation((_k: string, value: string) => {
      calls += 1
      if (calls === 1) throw new DOMException('full', 'QuotaExceededError')
      if (String(value).includes('base64')) throw new Error('images should have been dropped')
    })
    const result = savePack(
      pack({
        positions: [
          { groundView: { status: 'ok', image: 'data:image/jpeg;base64,AAA' } },
        ] as never,
      }),
    )
    expect(calls).toBe(2)
    expect(result.status).toBe('error')
    if (result.status === 'error') expect(result.reason).toMatch(/photos were not cached/i)
  })
})

describe('packMatches', () => {
  it('accepts a pack built for this exact plan', () => {
    expect(packMatches(pack({ fingerprint: 'abc' }), 'abc')).toBe(true)
  })

  it('rejects a pack from a different plan', () => {
    expect(packMatches(pack({ fingerprint: 'abc' }), 'xyz')).toBe(false)
    expect(packMatches(null, 'abc')).toBe(false)
  })
})

describe('revivePack', () => {
  /* JSON has no Date, and tideStateAt compares instants. */
  it('turns stored tide timestamps back into Dates', () => {
    const stored = pack({
      tide: {
        extremes: [{ at: '2026-09-20T14:22:00.000Z', feet: 2.9, kind: 'high' }],
        curve: [{ at: '2026-09-20T14:00:00.000Z', feet: 2.8 }],
      } as never,
    })
    const revived = revivePack(stored)
    expect(revived.tide?.extremes[0].at).toBeInstanceOf(Date)
    expect(revived.tide?.curve[0].at.toISOString()).toBe('2026-09-20T14:00:00.000Z')
  })

  it('leaves a pack with no tide alone', () => {
    expect(revivePack(pack()).tide).toBeUndefined()
  })
})
