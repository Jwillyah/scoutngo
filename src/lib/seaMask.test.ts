import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSeaMask, parseCoastlines, seaMask, seaStatus, setSeaMask } from './seaMask.ts'

const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}
const payload = { elements: [{ type: 'way', tags: { natural: 'coastline' }, geometry: [{ lat: 36.84, lon: -75.97 }, { lat: 36.85, lon: -75.973 }] }, { type: 'way', tags: { natural: 'water' }, geometry: [] }] }
const pier = { lat: 36.8435575, lon: -75.9713104 }

describe('the coastline the elevation is cleaned against', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memory())
    setSeaMask(null)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps coastline ways in their own order, and nothing else', () => {
    expect(parseCoastlines(payload)).toEqual([[[-75.97, 36.84], [-75.973, 36.85]]])
  })

  it('waits out a 502 and tries again, as Overpass needed at Virginia Beach', async () => {
    let calls = 0
    const fetcher = vi.fn(async () => (++calls === 1 ? new Response('Bad Gateway', { status: 502 }) : new Response(JSON.stringify(payload))))
    expect(await loadSeaMask(pier, fetcher as unknown as typeof fetch, 0)).toBe('fetched')
    expect(calls).toBe(2)
    expect(seaStatus()).toBe('ready')
    expect(seaMask()?.coastlines).toHaveLength(1)
  })

  it('then uses the copy kept on the phone, with no network', async () => {
    await loadSeaMask(pier, (async () => new Response(JSON.stringify(payload))) as unknown as typeof fetch, 0)
    setSeaMask(null)
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(await loadSeaMask(pier, offline as unknown as typeof fetch, 0)).toBe('saved')
    expect(offline).not.toHaveBeenCalled()
  })

  it('says it failed when nothing answers, and leaves the elevation alone', async () => {
    const down = vi.fn(async () => new Response('', { status: 504 }))
    expect(await loadSeaMask(pier, down as unknown as typeof fetch, 0)).toBe('none')
    expect(seaStatus()).toBe('failed')
    expect(seaMask()).toBeNull()
  })
})
