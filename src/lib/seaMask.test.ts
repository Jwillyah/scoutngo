import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanTerrainBytes, parseCoastlines, readSavedCoastline, saveCoastline } from './seaMask.ts'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const payload = { elements: [{ type: 'way', tags: { natural: 'coastline' }, geometry: [{ lat: 36.84, lon: -75.97 }, { lat: 36.85, lon: -75.973 }] }, { type: 'way', tags: { natural: 'water' }, geometry: [] }] }

describe('the coastline the elevation is cleaned against', () => {
  beforeEach(() => vi.stubGlobal('localStorage', memory()))
  afterEach(() => vi.unstubAllGlobals())

  it('keeps coastline ways in their own order, and nothing else', () => {
    expect(parseCoastlines(payload)).toEqual([[[-75.97, 36.84], [-75.973, 36.85]]])
  })

  it('is kept on the phone, per place', () => {
    saveCoastline('36.844,-75.971', parseCoastlines(payload))
    expect(readSavedCoastline('36.844,-75.971')).toHaveLength(1)
    expect(readSavedCoastline('38.270,-75.830')).toBeNull()
  })

  it('leaves anything that is not an elevation tile alone', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer
    expect(await cleanTerrainBytes('https://server.arcgisonline.com/x/1/2/3', bytes)).toBe(bytes)
  })
})
