import { describe, expect, it } from 'vitest'
import { RADIUS_DEFAULT_METERS, RADIUS_MAX_METERS } from '../core/radius.ts'
import { reviveLastSetup } from './lastSetup.ts'

const good = {
  at: { lat: 36.8268, lon: -75.9718 },
  name: { key: '36.826800|-75.971800', name: 'Virginia Beach Fishing Pier' },
  shootKind: 'sunrise',
  platform: 'air',
  reachMeters: 600,
}

describe('reviveLastSetup', () => {
  it('keeps a well-formed setup as it was', () => {
    expect(reviveLastSetup(good)).toEqual(good)
  })

  it('refuses anything without a real coordinate', () => {
    expect(reviveLastSetup(null)).toBeNull()
    expect(reviveLastSetup({})).toBeNull()
    expect(reviveLastSetup({ ...good, at: { lat: '36', lon: -75 } })).toBeNull()
    expect(reviveLastSetup({ ...good, at: { lat: 95, lon: -75 } })).toBeNull()
    expect(reviveLastSetup({ ...good, at: { lat: Number.NaN, lon: -75 } })).toBeNull()
  })

  it('drops the parts it does not recognise rather than the whole setup', () => {
    const out = reviveLastSetup({ ...good, name: { key: 'k', name: '  ' }, shootKind: 'noon', platform: 'boat', reachMeters: 1e9 })
    expect(out).toEqual({ at: good.at, name: null, shootKind: null, platform: 'both', reachMeters: RADIUS_MAX_METERS })
    expect(reviveLastSetup({ at: good.at })?.reachMeters).toBe(RADIUS_DEFAULT_METERS)
  })
})
