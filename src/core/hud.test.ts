import { describe, expect, it } from 'vitest'
import { hudState, hudToggleLabel } from './hud.ts'

/*
 * "Work out how to make that row one line, or make it collapse once I have
 * set it." Collapse was chosen: one line is not possible at 390px with
 * legible words. See the note in src/core/hud.ts.
 */
describe('the control row collapses once there is a plan', () => {
  it('is open before the first position, which is when it is being used', () => {
    expect(hudState(0, null)).toBe('open')
  })

  it('collapses as soon as there is one', () => {
    expect(hudState(1, null)).toBe('collapsed')
    expect(hudState(6, null)).toBe('collapsed')
  })

  /*
   * AN EXPLICIT CHOICE WINS AND IS REMEMBERED. Re-collapsing the row on
   * somebody who just opened it is the app arguing with them.
   */
  it('respects a choice to open it with positions placed', () => {
    expect(hudState(6, 'open')).toBe('open')
  })

  it('respects a choice to collapse it with none placed', () => {
    expect(hudState(0, 'collapsed')).toBe('collapsed')
  })

  it('never returns anything but the two states', () => {
    for (const count of [0, 1, 12]) {
      for (const override of [null, 'open', 'collapsed'] as const) {
        expect(['open', 'collapsed']).toContain(hudState(count, override))
      }
    }
  })
})

/* The toggle is a word, not a bare glyph: this app does not ship mystery dots. */
describe('the toggle says what it will do', () => {
  it('offers more when collapsed and less when open', () => {
    expect(hudToggleLabel('collapsed')).toBe('More')
    expect(hudToggleLabel('open')).toBe('Less')
  })
})
