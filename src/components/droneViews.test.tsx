import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DRONE_LIGHT_RATIO } from '../core/briefing.ts'
import { gridLegend, heightGrid } from '../core/droneHeight.ts'
import { dayBars } from '../core/droneNow.ts'
import { DroneHeightView, type DroneHeightData } from './DroneHeight.tsx'
import { DroneNowView, type DroneCardsData, type DroneNowData } from './DroneNow.tsx'
import { DronePlanView, type DronePlanData } from './DronePlan.tsx'

/*
 * THE DRONE PAGE'S VIEWS (Batch DRONE, Section 2; boards Drone_P1, P2, P4),
 * rendered with what DronePage.tsx hands them. They only render: every number
 * here came from src/core.
 */
const KT = 0.514444
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ').trim()
const kt = (mps: number) => `${Math.round(mps / KT)} kt`

const cards: DroneCardsData = {
  airspace: { big: 'Class D · 250 ft', line: 'LAANC near KNTU' },
  battery: { label: 'Battery · 47°F', big: '~38 min', line: '45 min rated · cold trims it' },
  sky: { big: 'Base 5,500 ft', line: 'vis 10 mi · rain 0% · KNTU' },
  kp: { big: 'Kp not received', line: 'NOAA did not answer' },
}
const hours = Array.from({ length: 24 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 16, i)), mps: (10 + (i % 5)) * KT }))
const bars = dayBars(hours, new Date('2026-11-16T16:30:00Z'), new Date('2026-11-16T11:10:00Z'), new Date('2026-11-16T21:53:00Z'), new Date('2026-11-16T22:20:00Z'), 23 * KT)

