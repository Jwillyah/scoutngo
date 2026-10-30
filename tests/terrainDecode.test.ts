import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * ELEVATION IS NEVER READ BACK FROM A CANVAS (29 Oct): WebKit adds noise to
 * canvas readback, and one unit of a terrarium tile's red byte is 256 m. Both
 * decoders read the PNG's bytes (src/lib/png.ts); scripts/audit-terrain-decode.mjs
 * proves it in WebKit.
 */
const code = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('the elevation decoders', () => {
  it('read no pixels back from a canvas', () => {
    for (const path of ['src/three/clayScene.ts', 'src/lib/seaMask.ts']) {
      expect(code(path), path).not.toMatch(/getImageData|convertToBlob|putImageData/)
    }
  })

  it('read the PNG itself', () => {
    expect(code('src/three/clayScene.ts')).toMatch(/decodePng\(bytes\)/)
    expect(code('src/lib/seaMask.ts')).toMatch(/readPng\(bytes\)/)
  })
})
