import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LatLon } from '../core/geo.ts'
import { phaseAt, phaseSpans } from '../core/nightWindow.ts'
import { getSunPosition } from '../core/sun.ts'
import { AirspacePanel } from './AirspacePanel.tsx'
import { SunSearchPanel } from './SunSearchPanel.tsx'
import { TimeScrubber } from './TimeScrubber.tsx'

const SANDBRIDGE: LatLon = { lat: 36.726, lon: -75.94 }
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

/*
 * THE EVENING THE REPORT CAME FROM. Sunset 18:27 local, dusk 18:53. A window
 * ending at 19:30 crosses day, civil twilight and night, so the bar must show
 * three bands and the requirements must change twice across it.
 */
const WINDOW_START = new Date('2026-10-15T21:00:00Z') // 17:00 EDT
const WINDOW_END = new Date('2026-10-15T23:30:00Z') // 19:30 EDT

function scrubber(at: Date) {
  return renderToStaticMarkup(
    <TimeScrubber
      start={WINDOW_START}
      end={WINDOW_END}
      value={0.5}
      onChange={() => {}}
      at={at}
      sun={getSunPosition(at, SANDBRIDGE.lat, SANDBRIDGE.lon)}
      timeZone="America/New_York"
      timeZoneAbbr="EDT"
      tideExtremes={[]}
      phases={phaseSpans(WINDOW_START, WINDOW_END, SANDBRIDGE.lat, SANDBRIDGE.lon)}
      phase={phaseAt(at, SANDBRIDGE.lat, SANDBRIDGE.lon)}
    />,
  )
}

describe('the bands on the time axis', () => {
  const html = scrubber(new Date('2026-10-15T21:30:00Z'))

  it('draws one band per phase the window crosses', () => {
    expect(html).toContain('scrub__phase--day')
    expect(html).toContain('scrub__phase--civil-twilight')
    expect(html).toContain('scrub__phase--night')
  })

  it('draws them as a contiguous run of the whole track', () => {
    const widths = [...html.matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]))
    expect(widths.length).toBeGreaterThanOrEqual(3)
    const total = widths.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(100, 1)
  })

  it('is hidden from the accessibility tree, being a stratum not a control', () => {
    expect(html).toMatch(/class="scrub__phases"\s+aria-hidden="true"/)
  })
})

describe('what the bar says at each moment', () => {
  /* 17:30 EDT: full daylight. Nothing applies and nothing is claimed. */
  it('says nothing in daylight', () => {
    const html = scrubber(new Date('2026-10-15T21:30:00Z'))
    expect(text(html)).not.toContain('Anti-collision')
    expect(html).not.toContain('scrub__rule-need')
  })

  /*
   * 18:48 EDT: inside the window the app reported as blue hour peak and said
   * nothing about. This is the regression, rendered.
   */
  it('requires anti-collision lighting in civil twilight', () => {
    const html = scrubber(new Date('2026-10-15T22:48:00Z'))
    const shown = text(html)
    expect(shown).toContain('Civil twilight')
    expect(shown).toContain('Anti-collision lights')
    expect(shown).toContain('107.29')
    expect(shown).toContain('3 statute miles')
    expect(shown).toContain('never be switched off in flight')
  })

  /* And it does NOT add the night training, which starts later, at dusk. */
  it('does not claim the night training in civil twilight', () => {
    const shown = text(scrubber(new Date('2026-10-15T22:48:00Z')))
    expect(shown).not.toContain('107.65')
  })

  it('adds the night training after dusk', () => {
    const shown = text(scrubber(new Date('2026-10-15T23:20:00Z')))
    expect(shown).toContain('Night')
    expect(shown).toContain('107.29')
    expect(shown).toContain('107.65')
    expect(shown).toContain('night operations training')
  })
})

describe('the airspace panel', () => {
  const render = (venue: LatLon | null, altitudeFeet: number | null) =>
    renderToStaticMarkup(<AirspacePanel venue={venue} altitudeFeet={altitudeFeet} />)

  it('asks for a venue when there is none', () => {
    expect(text(render(null, 200))).toContain('Set a venue')
  })

  /*
   * Norfolk Intl: a real Class C surface area with a zero ceiling and no LAANC
   * route listed. The answer is the manual path, and the panel says why.
   */
  it('reports the manual path at a zero-ceiling cell', () => {
    const shown = text(render({ lat: 36.8946, lon: -76.2012 }, 200))
    expect(shown).toContain('DroneZone application')
    expect(shown).toContain('0 ft AGL')
    expect(shown).toContain('Norfolk Intl')
  })

  /*
   * A DASH, NOT A ZERO, outside coverage. A 0 would read as a measured
   * ground-level ceiling, which is a different and much worse answer than
   * "there is no cell here".
   */
  it('prints a dash rather than a zero where there is no cell', () => {
    const html = render(SANDBRIDGE, 200)
    expect(html).toContain('air__dash')
    expect(text(html)).toContain('no facility-map cell')
    expect(text(html)).toContain('absence of data')
  })

  it('reports the ceiling but no route with nothing in the air', () => {
    const shown = text(render({ lat: 36.8946, lon: -76.2012 }, null))
    expect(shown).toContain('No air position in the plan')
    expect(shown).not.toContain('DroneZone application')
  })

  it('carries the FAA credit and the informational wording', () => {
    const shown = text(render(SANDBRIDGE, 200))
    expect(shown).toContain('Federal Aviation Administration')
    expect(shown).toContain('Not endorsed by or affiliated with the FAA')
    expect(shown).toContain('do not grant authorization')
  })

  /* Silence about TFRs would be the same lie as an unmarked power line. */
  it('says plainly that TFRs are not checked', () => {
    const shown = text(render(SANDBRIDGE, 200))
    expect(shown).toContain('NOT checked')
    expect(shown).toContain('tfr.faa.gov')
  })

  it('states the chart cycle it is answering from', () => {
    expect(text(render(SANDBRIDGE, 200))).toContain('Chart cycle effective')
  })
})

