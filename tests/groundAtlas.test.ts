import { describe, expect, it } from 'vitest'
import { ATLAS_PX_FULL, ATLAS_PX_IOS, isIOSDevice, MAX_3D_DPR, nearAtlasBytes, nearAtlasPx } from '../src/core/groundAtlas.ts'

/* Batch DRONE, Section 2.6: the 3D near picture on iOS. The five-opens check in WebKit: scripts/audit-3d-five.mjs. */
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

describe('the near ground picture', () => {
  it('is 2048 px on an iPhone and an iPad, 4096 elsewhere', () => {
    expect(nearAtlasPx(isIOSDevice(IPHONE, 5))).toBe(2048)
    expect(nearAtlasPx(isIOSDevice(IPAD_AS_MAC, 5))).toBe(2048)
    expect(nearAtlasPx(isIOSDevice(IPAD_AS_MAC, 0))).toBe(4096)
    expect(nearAtlasPx(isIOSDevice(ANDROID, 5))).toBe(4096)
  })
  it('holds a quarter of the memory on iOS: about 37 MiB against 149 MiB', () => {
    expect(Math.round(nearAtlasBytes(ATLAS_PX_IOS) / 2 ** 20)).toBe(37)
    expect(Math.round(nearAtlasBytes(ATLAS_PX_FULL) / 2 ** 20)).toBe(149)
  })
  it('the 3D pixel ratio is never over 2', () => expect(MAX_3D_DPR).toBe(2))
})
