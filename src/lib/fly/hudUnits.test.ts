import { describe, expect, it } from 'vitest'
import { barRole, flyUnits, hudLength, hudSpeed, hudWind } from './hudUnits.ts'

describe('the fly screen speaks one system', () => {
  it('heights in the distance unit; every speed in the speed setting (Batch Flow: mph beside a home in kt)', () => {
    expect(flyUnits('ft', 'kt')).toEqual({ length: 'ft', speed: 'kt', wind: 'kt' })
    expect(flyUnits('m', 'kmh')).toEqual({ length: 'm', speed: 'km/h', wind: 'kmh' })
    expect(flyUnits('ft', 'mph')).toEqual({ length: 'ft', speed: 'mph', wind: 'mph' })
  })
  it('converts: 121.92 m is 400 ft; 12 m/s is 23 kt, 26.8 mph', () => {
    expect(hudLength(121.92, flyUnits('ft', 'kt'))).toBe('400')
    expect(hudLength(121.92, flyUnits('m', 'kt'))).toBe('122')
    expect(hudSpeed(12, flyUnits('ft', 'kt'))).toBe('23')
    expect(hudSpeed(12, flyUnits('ft', 'mph'))).toBe('27')
    expect(hudSpeed(3, flyUnits('ft', 'mph'))).toBe('6.7')
    expect(hudSpeed(3, flyUnits('m', 'ms'))).toBe('3.0')
    expect(hudLength(null, flyUnits('ft', 'kt'))).toBe('—')
  })
  it('says the wind in the Settings wind unit, not the HUD speed unit (E11: "Wind 19 mph" beside a home in kt)', () => {
    /* 8.5 m/s is 16.5 kt, 19.0 mph. */
    expect(hudWind(8.5, flyUnits('ft', 'kt'))).toBe('Wind 17 kt')
    expect(hudWind(8.5, flyUnits('ft', 'mph'))).toBe('Wind 19 mph')
    expect(hudWind(8.5, flyUnits('m', 'kmh'))).toBe('Wind 31 km/h')
    expect(hudWind(null, flyUnits('ft', 'kt'))).toBe('Wind —')
  })
  it('colours an obstacle red only when it is a hazard: inside 5 m', () => {
    expect(barRole(3)).toBe('hazard')
    expect(barRole(10)).toBe('caution')
    expect(barRole(40)).toBe('far')
    expect(barRole(null)).toBe('unknown')
  })
})
