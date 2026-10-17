import { describe, expect, it } from 'vitest'
import { MAP_PANELS, skyLayerOn, togglePanel, type MapPanel } from './mapPanel.ts'

/*
 * "Make it structurally impossible for two to be open, not a thing each panel
 * remembers to do."
 */
describe('one panel at a time', () => {
  it('swaps rather than stacking', () => {
    expect(togglePanel('hazards', 'sky')).toBe('sky')
    expect(togglePanel('sky', 'hazards')).toBe('hazards')
  })

  it('closes the one that is open when it is tapped again', () => {
    expect(togglePanel('hazards', 'hazards')).toBe('none')
    expect(togglePanel('sky', 'sky')).toBe('none')
  })

  it('opens from nothing', () => {
    for (const panel of MAP_PANELS) expect(togglePanel('none', panel)).toBe(panel)
  })

  /*
   * THE STATE SPACE IS THE PROOF. Two booleans have four states and one of
   * them is the bug; one value of this type has three and all three are legal.
   * Asserted by walking every reachable state from every start.
   */
  it('can never reach a state with two open, from anywhere', () => {
    const seen = new Set<MapPanel>()
    const walk = (from: MapPanel) => {
      if (seen.has(from)) return
      seen.add(from)
      for (const panel of MAP_PANELS) walk(togglePanel(from, panel))
    }
    walk('none')
    expect([...seen].sort()).toEqual(['hazards', 'none', 'sky'])
    /* There is no value of the type that means two are open. */
    for (const state of seen) {
      expect(MAP_PANELS.filter((p) => p === state).length).toBeLessThanOrEqual(1)
    }
  })
})

/*
 * The layer and its key are one thing. A painted layer with the key closed is
 * a wash of colour with no way to find out what it means.
 */
describe('the sky layer follows its key', () => {
  it('is on only while the sky panel is', () => {
    expect(skyLayerOn('sky')).toBe(true)
    expect(skyLayerOn('hazards')).toBe(false)
    expect(skyLayerOn('none')).toBe(false)
  })

  it('goes off when another panel takes over', () => {
    expect(skyLayerOn(togglePanel('sky', 'hazards'))).toBe(false)
  })
})
