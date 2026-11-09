import { describe, expect, it } from 'vitest'
import { camsNear, type FacingCam } from '../src/core/skyCams.ts'
import { destinationPoint } from '../src/core/geo.ts'

/* "Cams near <spot>" (Batch N A4): Sunset view only with a known lens facing toward the sunset; road cams only under Roads and All. */
const PIER = { lat: 36.8436, lon: -75.9713 }
const cam = (id: string, km: number, bearing: number, facing: number | null, lanes = false): FacingCam => ({ id, name: id, operator: 'x', at: destinationPoint(PIER, bearing, km * 1000), facing, ...(lanes ? { facingIs: 'lanes' as const } : {}), url: `https://example.com/${id}`, access: 'free' })
const CAMS = [cam('beach-east', 1, 0, 100), cam('beach-west', 3, 270, 245), cam('unknown', 2, 90, null), cam('i264', 5, 270, 250, true), cam('far', 30, 0, 245)]

describe('the cams sheet', () => {
  it('Sunset view: known facing within 45° of the sunset, within 15 km; never a road cam or an unknown facing', () => {
    expect(camsNear(PIER, 'sunset', CAMS, 243, 100).map((c) => c.cam.id)).toEqual(['beach-west'])
  })
  it('Surf: facing the water; Roads: the road cams only; All: everything within 15 km', () => {
    expect(camsNear(PIER, 'surf', CAMS, 243, 100).map((c) => c.cam.id)).toEqual(['beach-east'])
    expect(camsNear(PIER, 'roads', CAMS, 243, 100).map((c) => c.cam.id)).toEqual(['i264'])
    expect(camsNear(PIER, 'all', CAMS, 243, 100).map((c) => c.cam.id)).toEqual(['beach-east', 'unknown', 'beach-west', 'i264'])
  })
})
