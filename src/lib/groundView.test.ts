import { describe, expect, it } from 'vitest'
import { groundViewUrl } from './groundView.ts'

describe('groundViewUrl', () => {
  const url = groundViewUrl({ lat: 38.364236, lon: -75.605912 }, 153.9, 5.1)

  it('sends the position, the computed bearing and the computed field of view', () => {
    expect(url).toContain('lat=38.364236')
    expect(url).toContain('lon=-75.605912')
    expect(url).toContain('heading=153.9')
    expect(url).toContain('fov=5.1')
  })

  it('goes through the function, so the key never reaches the browser', () => {
    expect(url.startsWith('/.netlify/functions/streetview?')).toBe(true)
    expect(url).not.toContain('googleapis')
    expect(url).not.toContain('key=')
  })
})
