import { beforeAll, describe, expect, it } from 'vitest'
import App from '../App.tsx'
import { renderAll } from '../test/renderAll.tsx'

/*
 * A COLD START OFFERS THE PLACE QUESTION, NOT AN ANSWER.
 *
 * The app used to open framed on the calibration venue in Salisbury Maryland
 * at zoom 16.5, which told every new user they were standing in one particular
 * car park. It now opens wide, with search and one "Use my location" button.
 */
describe('cold start', () => {
  /* Batch Polish, Section 1: the lazy screens waited for (src/test/renderAll.tsx). */
  let html = ''
  beforeAll(async () => {
    html = await renderAll(<App />)
  })

  /* The locate button is the top bar's arrow now, there on every screen. */
  it('offers to go to where you are', () => {
    expect(html).toContain('Go to where I am')
  })

  it('asks for a spot or place rather than naming one (Batch NOW, Section 5: "Search a spot or place")', () => {
    expect(html).toContain('Search a spot or place')
    expect(html).toContain('Find the venue, or tap the map.')
  })

  it('names no venue and offers no coordinate', () => {
    expect(html).not.toContain('Salisbury')
    expect(html).not.toContain('38.364')
    expect(html).not.toContain('75.605')
  })

  /*
   * The venue name field is an empty prompt, not a filled in guess. A cold
   * start that pre-named the place would be the same wrong claim in text.
   */
  it('leaves the venue name empty', () => {
    expect(html).not.toContain('class="plate')
  })
})
