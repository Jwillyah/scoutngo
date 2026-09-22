import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getSunPosition } from '../core/sun.ts'
import type { LatLon } from '../core/geo.ts'
import type { TideState } from '../core/tide.ts'
import { planPositions, type CameraPosition } from '../lib/plan.ts'
import { ConePicker } from './ConePicker.tsx'
import { MapControls } from './MapControls.tsx'
import { PositionCard } from './PositionCard.tsx'

/**
 * PLAN's chrome, after the cut.
 *
 * These are here to keep four removals removed. Every one of them was a second
 * way to do something that already had a home, and each is cheap to reintroduce
 * by habit: a search bar on a map, a readout beside a number, a plus and minus
 * beside a pinch, a row of chips for a filter nobody has turned on.
 */

const VENUE: LatLon = { lat: 38.364236, lon: -75.605912 }
const SUBJECT: LatLon = { lat: 38.3639, lon: -75.6058 }
const sunAzimuth = getSunPosition(new Date('2026-09-12T13:00:00-04:00'), VENUE.lat, VENUE.lon)
  .azimuth

const at = (over: Partial<CameraPosition> = {}): CameraPosition => ({
  id: 'p1',
  number: 1,
  at: { lat: 38.3655, lon: -75.6058 },
  lensId: 'sony-200-600',
  focalLength: 400,
  shot: 'Boats hitting the pilings.',
  risk: 'Crowd on the rail.',
  angleRationale: 'Pilings run away from camera, crowd behind.',
  coversShot: null,
  platform: 'ground',
  altitudeFeet: 0,
  moved: false,
  ...over,
})

const plan = planPositions([at()], SUBJECT, sunAzimuth)

/* A rising tide at the scrubbed moment. The card shows the level and the arrow. */
const RISING: TideState = {
  feet: 1.8,
  direction: 'rising',
  next: { kind: 'high', at: new Date('2026-09-12T16:10:00-04:00'), feet: 3.2 },
  previous: { kind: 'low', at: new Date('2026-09-12T10:02:00-04:00'), feet: 0.1 },
}

describe('MapControls', () => {
  const html = renderToStaticMarkup(
    <MapControls
      showSun
      onShowSun={() => {}}
      pitch={0}
      onPitch={() => {}}
      onFitAll={() => {}}
      canFitAll
    />,
  )

  /* Pinch does this, on every device this runs on. */
  it('has no zoom buttons', () => {
    expect(html).not.toContain('Zoom in')
    expect(html).not.toContain('Zoom out')
    expect(html).not.toContain('mapctl__stack')
  })

  it('keeps the three a gesture cannot do', () => {
    expect(html).toContain('sun overlay')
    expect(html).toContain('Tilt')
    expect(html).toContain('Fit all')
  })
})

describe('ConePicker', () => {
  it('is one control, not a row of chips', () => {
    const html = renderToStaticMarkup(
      <ConePicker
        plan={plan}
        coneMode="none"
        onConeMode={() => {}}
        lensFilters={[]}
        onLensFilters={() => {}}
        isolatedId={null}
        onClearIsolate={() => {}}
      />,
    )
    expect(html).toContain('class="picker"')
    expect(html).not.toContain('class="cones"')
    // Closed by default: the optic list is not on the map surface.
    expect(html).not.toContain('Sony 200-600')
  })

  /*
   * A filter that hides positions without saying so is how someone walks past
   * the shot, so the count is on the control itself.
   */
  it('says on the control when a filter is narrowing the map', () => {
    const html = renderToStaticMarkup(
      <ConePicker
        plan={plan}
        coneMode="none"
        onConeMode={() => {}}
        lensFilters={['sony-200-600']}
        onLensFilters={() => {}}
        isolatedId={null}
        onClearIsolate={() => {}}
      />,
    )
    expect(html).toContain('Lenses · 1')
    expect(html).toContain('mode--on')
  })

  it('says when one position is isolated', () => {
    const html = renderToStaticMarkup(
      <ConePicker
        plan={plan}
        coneMode="none"
        onConeMode={() => {}}
        lensFilters={[]}
        onLensFilters={() => {}}
        isolatedId="p1"
        onClearIsolate={() => {}}
      />,
    )
    expect(html).toContain('Isolated')
  })

  it('renders nothing before there is a plan', () => {
    expect(
      renderToStaticMarkup(
        <ConePicker
          plan={[]}
          coneMode="none"
          onConeMode={() => {}}
          lensFilters={[]}
          onLensFilters={() => {}}
          isolatedId={null}
          onClearIsolate={() => {}}
        />,
      ),
    ).toBe('')
  })
})

describe('PositionCard', () => {
  const html = renderToStaticMarkup(
    <PositionCard
      planned={plan[0]}
      shootAt={new Date('2026-09-12T13:00:00-04:00')}
      timeZone="America/New_York"
      tide={RISING}
      onClose={() => {}}
    />,
  )

  /* The place leads. The numbers used to. */
  it('opens with the photo slot, before any text', () => {
    expect(html.indexOf('class="frame"')).toBeGreaterThan(-1)
    expect(html.indexOf('class="frame"')).toBeLessThan(html.indexOf('card__shot'))
    expect(html.indexOf('card__shot')).toBeLessThan(html.indexOf('class="three'))
  })

  /*
   * Read from the CLASSIFICATION core computed, not hardcoded: this fixture
   * sits north of the subject under a southern sun, and asserting the word
   * directly would be asserting my guess about the arithmetic.
   */
  it('states the lighting as an icon, a word and a phrase', () => {
    const copy = {
      backlit: ['Backlit', 'Shooting into the sun'],
      'front-lit': ['Front-lit', 'Sun behind the camera'],
      'side-lit': ['Side-lit', 'Sun across the frame'],
    }[plan[0].lighting.classification]
    expect(copy).toBeDefined()
    expect(html).toContain('frame__light-icon')
    expect(html).toContain(copy![0])
    expect(html).toContain(copy![1])
    expect(html).toContain(`frame__light--${plan[0].lighting.classification}`)
  })

  /* Focal length, range in feet, tide with a direction. Nothing else. */
  it('leads with exactly three numbers', () => {
    const labels = [...html.matchAll(/class="three__label">([^<]+)</g)].map((m) => m[1])
    expect(labels).toEqual(['Lens', 'Range', 'Tide'])
    expect(html).toContain('400mm')
    expect(html).toContain('↑')
  })

  it('drops the tide cell inland rather than printing a dash', () => {
    const dry = renderToStaticMarkup(
      <PositionCard
        planned={plan[0]}
        shootAt={null}
        timeZone={null}
        tide={null}
        onClose={() => {}}
      />,
    )
    const labels = [...dry.matchAll(/class="three__label">([^<]+)</g)].map((m) => m[1])
    expect(labels).toEqual(['Lens', 'Range'])
    expect(dry).toContain('three--pair')
  })

  /*
   * NOTHING WAS DELETED when the card became photo first. Every value that used
   * to sit in the seven cell grid is still here, one tap away.
   */
  it('keeps every old number under a closed disclosure', () => {
    for (const label of [
      'Frame width',
      'Usable to',
      'Camera bearing',
      'Sun delta',
      'FOV h',
      'FOV v',
    ]) {
      expect(html).toContain(label)
    }
    expect(html).toContain('<details class="more"')
    expect(html).not.toContain('<details class="more" open')
    expect(html).toContain('>Numbers<')
  })

  it('states the imagery footprint even before any image arrives', () => {
    expect(html).toContain('class="frame"')
    expect(html).toContain('Loading ground view')
  })
})
