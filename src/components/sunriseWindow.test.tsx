import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SunReadout } from './SunReadout.tsx'
import { resolveWindow } from '../lib/venue.ts'
import { EMPTY_VENUE } from '../lib/venue.ts'

/*
 * THE SUNRISE WINDOW THAT WAS BEING DESCRIBED FALSELY.
 *
 * Lesner Bridge, Lynnhaven Inlet, 20 October 2026. Sunrise is 07:15 local, and
 * the window below runs 06:00 to 07:45, which is the shoot: backlit cloud over
 * the inlet with the sandbars coming out.
 *
 * What the readout said before: "Sun is below the horizon for part of this
 * window. There is nothing to light a position with." Every sample from -15.5
 * to -0.7 degrees got that line, which is night, nautical and afterglow. For
 * this shot it is not merely unhelpful, it is false.
 */
const LESNER = {
  ...EMPTY_VENUE,
  name: 'Lesner Bridge',
  latitude: '36.9063',
  longitude: '-76.0836',
  date: '2026-10-20',
  startTime: '06:00',
  endTime: '07:45',
}

const html = renderToStaticMarkup(<SunReadout venueWindow={resolveWindow(LESNER)} />)

describe('a pre-sunrise window is described, not dismissed', () => {
  it('no longer says there is nothing to light a position with', () => {
    expect(html).not.toContain('nothing to light')
  })

  /*
   * ALL SIX BANDS, not the three that happen to be sampled.
   *
   * The visible table shows start, middle and end, which here land on night,
   * blue hour peak and late golden. The window crosses six: naming it from the
   * three samples would skip nautical, afterglow and the horizon crossing
   * itself. The foot prints one sentence per band actually crossed.
   */
  it('names every band the window crosses, in order', () => {
    const notes = [
      'Sun more than 12° under',          // night
      'Sun 6 to 12° under',               // nautical
      'Sun 4 to 6° under',                // blue hour peak
      'Sun just under',                   // afterglow
      'Sun on the horizon',               // the crossing itself
      'Sun under 6°',                     // late golden
    ]
    for (const note of notes) expect(html, note).toContain(note)
    // And in the order the sun actually moved through them.
    const positions = notes.map((n) => html.indexOf(n))
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('shows the sampled band in each column of the table', () => {
    expect(html).toContain('>night<')
    expect(html).toContain('>blue hour peak<')
    expect(html).toContain('>late golden<')
  })

  it('says the sky is carrying the picture', () => {
    expect(html).toContain('readout__sky')
    expect(html).toContain('the sky carries the picture')
    expect(html).toContain('backlit cloud')
  })

  /*
   * THE WARNING SURVIVES, SCOPED TO WHAT IT IS TRUE OF. A face on the ground
   * really does have no light on it before sunrise. That is a limit on a lit
   * face, and the sentence says so rather than calling the shoot empty.
   */
  it('keeps the ground subject limit, worded as a limit on a lit face', () => {
    expect(html).toContain('readout__night')
    expect(html).toContain('no direct light on its face')
    expect(html).toContain('not on the shoot')
  })

  it('calls no band a failure', () => {
    const text = html.replace(/<[^>]*>/g, ' ').toLowerCase()
    for (const phrase of ['no shot', 'unusable', 'too dark to', 'nothing to shoot']) {
      expect(text).not.toContain(phrase)
    }
  })
})

/*
 * AND THE SUNSET SIDE, which is the same shoot the other way round.
 */
describe('a post-sunset window', () => {
  const dusk = renderToStaticMarkup(
    <SunReadout
      venueWindow={resolveWindow({ ...LESNER, startTime: '18:10', endTime: '19:30' })}
    />,
  )

  it('is described in bands rather than dismissed', () => {
    expect(dusk).not.toContain('nothing to light')
    expect(dusk).toContain('readout__sky')
  })

  it('crosses the horizon and reports both sides of it', () => {
    // The crossing, and the afterglow on the far side of it.
    expect(dusk).toContain('Sun on the horizon')
    expect(dusk).toContain('Sun just under')
    expect(dusk).toContain('Sun 4 to 6° under')
  })

  /* The same six bands, in the reverse order, because the sun is going down. */
  it('runs the bands downward', () => {
    const first = dusk.indexOf('Sun under 6°')
    const last = dusk.indexOf('Sun more than 12° under')
    expect(first).toBeGreaterThan(-1)
    expect(last).toBeGreaterThan(first)
  })
})
