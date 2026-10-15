import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CAMS } from '../src/data/cams.ts'

/*
 * THE CAM LIST IS A FILE, AND A LINK IS ALL THE APP DOES WITH IT.
 *
 * This is the privacy design, not a limitation. Any cam API would need the
 * venue coordinate sent somewhere to answer "which cameras are near me";
 * shipping the list means that question is answered on the device and the
 * coordinate never leaves.
 *
 * NEVER EMBED, NEVER PROXY, NEVER PULL A MANIFEST, NEVER SAVE A FRAME, AND
 * NOT INTO FIELD PACKS. Each of those is a different way the app could start
 * talking to a cam operator on the user's behalf, so each is checked.
 */
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const CAM_LIST = readFileSync('src/components/CamList.tsx', 'utf8')
const CAM_CODE = strip(CAM_LIST)
const CAM_DATA = strip(readFileSync('src/data/cams.ts', 'utf8'))
const FIELD_PACK = strip(readFileSync('src/lib/fieldPack.ts', 'utf8'))

describe('the data file itself', () => {
  it('has the six fields each entry needs', () => {
    expect(CAMS.length).toBeGreaterThan(10)
    for (const cam of CAMS) {
      expect(cam.id, 'id').toMatch(/^[a-z0-9-]+$/)
      expect(cam.name.length, cam.id).toBeGreaterThan(1)
      expect(cam.operator.length, cam.id).toBeGreaterThan(1)
      expect(['free', 'paid'], cam.id).toContain(cam.access)
      expect(cam.url, cam.id).toMatch(/^https:\/\//)
      expect(Number.isFinite(cam.at.lat), cam.id).toBe(true)
      expect(Number.isFinite(cam.at.lon), cam.id).toBe(true)
    }
  })

  it('has unique ids, because the ranking is keyed by them', () => {
    expect(new Set(CAMS.map((c) => c.id)).size).toBe(CAMS.length)
  })

  it('has unique urls, so no cam is listed twice under two names', () => {
    expect(new Set(CAMS.map((c) => c.url)).size).toBe(CAMS.length)
  })

  /* Every URL is https, so tapping one is never a downgrade. */
  it('is https throughout', () => {
    for (const cam of CAMS) expect(cam.url.startsWith('https://'), cam.id).toBe(true)
  })

  it('puts every seeded cam somewhere on the mid-Atlantic coast', () => {
    for (const cam of CAMS) {
      expect(cam.at.lat, cam.id).toBeGreaterThan(30)
      expect(cam.at.lat, cam.id).toBeLessThan(42)
      expect(cam.at.lon, cam.id).toBeGreaterThan(-82)
      expect(cam.at.lon, cam.id).toBeLessThan(-70)
    }
  })

  it('marks the Surfline entries paid, which is the thing to know up front', () => {
    const surfline = CAMS.filter((c) => c.operator === 'Surfline')
    expect(surfline.length).toBeGreaterThan(0)
    for (const cam of surfline) expect(cam.access).toBe('paid')
  })

  /*
   * NO KEY IN A URL. A cam entry carrying a token would make this file a
   * credential store and the list un-shareable, which defeats the point of it
   * being the easiest thing in the repo to contribute to.
   */
  it('carries no keys or tokens', () => {
    for (const cam of CAMS) {
      expect(cam.url.toLowerCase(), cam.id).not.toMatch(/[?&](key|token|apikey|auth)=/)
    }
  })
})

describe('the app only ever links out', () => {
  it('renders anchors and nothing embedded', () => {
    expect(CAM_CODE).toContain('href=')
    for (const tag of ['<iframe', '<img', '<video', '<embed', '<object']) {
      expect(CAM_CODE, `CamList renders ${tag}`).not.toContain(tag)
    }
  })

  it('opens them in a new tab without telling the operator where from', () => {
    expect(CAM_CODE).toContain("target=\"_blank\"")
    expect(CAM_CODE).toContain('noreferrer')
    expect(CAM_CODE).toContain('noopener')
  })

  /* NEVER FETCHED, PROXIED OR STREAMED. Not by us, not through our function. */
  it('fetches nothing', () => {
    for (const call of ['fetch(', 'XMLHttpRequest', 'new Image', 'createImageBitmap']) {
      expect(CAM_CODE, `CamList uses ${call}`).not.toContain(call)
    }
    expect(CAM_DATA, 'the data file fetches').not.toContain('fetch(')
  })

  it('pulls no manifest or stream', () => {
    for (const thing of ['.m3u8', '.mpd', 'hls', 'MediaSource', 'RTCPeer']) {
      expect(CAM_CODE.toLowerCase(), `CamList touches ${thing}`).not.toContain(
        thing.toLowerCase(),
      )
    }
  })

  it('saves no frame', () => {
    for (const thing of ['toDataURL', 'toBlob', 'canvas', 'localStorage', 'indexedDB']) {
      expect(CAM_CODE, `CamList uses ${thing}`).not.toContain(thing)
    }
  })

  /*
   * AND NOT INTO FIELD PACKS. A pack is built for working offline, which is
   * exactly the situation in which somebody might wish a cam frame had been
   * saved, so this is the one place the rule would be most tempting to break.
   */
  it('puts no cam in a field pack', () => {
    /*
     * The data file, the export, and the words as WHOLE WORDS: a bare "cam"
     * substring matches cameraBearing, which is the same false positive the
     * IP geolocation and service worker checks each hit first time round.
     */
    expect(FIELD_PACK).not.toContain('cams.ts')
    expect(FIELD_PACK).not.toContain('CAMS')
    for (const word of ['cam', 'cams', 'webcam', 'webcams']) {
      expect(FIELD_PACK, `fieldPack mentions "${word}"`).not.toMatch(
        new RegExp(`\\b${word}\\b`, 'i'),
      )
    }
  })

  /* The check must be able to fail, or it is decoration. */
  it('would catch an embed if one were added', () => {
    expect(strip('/* no <iframe> here */ const x = 1')).not.toContain('<iframe')
    expect(strip('const y = <iframe src={cam.url} />')).toContain('<iframe')
  })
})
