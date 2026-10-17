import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { NowScreen } from './NowScreen.tsx'

const html = renderToStaticMarkup(<NowScreen onClose={() => {}} onPlanHere={() => {}} />)
const text = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/*
 * THE FIRST THING IT DOES IS ASK.
 *
 * Rendered with no location, which is every launch: this screen holds nothing
 * between sessions and starts by asking. There is no way to reach the readout
 * without a tap, which is the same rule as the rest of the app.
 */
describe('the screen before a location is shared', () => {
  it('asks rather than assuming', () => {
    expect(text(html)).toContain('Use my location')
  })

  it('says what the location is for and what happens to it', () => {
    const shown = text(html)
    expect(shown).toContain('not stored')
    expect(shown).toContain('never guessed from your network')
  })

  /*
   * NEVER IP GEOLOCATION. That rule stands, and this screen is the most
   * tempting place in the app to break it: a location-less glance is useless,
   * and an IP lookup would make it work without asking. The repo has a
   * standing test for the ban; this asserts the wording promises it.
   */
  it('promises no network-derived position', () => {
    expect(text(html)).not.toMatch(/approximate location|by IP|from your IP/i)
  })

  it('shows no readout at all before there is a fix', () => {
    expect(html).not.toContain('now__head')
    expect(html).not.toContain('now__look')
  })
})

describe('what the screen is not', () => {
  /*
   * NO MAP AND NO SCRUBBER. Both would be a second thing to read in a moment
   * that has room for one, and the map would spin up a WebGL context for a
   * question with a one line answer.
   */
  it('has no map and no time scrubber', () => {
    expect(html).not.toContain('maplibre')
    expect(html).not.toContain('scrub__')
    expect(html).not.toContain('class="map')
  })

  /* It is one screen. Nothing is behind a tab or an accordion. */
  it('has no tabs, no accordion and no menu', () => {
    expect(html).not.toContain('role="tab"')
    expect(html).not.toContain('details')
    expect(html).not.toContain('summary')
  })

  it('is a dialog with a way out', () => {
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="Close"')
  })
})

/*
 * NO DEGREES ANYWHERE ON IT.
 *
 * "Look west-southwest" is something you can act on at a windscreen; "look
 * 254.1 degrees" needs a compass app and thirty seconds nobody has. The
 * degrees are the receipt and they belong in the planner. This is asserted on
 * the whole screen rather than on one line, because the failure mode is a
 * number creeping back in somewhere further down.
 */
describe('it carries no bearings and no coordinates', () => {
  it('prints no degree sign', () => {
    expect(html).not.toContain('°')
  })

  it('prints no decimal coordinate', () => {
    expect(text(html)).not.toMatch(/-?\d{1,3}\.\d{3,}/)
  })
})
