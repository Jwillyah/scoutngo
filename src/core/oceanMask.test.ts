import { describe, expect, it } from 'vitest'
import { cleanAgainstOcean, clipRingToSquare, oceanMask, ringArea } from './oceanMask.ts'
import { SHORE_BAND_M, SHORE_MARGIN_M } from './seaTile.ts'

const square = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
]

describe('a ring cut to its tile', () => {
  it('cuts a building across the east edge at the edge, so the two tiles meet', () => {
    const cut = clipRingToSquare(square(4000, 100, 4150, 200), 0, 4096)
    expect(Math.max(...cut.map((p) => p.x))).toBe(4096)
    expect(Math.abs(ringArea(cut)) / 2).toBe(96 * 100)
  })

  it('keeps a ring inside as it is, and drops one wholly in the buffer', () => {
    expect(clipRingToSquare(square(10, 10, 20, 20), 0, 4096)).toHaveLength(4)
    expect(clipRingToSquare(square(4100, 10, 4150, 20), 0, 4096)).toEqual([])
  })
})

describe('the sea on an elevation tile', () => {
  const vector = { z: 14, x: 4734, y: 6386 }
  /* The east half of the vector tile is ocean. */
  const eastHalf = [[square(2048, -64, 4160, 4160)]]

  it('marks the pixels whose centres are in the ocean, at the same zoom', () => {
    const mask = oceanMask(eastHalf, vector, 4096, vector, 8)
    expect([...mask.slice(0, 8)]).toEqual([0, 0, 0, 0, 1, 1, 1, 1])
  })

  it('places a deeper elevation tile inside its vector tile', () => {
    expect(oceanMask(eastHalf, vector, 4096, { z: 15, x: 4734 * 2 + 1, y: 6386 * 2 }, 4).every((v) => v === 1)).toBe(true)
    expect(oceanMask(eastHalf, vector, 4096, { z: 15, x: 4734 * 2, y: 6386 * 2 }, 4).every((v) => v === 0)).toBe(true)
  })

  it('reads a hole in the ocean (an island) as land', () => {
    const withIsland = [[square(0, 0, 4096, 4096), square(1024, 1024, 3072, 3072).reverse()]]
    const mask = oceanMask(withIsland, vector, 4096, vector, 4)
    expect([...mask]).toEqual([1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1])
  })

  it('will not place a shallower elevation tile', () => {
    expect(() => oceanMask(eastHalf, vector, 4096, { z: 13, x: 2367, y: 3193 }, 4)).toThrow()
  })
})

describe('cleaning heights against the ocean', () => {
  /* 32 px at 4 m: the sea from column 16; flat 2 m sand behind. */
  const size = 32
  const mpp = 4
  const mask = new Uint8Array(size * size).map((_, i) => (i % size >= 16 ? 1 : 0))

  it('puts the sea at 0 and brings a wall on the waterline down to the sand behind it', () => {
    const heights = new Float32Array(size * size).map((_, i) => {
      const x = i % size
      if (x >= 16) return 24.6
      return x >= 14 ? 25 : 2
    })
    const r = cleanAgainstOcean(heights, mask, size, mpp)
    expect(heights[5 * size + 20]).toBe(0)
    expect(heights[5 * size + 15]).toBe(2 + SHORE_MARGIN_M)
    expect(heights[5 * size + 14]).toBe(2 + SHORE_MARGIN_M)
    expect(heights[5 * size + 3]).toBe(2)
    expect(r.sea).toBe(16 * size)
    expect(r.shore).toBe(2 * size)
  })

  it('leaves a cliff its height: the land behind it is high too', () => {
    const heights = new Float32Array(size * size).map((_, i) => (i % size >= 16 ? 0 : 30))
    const r = cleanAgainstOcean(heights, mask, size, mpp)
    expect(heights[5 * size + 15]).toBe(30)
    expect(r.shore).toBe(0)
  })

  it('touches nothing past the shore band', () => {
    /* Low sand, and one 40 m pixel just past the band's reach: it stays. */
    const band = Math.ceil(SHORE_BAND_M / mpp)
    const heights = new Float32Array(size * size).map((_, i) => (i % size >= 16 ? 0 : i % size === 16 - band - 1 ? 40 : 2))
    cleanAgainstOcean(heights, mask, size, mpp)
    expect(heights[5 * size + 16 - band - 1]).toBe(40)
    /* And the band's last pixel, at that height, would have come down. */
    const inside = new Float32Array(size * size).map((_, i) => (i % size >= 16 ? 0 : i % size === 16 - band + 1 ? 40 : 2))
    cleanAgainstOcean(inside, mask, size, mpp)
    expect(inside[5 * size + 16 - band + 1]).toBe(2 + SHORE_MARGIN_M)
  })

  it('reads inland across a stepped edge, not along the coast into the wedge (Virginia Beach, 27 Oct)', () => {
    /* The sea from column 16, or 15 on odd rows: a staircase. Terrarium's 37 m spilled two pixels onto the land. */
    const stepped = new Uint8Array(size * size).map((_, i) => (i % size >= (Math.floor(i / size) % 2 === 1 ? 15 : 16) ? 1 : 0))
    const heights = new Float32Array(size * size).map((_, i) => {
      const x = i % size
      if (stepped[i] === 1) return 37
      return x >= 13 ? 37 : 1
    })
    cleanAgainstOcean(heights, stepped, size, mpp)
    for (let y = 2; y < size - 2; y += 1) for (let x = 13; x < 16; x += 1) if (stepped[y * size + x] === 0) expect(heights[y * size + x]).toBe(1 + SHORE_MARGIN_M)
  })

  it('sees the sea in the next tile: the margin', () => {
    /* No sea on this tile at all; the sea starts one pixel past its east edge. Its last column is Terrarium's 37 m. */
    const margin = 6
    const width = size + 2 * margin
    const withMargin = new Uint8Array(width * width).map((_, i) => (i % width >= margin + size + 1 ? 1 : 0))
    const heights = new Float32Array(size * size).map((_, i) => (i % size === size - 1 ? 37 : 1))
    cleanAgainstOcean(heights, withMargin, size, mpp, margin)
    expect(heights[10 * size + size - 1]).toBe(1 + SHORE_MARGIN_M)
  })

  it('reads the land behind a pixel on the edge from the neighbouring tile', () => {
    /* The sea is this whole tile but its west column; the beach runs on into the tile to the west, at 1 m. */
    const seaButEdge = new Uint8Array(size * size).map((_, i) => (i % size === 0 ? 0 : 1))
    const heights = new Float32Array(size * size).map((_, i) => (i % size === 0 ? 9 : 0))
    cleanAgainstOcean(heights, seaButEdge, size, mpp, 0, (x) => (x < 0 ? 1 : null))
    expect(heights[10 * size]).toBe(1 + SHORE_MARGIN_M)
    /* With no neighbour to read, it falls back to the tile and can say nothing better. */
    const alone = new Float32Array(size * size).map((_, i) => (i % size === 0 ? 9 : 0))
    cleanAgainstOcean(alone, seaButEdge, size, mpp)
    expect(alone[10 * size]).toBe(9)
  })
})
