import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MAX_ALTITUDE_FEET, pilotSeparation } from '../core/air.ts'
import type { LatLon } from '../core/geo.ts'
import { defaultSelection } from '../lib/kitSelection.ts'
import { DEFAULT_KIT } from '../core/kit.ts'
import { getSunPosition } from '../core/sun.ts'
import { planPositions, type CameraPosition } from '../lib/plan.ts'
import { PlatformFilter } from './PlatformFilter.tsx'
import { PositionCard } from './PositionCard.tsx'

const VENUE: LatLon = { lat: 38.364236, lon: -75.605912 }
const SUBJECT: LatLon = { lat: 38.3639, lon: -75.6058 }
const PILOT: LatLon = { lat: 38.3652, lon: -75.6071 }
/*
 * THE WHOLE SUN, because planPosition takes a SunPosition now rather than a
 * bare azimuth: a top-down read needs the altitude for shadow length and a 360
 * read needs it for where the sun sits against the horizon ring.
 */
const sun = getSunPosition(new Date('2026-09-12T13:00:00-04:00'), VENUE.lat, VENUE.lon)

const air = (over: Partial<CameraPosition> = {}): CameraPosition => ({
  id: 'a1',
  number: 1,
  at: { lat: 38.3648, lon: -75.6055 },
  lensId: 'air-3s-wide',
  focalLength: 24,
  shot: 'Top down on the dock.',
  risk: 'Gulls.',
  angleRationale: 'Shows the whole layout at once.',
  coversShot: null,
  platform: 'air',
  altitudeFeet: 200,
  shotType: 'framed',
  yawDegrees: 0,
  moved: false,
  origin: 'manual',
  ...over,
})

/** The same card on a GROUND position, for the either-way assertions. */
const groundCard = () =>
  card(PILOT, { platform: 'ground', altitudeFeet: 0, lensId: 'sony-200-600', focalLength: 400 })

const card = (pilotAt: LatLon | null, over: Partial<CameraPosition> = {}) =>
  renderToStaticMarkup(
    <PositionCard
      planned={planPositions([air(over)], SUBJECT, sun)[0]}
      shootAt={null}
      timeZone={null}
      tide={null}
      onClose={() => {}}
      count={1}
      onDelete={() => {}}
      onDuplicate={() => {}}
      onMove={() => {}}
      onSetOptic={() => {}}
      onSetAltitude={() => {}}
      onSetShotType={() => {}}
      onSetYaw={() => {}}
      kit={DEFAULT_KIT}
        selection={defaultSelection(DEFAULT_KIT)}
      pilotAt={pilotAt}
      onPlacePilot={() => {}}
    />,
  )

describe('the altitude is a field, not a printed number', () => {
  const html = card(null)

  it('offers an editable altitude', () => {
    expect(html).toContain('type="number"')
    expect(html).toContain('aria-label="Camera height, feet above ground level"')
    expect(html).toContain('value="200"')
  })

  it('caps the field at 400 feet', () => {
    expect(html).toContain(`max="${MAX_ALTITUDE_FEET}"`)
    expect(html).toContain('400')
  })
})

/*
 * THE WORDING. This is checked on the RENDERED TEXT rather than the source,
 * because the source says things like "not a statement about whether this
 * flight is permitted" and a source scan would match its own explanation.
 *
 * The rule: compute the distance, show it, and let the reader make the
 * judgement. The app does not state a legal conclusion, and nothing in it is
 * described as cleared or compliant. Whether a flight can happen depends on
 * the airspace, the aircraft and the operator, and this app knows none of them.
 */
describe('the air wording states no legal conclusion', () => {
  const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

  const BANNED = [
    'cleared',
    'compliant',
    'compliance',
    'legal',
    'illegal',
    'lawful',
    'unlawful',
    'approved',
    'authorised',
    'authorized',
    'permission granted',
    'safe to fly',
    'ok to fly',
    'you may fly',
    'allowed to fly',
    'within limits',
    'within the rules',
    'violation',
  ]

  for (const pilot of [null, PILOT]) {
    const label = pilot === null ? 'with no pilot placed' : 'with the pilot placed'
    it(`says nothing conclusive ${label}`, () => {
      const shown = text(card(pilot)).toLowerCase()
      for (const phrase of BANNED) {
        expect(shown, `rendered card contains "${phrase}"`).not.toContain(phrase)
      }
    })
  }

  /*
   * The check has to be able to fail. Without this, a rename that broke the
   * stripper would leave a test that passes on every input.
   */
  it('would catch a legal conclusion if one were written', () => {
    const shown = text('<p>This flight is <b>cleared</b> and compliant.</p>').toLowerCase()
    expect(BANNED.some((phrase) => shown.includes(phrase))).toBe(true)
    expect(shown).toContain('cleared')
    // And the stripper really does reach text inside nested tags.
    expect(text('<p>a<span>b</span>c</p>').replace(/ /g, '')).toBe('abc')
  })

  it('states the ceiling as the rule, not as a verdict on this flight', () => {
    const shown = text(card(PILOT))
    expect(shown).toContain('Part 107 sets the altitude limit at 400 ft above ground level')
  })

  it('calls the pilot numbers measurements and says what they are not', () => {
    const shown = text(card(PILOT))
    expect(shown).toContain('Measured distances')
    expect(shown).toContain('not a statement about whether this flight is permitted')
  })
})

