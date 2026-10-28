import { describe, expect, it } from 'vitest'
import { barRole, flyUnits, hudLength, hudSpeed } from './hudUnits.ts'

describe('the fly screen speaks one system', () => {
  it('feet go with miles an hour, metres with metres a second', () => {
    expect(flyUnits('ft')).toEqual({ length: 'ft', speed: 'mph' })
    expect(flyUnits('m')).toEqual({ length: 'm', speed: 'm/s' })
  })
  it('converts: 121.92 m is 400 ft; 12 m/s is 26.8 mph', () => {
    expect(hudLength(121.92, flyUnits('ft'))).toBe('400')
    expect(hudLength(121.92, flyUnits('m'))).toBe('122')
    expect(hudSpeed(12, flyUnits('ft'))).toBe('27')
    expect(hudSpeed(3, flyUnits('ft'))).toBe('6.7')
    expect(hudSpeed(3, flyUnits('m'))).toBe('3.0')
    expect(hudLength(null, flyUnits('ft'))).toBe('—')
  })
  it('colours an obstacle red only when it is a hazard: inside 5 m', () => {
    expect(barRole(3)).toBe('hazard')
    expect(barRole(10)).toBe('caution')
    expect(barRole(40)).toBe('far')
    expect(barRole(null)).toBe('unknown')
  })
})
