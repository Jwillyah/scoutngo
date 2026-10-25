import { renderToStaticMarkup } from 'react-dom/server'
import { NumeralsProvider } from '../lib/numerals.tsx'
import { describe, expect, it } from 'vitest'
import { classificationOf } from '../core/lighting.ts'
import { defaultSelection } from '../lib/kitSelection.ts'
import { DEFAULT_KIT } from '../core/kit.ts'
import { getSunPosition } from '../core/sun.ts'
import type { LatLon } from '../core/geo.ts'
import type { TideState } from '../core/tide.ts'
import { planPositions, type CameraPosition } from '../lib/plan.ts'
import { MapControls } from './MapControls.tsx'
import { PositionCard } from './PositionCard.tsx'
import { ShooterFigure } from './ShooterFigure.tsx'

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
/*
 * THE WHOLE SUN, because planPosition takes a SunPosition now rather than a
 * bare azimuth: a top-down read needs the altitude for shadow length and a 360
 * read needs it for where the sun sits against the horizon ring.
 */
const sun = getSunPosition(new Date('2026-09-12T13:00:00-04:00'), VENUE.lat, VENUE.lon)

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
  shotType: 'framed',
  yawDegrees: 0,
  moved: false,
  origin: 'suggested',
  ...over,
})

const plan = planPositions([at()], SUBJECT, sun)

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

/*
 * ConePicker's tests went with ConePicker.
 *
 * It asserted that the picker was one control rather than a row of chips,
 * that a narrowing lens filter said so on the control, that an isolated
 * position was announced, and that it rendered nothing before there was a
 * plan. All four were about a disclosure that sat over the map and that the
 * shell rebuild replaced with the Cones tile in the layers card.
 *
 * THE ONE BEHAVIOUR WORTH KEEPING MOVED WITH THE FEATURE. "Only this" is a
 * control on the position card now, and it is asserted in the PositionCard
 * block below -- including the part that actually broke: for a while the app
 * had `isolatedId` threaded from App through PlanMode to MapView with no way
 * on earth to set it.
 */

