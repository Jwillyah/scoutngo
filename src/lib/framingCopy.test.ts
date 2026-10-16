import { describe, expect, it } from 'vitest'
import { getSunPosition } from '../core/sun.ts'
import { destinationPoint, type LatLon } from '../core/geo.ts'
import { frameLine, wideFrameLine, wideFrameWord } from './framingCopy.ts'
import { planPosition, type CameraPosition } from './plan.ts'

const SUBJECT: LatLon = { lat: 37.0537, lon: -76.4802 }
const sun = getSunPosition(new Date('2026-10-15T17:00:00Z'), SUBJECT.lat, SUBJECT.lon)

/* 10900 Warwick Boulevard, roughly: an air position out over the car park. */
const position = (over: Partial<CameraPosition> = {}): CameraPosition => ({
  id: 'p1',
  number: 1,
  at: destinationPoint(SUBJECT, 270, 120),
  lensId: 'air-3s-wide',
  focalLength: 24,
  shot: '',
  risk: '',
  angleRationale: '',
  coversShot: null,
  platform: 'air',
  altitudeFeet: 200,
  shotType: 'framed',
  yawDegrees: 0,
  moved: false,
  origin: 'manual',
  ...over,
})

const planned = (subjectMeters: number | null, over: Partial<CameraPosition> = {}) =>
  planPosition(
    position(over),
    SUBJECT,
    sun,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    subjectMeters,
  )

/*
 * WHAT THE OLD COPY SAID, so a regression is caught by the sentence rather
 * than by somebody noticing it on a phone:
 *
 *   "At this distance the frame is wider than the event. The subject will be a
 *    speck. Move in, or go longer."
 *
 * Three claims. The app knew none of them, because nobody had told it how big
 * the subject was.
 */
describe('the frame line states a measurement', () => {
  it('says the focal length and what it frames, in metres', () => {
    const line = frameLine(planned(null))
    expect(line).toMatch(/^At 24mm from here you frame \d+ m across\.$/)
  })

  it('quotes the frame width core computed, not a second calculation', () => {
    const shot = planned(null)
    expect(frameLine(shot)).toContain(`${Math.round(shot.frameWidthMeters)} m`)
  })

  /* The air camera's published equivalent, not whatever is stored on the position. */
  it('quotes the focal length the field of view was computed from', () => {
    const shot = planned(null)
    expect(frameLine(shot)).toContain(`${shot.focalLength}mm`)
    expect(shot.focalLength).toBe(24)
  })

  it('says it on every position, flagged or not', () => {
    expect(frameLine(planned(null))).not.toBe('')
    expect(frameLine(planned(400))).not.toBe('')
    expect(frameLine(planned(5))).not.toBe('')
  })

  const BANNED = ['speck', 'too wide', 'the event', 'wider than the event', 'move in']

  it('claims nothing about what the picture will look like', () => {
    for (const subject of [null, 5, 400]) {
      const text = `${frameLine(planned(subject))} ${wideFrameLine(planned(subject)) ?? ''}`
      for (const phrase of BANNED) {
        expect(text.toLowerCase(), `copy contains "${phrase}"`).not.toContain(phrase)
      }
    }
  })

  /* The check can fail: these phrases really are findable when present. */
  it('would catch the old wording', () => {
    const old =
      'At this distance the frame is wider than the event. The subject will be a speck. Move in, or go longer.'
    expect(BANNED.some((phrase) => old.toLowerCase().includes(phrase))).toBe(true)
  })

  /*
   * "The event" is left over from the event-layout work. This shooter shoots
   * buildings, boats, surf and people, and most of those are not events.
   */
  it('does not call the subject an event', () => {
    expect(frameLine(planned(400)).toLowerCase()).not.toContain('event')
    expect(wideFrameLine(planned(5))?.toLowerCase() ?? '').not.toContain('event')
  })
})

describe('the comparison appears only when there is something to compare', () => {
  it('is silent when nobody has said how big the subject is', () => {
    expect(wideFrameLine(planned(null))).toBeNull()
  })

  it('is silent when the frame is a reasonable multiple of the subject', () => {
    expect(wideFrameLine(planned(400))).toBeNull()
    expect(planned(400).framingWarnings).toEqual([])
  })

  it('states the multiple and the size the shooter set, when it fires', () => {
    const shot = planned(10, { platform: 'ground', altitudeFeet: 0, lensId: 'sigma-28-75', focalLength: 28 })
    const line = wideFrameLine(shot)
    expect(line).not.toBeNull()
    expect(line).toContain('10 m subject you set')
    expect(line).toContain(`${shot.frameSubjectRatio?.toFixed(1)} times`)
  })

  /*
   * A FLAG ON EVERY POSITION IS WALLPAPER. The reported case: three aerials of
   * a building, all three flagged. With the building's real size entered, none
   * of them is, at any of the heights those aerials were flown at.
   */
  it('says nothing about three aerials of a building that size', () => {
    for (const feet of [150, 200, 300]) {
      const shot = planned(90, { altitudeFeet: feet })
      expect(wideFrameLine(shot), `flagged at ${feet} ft`).toBeNull()
      expect(shot.framingWarnings, `flagged at ${feet} ft`).toEqual([])
    }
  })

  /*
   * AND A 45 m BUILDING FROM A 400 ft AERIAL IS NOT FLAGGED EITHER. This is
   * the case that moved the ratio from three to four: 152 m of frame on a 45 m
   * building is 3.4 times, which is an ordinary aerial with its surroundings
   * in it, and the whole complaint was about flags on ordinary aerials.
   */
  /*
   * ITEM 3: AN AERIAL IS NEVER JUDGED, at any ratio. "Those are aerials. Wide
   * is what I flew for." The frame WIDTH is still stated, because that is a
   * measurement and it is useful; the ratio and the flag are not.
   */
  it('says nothing at all about an aerial, however wide the frame', () => {
    for (const subject of [5, 10, 45, 400]) {
      const shot = planned(subject)
      expect(shot.position.platform).toBe('air')
      expect(wideFrameLine(shot), `aerial judged at ${subject} m`).toBeNull()
      expect(shot.framingWarnings).not.toContain('frame-wider-than-subject')
      expect(shot.frameSubjectRatio, `aerial given a ratio at ${subject} m`).toBeNull()
      /* And the measurement survives the silence. */
      expect(frameLine(shot)).toMatch(/you frame \d+ m across/)
    }
  })

  /* A top-down and a 360 are silent too, on either platform. */
  it('says nothing about a top-down or a 360', () => {
    for (const shotType of ['top-down', 'orbit'] as const) {
      for (const platform of ['ground', 'air'] as const) {
        const shot = planned(5, {
          platform,
          shotType,
          altitudeFeet: platform === 'air' ? 200 : 30,
          ...(platform === 'ground' ? { lensId: 'sigma-28-75', focalLength: 28 } : {}),
        })
        expect(wideFrameLine(shot), `${platform}/${shotType}`).toBeNull()
      }
    }
  })
})

describe('the map word is the multiple, not a verdict', () => {
  it('prints the measured multiple', () => {
    expect(wideFrameWord(4.17)).toBe('4.2x wide')
    expect(wideFrameWord(12)).toBe('12.0x wide')
  })

  /* Null in, null out: the figure is never invented to fill the badge. */
  it('is null with no ratio to print', () => {
    expect(wideFrameWord(null)).toBeNull()
  })

  it('stays short enough for the plate', () => {
    expect(wideFrameWord(4.17)!.length).toBeLessThanOrEqual(13)
    expect(wideFrameWord(100)!.length).toBeLessThanOrEqual(13)
  })
})
