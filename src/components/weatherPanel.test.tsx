import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_UNITS } from '../lib/units.ts'
import { describe, expect, it } from 'vitest'
import type { LevelWind } from '../core/windProfile.ts'
import type { TideState } from '../core/tide.ts'
import { WeatherPanel } from './WeatherPanel.tsx'

/*
 * A SHEAR CASE, AS A FIXTURE. Not an observation.
 *
 * These four levels used to be labelled "the measured profile" from Lynnhaven
 * Inlet on 15 October 2026, and that observation existed nowhere but in this
 * comment. It was re-run live and the result is in
 * measurements/2026-10-18-lynnhaven-wind-profile.md.
 *
 * WHAT THE RE-RUN FOUND, AND IT IS NOT A CONFIRMATION. Across seven mornings
 * at 07:00 the 180 m wind ran 1.2x to 2.3x the ground wind, turning by 0 to
 * 49 degrees. The sharp 3.5x case these numbers describe did NOT appear. It
 * is not refuted either: shear is largest when the surface is calm, the
 * calmest morning sampled (4.34 m/s at the ground) gave the largest ratio,
 * and the original morning was calmer still.
 *
 * So these stay, as what they actually are: a fixture that exercises a strong
 * shear, chosen because the panel has to be right in that case. The claim
 * that they were measured on a particular morning is gone, because nothing
 * can check it.
 */
const LEVELS: LevelWind[] = [
  { heightMeters: 10, speedMps: 2.08, fromDegrees: 338 },
  { heightMeters: 80, speedMps: 4.19, fromDegrees: 335 },
  { heightMeters: 120, speedMps: 6.14, fromDegrees: 316 },
  { heightMeters: 180, speedMps: 7.5, fromDegrees: 360 },
]

const TIDE_OK = {
  status: 'ok' as const,
  station: { id: '8638888', name: 'Lynnhaven Inlet', at: { lat: 36.9, lon: -76.08 }, state: 'VA' },
  distanceKm: 0.57,
  distant: false,
  predictions: { extremes: [], curve: [], curveSource: 'derived' as const },
}

const RISING: TideState = {
  feet: 1.68,
  direction: 'falling',
  next: { kind: 'low', at: new Date('2026-10-20T14:42:00Z'), feet: 1.04 },
  previous: null,
}

const render = (over: Partial<Parameters<typeof WeatherPanel>[0]> = {}) =>
  renderToStaticMarkup(
    <WeatherPanel
      at={new Date('2026-10-15T11:00:00Z')}
      timeZone="America/New_York"
      past
      levels={LEVELS}
      gustMps={11.8}
      units={DEFAULT_UNITS}
      windHeight={{ feet: 400, source: 'position' }}
      ratedWindMps={12}
      ratedWindSource="DJI published specs, dji.com/air-3s/specs"
      tide={TIDE_OK}
      tideNow={RISING}
      cloud={null}
      {...over}
    />,
  )

describe('wind at the height being flown', () => {
  const html = render()

  it('reads at the flight altitude, not at the ground', () => {
    expect(html).toContain('at 400 ft')
    // 400ft is 122m: about 6.2 m/s, which is 12 kts, not the ground's 4.
    expect(html).toContain('12 kts')
    expect(html).not.toContain('>4 kts<')
  })

  it('always says which height the number is for', () => {
    expect(html).toContain('Wind at 400 ft')
    expect(render({ windHeight: { feet: null, source: 'ground' } })).toContain('at the ground, 10 m')
  })

  /* An interpolated figure is a reasonable number, not a measurement. */
  it('says it is interpolated and between which levels', () => {
    expect(html).toContain('Interpolated between the 120 m and 180 m levels')
    expect(html).toContain('not measured at this height')
  })

  /*
   * 590ft is 179.8m, which still interpolates: only an exact level or a height
   * past the top of the model is reported as sitting on one. Past 180m it
   * CLAMPS rather than extrapolating, because guessing above the model's range
   * is inventing weather.
   */
  it('says when it is on a served level instead of interpolating', () => {
    const above = render({ windHeight: { feet: 700, source: 'position' } })
    expect(above).toContain('At the 180 m level')
    expect(above).not.toContain('Interpolated')
  })

  it('still interpolates a few feet below the top level', () => {
    expect(render({ windHeight: { feet: 590, source: 'position' } })).toContain('Interpolated between the 120 m and 180 m')
  })

  /*
   * THE GUST IS A SURFACE FIGURE and must say so: Open-Meteo serves no gust
   * above ten metres, and implying it is the gust at altitude would be a claim
   * rather than a number.
   */
  it('labels the gust as a surface figure', () => {
    expect(html).toContain('Gusting 23 kts at the surface')
  })

  /*
   * THE RATING IS STATED, NOT RULED ON. Same rule as the Part 107 ceiling.
   */
  it('states the rating and hands the judgement over', () => {
    expect(html).toContain('rated to')
    expect(html).toContain('23 kts')
    expect(html).toContain('12 m/s')
    expect(html).toContain('dji.com/air-3s/specs')
    expect(html).toContain('Yours is the judgement')
    const text = html.replace(/<[^>]*>/g, ' ').toLowerCase()
    for (const verdict of ['do not fly', 'safe to fly', 'unsafe', 'too windy', 'grounded']) {
      expect(text).not.toContain(verdict)
    }
  })

  /* NO RATING, NO SENTENCE. An invented limit is something somebody could fly on. */
  it('omits the rating entirely when it has not been confirmed', () => {
    const unrated = render({ ratedWindMps: null, ratedWindSource: '' })
    expect(unrated).not.toContain('rated to')
    // The gust itself is still shown: that part is measured.
    expect(unrated).toContain('Gusting 23 kts')
  })
})

