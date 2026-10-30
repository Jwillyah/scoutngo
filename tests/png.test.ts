import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { decodePng, encodePng, terrariumMetres } from '../src/lib/png.ts'

/* Two real terrarium tiles, z12, from AWS (tests/data). */
const tile = (name: string) => readFileSync(`tests/data/${name}`)

describe('reading a PNG without a canvas', () => {
  it('reads the heights the tile holds at two known places', async () => {
    const meadow = await decodePng(tile('terrarium-12-1155-1572.png'))
    expect(meadow.width).toBe(256)
    expect(terrariumMetres(meadow.data, 106 * 256 + 123)).toBeGreaterThan(950)
    expect(terrariumMetres(meadow.data, 106 * 256 + 123)).toBeLessThan(1100)
    const badwater = await decodePng(tile('terrarium-12-719-1605.png'))
    /* Below sea level, decoded signed. */
    expect(terrariumMetres(badwater.data, 52 * 256 + 115)).toBeLessThan(-60)
    expect(terrariumMetres(badwater.data, 52 * 256 + 115)).toBeGreaterThan(-90)
  })

  it('round-trips through its own encoder, byte for byte', async () => {
    const a = await decodePng(tile('terrarium-12-1155-1572.png'))
    const b = await decodePng(await encodePng(a))
    expect(b.width).toBe(a.width)
    expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true)
  })

  it('refuses what it cannot read rather than returning wrong numbers', async () => {
    await expect(decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).rejects.toThrow('not a PNG')
  })
})
