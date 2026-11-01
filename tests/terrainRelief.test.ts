import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FLAT_M } from '../src/core/contours.ts'
import { encodePng } from '../src/lib/png.ts'
import { reliefAround } from '../src/lib/terrainRelief.ts'

/*
 * The 2D Terrain layer's data (src/lib/terrainRelief.ts): real terrarium
 * bytes for Big Meadow (tests/data, the tile measured on 29 Oct) give relief
 * and contours; a sea-level tile, as at a beach, is flat and draws nothing.
 */
const serve = (bytes: Uint8Array) => (async () => new Response(bytes as unknown as BodyInit, { status: 200 })) as unknown as typeof fetch

describe('relief round the venue', () => {
  it('Big Meadow: hundreds of metres of relief, and 10 m contours', async () => {
    const tile = new Uint8Array(readFileSync('tests/data/terrarium-12-1155-1572.png'))
    const r = await reliefAround({ lat: 38.5246, lon: -78.4405 }, serve(tile))
    expect(r).not.toBeNull()
    expect(r!.metres).toBeGreaterThan(200)
    expect(r!.contours.features.length).toBeGreaterThan(100)
    expect(r!.contours.features.every((f) => (f.properties?.level as number) % 10 === 0)).toBe(true)
  })

  it('a beach at sea level: flat here, no contours', async () => {
    /* Terrarium 0 m is (128, 0, 0). */
    const size = 256
    const data = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < size * size; i += 1) data.set([128, 0, 0, 255], i * 4)
    const png = new Uint8Array(await encodePng({ width: size, height: size, data }))
    const r = await reliefAround({ lat: 34.2104, lon: -77.7964 }, serve(png))
    expect(r?.metres).toBe(0)
    expect(r!.metres < FLAT_M).toBe(true)
    expect(r!.contours.features).toEqual([])
  })

  it('a tile that does not come is no answer, not flat', async () => {
    const r = await reliefAround({ lat: 34.2, lon: -77.8 }, (async () => new Response('', { status: 503 })) as unknown as typeof fetch)
    expect(r).toBeNull()
  })
})
