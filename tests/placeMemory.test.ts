import { beforeEach, describe, expect, it, vi } from 'vitest'
import { placeKeyOf, rememberedReach, resolveReach } from '../src/lib/placeMemory.ts'
import { placeOf, shownGroups } from '../src/lib/placeGroups.ts'

/*
 * OFFLINE THE PIER STAYS ON THE COAST (gate, 30 Oct): with no tiles the coast
 * test cannot answer, and that is not "no sea".
 */
const PIER = placeKeyOf(36.8435575, -75.9713104)
const AUTO = { water: 'auto', land: 'auto' } as const

describe('the last known coast or inland answer', () => {
  beforeEach(() => {
    const map = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, String(v)), removeItem: (k: string) => void map.delete(k) })
  })

  it('keeps the coast for a venue seen online, when offline cannot say', () => {
    expect(resolveReach(PIER, 120)).toBe(120)
    const offline = resolveReach(PIER, 'unavailable')
    expect(offline).toBe(120)
    expect(placeOf(offline)).toBe('coast')
    expect(shownGroups(AUTO, placeOf(offline))).toEqual({ water: true, land: false })
  })

  it('keeps inland as inland', () => {
    const meadow = placeKeyOf(38.5246, -78.4405)
    resolveReach(meadow, null)
    expect(placeOf(resolveReach(meadow, 'unavailable'))).toBe('inland')
  })

  it('says nothing for a venue never seen, rather than the wrong group', () => {
    const never = resolveReach(placeKeyOf(10, 10), 'unavailable')
    expect(never).toBeUndefined()
    expect(placeOf(never)).toBe('unknown')
    expect(shownGroups(AUTO, 'unknown')).toEqual({ water: false, land: false })
  })

  it('takes a fresh answer over the remembered one', () => {
    resolveReach(PIER, 120)
    resolveReach(PIER, null)
    expect(rememberedReach(PIER)).toBeNull()
  })
})

describe('the coast test says unavailable, not "no sea", without tiles', () => {
  it('seaReach is unavailable when a tile cannot be had', async () => {
    vi.resetModules()
    vi.doMock('../src/lib/vectorTiles.ts', async (orig) => ({ ...(await orig<object>()), loadVectorTile: async () => null }))
    const { seaReach, metresToSea } = await import('../src/lib/coast.ts')
    expect(await seaReach({ lat: 36.8435575, lon: -75.9713104 }, 2000)).toBe('unavailable')
    expect(await metresToSea({ lat: 36.8435575, lon: -75.9713104 }, 2000)).toBeNull()
    vi.doUnmock('../src/lib/vectorTiles.ts')
  })
})