/*
 * UNKNOWN IS A DASH AND A SENTENCE, NEVER A ZERO.
 */
describe('a reading that did not arrive', () => {
  it('prints a dash and says the forecast did not say', () => {
    const html = render({ levels: [], gustMps: null })
    expect(html).toContain('–')
    expect(html).toContain('The forecast did not say')
    expect(html).not.toContain('0 kts')
  })

  it('prints a dash for a missing tide, not a height of nought', () => {
    const html = render({ tideNow: null })
    expect(html).toContain('–')
    expect(html).not.toContain('0.0 ft')
  })

  it('prints a dash for cloud nobody asked for yet', () => {
    expect(render().replace(/<[^>]*>/g, ' ')).toContain('–')
  })

  it('says the forecast did not say for a cloud reading with no low layer', () => {
    const html = render({
      cloud: {
        samples: [],
        worstLow: null,
        worstLowAtKm: null,
        meanLow: null,
        meanMid: null,
        meanHigh: null,
        verdict: 'no cloud forecast for this sightline',
      },
    })
    expect(html).toContain('The forecast did not say')
  })
})

/*
 * EVERYTHING IS FOR THE SCRUBBED MOMENT, and the panel says whether that
 * moment has happened.
 */
describe('the moment the readings are for', () => {
  it('prints the hour and calls it observed in the past', () => {
    const html = render({ past: true })
    expect(html).toContain('07:00')
    expect(html).toContain('observed')
  })

  it('calls it forecast in the future', () => {
    expect(render({ past: false })).toContain('forecast')
  })

  it('asks for a venue and a window before claiming anything', () => {
    const html = render({ at: null, timeZone: null })
    expect(html).toContain('Set the venue and the window')
  })
})

describe('tide, short', () => {
  const html = render()

  it('gives height, direction and the next turn, and no table', () => {
    expect(html).toContain('1.7 ft')
    expect(html).toContain('falling')
    expect(html).toContain('Next low')
    expect(html).toContain('1.0 ft')
  })

  /*
   * THE STATION, AND HOW FAR IT IS IN THE UNIT THE SHOOTER CHOSE.
   *
   * This asserted the literal string "0.6 km", which was right when the
   * panel had the unit baked in and is the wrong question now: the panel's
   * job is to render the distance in the chosen system, and a test pinned to
   * one spelling of it passes whether or not the preference is honoured.
   *
   * 0.57 km is 1,870 ft and 570 m. Both are checked, because a conversion
   * that is wired in one direction only is the shape this whole preference
   * was added to avoid.
   */
  it('keeps the station and its distance, in the chosen unit', () => {
    expect(html).toContain('Lynnhaven Inlet')
    expect(html).toContain('1,870 ft')
    expect(html).not.toContain('km')

    const metric = render({ units: { wind: 'kt', distance: 'm' } })
    expect(metric).toContain('570 m')
    expect(metric).not.toContain('ft.')
  })

  /* And still says when the curve was computed here rather than published. */
  it('says when the level between turns was derived', () => {
    expect(html).toContain('computed here from the turns')
  })
})
