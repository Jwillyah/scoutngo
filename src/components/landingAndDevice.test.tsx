import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ColdStart } from './ColdStart.tsx'
import { Landing } from './Landing.tsx'
import { OnThisDevice } from './OnThisDevice.tsx'
import type { Spot } from '../lib/spots.ts'

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

  it('states the rule the whole app is built on', () => {
    expect(text).toContain('The model proposes, code computes')
    expect(text.toLowerCase()).toContain('arithmetic')
  })

  it('states the privacy as a feature rather than an apology', () => {
    expect(text).toContain('No account')
    expect(text).toContain('No database')
    expect(text).toContain('No analytics')
    /* And says what DOES leave, because the claim is worthless if it is vague. */
    expect(text.toLowerCase()).toContain('what does leave the device')
  })

  it('ends with one button', () => {
    expect(text).toContain('Dive in')
    const buttons = html.match(/<button/g) ?? []
    expect(buttons).toHaveLength(1)
  })

  /*
   * AND NOTHING ELSE. "Content, no more than this." A fifth section is scope
   * creep on a page whose whole virtue is being short.
   */
  it('has exactly three sections', () => {
    expect(html.match(/class="land__sec"/g)).toHaveLength(3)
  })

  /* The vernacular: no cards, no stock photography, no SaaS furniture. */
  it('has no imagery and no feature grid', () => {
    expect(html).not.toContain('<img')
    expect(html).not.toContain('card')
    expect(text.toLowerCase()).not.toContain('get started')
    expect(text.toLowerCase()).not.toContain('sign up')
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
