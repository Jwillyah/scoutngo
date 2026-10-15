import { describe, expect, it } from 'vitest'
import { classifyLighting, type LightingRead } from '../core/lighting.ts'
import type { Aim } from '../core/shotType.ts'
import type { SunPosition } from '../core/sun.ts'
import { lightLine } from './lightCopy.ts'

const sunAt = (azimuth: number, altitude: number): SunPosition => ({
  azimuth,
  altitude,
  shadowBearing: (azimuth + 180) % 360,
})

const read = (aim: Aim, azimuth: number, altitude: number): LightingRead =>
  classifyLighting(aim, sunAt(azimuth, altitude))

const FRAMED: Aim = { shotType: 'framed', positionBearing: 0, cameraBearing: 180 }

describe('a framed shot is worded exactly as it always was', () => {
  it('keeps the three classifications and their phrases', () => {
    const line = lightLine(read(FRAMED, 180, 30))
    expect(line.word).toBe('Backlit')
    expect(line.phrase).toBe('Shooting into the sun')
    expect(line.tone).toBe('backlit')
    expect(line.hasClass).toBe(true)
  })
})

/*
 * THE UI MUST SAY WHY THERE IS NO CLASS, not show a blank. A gap where a
 * classification used to be reads as a broken app rather than as a deliberate
 * refusal.
 */
describe('a shot type with no lighting class says why', () => {
  it('explains a top-down', () => {
    const line = lightLine(read({ shotType: 'top-down', yawDegrees: 0 }, 90, 20))
    expect(line.hasClass).toBe(false)
    expect(line.tone).toBe('top-down')
    expect(line.phrase).toContain('No lighting class')
    expect(line.phrase).toContain('points at the ground')
  })

  it('explains a 360', () => {
    const line = lightLine(read({ shotType: 'orbit' }, 90, 20))
    expect(line.hasClass).toBe(false)
    expect(line.tone).toBe('orbit')
    expect(line.phrase).toContain('No lighting class')
    expect(line.phrase).toContain('every direction')
  })

  /*
   * AND NEVER BORROWS A LIGHTING WORD. Printing "backlit" beside a 360 would
   * be stating a direction the camera is not pointing, which is the whole
   * thing the refusal exists to prevent.
   */
  it('never uses a classification word for a type that has none', () => {
    for (const aim of [
      { shotType: 'top-down', yawDegrees: 0 } as const,
      { shotType: 'top-down', yawDegrees: 137 } as const,
      { shotType: 'orbit' } as const,
    ]) {
      for (const altitude of [-6, -2, 0, 5, 20, 45, 70]) {
        const line = lightLine(read(aim, 134, altitude))
        const text = `${line.word} ${line.phrase}`.toLowerCase()
        expect(text).not.toContain('backlit')
        expect(text).not.toContain('front-lit')
        expect(text).not.toContain('side-lit')
        expect(line.tone).not.toBe('backlit')
      }
    }
  })
})

describe('what a top-down says instead', () => {
  it('leads with the shadows, because that is the read', () => {
    const line = lightLine(read({ shotType: 'top-down', yawDegrees: 0 }, 90, 5))
    expect(line.word).toContain('Shadows')
    expect(line.word).toContain('W')
    expect(line.phrase).toContain('raking shadows')
  })

  it('says there are none below the horizon rather than printing a blank', () => {
    const line = lightLine(read({ shotType: 'top-down', yawDegrees: 0 }, 90, -4))
    expect(line.word).toBe('No shadows')
    expect(line.phrase).toContain('below the horizon')
  })

  it('says how the shadows sit against the frame', () => {
    const along = lightLine(read({ shotType: 'top-down', yawDegrees: 270 }, 90, 20))
    expect(along.phrase).toContain('along the frame')
    const across = lightLine(read({ shotType: 'top-down', yawDegrees: 0 }, 90, 20))
    expect(across.phrase).toContain('across the frame')
  })

  it('caps an absurd ratio rather than printing 114.6x', () => {
    const line = lightLine(read({ shotType: 'top-down', yawDegrees: 0 }, 90, 0.5))
    expect(line.word).toContain('20×+')
  })
})

describe('what a 360 says instead', () => {
  it('says where the sun is on the ring and how high', () => {
    const line = lightLine(read({ shotType: 'orbit' }, 118, 8))
    expect(line.word).toContain('118°')
    expect(line.phrase).toContain('above the ring')
  })

  it('warns about flare when the sun is low and in frame', () => {
    const line = lightLine(read({ shotType: 'orbit' }, 90, 4))
    expect(line.phrase).toContain('flare')
  })

  /* PRE-SUNRISE IS NOT A FAILURE. It is the reason the alarm went off. */
  it('reports a sun under the horizon as a position, not a problem', () => {
    const line = lightLine(read({ shotType: 'orbit' }, 70, -4))
    expect(line.phrase).toContain('below the ring')
    expect(line.phrase).toContain('no direct flare')
    expect(line.phrase.toLowerCase()).not.toContain('nothing to light')
  })
})
