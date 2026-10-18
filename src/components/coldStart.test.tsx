import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../App.tsx'

/*
 * A COLD START OFFERS THE PLACE QUESTION, NOT AN ANSWER.
 *
 * The app used to open framed on the calibration venue in Salisbury Maryland
 * at zoom 16.5, which told every new user they were standing in one particular
 * car park. It now opens wide, with search and one "Use my location" button.
 */
describe('cold start', () => {
  const html = renderToStaticMarkup(<App />)

  it('offers Use my location while there is nowhere yet', () => {
    expect(html).toContain('Use my location')
  })

  it('asks where the shoot is rather than naming a place', () => {
    // The apostrophe is entity escaped in the rendered markup.
    expect(html).toContain('Where&#x27;s the shoot?')
    expect(html).toContain('Drop a pin on the venue, or search for it.')
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
    expect(html).toContain('Drop a pin or search for the venue')
  })
})
