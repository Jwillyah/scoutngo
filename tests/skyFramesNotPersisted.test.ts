import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * SKY FRAMES LIVE IN MEMORY FOR THE SESSION ONLY.
 *
 * A GOES frame is a picture of the weather at one minute, and the right
 * lifetime for that is "until you reload". Writing frames anywhere durable
 * would be a growing pile of stale pictures, and putting one in a field pack
 * would be worse: a pack is carried into the field and read offline, which is
 * exactly where a frame from yesterday would be mistaken for today's.
 */
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const FRAMES = strip(readFileSync('src/lib/useSkyFrames.ts', 'utf8'))
const FIELD_PACK = strip(readFileSync('src/lib/fieldPack.ts', 'utf8'))

describe('frames are never persisted', () => {
  it('writes to no durable store', () => {
    for (const api of ['localStorage', 'sessionStorage', 'indexedDB', 'caches', 'IDBDatabase']) {
      expect(FRAMES, `useSkyFrames touches ${api}`).not.toContain(api)
    }
  })

  it('saves no image anywhere', () => {
    for (const api of ['toDataURL', 'toBlob', 'createObjectURL', 'FileReader']) {
      expect(FRAMES, `useSkyFrames uses ${api}`).not.toContain(api)
    }
  })

  /*
   * AND NOTHING SKY-RELATED GOES INTO A FIELD PACK. Whole words, because a
   * bare "sky" or "goes" substring matches ordinary prose and identifiers:
   * that false positive has bitten the IP, service worker and cam checks.
   */
  it('puts no frame, grid or sky source in a field pack', () => {
    expect(FIELD_PACK).not.toContain('useSkyFrames')
    expect(FIELD_PACK).not.toContain('goesTileUrl')
    expect(FIELD_PACK).not.toContain('GOES')
    for (const word of ['frame', 'frames', 'satellite', 'gibs']) {
      expect(FIELD_PACK, `fieldPack mentions "${word}"`).not.toMatch(
        new RegExp(`\\b${word}\\b`, 'i'),
      )
    }
  })

  /* The one cache it does keep is an in-memory Map, which dies with the tab. */
  it('keeps its only cache in memory', () => {
    expect(FRAMES).toContain('new Map')
    expect(FRAMES).toContain('useRef')
  })

  /* The check has to be able to fail. */
  it('would catch a write if one were added', () => {
    expect(strip('/* never localStorage */ const x = 1')).not.toContain('localStorage')
    expect(strip('localStorage.setItem("frame", png)')).toContain('localStorage')
  })
})
