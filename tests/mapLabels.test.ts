import { describe, expect, it } from 'vitest'
import { chooseLabels, KEEP_CLEAR_PX, MAX_LABELS, placeKind, shownAt, type LabelCandidate } from '../src/core/mapLabels.ts'

/* Batch Map, Section 3: our own labels, one font, ordered, never crowded, never on the crosshair or the pin. */
const flat = (lat: number, lon: number) => ({ x: (lon + 76) * 1000, y: (37 - lat) * 1000 })
const c = (name: string, kind: LabelCandidate['kind'], lat: number, lon: number, rank: number | null = null, roadClass?: string): LabelCandidate => ({ name, kind, lat, lon, rank, roadClass })

describe('map labels', () => {
  it('maps OpenMapTiles classes, and leaves states and countries out', () => {
    expect(placeKind('city')).toBe('city')
    expect(placeKind('hamlet')).toBe('small')
    expect(placeKind('state')).toBeNull()
    expect(placeKind('country')).toBeNull()
  })
  it('shows no road below zoom 13, only major ones until 15', () => {
    expect(shownAt(c('I-264', 'road', 0, 0, null, 'motorway'), 12)).toBe(false)
    expect(shownAt(c('I-264', 'road', 0, 0, null, 'motorway'), 13)).toBe(true)
    expect(shownAt(c('Atlantic Ave', 'road', 0, 0, null, 'secondary'), 14)).toBe(false)
    expect(shownAt(c('Atlantic Ave', 'road', 0, 0, null, 'secondary'), 15)).toBe(true)
  })
  it('puts cities before towns before villages, at most twelve, none overlapping', () => {
    const many = Array.from({ length: 40 }, (_, i) => c(`Village ${i}`, 'village', 36.9 - (i % 8) * 0.05, -75.95 + Math.floor(i / 8) * 0.12))
    const got = chooseLabels([...many, c('Virginia Beach', 'city', 36.85, -75.7, 1), c('Sandbridge', 'town', 36.6, -75.6, 3)], 11, flat, 1000, 1000, [])
    expect(got.length).toBeLessThanOrEqual(MAX_LABELS)
    expect(got[0].name).toBe('Virginia Beach')
    expect(got[1].name).toBe('Sandbridge')
    for (const [i, a] of got.entries()) for (const b of got.slice(i + 1)) {
      const overlap = Math.abs(a.x - b.x) < (a.name.length * a.size * 0.56 + b.name.length * b.size * 0.56) / 2 + 6 && Math.abs(a.y - b.y) < (a.size + b.size) * 0.65
      expect(overlap, `${a.name} / ${b.name}`).toBe(false)
    }
  })
  it('never sits on the crosshair or the spot\'s pin: the name moves just above it', () => {
    const centre = { x: 500, y: 500 }
    const got = chooseLabels([c('Kill Devil Hills', 'town', 36.5, -75.5)], 12, flat, 1000, 1000, [centre])
    expect(got).toHaveLength(1)
    expect(got[0].y).toBeLessThan(500 - KEEP_CLEAR_PX)
    const moved = chooseLabels([c('Kill Devil Hills', 'town', 36.5 + (KEEP_CLEAR_PX + 30) / 1000, -75.5)], 12, flat, 1000, 1000, [centre])
    expect(moved).toHaveLength(1)
  })
})
