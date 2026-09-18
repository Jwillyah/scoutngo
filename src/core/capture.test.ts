import { describe, expect, it } from 'vitest'
import {
  CAPTURE_MAX_LONG_EDGE,
  fitLongEdge,
  resolveCaptureLongEdge,
  visualTokens,
} from './capture.ts'

/** The real phone capture: 390pt wide at 3x. */
const PHONE = { width: 1170, height: 2532 }

describe('fitLongEdge', () => {
  it('leaves a size that already fits alone', () => {
    expect(fitLongEdge(PHONE, 2532)).toEqual(PHONE)
    expect(fitLongEdge(PHONE, 4000)).toEqual(PHONE)
  })

  it('scales the long edge down to the cap and keeps the aspect ratio', () => {
    const fitted = fitLongEdge(PHONE, 1568)
    expect(Math.max(fitted.width, fitted.height)).toBe(1568)
    expect(fitted.width / fitted.height).toBeCloseTo(PHONE.width / PHONE.height, 3)
  })

  /* Enlarging invents detail that was never captured and costs tokens for it. */
  it('never scales up', () => {
    expect(fitLongEdge({ width: 400, height: 800 }, 4000)).toEqual({ width: 400, height: 800 })
  })

  it('handles a landscape canvas, where the long edge is the width', () => {
    const fitted = fitLongEdge({ width: 2532, height: 1170 }, 1568)
    expect(fitted.width).toBe(1568)
    expect(fitted.height).toBeLessThan(fitted.width)
  })

  it('never returns a zero dimension', () => {
    const fitted = fitLongEdge({ width: 4000, height: 3 }, 256)
    expect(fitted.width).toBeGreaterThan(0)
    expect(fitted.height).toBeGreaterThan(0)
  })

  it('survives a degenerate size rather than dividing by zero', () => {
    expect(fitLongEdge({ width: 0, height: 0 }, 1568)).toEqual({ width: 0, height: 0 })
  })
})

describe('visualTokens', () => {
  /*
   * Claude reads an image as 28x28 patches, so the token cost is the patch grid.
   * These are the two sides of the A/B, and the ratio between them is the whole
   * reason the comparison was worth running.
   */
  it('prices the full size phone capture', () => {
    expect(visualTokens(PHONE)).toBe(42 * 91)
  })

  it('prices the 1568 candidate at roughly a third of it', () => {
    const small = visualTokens(fitLongEdge(PHONE, 1568))
    expect(small).toBeLessThan(visualTokens(PHONE) * 0.45)
  })

  it('stays under the high resolution tier ceiling at full size', () => {
    // Sonnet 5 allows 4784 visual tokens and a 2576px long edge.
    expect(visualTokens(PHONE)).toBeLessThan(4784)
    expect(Math.max(PHONE.width, PHONE.height)).toBeLessThan(2576)
  })
})

describe('resolveCaptureLongEdge', () => {
  it('defaults when there is no override', () => {
    expect(resolveCaptureLongEdge('')).toBe(CAPTURE_MAX_LONG_EDGE)
    expect(resolveCaptureLongEdge('?other=1')).toBe(CAPTURE_MAX_LONG_EDGE)
  })

  it('takes the override the A/B uses', () => {
    expect(resolveCaptureLongEdge('?captureEdge=1568')).toBe(1568)
  })

  /* A mistyped query string must not send a one pixel image to the model. */
  it('falls back rather than trusting junk', () => {
    for (const bad of ['?captureEdge=abc', '?captureEdge=0', '?captureEdge=-5', '?captureEdge=99999']) {
      expect(resolveCaptureLongEdge(bad)).toBe(CAPTURE_MAX_LONG_EDGE)
    }
  })
})
