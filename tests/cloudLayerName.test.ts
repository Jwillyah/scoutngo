import { describe, expect, it } from 'vitest'
import { cloudHeightWords, cloudLayerLabel, cloudLayerName, distanceToward, distanceWords } from '../src/core/cloudLayerName.ts'
import { deckTruth } from '../src/core/layerTruth.ts'
import { LAYERS } from '../src/core/clouds.ts'

/* Batch SIMPLE-3, Section 3.3: "a mid deck at 8,000 ft is never called high cirrus 8 km". */
describe('a layer is named from its height', () => {
  it('low under 6,500 ft, mid 6,500–20,000, high over 20,000', () => {
    expect(cloudLayerName(1200)).toBe('low deck')
    expect(cloudLayerName(6499)).toBe('low deck')
    expect(cloudLayerName(6500)).toBe('mid deck')
    expect(cloudLayerName(8000)).toBe('mid deck')
    expect(cloudLayerName(20000)).toBe('mid deck')
    expect(cloudLayerName(20001)).toBe('high cloud')
  })

  it('heights in ft for a shooter in feet, m/km otherwise; a dash, never a zero, when unknown', () => {
    expect(cloudHeightWords(8000 * 0.3048, true)).toBe('8,000 ft')
    expect(cloudHeightWords(8000, true)).toBe('26,200 ft')
    expect(cloudHeightWords(8000, false)).toBe('8.0 km')
    expect(cloudHeightWords(820, false)).toBe('800 m')
    expect(cloudHeightWords(null, true)).toBe('—')
  })

  it('23 Nov: the models call it high, a station has a deck at 8,000 ft → "mid deck · 8,000 ft", never cirrus, never km', () => {
    const truth = deckTruth({ station: { station: 'KNTU', amount: 'BKN', baseFt: 8000, atLeast: false }, modelLayer: 'high' })
    const high = LAYERS.find((l) => l.name === 'high')!
    const label = cloudLayerLabel({ layer: 'high', typicalHeightM: high.heightM, truth, miles: true })
    expect(label.words).toBe('mid deck · 8,000 ft')
    expect(label.measured).toBe(true)
    expect(label.words).not.toMatch(/cirrus|km/)
  })

  it('nothing measured: the typical height names it, with "about"', () => {
    for (const l of LAYERS) {
      const label = cloudLayerLabel({ layer: l.name, typicalHeightM: l.heightM, truth: null, miles: true })
      expect(label.measured).toBe(false)
      expect(label.height).toMatch(/^about [\d,]+ ft$/)
      expect(label.name).toBe(cloudLayerName(l.heightM / 0.3048))
      expect(label.words).not.toMatch(/cirrus|km/)
    }
  })

  it('a station deck at the ceilometer limit says "or higher"', () => {
    const truth = deckTruth({ station: { station: 'KORF', amount: 'BKN', baseFt: 12000, atLeast: true }, modelLayer: 'high' })
    expect(cloudLayerLabel({ layer: 'high', typicalHeightM: 8000, truth, miles: true }).words).toBe('mid deck · 12,000 ft or higher')
  })
})

describe('how far and which way, in mi for a shooter in feet', () => {
  it('"13 km NE" is "8 mi NE"; under a kilometre "here"', () => {
    expect(distanceToward(13, 45, true)).toBe('8 mi NE')
    expect(distanceToward(13, 45, false)).toBe('13 km NE')
    expect(distanceToward(0.4, 45, true)).toBe('here')
    expect(distanceWords(2, true)).toBe('1 mi')
  })
})
