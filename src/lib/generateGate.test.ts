import { describe, expect, it } from 'vitest'
import { generateBlock } from './generateGate.ts'
import { CALIBRATION_VENUE, EMPTY_VENUE, type VenueDraft } from './venue.ts'

const ok = { errors: {}, missing: null, staleBrief: false, venue: CALIBRATION_VENUE }

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
  it('runs when the venue and the brief are both there', () => {
    expect(generateBlock(ok)).toBeNull()
  })

  it('blocks an empty brief, which is what the chips path leaves', () => {
    const block = generateBlock({ ...ok, venue: { ...CALIBRATION_VENUE, eventDescription: '' } })
    expect(block).not.toBeNull()
    expect(block?.field).toBe('brief')
  })

  it('blocks a brief that is only whitespace', () => {
    expect(generateBlock({ ...ok, venue: { ...CALIBRATION_VENUE, eventDescription: '   \n ' } }))
      .not.toBeNull()
  })

  it('blocks an incomplete venue and carries which field is missing', () => {
    const block = generateBlock({
      ...ok,
      errors: { latitude: 'required' },
      missing: 'venue',
      venue: EMPTY_VENUE,
    })
    expect(block?.field).toBe('venue')
  })

  it('blocks a brief that describes somewhere the pin has left', () => {
    const block = generateBlock({ ...ok, staleBrief: true })
    expect(block?.message).toMatch(/pin moved/i)
  })

  /*
   * ORDER MATTERS. An incomplete venue is reported before a missing brief,
   * because writing a brief for a venue that is not set yet is wasted typing.
   */
  it('reports the venue before the brief when both are wrong', () => {
    const block = generateBlock({
      errors: { latitude: 'required' },
      missing: 'venue',
      staleBrief: true,
      venue: EMPTY_VENUE,
    })
    expect(block?.field).toBe('venue')
  })
})

/*
 * EVERY BLOCK IS SAYABLE AND ACTIONABLE. A block with an empty message is the
 * silent button again, wearing a different type.
 */
describe('every block can be read and acted on', () => {
  const cases: { label: string; input: Parameters<typeof generateBlock>[0] }[] = [
    { label: 'empty brief', input: { ...ok, venue: { ...CALIBRATION_VENUE, eventDescription: '' } } },
    { label: 'stale brief', input: { ...ok, staleBrief: true } },
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
    const brief = generateBlock({ ...ok, venue: { ...CALIBRATION_VENUE, eventDescription: '' } })
    expect(brief!.message.toLowerCase()).toContain('what the shoot is')
    /* And it says the chips are not enough, since that is the shooter's path. */
    expect(brief!.message.toLowerCase()).toContain('chips')
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
    const before = { ...ok, venue: { ...CALIBRATION_VENUE, eventDescription: '' } }
    const first = generateBlock(before)
    const second = generateBlock(before)
    expect(first).toEqual(second)
    /* It did not mutate what it was handed. */
    expect(before.venue.eventDescription).toBe('')
  })
})

/* An empty venue blocks on the venue, never silently on nothing. */
describe('a blank start blocks on something', () => {
  it('never returns null for a venue with nothing in it', () => {
    const blank: VenueDraft = EMPTY_VENUE
    const block = generateBlock({
      errors: { latitude: 'required', longitude: 'required' },
      missing: 'venue',
      staleBrief: false,
      venue: blank,
    })
    expect(block).not.toBeNull()
  })
})
