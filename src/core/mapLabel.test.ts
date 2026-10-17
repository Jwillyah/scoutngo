import { describe, expect, it } from 'vitest'
import { plateLabels, sharedOptic } from './mapLabel.ts'

/*
 * THE REPORTED MAP. "Six positions, six labels reading SIGMA 40, SIGMA 50,
 * SIGMA 55, SIGMA 65, SIGMA 70, SIGMA 75."
 */
const SIX = [40, 50, 55, 65, 70, 75].map((focalLength) => ({
  opticName: 'Sigma 28-75 f2.8',
  focalLength,
}))

describe('one optic across the map says it nowhere on the plates', () => {
  const plates = plateLabels(SIX)

  it('drops the word from every plate', () => {
    expect(plates.map((p) => p.tag)).toEqual([null, null, null, null, null, null])
  })

  it('keeps what actually varies', () => {
    expect(plates.map((p) => p.focalLength)).toEqual([40, 50, 55, 65, 70, 75])
  })

  /* And says the optic once, somewhere, in full. */
  it('names the optic once for the plan', () => {
    expect(sharedOptic(SIX)).toBe('Sigma 28-75 f2.8')
  })
})

describe('two optics and every plate carries its own', () => {
  const mixed = [
    { opticName: 'Sigma 28-75 f2.8', focalLength: 40 },
    { opticName: 'Sigma 28-75 f2.8', focalLength: 55 },
    { opticName: 'Sony 200-600', focalLength: 400 },
  ]

  it('tags all of them, including the two that share', () => {
    expect(plateLabels(mixed).map((p) => p.tag)).toEqual(['SIGMA', 'SIGMA', 'SONY'])
  })

  /*
   * DROPPING ONLY THE DUPLICATES would make the PRESENCE of a word a code:
   * "this one is different" rather than "this one is a Sony". Everything
   * carries its own, or nothing does.
   */
  it('does not drop the word from the two that share it', () => {
    expect(plateLabels(mixed).every((p) => p.tag !== null)).toBe(true)
  })

  it('says nothing once, because every plate is already saying it', () => {
    expect(sharedOptic(mixed)).toBeNull()
  })
})

describe('the aircraft case, which is what the optic was added for', () => {
  const air = [
    { opticName: 'Air 3S wide', focalLength: 24 },
    { opticName: 'Sigma 28-75 f2.8', focalLength: 28 },
  ]

  it('keeps the distinction that answered "28 on what"', () => {
    expect(plateLabels(air).map((p) => p.tag)).toEqual(['AIR 3S', 'SIGMA'])
  })

  /* An all-aircraft plan drops it too: the silhouette already says air. */
  it('drops it when every position is on the same aircraft camera', () => {
    const allAir = [
      { opticName: 'Air 3S wide', focalLength: 24 },
      { opticName: 'Air 3S wide', focalLength: 24 },
    ]
    expect(plateLabels(allAir).map((p) => p.tag)).toEqual([null, null])
    expect(sharedOptic(allAir)).toBe('Air 3S wide')
  })

  /*
   * TWO CAMERAS ON ONE AIRCRAFT still differ, and the focal length alone
   * distinguishes them, but the tag is the same word. The rule is about
   * DISTINCT TAGS, so a map of wide and tele drops the repeated "AIR 3S".
   */
  it('drops a tag two aircraft cameras share, since the focal tells them apart', () => {
    const both = [
      { opticName: 'Air 3S wide', focalLength: 24 },
      { opticName: 'Air 3S tele', focalLength: 70 },
    ]
    expect(plateLabels(both).map((p) => p.tag)).toEqual([null, null])
    /* And no single optic to name, because there are two. */
    expect(sharedOptic(both)).toBeNull()
  })
})

describe('the edges', () => {
  it('says nothing for an empty plan', () => {
    expect(plateLabels([])).toEqual([])
    expect(sharedOptic([])).toBeNull()
  })

  /* One position: nothing to distinguish it from, so the plate is bare. */
  it('drops the tag from a lone position and names it once instead', () => {
    const one = [{ opticName: 'Sony 200-600', focalLength: 400 }]
    expect(plateLabels(one)[0].tag).toBeNull()
    expect(sharedOptic(one)).toBe('Sony 200-600')
  })
})