describe('PositionCard', () => {
  /*
   * RENDERED WITH THE RECEIPTS ON.
   *
   * Bearings, solar degrees and the FOV plate are hidden by default now
   * (src/core/numerals.ts), and each is hidden together with its own label,
   * because a "Camera bearing" heading above an empty cell is worse than
   * neither. This describe is about what the CARD contains and where it sits,
   * so it asks for everything; what the switch hides is numerals.test.tsx.
   */
  const html = renderToStaticMarkup(
    <NumeralsProvider show>
    <PositionCard
      isolated={false}
      onIsolate={() => {}}
      kit={DEFAULT_KIT}
        selection={defaultSelection(DEFAULT_KIT)}
        marks={[]}
        subject={SUBJECT}
      planned={plan[0]}
      shootAt={new Date('2026-09-12T13:00:00-04:00')}
      timeZone="America/New_York"
      tide={RISING}
      onClose={() => {}}
      count={1}
      onDelete={() => {}}
      onDuplicate={() => {}}
      onMove={() => {}}
      onSetOptic={() => {}}
      onSetAltitude={() => {}}
      onSetShotType={() => {}}
      onSetYaw={() => {}}
      pilotAt={null}
      onPlacePilot={() => {}}
    />
    </NumeralsProvider>,
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
    const COPY: Record<string, [string, string]> = {
      backlit: ['Backlit', 'Shooting into the sun'],
      'front-lit': ['Front-lit', 'Sun behind the camera'],
      'side-lit': ['Side-lit', 'Sun across the frame'],
    }
    const classification = classificationOf(plan[0].read)
    expect(classification).not.toBeNull()
    const copy = COPY[classification ?? '']
    expect(copy).toBeDefined()
    expect(html).toContain('frame__light-icon')
    expect(html).toContain(copy![0])
    expect(html).toContain(copy![1])
    expect(html).toContain(`frame__light--${classificationOf(plan[0].read)}`)
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
      isolated={false}
      onIsolate={() => {}}
      kit={DEFAULT_KIT}
        selection={defaultSelection(DEFAULT_KIT)}
        marks={[]}
        subject={SUBJECT}
        planned={plan[0]}
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
      pilotAt={null}
      onPlacePilot={() => {}}
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
      'How wide it sees',
      'How tall it sees',
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

/*
 * THE MAGENTA MARKER SAYS WHY, ON SCREEN.
 *
 * It printed the full phrase once; six positions back from a generate put
 * three overlapping red paragraphs across the imagery, so it was cut to a bare
 * "!". That fixed the overlap and left a red badge that means nothing to
 * anyone who has not been told what it is. One word each now.
 */
/*
 * ONLY THIS ONE'S COVERAGE.
 *
 * THE CONTROL DISAPPEARED AND NOTHING NOTICED. It lived in ConePicker, a
 * disclosure over the map; the shell rebuild replaced that with the Cones
 * tile and the picker was never rehomed. `isolatedId` went on being passed
 * from App to PlanMode to MapView, `onClearIsolate` went on being declared,
 * and no screen in the app could set either -- a feature complete in every
 * part except a door. Shape D in docs/failure-modes.md.
 *
 * ASSERTED AS THE TWO DIRECTIONS, because a one-way control is the other
 * failure this repo keeps finding: isolating has to be undoable from the
 * same button, or it is the platform filter again.
 */
describe('isolating one position', () => {
  const card = (isolated: boolean, onIsolate: (id: string | null) => void = () => {}) =>
    renderToStaticMarkup(
      <NumeralsProvider show>
        <PositionCard
          isolated={isolated}
          onIsolate={onIsolate}
          kit={DEFAULT_KIT}
          selection={defaultSelection(DEFAULT_KIT)}
          marks={[]}
          subject={SUBJECT}
          planned={plan[0]}
          shootAt={null}
          timeZone={null}
          tide={null}
          onClose={() => {}}
          count={plan.length}
          onDelete={() => {}}
          onDuplicate={() => {}}
          onMove={() => {}}
          onSetOptic={() => {}}
          onSetAltitude={() => {}}
          onSetShotType={() => {}}
          onSetYaw={() => {}}
          pilotAt={null}
          onPlacePilot={() => {}}
        />
      </NumeralsProvider>,
    )

  it('offers the control on the position it is about', () => {
    expect(card(false)).toContain('Only this')
  })

  it('says which state it is in, rather than only looking different', () => {
    expect(card(false)).toContain('aria-pressed="false"')
    expect(card(true)).toContain('aria-pressed="true"')
  })

  /*
   * THE WAY BACK IS THE SAME BUTTON, AND IT IS NEVER DISABLED.
   *
   * A control you can enter and not leave is the one-way platform filter,
   * which needed a page reload to escape. Asserted on the rendered control
   * rather than on a stub: a first draft of this test declared its own
   * `onIsolate` and called it, which proved that calling a function calls it
   * -- shape B in docs/failure-modes.md, a check that cannot fail.
   *
   * renderToStaticMarkup cannot click, so what is checked here is the
   * property that makes the click possible: the isolated card still offers
   * an enabled control with the same label. The handler's one line --
   * onIsolate(isolated ? null : id) -- is then the whole mechanism.
   */
  it('still offers an enabled control while isolated', () => {
    const on = card(true)
    expect(on).toContain('Only this')
    const button = on.slice(on.indexOf('aria-pressed="true"'))
    expect(button.slice(0, button.indexOf('</button>'))).not.toContain('disabled')
  })
})

describe('a flagged position says what is wrong with it', () => {
  const flagged = (over: Partial<CameraPosition>) =>
    renderToStaticMarkup(
      <ShooterFigure
        number={3}
        opticName="Sigma 28-75 f2.8"
        opticTag="SIGMA"
        focalLength={400}
        classification="side-lit"
        shotType="framed"
        warnings={[]}
        framingWarnings={[]}
        frameSubjectRatio={null}
        blockedCount={0}
        platform="ground"
        altitudeFeet={0}
        moved={false}
        origin="manual"
        selected={false}
        onSelect={() => {}}
        {...(over as Record<string, never>)}
      />,
    )

  it('prints the word, not an exclamation mark', () => {
    const html = flagged({ warnings: ['in-water'] } as never)
    expect(html).toContain('shooter__flag')
    expect(html).toContain('water')
    expect(html).not.toMatch(/shooter__flag[^>]*>!</)
  })

  it('has a word for every site warning', () => {
    expect(flagged({ warnings: ['in-water'] } as never)).toContain('water')
    expect(flagged({ warnings: ['in-roadway'] } as never)).toContain('road')
    expect(flagged({ warnings: ['over-structure'] } as never)).toContain('people')
  })

  it('has a word for every framing warning', () => {
    expect(flagged({ framingWarnings: ['frame-wider-than-subject'] } as never)).toContain('wide')
    expect(flagged({ framingWarnings: ['beyond-standoff'] } as never)).toContain('far')
  })

  /*
   * THE COMPUTED MULTIPLE, NOT THE WORD. "WIDE" was a verdict in one word, in
   * hazard red, on all three positions of a drone shoot. The flag carries the
   * number when there is one.
   */
  it('prints the multiple when the subject size is known', () => {
    const html = flagged({
      framingWarnings: ['frame-wider-than-subject'],
      frameSubjectRatio: 4.17,
    } as never)
    expect(html).toContain('4.2x wide')
  })

  /*
   * AND A WIDE FRAME IS NOT RED. Red is for something being wrong: standing in
   * a river, or further out than the shot can carry. A wide frame is a choice.
   */
  it('keeps the magenta for hazards and uses a plain plate for a wide frame', () => {
    const wide = flagged({
      framingWarnings: ['frame-wider-than-subject'],
      frameSubjectRatio: 4.17,
    } as never)
    expect(wide).toContain('shooter__flag--note')
    expect(wide).not.toContain('shooter__flag--hazard')
    /* The disc itself stays its normal colour too. */
    expect(wide).not.toContain('shooter--warned')

    for (const hazard of [
      { warnings: ['in-water'] },
      { framingWarnings: ['beyond-standoff'] },
    ]) {
      const html = flagged(hazard as never)
      expect(html).toContain('shooter__flag--hazard')
      expect(html).toContain('shooter--warned')
    }
  })

  /*
   * ITEM 3: the plate said "28" and nothing else. "28 on what? A focal length
   * with no camera is the same ambiguity that let the Sigma stand in for my
   * drone in the first place."
   */
  /*
   * THE PLATE IS ON THE SELECTED POSITION ONLY. Six plates in a cluster were
   * the crowding the layout brief named; the number says which is which.
   */
  it('shows no plate on a position that is not selected', () => {
    const html = flagged({ opticName: 'Air 3S wide', opticTag: 'AIR 3S', focalLength: 24, selected: false } as never)
    expect(html).not.toContain('shooter__focal')
  })

  it('names the optic on the plate beside the focal length', () => {
    const html = flagged({ opticName: 'Air 3S wide', opticTag: 'AIR 3S', focalLength: 24, selected: true } as never)
    expect(html).toContain('AIR 3S')
    expect(html).toContain('24')
    expect(html).toContain('shooter__optic')
  })

  /*
   * AND IT DROPS THE TAG WHEN EVERY PLATE WOULD CARRY THE SAME ONE. "The word
   * SIGMA is on all six, so it carries no information." The decision is made
   * across the whole set in core/mapLabel.ts; the figure only renders it.
   */
  it('prints no tag when it was given none', () => {
    const html = flagged({ opticName: 'Sigma 28-75 f2.8', opticTag: null, focalLength: 40 } as never)
    expect(html).not.toContain('shooter__optic')
    expect(html).not.toContain('SIGMA')
    expect(html).toContain('40')
  })

  /* The screen reader still gets the optic: it reads one position at a time. */
  it('still names the optic in the aria-label with no tag', () => {
    expect(
      flagged({ opticName: 'Sigma 28-75 f2.8', opticTag: null, focalLength: 40 } as never),
    ).toContain('Sigma 28-75 f2.8, 40 millimetres')
  })

  it('names it in the aria-label too, not only on the plate', () => {
    expect(flagged({ opticName: 'Air 3S wide', focalLength: 24 } as never)).toContain(
      'Air 3S wide, 24 millimetres',
    )
  })

  /* And an unflagged position carries no flag at all. */
  it('says nothing when there is nothing wrong', () => {
    expect(flagged({})).not.toContain('shooter__flag')
  })

  /*
   * THE WORD IS NOT HIDDEN FROM A SCREEN READER, which the "!" was: it carried
   * aria-hidden and the meaning lived only in the marker's aria-label. The
   * full phrase is still in the aria-label as well, which is the longer form.
   */
  it('is readable by a screen reader, and the full phrase is still in the label', () => {
    const html = flagged({ warnings: ['in-water'] } as never)
    expect(html).not.toMatch(/shooter__flag"[^>]*aria-hidden/)
    expect(html).toContain('in water')
  })
})