describe('Now (board Drone_P1)', () => {
  const data: DroneNowData = {
    speed: '15',
    unit: 'kt',
    fromLine: 'from NNW · gusts 22',
    limitLine: 'Under your 23 kt limit · gusts at 96%',
    towardDeg: 157.5,
    chip: 'Gusty now · calmer 3–4:50 PM (11 kt)',
    bars,
    barsLabel: 'Today at 400 ft · your limit 23 kt',
    marks: [{ key: 'start', text: 'now' }, { key: 'calm', text: 'calmer 3–4:50p', tone: 'calm' }, { key: 'sunset', text: 'sunset 4:53p' }, { key: 'dusk', text: 'twilight 5:20p', tone: 'dusk' }],
    barsNone: 'n/a',
  }
  const html = renderToStaticMarkup(<DroneNowView data={data} cards={cards} onAirspace={() => undefined} />)
  const words = text(html)

  it('says the wind, the limit and the chip as the board does', () => {
    expect(words).toContain('15 kt')
    expect(words).toContain('from NNW · gusts 22')
    expect(words).toContain('Under your 23 kt limit · gusts at 96%')
    expect(words).toContain('Gusty now · calmer 3–4:50 PM (11 kt)')
  })

  it('points the arrow where the wind blows', () => {
    expect(html).toContain('data-toward="158"')
  })

  it('draws a bar for each hour of light left, the limit line, sunset and dusk', () => {
    expect((html.match(/class="drp__bar /g) ?? []).length).toBe(bars!.bars.length)
    expect(html).toContain('drp__limitline')
    expect(html).toContain('drp__sunsetline')
    expect(html).toContain('drp__duskline')
    expect(words).toContain('sunset 4:53p')
    expect(words).toContain('twilight 5:20p')
  })

  it('has the four cards, the Airspace one a button, and never a bare dash for Kp', () => {
    expect([...html.matchAll(/class="wtile__label">([^<]+)</g)].map((m) => m[1])).toEqual(['Airspace', 'Battery · 47°F', 'Sky', 'GPS · Kp'])
    expect(html).toMatch(/<button[^>]*drp__tile--air[^>]*>.*Check TFRs ›/)
    expect(words).toContain('Kp not received')
  })

  it('never says safe or clear', () => {
    expect(words).not.toMatch(/\bsafe\b|all clear|clear to fly/i)
  })
})

describe('By height (board Drone_P2)', () => {
  const gh = Array.from({ length: 8 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 16, 15 + i)), mps10: 9 * KT, mps120: (14 + i) * KT }))
  const data: DroneHeightData = {
    headline: 'Best window 3–4:50 PM',
    sub: 'Now: NNW 15 kt at 400 ft, gusts 22 (limit 23).',
    grid: heightGrid(gh, 23 * KT, 250, new Date('2026-11-16T21:53:00Z')),
    label: 'Wind by height · kt · from NNW',
    ceilingLabel: 'LAANC 250 ft',
    hourLabels: ['now', '11a', '12p', '1p', '2p', '3p', '4p', '5p'],
    value: (mps) => (mps === null ? '—' : `${Math.round(mps / KT)}`),
    legend: gridLegend(23 * KT, DRONE_LIGHT_RATIO, (m) => m / KT),
    none: 'n/a',
  }
  const html = renderToStaticMarkup(<DroneHeightView data={data} cards={cards} onAirspace={() => undefined} />)

  it('has the headline, five heights by eight hours, and the ceiling between 300 and 200', () => {
    expect(text(html)).toContain('Best window 3–4:50 PM')
    expect([...html.matchAll(/class="drp__rowk" role="rowheader">([^<]+)</g)].map((m) => m[1])).toEqual(['400', '300', '200', '100', 'gnd'])
    expect((html.match(/role="cell"/g) ?? []).length).toBe(40)
    expect(html).toMatch(/drp__row drp__row--ceiling"[^>]*>\s*<span class="drp__rowk" role="rowheader">200</)
    expect(text(html)).toContain('LAANC 250 ft')
  })

  it('marks the sunset column and the legend from the same line', () => {
    expect((html.match(/drp__cell--sunset/g) ?? []).length).toBe(5)
    expect(text(html)).toContain('under 12')
    expect(text(html)).toContain('at your limit 23')
  })
})

describe('Plan (board Drone_P4)', () => {
  const base: DronePlanData = {
    wind: { fromDeg: 337.5, mps: 15 * KT },
    ratedMin: 45,
    tempC: (47 - 32) / 1.8,
    tempWords: '47°F',
    speed: kt,
    distanceUnit: 'ft',
    sunAtHeight: { big: 'Sets 4:55 PM', line: '2 min after the beach (4:53 PM): one more pass of light up high.' },
    lens: { big: 'Flare 225–265°', line: 'Facing WSW from 3:30 PM to sunset puts the low sun in frame.' },
    lensAir: { big: 'Lens fog unlikely', line: 'Dew point 32°F vs 47°F · 46°F at 400 ft' },
    lastFlight: null,
    lastFlightNone: 'Import a flight log CSV',
    lastFlightError: null,
    onImport: () => undefined,
    onForget: () => undefined,
  }

  it('turns back by a battery %, downwind out by default, with its inputs said', () => {
    const html = renderToStaticMarkup(<DronePlanView data={base} />)
    const words = text(html)
    expect(html).toMatch(/data-turn="\d+"/)
    expect(words).toMatch(/\d+% battery, if you fly 0\.8 mi SSE/)
    expect(words).toContain('15 kt headwind back')
    expect(words).toContain('47°F cold trims 16%')
    expect(words).toContain('landing with 25% left')
  })

  it('has the sun, lens and ice cards, and no birds card', () => {
    const words = text(renderToStaticMarkup(<DronePlanView data={base} />))
    expect(words).toContain('Sun at 400 ft')
    expect(words).toContain('Sets 4:55 PM')
    expect(words).toContain('Flare 225–265°')
    expect(words).toContain('Lens fog unlikely')
    expect(words).not.toMatch(/birds?/i)
  })

  it('offers a CSV import that stays on the phone, and forgets on request', () => {
    const none = renderToStaticMarkup(<DronePlanView data={base} />)
    expect(none).toMatch(/<input type="file" accept="\.csv/)
    expect(none).not.toContain('Forget it')
    const kept = renderToStaticMarkup(<DronePlanView data={{ ...base, lastFlight: { big: 'Sep 10 · 23 min · max 240 ft', line: 'Wind it felt: 13 kt · we forecast 11 kt.' } }} />)
    expect(text(kept)).toContain('Sep 10 · 23 min · max 240 ft')
    expect(kept).toContain('Forget it')
  })

  it('says when there is no wind to work from, rather than a number', () => {
    const words = text(renderToStaticMarkup(<DronePlanView data={{ ...base, wind: null }} />))
    expect(words).toContain('did not give the wind at 400 ft')
    expect(words).not.toMatch(/\d+% battery/)
  })
})
