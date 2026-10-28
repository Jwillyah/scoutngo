import { describe, expect, it } from 'vitest'
import type { PhotoMeta } from './photoMeta.ts'
import { describeMeta, photoInstant, poseFromMeta } from './pose.ts'

/* DJI_20261027073735_0094_D.jpg as the reader returns it (27 Oct sunrise, Lightroom export). */
const META: PhotoMeta = {
  make: 'DJI',
  model: 'FC9184',
  takenLocal: '2026:10:27 07:37:35',
  offset: null,
  focalMm: 19.35,
  focal35: 70,
  width: 4833,
  height: 6041,
  lat: 36.830864074,
  lon: -75.9661291,
  aboveTakeoffM: 88.8,
  gimbalYaw: -15.7,
  gimbalPitch: -1.5,
  gimbalRoll: 0,
  software: 'Adobe Photoshop Lightroom Classic 15.6 (Macintosh)',
  stitched: false,
  /* Its real crop: 0.6 of a landscape frame's width, all of its height. */
  crop: { left: 0.267901, top: 0, right: 0.866185, bottom: 1, angle: 0.08 },
}

describe('the minute a photo was taken', () => {
  it("reads the drone's wall clock in the zone of the place when the file names none", () => {
    /* 07:37:35 EDT on 27 Oct is 11:37:35 UTC. */
    expect(photoInstant(META, 'America/New_York')?.toISOString()).toBe('2026-10-27T11:37:35.000Z')
  })
  it("takes the file's own offset over the place's zone", () => {
    expect(photoInstant({ ...META, offset: '-05:00' }, 'America/New_York')?.toISOString()).toBe('2026-10-27T12:37:35.000Z')
  })
  it('is null with no time in the file', () => {
    expect(photoInstant({ ...META, takenLocal: null }, 'America/New_York')).toBeNull()
  })
})

describe('the camera from the file', () => {
  it('stands where the file says, looking where the gimbal looked, at the lens', () => {
    const p = poseFromMeta(META, 4833, 6041, null)
    expect(p).not.toBeNull()
    if (p === null) return
    expect(p.at).toEqual({ lat: META.lat, lon: META.lon })
    expect(p.aboveTakeoffM).toBe(88.8)
    /* The crop sits right of centre (0.567 of the width), so the picture looks a little right of the gimbal; full height, so no tilt. */
    expect(p.yaw).toBeGreaterThan(-15.7)
    expect(p.yaw).toBeLessThan(-15.7 + 3)
    expect(p.pitch).toBeCloseTo(-1.5, 9)
    expect(p.timeZone).toBe('America/New_York')
    /* Portrait: taller than wide. */
    expect(p.fov.verticalDeg).toBeGreaterThan(p.fov.horizontalDeg)
  })
  it('a stitch takes the angle it is given, never the lens, and keeps the picture shape', () => {
    const p = poseFromMeta({ ...META, stitched: true }, 3454, 6141, 60)
    expect(p?.fov.horizontalDeg).toBe(60)
    /* tan(v/2) = tan(30) x 6141 / 3454 */
    expect(p?.fov.verticalDeg).toBeCloseTo((2 * Math.atan(Math.tan(Math.PI / 6) * (6141 / 3454)) * 180) / Math.PI, 9)
  })
  it('is null when the file lacks a part the view needs', () => {
    expect(poseFromMeta({ ...META, lat: null, lon: null }, 4833, 6041, null)).toBeNull()
    expect(poseFromMeta({ ...META, gimbalYaw: null }, 4833, 6041, null)).toBeNull()
  })
})

describe('what the file holds, in words', () => {
  it('says each thing, and a dash for what is missing, never a zero', () => {
    const words = describeMeta({ ...META, gimbalPitch: null, aboveTakeoffM: null }, false, 'ft')
    expect(words).toContain('heading -15.7°')
    expect(words).toContain('tilt —')
    expect(words).toContain('height —')
    expect(words.join(' ')).not.toMatch(/\b0 ft\b/)
  })
  it('says a stitch is one frame of a stitch, not its lens', () => {
    expect(describeMeta({ ...META, stitched: true }, true, 'm')).toContain('70 mm (one frame of a stitch)')
  })
})

describe('the crop, read from the file', () => {
  it('a portrait cut from a landscape frame: the vertical angle is the lens\'s short side, 21.0 degrees at 70 mm', () => {
    const p = poseFromMeta(META, 4833, 6041, null)
    expect(p?.fov.verticalDeg).toBeCloseTo((2 * Math.atan((0.6 * 43.27) / 140) * 180) / Math.PI, 6)
    expect(p?.fov.verticalDeg).toBeCloseTo(21.0, 1)
  })
  it('without the crop it would have been 26.1, the error the 27 Oct files showed', () => {
    const p = poseFromMeta({ ...META, crop: null }, 4833, 6041, null)
    expect(p?.fov.verticalDeg).toBeCloseTo(26.1, 1)
  })
})
