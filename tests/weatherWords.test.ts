import { describe, expect, it } from 'vitest'
import { blendRun } from '../src/core/modelSkill.ts'
import { cloudAgreement, dayAgreement, hourlyStrip, rainLine6h, rainNearLine } from '../src/core/weatherWords.ts'

const T0 = Date.UTC(2026, 10, 3, 14)
const times = Array.from({ length: 12 }, (_, i) => new Date(T0 + i * 3_600_000).toISOString().slice(0, 16))
const run = (rainA: number[], rainB: number[], cloudB = 50) => ({
  times,
  series: {
    gfs_global: { temp: times.map(() => 15), rain: rainA, cloud: times.map(() => 40) },
    ecmwf_ifs025: { temp: times.map(() => 16), rain: rainB, cloud: times.map(() => cloudB) },
  },
})
const clock = (d: Date) => d.toISOString().slice(11, 16)

describe('the Weather tab words (Batch K addendum A)', () => {
  it('no rain in 6 hours, said as that, never "clear"', () => {
    const h = blendRun(run(times.map(() => 0), times.map(() => 0)), null, 'UTC')
    expect(rainLine6h(h, new Date(T0), clock)).toBe('No rain expected in the next 6 hours.')
  })
  it('rain likely from its first wet hour, with the chance', () => {
    const wet = times.map((_, i) => (i >= 3 ? 2 : 0))
    const h = blendRun(run(wet, wet), null, 'UTC')
    expect(rainLine6h(h, new Date(T0), clock)).toBe('Rain likely from 17:00 (100%).')
  })
  it('the hour strip has the sunset in its place', () => {
    const h = blendRun(run(times.map(() => 0), times.map(() => 0)), null, 'UTC')
    const s = hourlyStrip(h, new Date(T0 + 60_000), [{ at: new Date(T0 + 2.5 * 3_600_000), word: 'sunset' }])
    expect(s.map((c) => c.kind)).toEqual(['hour', 'hour', 'hour', 'sun', 'hour', 'hour', 'hour'])
  })
  it('agreement: split when only some models have rain; split on timing when starts differ', () => {
    expect(dayAgreement(blendRun(run(times.map(() => 1), times.map(() => 0)), null, 'UTC')).word).toBe('split: 1 of 2')
    const early = times.map((_, i) => (i === 0 ? 1 : 0))
    const late = times.map((_, i) => (i === 8 ? 1 : 0))
    expect(dayAgreement(blendRun(run(early, late), null, 'UTC')).word).toBe('agree on rain, split on timing')
    expect(dayAgreement(blendRun(run(times.map(() => 0), times.map(() => 0)), null, 'UTC')).agree).toBe(true)
  })
  it('tonight: they agree within 30 points of cloud, otherwise split', () => {
    expect(cloudAgreement(blendRun(run(times.map(() => 0), times.map(() => 0), 60), null, 'UTC')[0]).word).toBe('They agree.')
    expect(cloudAgreement(blendRun(run(times.map(() => 0), times.map(() => 0), 95), null, 'UTC')[0]).word).toBe('They’re split.')
  })
  it('the radar line: where the rain is and whether it comes', () => {
    expect(rainNearLine({ km: 225, bearingDeg: 0 }, 10, 'mi')).toBe('rain 140 mi N · moving away')
    expect(rainNearLine({ km: 30, bearingDeg: 270 }, 90, 'mi')).toBe('rain 19 mi W · moving toward you')
    expect(rainNearLine(null, null, 'mi')).toBeNull()
  })
})
