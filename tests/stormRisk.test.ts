import { describe, expect, it } from 'vitest'
import { hourVote, outlookAt, rainOdds, shearMs, stormDay, stormLine, type IngredientHour } from '../src/core/stormRisk.ts'

const H0 = new Date('2026-07-15T16:00:00Z')
const at = (h: number) => new Date(H0.getTime() + h * 3_600_000)
const quiet = { cape: 100, cin: 20, li: 3, pw: 25, rain: 0, shear: 5 }
const hot = { cape: 2200, cin: 10, li: -5, pw: 50, rain: 1.2, shear: 18 }

function day(stormFrom: number, models = 4): IngredientHour[] {
  return Array.from({ length: 10 }, (_, h) => ({ at: at(h), models: Array.from({ length: models }, () => (h >= stormFrom ? hot : quiet)) }))
}

describe('storm ingredients (Batch K, Section 3)', () => {
  it('says when storms become possible, strong and wet', () => {
    const d = stormDay('2026-07-15', day(3))
    expect(d.possible).toBe(true)
    expect(d.from?.toISOString()).toBe(at(3).toISOString())
    expect(stormLine(d, (x) => x.toISOString().slice(11, 16), 'today')).toBe('Storms possible after 19:00 · could be strong · heavy rain possible')
    expect(d.maxCape).toBe(2200)
  })
  it('energy without rain in the model is not a storm', () => {
    const h: IngredientHour = { at: H0, models: [{ ...hot, rain: 0 }, { ...hot, rain: 0 }] }
    expect(hourVote(h).possible).toBe(false)
  })
  it('a strong lid stops it', () => {
    expect(hourVote({ at: H0, models: [{ ...hot, cin: 250 }] }).possible).toBe(false)
  })
  it('half the models must agree', () => {
    expect(hourVote({ at: H0, models: [hot, quiet, quiet] }).possible).toBe(false)
    expect(hourVote({ at: H0, models: [hot, hot, quiet, quiet] }).possible).toBe(true)
  })
  it('no storms: no line, never "safe" or "clear"', () => {
    expect(stormLine(stormDay('2026-07-15', day(99)), () => 'x', 'today')).toBeNull()
  })
  it('the line is the models’ alone: the SPC is quoted beside it, not read by it', () => {
    /* stormDay takes model hours and nothing else: an SPC High risk cannot change it. */
    expect(stormDay.length).toBe(2)
    expect(outlookAt(['TSTM', 'HIGH', 'MRGL'])?.word).toBe('High risk (5 of 5)')
    expect(stormLine(stormDay('d', day(99)), () => 'x', 'today')).toBeNull()
  })
  it('shear is the vector change, not the speed change', () => {
    expect(shearMs(10, 270, 10, 90)).toBeCloseTo(20, 5)
    expect(shearMs(10, 270, 20, 270)).toBeCloseTo(10, 5)
  })
  it('the ensemble: share of runs with rain, and the likeliest three hours', () => {
    const hours = Array.from({ length: 8 }, (_, h) => at(h))
    const runs = Array.from({ length: 10 }, (_, r) => hours.map((_, h) => (r < 6 && h >= 4 && h <= 6 ? 1 : 0)))
    const o = rainOdds(runs, hours)
    expect(o.chance).toBeCloseTo(0.6, 5)
    expect(o.from?.toISOString()).toBe(at(4).toISOString())
    expect(o.to?.toISOString()).toBe(at(7).toISOString())
  })
})