/*
 * THE WORDING, ON THE RENDERED TEXT. Same rule and same reason as the Part 107
 * altitude card: the source says things like "not a statement about whether
 * this flight is permitted" and a source scan would match its own explanation.
 *
 * The FAA's process NAMES are allowed. "the auto-approval route" describes a
 * process; "this flight is approved" is a verdict. Verdicts are what is banned.
 */
describe('the airspace wording states no legal conclusion', () => {
  const BANNED = [
    'cleared',
    'compliant',
    'compliance',
    'legal',
    'illegal',
    'lawful',
    'unlawful',
    'permitted',
    'you may fly',
    'safe to fly',
    'ok to fly',
    'allowed to fly',
    'you can fly',
    'no restrictions',
    'free to fly',
    'clear of',
    'is approved',
    'are approved',
    'good to go',
    'violation',
  ]

  const CASES: [string, LatLon, number | null][] = [
    ['outside coverage', SANDBRIDGE, 200],
    ['zero ceiling', { lat: 36.8946, lon: -76.2012 }, 200],
    ['no route listed', { lat: 18.4125, lon: -66.0792 }, 100],
    ['inside Class B', { lat: 38.8512, lon: -77.0402 }, 300],
    ['nothing in the air', SANDBRIDGE, null],
  ]

  for (const [label, venue, altitude] of CASES) {
    it(`says nothing conclusive: ${label}`, () => {
      const shown = text(
        renderToStaticMarkup(<AirspacePanel venue={venue} altitudeFeet={altitude} />),
      ).toLowerCase()
      for (const phrase of BANNED) {
        expect(shown, `${label} contains "${phrase}"`).not.toContain(phrase)
      }
    })
  }

  it('would catch a verdict if one were written', () => {
    const bad = 'This flight is approved and compliant, you may fly.'.toLowerCase()
    expect(BANNED.some((p) => bad.includes(p))).toBe(true)
  })

  /*
   * The airspace half of this panel resolves asynchronously, so a static
   * render shows its loading line rather than its answer. That line is
   * asserted here; the sentence it resolves to is a constant in core and is
   * held to the banned-word rule there, in airspaceLookup.test.ts.
   */
  it('says it is reading, rather than showing an answer it does not have yet', () => {
    const shown = text(renderToStaticMarkup(<AirspacePanel venue={SANDBRIDGE} altitudeFeet={200} />))
    expect(shown).toContain('Reading the airspace extract')
  })
})

describe('the reverse sun search', () => {
  const render = (over: Partial<Parameters<typeof SunSearchPanel>[0]> = {}) =>
    renderToStaticMarkup(
      <SunSearchPanel
        venue={SANDBRIDGE}
        timeZone="America/New_York"
        timeZoneAbbr="EDT"
        target={null}
        onPickTarget={() => {}}
        picking={false}
        {...over}
      />,
    )

  it('asks for a venue when there is none', () => {
    expect(text(render({ venue: null }))).toContain('Set a venue first')
  })

  it('asks for a bearing or a point before searching', () => {
    expect(text(render())).toContain('Pick a point or type a bearing')
  })

  it('offers both ways in, a tapped point and a typed bearing', () => {
    const shown = text(render())
    expect(shown).toContain('Tap a thing to aim at')
    expect(shown).toContain('Or a bearing')
  })

  /*
   * A tapped point and a typed bearing must visibly be the SAME question. Two
   * inputs for one number is a trap unless one is shown as derived from the
   * other, so the field fills in with the derived bearing and locks.
   */
  it('shows the bearing a tapped point implies, and locks the field', () => {
    const html = render({ target: { lat: 36.6, lon: -76.3 } })
    const shown = text(html)
    expect(shown).toContain('from the pin')
    expect(shown).toContain('The search is the same either way')
    expect(html).toContain('disabled')
  })

  it('reports the aim as armed while picking', () => {
    const html = render({ picking: true })
    expect(html).toContain('aria-pressed="true"')
    expect(text(html)).toContain('Tap the map')
  })
})
