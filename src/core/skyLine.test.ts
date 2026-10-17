import { describe, expect, it } from 'vitest'
import type { CloudSample, SightlineCloud } from './cloud.ts'
import { summariseSightline } from './cloud.ts'
import { hasHorizonSlot, skyLine } from './skyLine.ts'

const sample = (distanceKm: number, low: number | null, mid: number | null, high: number | null): CloudSample => ({
  distanceKm,
  low,
  mid,
  high,
})

const sightline = (samples: CloudSample[]): SightlineCloud => summariseSightline(samples)

describe('the arrangement that makes a sunset', () => {
  /*
   * THE CASE IN THE REPORT. Thick mid cloud with nothing low at distance is
   * the best sunset there is, and a single cloud percentage cannot tell it
   * apart from the worst one.
   */
  it('names thick mid cloud with a slot at the horizon', () => {
    const line = skyLine(
      sightline([
        sample(10, 10, 80, 20),
        sample(20, 10, 85, 20),
        sample(40, 5, 80, 10),
        sample(60, 5, 70, 10),
        sample(80, 0, 60, 10),
      ]),
    )
    expect(line).toBe('Looks like thick mid cloud with a clear slot at the horizon.')
  })

  it('does not claim a slot when the far samples are also covered', () => {
    const cloud = sightline([
      sample(10, 10, 80, 20),
      sample(40, 60, 80, 10),
      sample(80, 65, 60, 10),
    ])
    expect(hasHorizonSlot(cloud)).toBe(false)
    expect(skyLine(cloud)).not.toContain('slot')
  })

  it('reports solid low cloud as what it is', () => {
    const line = skyLine(sightline([sample(10, 90, 50, 20), sample(40, 85, 40, 10)]))
    expect(line).toContain('thick low cloud')
    expect(line).toContain('horizon')
  })

  it('reports broken low cloud as coming and going', () => {
    const line = skyLine(sightline([sample(10, 45, 10, 10), sample(40, 50, 10, 5)]))
    expect(line).toContain('broken low cloud')
    expect(line).toContain('come and go')
  })

  it('reports a mostly empty sky plainly', () => {
    const line = skyLine(
      sightline([sample(10, 5, 5, 5), sample(40, 5, 5, 5), sample(80, 0, 0, 0)]),
    )
    expect(line).toContain('little cloud')
  })

  it('names the higher layer when high cloud dominates', () => {
    const line = skyLine(
      sightline([sample(10, 5, 10, 80), sample(40, 5, 10, 85), sample(80, 0, 5, 80)]),
    )
    expect(line).toContain('thick high cloud')
  })
})

describe('the horizon slot is read from the far samples', () => {
  /*
   * The near samples are the sky overhead, which is already visible out of the
   * window. The far ones are where a low sun comes from.
   */
  it('ignores low cloud directly overhead', () => {
    const cloud = sightline([
      sample(10, 90, 10, 10),
      sample(40, 5, 10, 10),
      sample(80, 0, 10, 10),
    ])
    expect(hasHorizonSlot(cloud)).toBe(true)
  })

  it('has no slot when there are no far samples at all', () => {
    expect(hasHorizonSlot(sightline([sample(10, 0, 0, 0), sample(20, 0, 0, 0)]))).toBe(false)
  })

  it('has no slot when the far samples carry no low layer', () => {
    expect(hasHorizonSlot(sightline([sample(40, null, 10, 10), sample(80, null, 10, 10)]))).toBe(
      false,
    )
  })
})

describe('what it says with nothing to go on', () => {
  /*
   * A BLANK LINE WOULD READ AS A CLEAR SKY. That is the one reading this must
   * never produce, so a missing forecast gets a sentence rather than an empty
   * string or a zero.
   */
  it('says the forecast did not say', () => {
    expect(skyLine(null)).toContain('did not say')
    expect(skyLine(sightline([]))).toContain('did not say')
    expect(skyLine(sightline([sample(10, null, null, null)]))).toContain('did not say')
  })

  it('never returns an empty string', () => {
    for (const cloud of [null, sightline([]), sightline([sample(10, null, 50, 50)])]) {
      expect(skyLine(cloud).length).toBeGreaterThan(10)
    }
  })
})

describe('it hedges and it does not score', () => {
  const CASES: SightlineCloud[] = [
    sightline([sample(10, 10, 80, 20), sample(80, 0, 60, 10)]),
    sightline([sample(10, 90, 50, 20)]),
    sightline([sample(10, 45, 10, 10), sample(80, 50, 10, 5)]),
    sightline([sample(10, 5, 5, 5), sample(80, 0, 0, 0)]),
    sightline([]),
  ]

  it('hedges every sentence that makes a claim', () => {
    for (const cloud of CASES) {
      const line = skyLine(cloud)
      const hedged = /looks like|may |did not say/i.test(line)
      expect(hedged, `not hedged: "${line}"`).toBe(true)
    }
  })

  it('never scores the sky or tells you whether to go', () => {
    for (const cloud of CASES) {
      const line = skyLine(cloud).toLowerCase()
      for (const banned of [
        'worth',
        'perfect',
        'great',
        'excellent',
        'poor',
        'bad',
        'good',
        '/10',
        'score',
        'rating',
        'best',
        'guaranteed',
        'will be',
        'go now',
        'do not bother',
      ]) {
        expect(line, `"${line}" contains "${banned}"`).not.toContain(banned)
      }
    }
  })

  it('never states a percentage, which is the receipt not the answer', () => {
    for (const cloud of CASES) {
      expect(skyLine(cloud)).not.toMatch(/\d/)
    }
  })
})
