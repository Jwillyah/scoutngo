import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { assessCoverage, assessRangeVariety } from '../core/coverage.ts'
import { isReceipt, NUMERALS_DEFAULT, type NumeralKind } from '../core/numerals.ts'
import { resolveWindow } from '../lib/venue.ts'
import { NumeralsProvider } from '../lib/numerals.tsx'
import { CamList } from './CamList.tsx'
import { DEFAULT_UNITS } from '../lib/units.ts'
import { CoverageNotice } from './CoverageNotice.tsx'
import { SunReadout } from './SunReadout.tsx'
import { TimeStrip } from './TimeStrip.tsx'
import { PhaseRule } from './PhaseRule.tsx'
import { VenuePlate } from './VenuePlate.tsx'

const VENUE = { lat: 36.726, lon: -75.94 }

const both = (node: ReactElement) => ({
  on: renderToStaticMarkup(<NumeralsProvider show>{node}</NumeralsProvider>),
  off: renderToStaticMarkup(<NumeralsProvider show={false}>{node}</NumeralsProvider>),
})

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/* A clustered plan on one bank, which is what makes CoverageNotice warn. */
const CLUSTERED = {
  coverage: assessCoverage([250, 255, 262, 258]),
  rangeVariety: assessRangeVariety([
    { rangeMeters: 180, maxStandoffMeters: 200 },
    { rangeMeters: 190, maxStandoffMeters: 200 },
  ]),
}

const WINDOW = resolveWindow({
  name: { key: `${'36.726000'}|${'-75.940000'}`, name: 'Test' },
  latitude: '36.726000',
  longitude: '-75.940000',
  date: '2026-10-15',
  startTime: '17:00',
  endTime: '19:30',
  eventDescription: '',
  desiredOutcome: '',
  subjectAcrossMeters: '',
})

const SUBJECTS: { label: string; node: ReactElement }[] = [
  {
    label: 'the time bar',
    node: (
      <TimeStrip
        start={new Date('2026-10-15T21:00:00Z')}
        end={new Date('2026-10-15T23:30:00Z')}
        value={0.5}
        onChange={() => {}}
        at={new Date('2026-10-15T22:00:00Z')}
        timeZone="America/New_York"
        timeZoneAbbr="EDT"
        phases={[]}
      />
    ),
  },
  { label: 'the coverage notice', node: <CoverageNotice planCoverage={CLUSTERED} /> },
  {
    label: 'the camera list',
    node: <CamList venue={VENUE} wind={{ fromDegrees: 230, speedMps: 6 }} units={DEFAULT_UNITS} kind="coast" onKind={() => {}} />,
  },
  { label: 'the sun readout', node: <SunReadout venueWindow={WINDOW} /> },
  {
    label: 'the venue plate',
    node: (
      <VenuePlate
        state={{ kind: 'name', name: 'Test' }}
        latitude="38.3642"
        longitude="-75.6059"
        at={VENUE}
      />
    ),
  },
  /*
   * THE PHASE RULE, which used to be inside the time bar and is now its own
   * component on the light card. It is in this sweep for the same reason it
   * was before: 107.29 and 107.65 are prose a shooter acts on, and the
   * numerals switch must never take a sentence with it.
   */
  {
    label: 'the phase rule',
    node: <PhaseRule phase="civil-twilight" flying={{ airPositions: 1, dronePlatform: true }} />,
  }
]

/*
 * THE ASSERTION THE WHOLE SWITCH HAS TO SURVIVE.
 *
 * Quiet is not the same as simple. Hiding a bearing is tidying; hiding a
 * warning or a caveat is lying by omission, and the difference is the entire
 * reason this is one disclosure rather than a "simple mode". Every one of
 * these sentences is either a warning about the plan or a statement about how
 * much the app actually knows, and every one of them must read identically
 * with the numbers off.
 */
const MUST_SURVIVE: { label: string; node: ReactElement; lines: string[] }[] = [
  {
    label: 'the coverage notice',
    node: <CoverageNotice planCoverage={CLUSTERED} />,
    lines: [
      'Clustered',
      'That is a plan that sees the event from one side',
      'Nothing on the far side',
      'There is no reverse angle here, and no backlit option to weigh up',
    ],
  },
  {
    label: 'the camera list',
    node: <CamList venue={VENUE} wind={{ fromDegrees: 230, speedMps: 6 }} units={DEFAULT_UNITS} kind="coast" onKind={() => {}} />,
    lines: [
      'This list is a file in the app',
      'nothing about your venue is sent anywhere',
      'Tapping a camera opens that operator',
    ],
  },
  {
    label: 'the camera list with no wind yet',
    node: <CamList venue={VENUE} wind={null} units={DEFAULT_UNITS} kind="coast" onKind={() => {}} />,
    lines: ['The wind has not come back yet, so nothing here is ranked by what is upwind'],
  },
]

