import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ColdStart } from './ColdStart.tsx'
import { Landing, LandingDetails } from './Landing.tsx'
import { OnThisDevice } from './OnThisDevice.tsx'
import type { Spot } from '../lib/spots.ts'

const text_ = (markup: string) =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const html = renderToStaticMarkup(<Landing onDismiss={() => {}} />)
const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

/*
 * ITEM 10. The content was specified exactly: what it is, the three stages,
 * the rule, and privacy as the feature it is. "Content, no more than this."
 */
describe('the landing page says the four things and stops', () => {
  it('says what it is, in the words it was given', () => {
    expect(text).toContain('Plan a shoot at a place you have never stood in')
  })

  it('names the three stages and what each is for', () => {
    for (const [stage, when] of [
      ['Setup', 'Before the day'],
      ['Plan', 'The work'],
      ['Field', 'On the day'],
    ]) {
      expect(text, stage).toContain(stage)
      expect(text, when).toContain(when)
    }
  })

  /*
   * THE TWO RULES, ONE LINE EACH. The argument behind them moved to the
   * details view; the rules themselves are still on the cover, because a
   * cover that does not say what the thing is built on is a splash screen.
   */
  it('states both rules in one line each', () => {
    expect(text).toContain('Computed')
    expect(text.toLowerCase()).toContain('arithmetic from coordinates')
    expect(text.toLowerCase()).toContain('never asked for one')

    expect(text).toContain('Yours')
    expect(text.toLowerCase()).toContain('no account, no database, no analytics')
    expect(text.toLowerCase()).toContain('stays in this browser')
  })

  /*
   * ONE PRIMARY ACTION, which is the rule this page actually has.
   *
   * It used to be "exactly one <button>", and that rule caught a real
   * regression when the NOW entry was put here. The detail link is not the
   * same thing: it is set as type, it competes with nothing, and the
   * alternative to having it is a cover page that has to be scrolled. So the
   * rule is now one PRIMARY action and one disclosure, counted separately.
   */
  it('has one primary action and one link to the detail', () => {
    expect(text).toContain('Dive in')
    expect(html.match(/class="land__go"/g)).toHaveLength(1)
    expect(html.match(/class="land__more"/g)).toHaveLength(1)
    expect(text.toLowerCase()).toContain('what does leave the device')
  })

  /*
   * THE COVER IS THE HERO, THE STAGES, AND THE TWO RULES. One section, which
   * is the three stages. A second section on the cover is the thing this pass
   * removed.
   */
  it('has one section on the cover', () => {
    expect(html.match(/class="land__sec"/g)).toHaveLength(1)
    expect(text).toContain('Three stages')
  })

/*
 * NOTHING WAS DELETED ON ITS WAY OFF THE FRONT PAGE.
 *
 * This is the test that matters for this change. The instruction was to cut
 * the cover and MOVE the detail, not to lose any of it, and "moved" is only
 * verifiable by asserting the moved sentences are still rendered somewhere.
 * Every line below was on the cover before and is on the details view now,
 * word for word.
 */
  it('keeps every honesty line, on the details view', () => {
    const detail = text_(renderToStaticMarkup(<LandingDetails onBack={() => {}} />))

    for (const line of [
      'The model proposes, code computes',
      'all of it is arithmetic, computed here, from coordinates',
      'It is never asked for a number',
      'recomputed before you see it',
      'No account. No database. No analytics.',
      'go nowhere else',
      'What does leave the device: map tiles',
      'the public map data behind the hazard layer',
      'Never the plan, and never a coordinate attached to you',
    ]) {
      expect(detail, `LOST on the way to the details view: "${line}"`).toContain(line)
    }
  })

  /* And the details view says the things the app refuses to say. */
  it('states the refusals on the details view', () => {
    const detail = text_(renderToStaticMarkup(<LandingDetails onBack={() => {}} />))
    expect(detail).toContain('never says an area is clear of hazards')
    expect(detail).toContain('never says a flight is legal, cleared or compliant')
    expect(detail).toContain('Temporary flight restrictions are not checked')
    expect(detail).toContain('prints a dash')
  })

  /*
   * THE VERNACULAR. No cards, no SaaS furniture, and no stock photography.
   *
   * THIS RULE CHANGED, and the reason is worth keeping. It used to be "no
   * imagery at all", which was the austere reading: flat black and one rule.
   * That is a default wearing restraint's clothes. The hero is the PRODUCT
   * now, which means a real map frame with real imagery in it, so "no img" is
   * the wrong test. What is actually forbidden is a picture of something that
   * is not this app.
   */
  it('has no feature grid and no SaaS furniture', () => {
    expect(html).not.toContain('card')
    expect(text.toLowerCase()).not.toContain('get started')
    expect(text.toLowerCase()).not.toContain('sign up')
    expect(text.toLowerCase()).not.toContain('trusted by')
  })

  it('shows the product itself, not a picture of one', () => {
    /* The one image is a tile from the same basemap the map uses. */
    const images = [...html.matchAll(/<img[^>]*src="([^"]*)"/g)].map((m) => m[1])
    expect(images).toHaveLength(1)
    expect(images[0]).toContain('World_Imagery/MapServer/tile')
    /* With the app's own overlays on it, not a caption describing them. */
    for (const part of ['hero__cone', 'hero__ray--sun', 'hero__ray--shadow', 'hero__disc']) {
      expect(html, part).toContain(part)
    }
  })

  it('credits the imagery and says whose place it is', () => {
    expect(text).toContain('An example venue, not your location')
    expect(text).toContain('Esri')
  })

  /*
   * AND NO COORDINATE ON THE FIRST SCREEN. The app does not know where you
   * are and does not ask; a latitude on the cold start reads as your own.
   */
  it('prints no coordinate', () => {
    expect(text).not.toMatch(/\d{1,3}\.\d{3,}/)
  })
})

