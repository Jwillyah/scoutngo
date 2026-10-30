import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ColdStart } from './ColdStart.tsx'
import { Landing } from './Landing.tsx'
import { HowPage } from './HowPage.tsx'
import { OnThisDevice } from './OnThisDevice.tsx'
import type { Spot } from '../lib/spots.ts'

const text_ = (markup: string) =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

const html = renderToStaticMarkup(<Landing onDismiss={() => {}} />)
const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

/*
 * THE COVER IS FIVE ELEMENTS AND TWO QUIET LINES, AND NOTHING ELSE.
 *
 * The list is the specification, so the test is a count as well as a content
 * check: a sixth element added in six months fails here rather than being
 * noticed on a phone.
 */
describe('the cover carries five elements and stops', () => {
  it('leads with the wordmark and the line', () => {
    expect(text).toContain('ScoutNGo')
    expect(text).toContain('Plan the shot before you go.')
  })

  it('has exactly one primary action and it says what it does', () => {
    expect(html.match(/class="cover__go"/g)).toHaveLength(1)
    expect(text).toContain('Open the map')
  })

  it('carries the two quiet lines, in their places', () => {
    /* How it works, and since 29 Oct Privacy (the brief: /privacy linked from the home footer). */
    expect(html.match(/class="cover__more"/g)).toHaveLength(2)
    expect(text).toContain('Free · open source · no account · Privacy · How it works')
  })

  it('carries no photograph (30 Oct): no personal photos anywhere public', () => {
    expect([...html.matchAll(/<img[^>]*src="([^"]*)"/g)]).toHaveLength(0)
  })

  it('carries no scrubbing control, because a still frame cannot have one', () => {
    /*
     * The cover briefly carried a real time scrubber, computed from the
     * calibration venue. It was real arithmetic and still the wrong thing:
     * this page is a picture of the app, and a slider on a picture is a
     * control that cannot do anything.
     *
     * ASSERTED AS A PROPERTY, NOT AS THREE CLASS NAMES. It was
     * `not.toContain('scrub__range')` and two more like it -- a blocklist of
     * spellings, which passes the moment somebody renames the thing it is
     * watching for. That happened: the scrubber became the time strip and
     * every one of those three names stopped existing, so the test went on
     * passing while checking nothing. Shape C in docs/failure-modes.md, and
     * the guard rule there is to assert the positive property instead.
     *
     * The property is that the cover holds no slider of any kind. The GO
     * button is a control and is meant to be there, so this cannot simply
     * forbid interactivity.
     */
    expect(html).not.toContain('type="range"')
    expect(html).not.toContain('role="slider"')
    expect(html).not.toMatch(/<input\b/)
  })

  it('orders the copy: wordmark, line, the three lines, button, footer with its links', () => {
    const order = ['cover__name', 'cover__head', 'cover__lines', 'cover__go', 'cover__licence', 'cover__more']
    const at = order.map((c) => html.indexOf(c))
    expect(at.every((i) => i >= 0)).toBe(true)
    for (let i = 1; i < at.length; i += 1) expect(at[i]).toBeGreaterThan(at[i - 1] ?? -1)
  })

  it('credits no photographer: there is no photograph', () => {
    expect(html).not.toContain('cover__attrib')
    expect(text).not.toMatch(/Photo by/)
  })

  /*
   * WHAT WAS DELETED FROM THE COVER. Each of these was on it and is now on
   * /how. The point of naming them here is that a future edit that drags one
   * back onto the cover fails a test rather than quietly undoing the pass.
   */
  it('no longer carries the three stages, the two rule blocks or the build hash', () => {
    expect(text).not.toContain('Three stages')
    expect(text).not.toContain('Before the day')
    expect(text).not.toMatch(/\bComputed\b\s*Every number/)
    expect(text).not.toContain('Yours')
    expect(text).not.toContain('Build ')
    expect(text).not.toContain('this page is in Settings')
  })

  /* The four feature tiles were asked for by name; the rest of the furniture still is not. */
  it('has no SaaS furniture', () => {
    expect(html).not.toContain('card')
    expect(text.toLowerCase()).not.toContain('get started')
    expect(text.toLowerCase()).not.toContain('sign up')
    expect(text.toLowerCase()).not.toContain('trusted by')
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
    expect(how).toContain('Temporary flight restrictions are not checked')
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
 * THE COLD START. "Opening on the mid-Atlantic is useless... put my saved
 * spots on that screen." And the rule that forbids the other answer stands.
 */
describe('the cold start offers saved spots', () => {
  const spot = (id: string, name: string, savedAt: string): Spot => ({
    id,
    name,
    savedAt,
    venue: {
      name: { key: '36.7362|-75.9360', name },
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
