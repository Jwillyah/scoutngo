import { describe, expect, it } from 'vitest'
import { groundOf, NIGHT_SUN_DEG } from '../src/core/homeDay.ts'
import { netLines, noteNet, wherePart } from '../src/lib/netLog.ts'

/* Batch N A1: the home's background by condition; night by the sun's height (civil dusk), not the clock. */
describe('the home ground', () => {
  it('night below -6°, whatever the sky', () => {
    expect(NIGHT_SUN_DEG).toBe(-6)
    expect(groundOf(-6.5, 61, true)).toBe('night')
    expect(groundOf(-5.5, 0, false)).toBe('golden')
  })
  it('storms, fog and rain before sunrise and sunset colours; then overcast or a day sky', () => {
    expect(groundOf(30, 95, false)).toBe('storm')
    expect(groundOf(30, 0, true)).toBe('storm')
    expect(groundOf(30, 45, false)).toBe('fog')
    expect(groundOf(3, 61, false)).toBe('rain')
    expect(groundOf(3, 1, false)).toBe('golden')
    expect(groundOf(30, 3, false)).toBe('cloud')
    expect(groundOf(30, 1, false)).toBe('day')
  })
})

/* Batch N E1: the debug lines never hold a query string (it can hold the rounded spot). */
describe('the network debug lines', () => {
  it('host and path only', () => {
    expect(wherePart('https://api.weather.gov/alerts/active?point=36.84,-75.97', 'https://scoutngo.vercel.app')).toEqual({ host: 'api.weather.gov', path: '/alerts/active' })
    expect(wherePart('/api/forecast?om=x&latitude=36.85', 'https://scoutngo.vercel.app')).toEqual({ host: 'this app', path: '/api/forecast' })
    noteNet({ at: 1000, host: 'this app', path: '/', status: 'TypeError', ms: 6000 })
    const lines = netLines(4000, true, false, true, null)
    expect(lines[0]).toMatch(/^device online · app OFFLINE · sw on/)
    expect(lines[1]).toBe('3s ago this app/ → TypeError 6000ms')
    expect(lines.join(' ')).not.toMatch(/36\.8|latitude/)
  })
})
