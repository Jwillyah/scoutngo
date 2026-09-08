import { describe, expect, it } from 'vitest'
import { isAcceptedImage, normalizePoint } from './screenshot.ts'

const box = { left: 20, top: 100, width: 200, height: 400 }

describe('normalizePoint', () => {
  it('maps a click to normalized 0 to 1 image coordinates', () => {
    expect(normalizePoint(120, 300, box)).toEqual({ x: 0.5, y: 0.5 })
    expect(normalizePoint(20, 100, box)).toEqual({ x: 0, y: 0 })
    expect(normalizePoint(220, 500, box)).toEqual({ x: 1, y: 1 })
  })

  it('clamps a click that lands outside the image box', () => {
    expect(normalizePoint(-500, -500, box)).toEqual({ x: 0, y: 0 })
    expect(normalizePoint(9999, 9999, box)).toEqual({ x: 1, y: 1 })
  })

  it('falls back to the centre for a zero sized box', () => {
    expect(normalizePoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({
      x: 0.5,
      y: 0.5,
    })
  })
})

describe('isAcceptedImage', () => {
  const asFile = (type: string) => new File([''], 'shot', { type })

  it('accepts png and jpg', () => {
    expect(isAcceptedImage(asFile('image/png'))).toBe(true)
    expect(isAcceptedImage(asFile('image/jpeg'))).toBe(true)
  })

  it('rejects everything else', () => {
    expect(isAcceptedImage(asFile('image/gif'))).toBe(false)
    expect(isAcceptedImage(asFile('application/pdf'))).toBe(false)
    expect(isAcceptedImage(asFile(''))).toBe(false)
  })
})
