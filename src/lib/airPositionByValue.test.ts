import { describe, expect, it } from 'vitest'
import { DEFAULT_ALTITUDE_FEET } from '../core/air.ts'
import { DEFAULT_KIT } from '../core/kit.ts'
import { defaultOpticFor, opticsFor } from '../core/optics.ts'
import type { PlatformFilter } from '../core/platformFilter.ts'
import { getSunPosition } from '../core/sun.ts'
import { destinationPoint, type LatLon } from '../core/geo.ts'
import { defaultSelection } from './kitSelection.ts'
import { planPosition } from './plan.ts'
import { addPosition } from './positions.ts'
import { revivePositions } from './revivePositions.ts'

/**
 * ADDING A POSITION WITH AIR SELECTED, ASSERTED BY VALUE.
 *
 * FOURTH REPORT. "Two fixes have not held... one test that creates a position
 * with Air selected and asserts the stored platform, the label, the focal and
 * the absence of the warning. By value, not by code path existing."
 *
 * So this walks the add exactly as the app does, then asks the four questions
 * the card answers, and checks the ANSWERS. Every earlier test in this area
 * checked a list or a predicate; none of them would have caught a position
 * whose platform and optic disagreed, because each half was right on its own.
 */

const SUBJECT: LatLon = { lat: 36.7362, lon: -75.936 }
const sun = getSunPosition(new Date('2026-10-18T22:00:00Z'), SUBJECT.lat, SUBJECT.lon)
const selection = defaultSelection(DEFAULT_KIT)

/** The add path, as App.addPositionAt runs it, for a given filter. */
function addWithFilter(filter: PlatformFilter) {
  const air = defaultOpticFor('air', DEFAULT_KIT, selection)
  const ground = defaultOpticFor('ground', DEFAULT_KIT, selection)
  const addsAir = filter === 'air' && air !== null

  const list = addsAir
    ? addPosition([], {
        at: destinationPoint(SUBJECT, 270, 150),
        lensId: air!.id,
        focalLength: air!.minFocalLength,
        platform: 'air',
        altitudeFeet: DEFAULT_ALTITUDE_FEET,
      })
    : addPosition([], {
        at: destinationPoint(SUBJECT, 270, 150),
        lensId: ground!.id,
        focalLength: ground!.minFocalLength,
      })

  const stored = list[0]
  /* A subject size is set, so the wide rule has everything it needs to fire. */
  const planned = planPosition(
    stored,
    SUBJECT,
    sun,
    undefined,
    undefined,
    undefined,
    undefined,
    DEFAULT_KIT,
    8,
  )
  return {
    stored,
    planned,
    /* What the card's optic picker shows as the selected label. */
    label: opticsFor(stored.platform, DEFAULT_KIT, selection, stored.lensId).find(
      (optic) => optic.id === stored.lensId,
    )?.name,
    /* What the Focal field shows. */
    focal: planned.focalLength,
  }
}

describe('Air selected: the four things the card shows', () => {
  const result = addWithFilter('air')

  it('stores the platform as air', () => {
    expect(result.stored.platform).toBe('air')
  })

  /* THE LABEL. The reported screen read "Sigma 28-75 f2.8" here. */
  it('labels the optic as the aircraft camera, not a lens', () => {
    expect(result.label).toBe('Air 3S wide')
    expect(result.label).not.toBe('Sigma 28-75 f2.8')
    expect(result.planned.optic.name).toBe('Air 3S wide')
    expect(result.planned.optic.kind).toBe('drone')
  })

  /* THE FOCAL. 24 was right on the reported screen; the label was not. */
  it('shows the aircraft focal length', () => {
    expect(result.focal).toBe(24)
    expect(result.stored.focalLength).toBe(24)
  })

  /* THE WARNING. Suppressed for air; the reported screen showed it. */
  it('passes no framing judgement on it', () => {
    expect(result.planned.framingWarnings).toEqual([])
    expect(result.planned.frameSubjectRatio).toBeNull()
  })

  /* And it flies, rather than sitting on the ground at zero. */
  it('gives it a flight altitude', () => {
    expect(result.stored.altitudeFeet).toBe(DEFAULT_ALTITUDE_FEET)
  })

  /*
   * THE LABEL AND THE FOCAL COME FROM THE SAME OPTIC. The reported screen had
   * them from two different ones, which is the entire bug: each half was
   * individually plausible.
   */
  it('takes the label and the focal from one optic record', () => {
    expect(result.planned.optic.id).toBe(result.stored.lensId)
    const optic = opticsFor('air', DEFAULT_KIT, selection, result.stored.lensId).find(
      (o) => o.id === result.planned.optic.id,
    )
    expect(optic?.minFocalLength).toBe(result.focal)
  })
})

