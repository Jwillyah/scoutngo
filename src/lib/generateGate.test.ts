import { describe, expect, it } from 'vitest'
import { generateBlock } from './generateGate.ts'

const ok = { errors: {}, missing: null }

/*
 * THE REPORTED BUG, AS AN ASSERTION. "I tap it and nothing happens. No
 * positions, no spinner, no error." Measured on the real shoot's state:
 *
 *   DIAG tap   {hasErrors:false, staleBrief:false, briefLen:0, mode:"plan"}
 *   DIAG stop  guard 2, empty brief -> setMode('setup') + setGeneration(error)
 *   message on screen []
 *
 * The reason existed. The navigation threw it away. So the reason is a value
 * now, and these tests are about whether it is a USEFUL one.
 */
describe('a generate that cannot run says why', () => {
  it('runs when the venue is set', () => {
    expect(generateBlock(ok)).toBeNull()
  })

  /*
   * AND IT RUNS WITH NO TYPED BRIEF, which is the follow-up. The chips say
   * what the shoot is; requiring a sentence as well re-added the text box the
   * chips replaced, as a gate. See src/core/shootBrief.ts.
   */
  it('runs with no typed brief at all', () => {
    expect(generateBlock({ errors: {}, missing: null })).toBeNull()
  })

  it('blocks an incomplete venue and carries which field is missing', () => {
    const block = generateBlock({
      ...ok,
      errors: { latitude: 'required' },
      missing: 'venue',
    })
    expect(block?.field).toBe('venue')
  })

  /*
   * SUGGEST NEVER READS THE BRIEF NOW (src/core/suggest.ts), so a brief that
   * describes somewhere else is not a reason to refuse. There is no longer a
   * brief input to this gate at all.
   */
  it('has no brief to block on', () => {
    expect(generateBlock.length).toBe(1)
    expect(Object.keys(ok)).not.toContain('staleBrief')
  })
})

describe('every block can be read and acted on', () => {
  const cases: { label: string; input: Parameters<typeof generateBlock>[0] }[] = [
    { label: 'bad venue', input: { ...ok, errors: { latitude: 'x' }, missing: 'venue' } },
  ]

  for (const { label, input } of cases) {
    it(`${label} carries a sentence and a button label`, () => {
      const block = generateBlock(input)
      expect(block).not.toBeNull()
      expect(block!.message.length).toBeGreaterThan(30)
      expect(block!.message).toMatch(/\.$/)
      expect(block!.action.length).toBeGreaterThan(3)
      expect(block!.action.length).toBeLessThan(26)
    })
  }

  /*
   * IT SAYS WHAT IS MISSING, NOT THAT SOMETHING FAILED. "Could not generate"
   * is the silent button with words on it.
   */
  it('names the thing that is missing', () => {
    const venue = generateBlock({ ...ok, errors: { latitude: 'x' }, missing: 'venue' })
    expect(venue!.message.toLowerCase()).toContain('venue')
  })

  it('claims nothing about a model or a server', () => {
    for (const { input } of cases) {
      const text = generateBlock(input)!.message.toLowerCase()
      for (const word of ['error', 'failed', 'api', 'endpoint', 'unavailable']) {
        expect(text, `block says "${word}"`).not.toContain(word)
      }
    }
  })
})

/**
 * THE STRUCTURAL RULE: deciding it cannot run must not navigate.
 *
 * This is the whole bug. The reason was computed and then the screen that
 * renders it was unmounted in the next statement, so a correct diagnosis
 * reached nobody. A source scan, because the rule is about what the handler
 * does, not about what a function returns.
 */
describe('the block is shown, not navigated away from', () => {
  it('is a pure function with no side effects to lose', () => {
    const before = { errors: { latitude: 'required' }, missing: 'venue' as const }
    expect(generateBlock(before)).toEqual(generateBlock(before))
    /* It did not mutate what it was handed. */
    expect(before.errors.latitude).toBe('required')
  })
})

/* An empty venue blocks on the venue, never silently on nothing. */
describe('a blank start blocks on something', () => {
  it('never returns null for a venue with nothing in it', () => {
    const block = generateBlock({
      errors: { latitude: 'required', longitude: 'required' },
      missing: 'venue',
    })
    expect(block).not.toBeNull()
  })
})