/*
 * THE PILOT LINE'S LENGTH. Two numbers, both measured in core, and they have to
 * be the numbers core computed rather than something the card worked out again.
 */
describe('the pilot separation is shown', () => {
  it('shows both the ground distance and the real one', () => {
    const html = card(PILOT)
    const separation = pilotSeparation(PILOT, air().at, 200)
    expect(separation.slantMeters).toBeGreaterThan(separation.horizontalMeters)
    expect(html).toContain('Pilot, across ground')
    expect(html).toContain('Pilot to aircraft')
    // The metre figures core produced, rounded as the reach formatter does.
    expect(html).toContain(`${Math.round(separation.horizontalMeters)} m`)
    expect(html).toContain(`${Math.round(separation.slantMeters)} m`)
  })

  it('asks for a pilot position rather than showing a blank, when there is none', () => {
    const html = card(null)
    expect(html).toContain('Place the pilot position')
    expect(html).not.toContain('Pilot to aircraft')
  })

  /*
   * A GROUND POSITION GETS NONE OF THIS. There is no altitude to set and no
   * aircraft to be separated from.
   */
  it('shows nothing of the sort on a ground position', () => {
    const ground = groundCard()
    expect(ground).not.toContain('ft AGL')
    expect(ground).not.toContain('Pilot to aircraft')
  })
})

describe('the Ground / Air / Both control', () => {
  const render = (over: Partial<Parameters<typeof PlatformFilter>[0]> = {}) =>
    renderToStaticMarkup(
      <PlatformFilter
        value="both"
        onChange={() => {}}
        counts={{ ground: 3, air: 2 }}
        hidden={0}
        airAvailable
        {...over}
      />,
    )

  it('offers all three', () => {
    const html = render()
    expect(html).toContain('Both')
    expect(html).toContain('Ground')
    expect(html).toContain('Air')
  })

  it('carries the counts, so an empty tab looks empty before it is tapped', () => {
    const html = render()
    expect(html).toContain('>3<')
    expect(html).toContain('>2<')
  })

  /* A filter that silently hides positions is a plan quietly missing the day. */
  it('says how many it is hiding', () => {
    expect(render({ value: 'air', hidden: 3 })).toContain('3 positions hidden')
    expect(render({ value: 'air', hidden: 1 })).toContain('1 position hidden')
    expect(render({ hidden: 0 })).not.toContain('hidden')
  })

  it('disables Air when there is no drone in the kit', () => {
    expect(render({ airAvailable: false })).toContain('disabled=""')
    expect(render({ airAvailable: false })).toContain('No drone in the kit.')
  })
})

/**
 * THE LENS PICKER, AS IT READS ON SCREEN.
 *
 * WHAT WAS REPORTED. A drone position offering "Sigma 28-75 f2.8" at 28mm. "I
 * cannot mount a Sigma on a Mavic." The position really was air, holding
 * air-3s-wide: the picker listed kit.lenses whatever the platform was, no
 * option matched the held id, and a select with no matching option displays
 * its FIRST option. So the card named a lens the position was not using, and
 * one touch would have written that lens onto the aircraft.
 *
 * Asserted on the RENDERED OPTIONS rather than on the source, because the
 * question is what the shooter is offered.
 */
describe('the optic picker is the platform\'s own', () => {
  const options = (html: string) =>
    [...html.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)</g)].map((m) => ({
      id: m[1],
      label: m[2],
    }))
  const GLASS = DEFAULT_KIT.lenses.map((lens) => lens.name)
  const CAMERAS = DEFAULT_KIT.drones.flatMap((drone) => drone.cameras.map((c) => c.name))

  it('offers the aircraft cameras on an air position, and nothing else', () => {
    const shown = options(card(PILOT))
      .filter((option) => CAMERAS.includes(option.label) || GLASS.includes(option.label))
      .map((option) => option.label)
    expect(shown).toEqual(CAMERAS)
  })

  it('offers no ground glass on an air position', () => {
    const html = card(PILOT)
    for (const name of GLASS) {
      expect(html, `air card offers "${name}"`).not.toContain(`>${name}<`)
    }
    /* The named lens from the report, spelled out. */
    expect(html).not.toContain('Sigma 28-75')
  })

  /*
   * And the select's value is one of its own options, which is the invariant
   * whose absence made the card lie: it is what decides which name is drawn.
   */
  it('selects the camera the position is actually using', () => {
    const html = card(PILOT)
    expect(html).toContain('value="air-3s-wide"')
    expect(options(html).some((option) => option.id === 'air-3s-wide')).toBe(true)
  })

  /* "Lens" is the wrong word for a fixed camera on an aircraft. */
  it('calls it a camera on an air position', () => {
    expect(card(PILOT)).toContain('Camera')
  })

  it('offers the glass on a ground position, and no aircraft camera', () => {
    const html = groundCard()
    for (const name of CAMERAS) {
      expect(html, `ground card offers "${name}"`).not.toContain(`>${name}<`)
    }
    for (const name of GLASS) expect(html).toContain(`>${name}<`)
  })

  /* The check can fail: these names really are findable when they are there. */
  it('would see an aircraft camera on a ground card if one were offered', () => {
    expect(CAMERAS.length).toBeGreaterThan(0)
    for (const name of CAMERAS) expect(card(PILOT)).toContain(`>${name}<`)
  })
})
