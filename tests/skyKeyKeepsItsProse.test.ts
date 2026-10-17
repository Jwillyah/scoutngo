import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * THE COMPACT BAR DID NOT DELETE THE HONESTY.
 *
 * "Make the picker a compact bar... Keep all of that text. It is good and it
 * is honest. It just does not need to be on screen while I am looking at the
 * weather."
 *
 * The rendered test asserts the bar is compact. This asserts the other half:
 * every sentence that came off the bar is still in the component, behind the
 * info tap. Without it, "compact" could be achieved by deleting the parts that
 * make the layer honest about being a model, and every render test would still
 * pass.
 *
 * A source scan because a static render cannot tap, and because the question
 * is about what EXISTS rather than what is shown.
 */
const SOURCE = readFileSync(new URL('../src/components/SkyLegend.tsx', import.meta.url), 'utf8')

describe('every sentence survived the compacting', () => {
  const KEPT = [
    ['the model caveat for wind', 'no satellite picture of wind'],
    ['what the bands are measured against', 'published rating of the most limiting aircraft'],
    ['the grid extent', 'gridExtentLine()'],
    ['the squares are a model', 'not a photograph'],
    ['the band explanation', 'GOES_BAND_NOTE'],
    ['the colour table provenance', 'NASA GIBS publishes'],
  ]

  for (const [what, phrase] of KEPT) {
    it(`keeps ${what}`, () => {
      expect(SOURCE).toContain(phrase)
    })
  }

  it('puts them behind the info tap rather than on the bar', () => {
    expect(SOURCE).toContain('skykey__info-body')
    expect(SOURCE).toContain('showInfo')
  })

  /*
   * EXCEPT A PROBLEM, which is never behind a tap. It says why the map is
   * empty, and somebody looking at an empty map should not have to go looking
   * for that.
   */
  it('leaves a forecast problem on the bar, not behind the tap', () => {
    const body = SOURCE.slice(SOURCE.indexOf('forecastProblem'))
    const line = body.slice(0, 200)
    expect(line).not.toContain('showInfo')
  })

  /* The check can fail: a phrase that is not there is reported as missing. */
  it('would notice a deleted sentence', () => {
    expect(SOURCE).not.toContain('a sentence that was never in this file')
  })
})
