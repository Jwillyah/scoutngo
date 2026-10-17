import { describe, expect, it } from 'vitest'
import {
  briefFromChips,
  briefIsTyped,
  briefSourceLine,
  resolveBrief,
  type ChipIntent,
} from './shootBrief.ts'

const intent = (over: Partial<ChipIntent> = {}): ChipIntent => ({
  kind: 'sunrise',
  platform: 'air',
  venueName: 'Capital Trace, Newport News',
  shotCount: 0,
  ...over,
})

/*
 * "The chips already say what the shoot is: Sunrise, Drone. That is the
 * intent, structured." So the brief is built from them, and the typed box goes
 * back to being for a real client brief.
 */
describe('the chips say what the shoot is', () => {
  const { event, outcome } = briefFromChips(intent())

  it('says it is a sunrise shoot and what that means for the light', () => {
    expect(outcome.toLowerCase()).toContain('sunrise')
    expect(outcome.toLowerCase()).toContain('low')
  })

  it('says every position is a drone position', () => {
    expect(outcome.toLowerCase()).toContain('drone')
    expect(outcome.toLowerCase()).toContain('flying')
  })

  it('names the venue as the subject', () => {
    expect(event).toContain('Capital Trace, Newport News')
  })

  it('distinguishes the three platforms', () => {
    const air = briefFromChips(intent({ platform: 'air' })).outcome
    const ground = briefFromChips(intent({ platform: 'ground' })).outcome
    const both = briefFromChips(intent({ platform: 'both' })).outcome
    expect(new Set([air, ground, both]).size).toBe(3)
    expect(ground.toLowerCase()).toContain('no aircraft')
    expect(both.toLowerCase()).toContain('both')
  })

  it('distinguishes the three times of day', () => {
    const kinds = (['sunrise', 'sunset', 'daytime'] as const).map(
      (kind) => briefFromChips(intent({ kind })).outcome,
    )
    expect(new Set(kinds).size).toBe(3)
    expect(kinds[1].toLowerCase()).toContain('dusk')
    expect(kinds[2].toLowerCase()).toContain('high')
  })
})

/*
 * THE FAILURE THIS HAS TO KEEP PREVENTING. "Pressed at an apartment complex
 * with an empty description, this invented a marina shoot: the model was
 * handed a satellite image and nothing else."
 *
 * An empty string caused that. This is not an empty string and it is not an
 * invented one: it names the absence and forbids filling it in.
 */
describe('it never invents an event, and says so', () => {
  const { event } = briefFromChips(intent())

  it('states plainly that nothing was described', () => {
    expect(event).toContain('NO EVENT WAS DESCRIBED')
  })

  it('forbids inventing one, naming what gets invented', () => {
    const lower = event.toLowerCase()
    expect(lower).toContain('do not invent')
    for (const word of ['event', 'crowd', 'ceremony', 'activity']) {
      expect(lower, `does not warn about "${word}"`).toContain(word)
    }
  })

  it('says a guess from the satellite image does not go in the plan', () => {
    expect(event.toLowerCase()).toContain('satellite image')
    expect(event.toLowerCase()).toContain('guess')
  })

  /* It is never empty, which is the one state that caused the original bug. */
  it('is never an empty string, for any combination of chips', () => {
    for (const kind of [null, 'sunrise', 'sunset', 'daytime'] as const) {
      for (const platform of ['ground', 'air', 'both'] as const) {
        for (const venueName of ['', 'Somewhere']) {
          const brief = briefFromChips({ kind, platform, venueName, shotCount: 0 })
          expect(brief.event.trim().length, `${kind}/${platform}`).toBeGreaterThan(80)
          expect(brief.outcome.trim().length, `${kind}/${platform}`).toBeGreaterThan(40)
        }
      }
    }
  })

  it('works with no venue name without saying "undefined"', () => {
    const brief = briefFromChips(intent({ venueName: '' }))
    expect(brief.event).not.toContain('undefined')
    expect(brief.event).toContain('Treat the location itself as the subject.')
  })

  /* A pasted shot list is the brief, and the text hands over to it. */
  it('defers to a shot list when there is one', () => {
    expect(briefFromChips(intent({ shotCount: 4 })).event).toContain('shot list')
    expect(briefFromChips(intent({ shotCount: 0 })).event).not.toContain('shot list')
  })
})

/*
 * NO CHIP TAPPED IS NOT A DEFAULT, IT IS A SILENCE. Claiming sunrise because
 * nobody said otherwise is the same class of invention as the marina.
 */
describe('an untapped chip claims nothing', () => {
  const { outcome } = briefFromChips(intent({ kind: null }))

  it('does not pick a time of day', () => {
    for (const word of ['sunrise', 'sunset', 'golden']) {
      expect(outcome.toLowerCase(), `claims "${word}"`).not.toContain(word)
    }
  })

  it('asks for positions that work across the whole window instead', () => {
    expect(outcome.toLowerCase()).toContain('whole window')
  })
})

describe('a typed brief still wins', () => {
  const typed = { event: 'Boat docking contest on the Wicomico.', outcome: 'Vertical cuts.' }

  it('uses what was typed when it is there', () => {
    expect(resolveBrief(typed, intent())).toEqual(typed)
  })

  /* PER FIELD. A client brief about the event with nothing about the outcome
   * keeps its event text and takes the chips' outcome. */
  it('fills in only the half that is empty', () => {
    const half = resolveBrief({ event: typed.event, outcome: '' }, intent())
    expect(half.event).toBe(typed.event)
    expect(half.outcome).toContain('sunrise')
  })

  it('treats whitespace as empty', () => {
    const blank = resolveBrief({ event: '   \n ', outcome: '' }, intent())
    expect(blank.event).toContain('NO EVENT WAS DESCRIBED')
  })

  it('knows whether anything was typed at all', () => {
    expect(briefIsTyped(typed)).toBe(true)
    expect(briefIsTyped({ event: '', outcome: '' })).toBe(false)
    expect(briefIsTyped({ event: '  ', outcome: '  ' })).toBe(false)
    expect(briefIsTyped({ event: '', outcome: 'x' })).toBe(true)
  })
})

/* The shooter is told which of the two is being sent. */
describe('the screen says where the brief came from', () => {
  it('names the chips it is using', () => {
    expect(briefSourceLine(intent(), false)).toBe('Using the chips: sunrise, drone.')
    expect(briefSourceLine(intent({ platform: 'ground' }), false)).toContain('ground')
  })

  it('says so when the shooter wrote one', () => {
    expect(briefSourceLine(intent(), true)).toBe('Using the brief you wrote.')
  })

  it('does not pretend a chip was tapped when none was', () => {
    const line = briefSourceLine({ kind: null, platform: 'both', venueName: '', shotCount: 0 }, false)
    expect(line).toContain('No chips tapped')
    expect(line.toLowerCase()).not.toContain('sunrise')
  })
})
