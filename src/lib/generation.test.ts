import { describe, expect, it } from 'vitest'
import { GENERATE_STAGES, stageIndex, stageLabel } from './generation.ts'

describe('generate stages', () => {
  it('names the four real steps, in the order the code takes them', () => {
    expect(GENERATE_STAGES.map((stage) => stage.key)).toEqual([
      'capture',
      'terrain',
      'positions',
      'lighting',
    ])
  })

  it('orders strictly, so a later stage never reads as earlier progress', () => {
    expect(stageIndex('capture')).toBe(0)
    expect(stageIndex('terrain')).toBeGreaterThan(stageIndex('capture'))
    expect(stageIndex('positions')).toBeGreaterThan(stageIndex('terrain'))
    expect(stageIndex('lighting')).toBeGreaterThan(stageIndex('positions'))
  })

  it('gives every stage a label that says what is happening', () => {
    for (const stage of GENERATE_STAGES) {
      expect(stageLabel(stage.key)).toBe(stage.label)
      expect(stageLabel(stage.key).length).toBeGreaterThan(0)
    }
  })

  /*
   * The stage is the only progress signal, so it has to be a step and not a clock.
   * Nothing in here may mention seconds, percentages, or an estimate: the app has
   * no idea how long Overpass or the model will take, and saying otherwise would be
   * inventing a number.
   */
  it('promises no duration it cannot know', () => {
    const text = GENERATE_STAGES.map((stage) => stage.label).join(' ').toLowerCase()
    for (const banned of ['second', 'minute', '%', 'almost', 'nearly', 'soon']) {
      expect(text).not.toContain(banned)
    }
  })
})