describe('Ground selected: the mirror, so neither test is vacuous', () => {
  const result = addWithFilter('ground')

  it('stores ground and labels a lens', () => {
    expect(result.stored.platform).toBe('ground')
    expect(result.label).toBe('Sigma 28-75 f2.8')
    expect(result.planned.optic.kind).toBe('lens')
  })

  it('does judge the frame, which is the case the rule is for', () => {
    expect(result.planned.framingWarnings).toContain('frame-wider-than-subject')
  })
})

/**
 * THE POSITION THAT ACTUALLY PRODUCED THE REPORTED SCREEN.
 *
 * Not one the add path made. One restored from a spot saved while an older
 * bug was live: the aircraft's optic, at the aircraft's focal length, with
 * platform left on ground. Measured on the code before this fix:
 *
 *   storedPlatform     "ground"
 *   storedLensId       "air-3s-wide"
 *   resolvedOpticId    "sigma-28-75"       <- findLens fell back
 *   resolvedOpticName  "Sigma 28-75 f2.8"  <- the reported LENS
 *   computedFocal      24                  <- the reported FOCAL
 */
describe('a saved position whose platform and optic disagree', () => {
  const fossil = {
    id: 'old1',
    number: 1,
    at: destinationPoint(SUBJECT, 270, 150),
    lensId: 'air-3s-wide',
    focalLength: 24,
    shot: '',
    risk: '',
    angleRationale: '',
    coversShot: null,
    platform: 'ground',
    altitudeFeet: 0,
    shotType: 'framed',
    yawDegrees: 0,
    moved: false,
    origin: 'manual',
  }

  const revival = revivePositions([fossil], DEFAULT_KIT)

  it('is repaired towards the optic, which is the half that cannot be ambiguous', () => {
    expect(revival.positions).toHaveLength(1)
    expect(revival.positions[0].platform).toBe('air')
    expect(revival.positions[0].lensId).toBe('air-3s-wide')
  })

  it('is given a flight altitude rather than left at zero', () => {
    expect(revival.positions[0].altitudeFeet).toBe(DEFAULT_ALTITUDE_FEET)
  })

  it('says what it changed rather than doing it quietly', () => {
    expect(revival.repaired).toEqual([
      { id: 'old1', from: 'ground', to: 'air', optic: 'air-3s-wide' },
    ])
  })

  /* And after the repair, the card shows the aircraft, by value. */
  it('then shows the aircraft camera and no warning', () => {
    const planned = planPosition(
      revival.positions[0],
      SUBJECT,
      sun,
      undefined,
      undefined,
      undefined,
      undefined,
      DEFAULT_KIT,
      8,
    )
    expect(planned.optic.name).toBe('Air 3S wide')
    expect(planned.focalLength).toBe(24)
    expect(planned.framingWarnings).toEqual([])
  })

  /*
   * AND THE OLD SILENT SUBSTITUTION IS GONE. Handed the fossil directly,
   * without revival, plan.ts now refuses rather than quietly resolving the
   * Sigma. That substitution is what made the contradiction look plausible
   * for three reports.
   */
  it('refuses to resolve an unresolvable optic instead of swapping one in', () => {
    expect(() =>
      planPosition(fossil as never, SUBJECT, sun, undefined, undefined, undefined, undefined, DEFAULT_KIT),
    ).toThrow(/not a lens in the kit/)
  })
})

/* A position whose optic is in no kit at all cannot be repaired, only dropped. */
describe('a position using gear that is in no kit', () => {
  const revival = revivePositions(
    [
      {
        id: 'x',
        number: 1,
        at: SUBJECT,
        lensId: 'canon-rf-50',
        focalLength: 50,
        platform: 'ground',
        altitudeFeet: 0,
        shotType: 'framed',
        yawDegrees: 0,
        moved: false,
        origin: 'manual',
        shot: '',
        risk: '',
        angleRationale: '',
        coversShot: null,
      },
    ],
    DEFAULT_KIT,
  )

  it('is dropped and named, not placed with someone else glass', () => {
    expect(revival.positions).toEqual([])
    expect(revival.dropped).toHaveLength(1)
    expect(revival.dropped[0].reason).toContain('canon-rf-50')
  })
})
