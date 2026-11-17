import { describe, expect, it } from 'vitest'
import { percentLine, stationLine, swellLine, tideLines, windLine } from './markerReadout.ts'

/* The boards' readout (docs/mockups/Map_Timeline_Wind.png, Map_Timeline_Tide.png). */
describe('the marker readout', () => {
  it('wind: speed, where from, gusts', () => {
    expect(windLine(9.2, 337.5, 13, 'kt')).toBe('9 kt NNW · g13')
    expect(windLine(9, null, null, 'mph')).toBe('9 mph')
  })
  it('a dash, never a zero, when the forecast did not say', () => {
    expect(windLine(null, 10, 3, 'kt')).toBe('— kt')
    expect(percentLine(null, 'cloud')).toBe('— cloud')
    expect(tideLines(null, null, null)).toEqual(['— ft'])
  })
  it('swell at sea; nothing on land', () => {
    expect(swellLine(0.7, 12.2, 67.5)).toBe('swell 0.7 ft 12 s ENE')
    expect(swellLine(null, 12, 67.5)).toBeNull()
  })
  it('the nearest station with its age', () => {
    expect(stationLine('KNTU', 13, 0, 'kt', '1 h ago')).toBe('KNTU 13 kt N · 1 h ago')
    expect(stationLine('KNTU', 0.4, null, 'kt', null)).toBe('KNTU calm')
    expect(stationLine('KNTU', 5, null, 'kt', null)).toBe('KNTU 5 kt var')
  })
  it('tide: level, which way, the next turn', () => {
    expect(tideLines(2.44, 'falling', { kind: 'low', feet: 0.5, at: '2:24 PM' })).toEqual(['2.4 ft · falling', 'low 0.5 ft at 2:24 PM'])
    expect(tideLines(3, 'slack', null)).toEqual(['3.0 ft · turning'])
  })
  it('cloud and rain as a %', () => {
    expect(percentLine(62.4, 'cloud')).toBe('62% cloud')
    expect(percentLine(140, 'rain')).toBe('100% chance of rain')
  })
  it('never says safe or clear', () => {
    const all = [windLine(0, 0, 0, 'kt'), percentLine(0, 'cloud'), percentLine(0, 'rain'), stationLine('X', 0, 0, 'kt', null), ...tideLines(0, 'slack', null)].join(' ')
    expect(all).not.toMatch(/safe|clear/i)
  })
})
