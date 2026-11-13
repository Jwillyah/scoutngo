import { describe, expect, it } from 'vitest'
import { offset } from '../src/core/bestSky.ts'
import { driftOf, driftPatches, driftWords } from '../src/core/satDrift.ts'

/* Batch NOW, Section 0.3: the satellite's patch moved with the wind at its height to the color's time. */
describe('the patch drifts', () => {
  it('the grid\'s mean wind over the time to the color: from the west at 28 km/h for 2 h is 56 km east, "drifting E at 15 kt"', () => {
    const d = driftOf([{ kmh: 28, fromDeg: 270 }, { kmh: 28, fromDeg: 270 }], 2 * 3_600_000)!
    expect(Math.round(d.toDeg)).toBe(90)
    expect(d.km).toBeCloseTo(56, 6)
    expect(driftWords(d)).toBe('patch drifting E at 15 kt')
    expect(driftOf([{ kmh: null, fromDeg: null }], 3_600_000)).toBeNull()
  })
  it('a patch west of the spot at the frame is over the spot at the color', () => {
    const at = { lat: 36.85, lon: -75.98 }
    const row = [0, 5, 10, 15, 20].map((km) => offset(at, 270, km))
    const pts = row.map((p, i) => ({ ...p, satPatch: i === 2 }))
    const d = driftOf([{ kmh: 10, fromDeg: 270 }], 3_600_000)!
    const moved = driftPatches(pts, d)
    /* 10 km east: the patch at 10 km west is now at 0 km. */
    expect(moved[0].satPatch).toBe(true)
    expect(moved[2].satPatch).toBe(false)
    /* The far west point's air came from off the grid: not known. */
    expect(moved[4].satPatch).toBeNull()
  })
})