/*
 * THE COLD START. "Opening on the mid-Atlantic is useless... put my saved
 * spots on that screen." And the rule that forbids the other answer stands.
 */
describe('the cold start offers saved spots', () => {
  const spot = (id: string, name: string, savedAt: string): Spot => ({
    id,
    name,
    savedAt,
    venue: {
      name,
      latitude: '36.7362',
      longitude: '-75.9360',
      date: '2026-10-18',
      startTime: '15:00',
      endTime: '19:00',
      eventDescription: '',
      desiredOutcome: '',
      subjectAcrossMeters: '',
    },
    kit: { bodyIds: [], lensIds: [], droneIds: [], styleNotes: '' },
    positions: [],
  })

  const spots = [
    spot('a', 'Sandbridge', '2026-10-18T12:00:00.000Z'),
    spot('b', 'Lesner Bridge', '2026-10-11T12:00:00.000Z'),
  ]

  it('lists them, most recent first', () => {
    const out = renderToStaticMarkup(<ColdStart spots={spots} onLoad={() => {}} />)
    expect(out.indexOf('Sandbridge')).toBeLessThan(out.indexOf('Lesner Bridge'))
  })

  it('says the app does not know where you are, and does not ask', () => {
    const out = renderToStaticMarkup(<ColdStart spots={spots} onLoad={() => {}} />)
    expect(out).toContain('does not know where you are')
    expect(out).toContain('does not ask')
  })

  /* A first run has nothing true to show, so it shows nothing. */
  it('renders nothing with no spots saved', () => {
    expect(renderToStaticMarkup(<ColdStart spots={[]} onLoad={() => {}} />)).toBe('')
  })

  /* Six is enough to find a place; a long list is a different screen. */
  it('shows at most six', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      spot(`s${i}`, `Spot ${i}`, `2026-10-${String(i + 1).padStart(2, '0')}T12:00:00.000Z`),
    )
    const out = renderToStaticMarkup(<ColdStart spots={many} onLoad={() => {}} />)
    expect(out.match(/cold__spot/g)).toHaveLength(6)
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