describe('the one switch', () => {
  it('is off by default, so the words are what you get', () => {
    expect(NUMERALS_DEFAULT).toBe(false)
  })

  it('classifies receipts and keeps everything actionable', () => {
    const hidden: NumeralKind[] = ['bearing', 'solar', 'coordinate', 'focal']
    const kept: NumeralKind[] = ['actionable', 'time', 'count']
    for (const kind of hidden) expect(isReceipt(kind), kind).toBe(true)
    for (const kind of kept) expect(isReceipt(kind), kind).toBe(false)
  })
})

describe('turning the numbers off removes no warning and no honesty line', () => {
  for (const { label, node, lines } of MUST_SURVIVE) {
    it(`keeps every one of them in ${label}`, () => {
      const { on, off } = both(node)
      for (const line of lines) {
        expect(text(on), `${label}: missing with numbers ON`).toContain(line)
        expect(text(off), `${label}: LOST with numbers off`).toContain(line)
      }
    })
  }

  /*
   * And the general form of the same thing, scoped to PROSE.
   *
   * WHY NOT EVERY WORD. The first version of this compared every word and
   * failed on three legitimate cases: the time bar's "Alt" label, the
   * coverage notice's "spread", and the camera list's "off the wind". All
   * three are words that exist only to label a hidden number, and a label with
   * nothing after it is worse than no label. So hiding a receipt is allowed to
   * take its own label with it.
   *
   * What is NOT allowed is losing a sentence. A warning and an honesty line
   * are prose, so the rule is that every sentence of six words or more still
   * appears, matched on its opening words so a trimmed numeric tail is fine
   * and a deleted sentence is not.
   */
  /*
   * PER BLOCK ELEMENT, not per full stop.
   *
   * Splitting the whole stripped page on sentence boundaries put the time
   * bar's readout row and its 107.29 rule into one chunk, because "255.5°"
   * and "107.29" contain full stops and the row carries none. Prose in this
   * app lives in a paragraph or a list item, so those are what is compared.
   */
  const prose = (html: string) =>
    [...html.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/g)]
      .map((m) => text(m[2]))
      .filter((line) => line.split(/\s+/).length >= 6)

  const opening = (line: string) => line.split(/\s+/).slice(0, 5).join(' ')

  for (const { label, node } of SUBJECTS) {
    it(`loses no sentence in ${label}`, () => {
      const { on, off } = both(node)
      const offText = text(off)
      const lost = prose(on).filter((line) => !offText.includes(opening(line)))
      expect(lost, `${label} lost prose`).toEqual([])
    })
  }
})

describe('turning the numbers off does remove the numbers', () => {
  /* The switch has to actually do something, or the test above passes forever. */
  /*
   * THE TIME BAR HAS NO RECEIPTS LEFT TO DROP.
   *
   * This asserted that turning numbers off removed "255.5°" from the bar.
   * The bar carried Az and Alt in degrees; it is a 34px control now and
   * carries neither, because the light card already printed both from the
   * same core call -- two sources for one fact, to different precisions.
   *
   * SO THE ASSERTION IS THE OTHER HALF OF THE OLD ONE: the clock survives
   * the switch, because a clock is not a receipt. The degrees are still
   * tested where they still exist, on the sun readout, below.
   */
  it('keeps the clock on the time bar with numbers off, and shows no degrees either way', () => {
    const { on, off } = both(SUBJECTS[0].node)
    expect(on).not.toMatch(/\d+\.\d°/)
    expect(off).not.toMatch(/\d+\.\d°/)
    expect(text(off)).toMatch(/\d{1,2}:\d{2}/)
  })

  it('drops the coordinates from the venue plate', () => {
    const { on, off } = both(SUBJECTS[4].node)
    expect(on).toContain('36.72600')
    expect(off).not.toContain('36.72600')
    /*
     * The name stays. Asserted on the markup rather than the stripped text
     * because the plate renders it as an input VALUE, and an attribute is not
     * text content.
     */
    expect(off).toContain('>Test<')
  })

  it('drops the solar degrees from the sun readout', () => {
    const { on, off } = both(SUBJECTS[3].node)
    expect(on).toMatch(/\d+\.\d°/)
    expect(off).not.toMatch(/\d+\.\d°/)
  })

  it('keeps the wind speed, which is a number you act on', () => {
    const { off } = both(SUBJECTS[2].node)
    expect(text(off)).toContain('m/s')
    expect(text(off)).toMatch(/\d/)
  })
})
