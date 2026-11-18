import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Landing } from './Landing.tsx'
import { HowPage } from './HowPage.tsx'
import { OnThisDevice } from './OnThisDevice.tsx'

const text_ = (markup: string) =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const html = renderToStaticMarkup(<Landing onDismiss={() => {}} />)
const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

/*
 * THE LANDING IS BOARD E AND NOTHING ELSE (Batch CORE, Section 6; docs/mockups/
 * Landing_E.png, Jwilly's pick). The list is the specification, so the test is
 * a count as well as a content check.
 */
describe('the landing carries board E\'s parts and stops', () => {
  it('leads with the wordmark, the headline and the line, in Jwilly\'s words', () => {
    expect(text).toContain('ScoutNGo')
    expect(text).toContain('Know before you go outside.')
    expect(text).toContain('Free and open source. Your spots stay on your phone.')
  })

  it('never says "no account", anywhere on it (Jwilly, 16 Nov)', () => {
    expect(text.toLowerCase()).not.toMatch(/no account/)
  })

  it('five example rows, Surf · Shoot · Drone · Tide · Wind, labelled Example; no Fish, no Weather, no Fly', () => {
    expect(html.match(/class="land__row /g)).toHaveLength(5)
    const order = ['>Surf<', '>Shoot<', '>Drone<', '>Tide<', '>Wind<'].map((t) => html.indexOf(t))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
    expect(text).toMatch(/Example · what you(&rsquo;|’|&#x27;|')ll see/)
    expect(text).not.toMatch(/\bFish\b|\bWeather\b|Fly it|fly it here/i)
  })

  it('no real place on it: no Virginia Beach, no pier, no coordinate', () => {
    expect(text).not.toMatch(/Virginia Beach|pier/i)
    expect(text).not.toMatch(/\d{1,3}\.\d{3,}/)
  })

  it('the color card, then one primary action that says what it does', () => {
    expect(text).toMatch(/Where(&rsquo;|’|&#x27;|')s the color tonight\?/)
    expect(html.match(/class="land__go"/g)).toHaveLength(1)
    expect(text).toContain('Open ScoutNGo')
    expect(html.indexOf('land__color')).toBeLessThan(html.indexOf('land__go'))
  })

  it('the footer: Free · open source · Privacy ("works offline" waits for Section 7A on the phone)', () => {
    expect(text).toContain('Free · open source · Privacy')
    expect(text).not.toMatch(/works offline/)
  })

  it('carries no <img> and no slider', () => {
    expect([...html.matchAll(/<img[^>]*src="([^"]*)"/g)]).toHaveLength(0)
    expect(html).not.toContain('type="range"')
    expect(html).not.toMatch(/<input\b/)
  })

  it('no SaaS furniture, and none of what moved to /how', () => {
    expect(text.toLowerCase()).not.toMatch(/get started|sign up|trusted by/)
    expect(text).not.toContain('Three stages')
    expect(text).not.toContain('Build ')
  })
})

/*
 * NOTHING WAS DELETED ON ITS WAY OFF THE COVER.
 *
 * This is the test that matters for this change. The instruction was to move
 * the cover's content to the page below, not to lose any of it, and "moved"
 * is only verifiable by asserting the moved sentences are still rendered.
 */
describe('/how carries everything the cover gave up, and more', () => {
  const how = text_(renderToStaticMarkup(<HowPage onBack={() => {}} />))

  it('carries the three stages that left the cover', () => {
    for (const [stage, when] of [
      ['Setup', 'Before the day'],
      ['Plan', 'The work'],
      ['Field', 'On the day'],
    ]) {
      expect(how, stage).toContain(stage)
      expect(how, when).toContain(when)
    }
  })

  it('carries the computed rule and the privacy rule', () => {
    expect(how.toLowerCase()).toContain('arithmetic from coordinates')
    expect(how.toLowerCase()).toContain('never asked for one')
    expect(how.toLowerCase()).toContain('no account, no database, no analytics')
  })

  it('names what is computed, rather than only claiming that things are', () => {
    for (const named of [
      'Sun azimuth and altitude',
      'Lighting classification',
      'Field of view',
      'slant range',
      'Tide',
      'Airspace',
      'Celestial positions',
    ]) {
      expect(how, named).toContain(named)
    }
  })

  it('says plainly what the model is for', () => {
    expect(how).toContain('What the model is for')
    expect(how).toContain('Words, and only words')
    expect(how).toContain('never asked for a bearing')
  })

  it('states the refusals', () => {
    expect(how).toContain('never says an area is clear of hazards')
    expect(how).toContain('never says a flight is legal, cleared or compliant')
    expect(how).toContain('Temporary flight restrictions are read from tfr.faa.gov')
    expect(how).toContain('Other NOTAMs are not checked')
    expect(how).toContain('prints a dash')
  })

  it('says what leaves the device as fact, not as a promise', () => {
    expect(how).toContain('stay in this browser')
    expect(how).toContain('no telemetry')
    expect(how).toContain('It logs nothing')
    /* A pledge is what a page says when it cannot show you the source. */
    expect(how.toLowerCase()).not.toContain('we will never')
    expect(how.toLowerCase()).not.toContain('we promise')
  })

  it('says what this is not', () => {
    expect(how).toContain('not a forecast app')
    expect(how).toContain('not a safety authority')
    expect(how).toContain('not a substitute for checking the airspace')
  })

  it('carries the footer the cover gave up', () => {
    expect(how).toContain('Build')
    expect(how).toContain('github.com/Jwillyah/scoutngo')
    expect(how).toContain('Esri')
    expect(how).toContain('OpenStreetMap')
    expect(how).toContain('This page is in Settings whenever you want it')
  })

  it('writes the colour rule down where a reader can find it', () => {
    expect(how).toContain('Teal is chrome')
    expect(how).toContain('never styles a reading')
  })
})

/*
 * ITEM 9. "It is a feature, not an apology, but I need to know before I rely
 * on it." The two consequences are the only parts anybody can act on.
 */
describe('the one-device line', () => {
  const out = renderToStaticMarkup(<OnThisDevice what="saved spots" />)

  it('says both consequences, not just the location', () => {
    expect(out).toContain('does not appear on your other devices')
    expect(out).toContain('erases it')
  })

  it('names what it is talking about', () => {
    expect(out).toContain('saved spots')
  })

  it('says why, as the feature it is', () => {
    expect(out).toContain('no account and no server')
    expect(out).toContain('never leaves the phone')
  })

  it('points at the way to keep a copy', () => {
    expect(out).toContain('Export')
  })

  /* Not an apology: no sorry, no unfortunately, no limitation. */
  it('does not apologise', () => {
    for (const word of ['sorry', 'unfortunately', 'limitation', 'cannot sync']) {
      expect(out.toLowerCase(), word).not.toContain(word)
    }
  })
})
