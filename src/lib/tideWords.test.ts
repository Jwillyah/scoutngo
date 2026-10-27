import { describe, expect, it } from 'vitest'
import { celsiusToF, compass, glassRead, metresToFeet, motionWords } from './tideWords.ts'

describe('the tide sheet words', () => {
  it('says which way and how fast, plainly', () => {
    expect(motionWords('falling', -0.84)).toBe('Going out, 0.8 ft an hour')
    expect(motionWords('rising', 0.94)).toBe('Coming in, 0.9 ft an hour')
    expect(motionWords('slack', 0.01)).toBe('The water is turning: hardly moving')
  })

  it('reads the glass at a beach facing east (Virginia Beach)', () => {
    expect(glassRead(1, 90, 78).line).toBe('Glassy: hardly any wind')
    expect(glassRead(6, 270, 78).line).toBe('Glassy: the wind blows off the land')
    expect(glassRead(6, 90, 78).line).toBe('Choppy: the wind blows in off the water')
    expect(glassRead(6, 0, 78).line).toBe('Bumpy: the wind blows along the beach')
  })

  it('converts the sea forecast to feet and Fahrenheit', () => {
    expect(metresToFeet(0.5)).toBeCloseTo(1.64, 2)
    expect(celsiusToF(18)).toBeCloseTo(64.4, 1)
    expect(compass(78)).toBe('ENE')
    expect(compass(270)).toBe('W')
  })
})
