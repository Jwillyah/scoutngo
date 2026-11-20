import { describe, expect, it } from 'vitest'
import { sunMoonLinesShown, type MapWeatherLayer } from './mapLines.ts'

/* Batch SIMPLE-2, Section 5.4 (Trey and Jwilly): no dashed sun or moon line over the radar or the clouds. */
describe('the sun and moon lines and a weather layer', () => {
  it('radar and clouds: no lines', () => {
    expect(sunMoonLinesShown('radar')).toBe(false)
    expect(sunMoonLinesShown('clouds')).toBe(false)
  })
  it('wind and tide, the other layers of the bar: no lines either', () => {
    expect(sunMoonLinesShown('wind')).toBe(false)
    expect(sunMoonLinesShown('tide')).toBe(false)
  })
  it('no layer: the lines as the shooter set them', () => {
    expect(sunMoonLinesShown('off')).toBe(true)
  })
  it('every layer the map has is decided (the type and the list agree)', () => {
    const all: MapWeatherLayer[] = ['off', 'radar', 'wind', 'clouds', 'tide']
    expect(all.filter(sunMoonLinesShown)).toEqual(['off'])
  })
})
