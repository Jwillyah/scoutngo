import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DRONE_LIGHT_RATIO } from '../core/briefing.ts'
import { gridLegend, heightGrid } from '../core/droneHeight.ts'
import { dayBars } from '../core/droneNow.ts'
import { DroneHeightView, type DroneHeightData } from './DroneHeight.tsx'
import { DroneNowView, type DroneNowData, type DroneRow } from './DroneNow.tsx'
import { DronePlanView, type DronePlanData } from './DronePlan.tsx'
import { DronePreflightView } from './DronePreflight.tsx'
import { preflightRows } from '../core/dronePreflight.ts'

/*
 * THE DRONE PAGE'S VIEWS (Batch DRONE, Section 2; Batch FIX, Section 6:
 * boards Drone_Slim_1, 2, 4), rendered with what DronePage.tsx hands them.
 * They only render: every number here came from src/core.
 */
const KT = 0.514444
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/\s+/g, ' ').trim()
const kt = (mps: number) => `${Math.round(mps / KT)} kt`

const rows: DroneRow[] = [
  { key: 'airspace', label: 'Airspace', big: 'Class C · 100 ft', small: 'KORF', tone: 'drone', onTap: () => undefined },
  { key: 'battery', label: 'Battery', big: '~37 min', small: '46°F cold' },
  { key: 'sky', label: 'Sky', big: 'Little cloud', small: 'vis 10 mi' },
  { key: 'gps', label: 'GPS', big: 'Quiet', small: 'Kp 2 · 7:00 AM' },
]
const hours = Array.from({ length: 24 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 16, i)), mps: (10 + (i % 5)) * KT }))
const bars = dayBars(hours, new Date('2026-11-16T16:30:00Z'), new Date('2026-11-16T11:10:00Z'), new Date('2026-11-16T21:53:00Z'), new Date('2026-11-16T22:20:00Z'), 23 * KT)

describe('Now (board Drone_Slim_1)', () => {
  const data: DroneNowData = {
    speed: '7',
    unit: 'kt',
    fromLine: 'from NNE · gusts 11 · at 400 ft',
    towardDeg: 202.5,
    dial: 'arrow',
    chip: { text: 'Under your limit until sunset 4:53 PM · gusts 46%', tone: 'ok' },
    note: null,
    bars,
    barsLabel: 'Today at 400 ft',
    marks: [{ key: 'start', text: 'now' }, { key: 'sunset', text: 'sunset 4:53p' }],
    barsNone: 'n/a',
  }
  const html = renderToStaticMarkup(<DroneNowView data={data} rows={rows} />)
  const words = text(html)

  it('says the number, "from NNE · gusts 11 · at 400 ft" and ONE teal chip', () => {
    expect(words).toContain('7 kt')
    expect(words).toContain('from NNE · gusts 11 · at 400 ft')
    expect((html.match(/class="drp__chip /g) ?? []).length).toBe(1)
    expect(html).toContain('drp__chip--ok')
    expect(words).toContain('Under your limit until sunset 4:53 PM · gusts 46%')
    expect(words).not.toMatch(/calm now/i)
  })

  it('the chip is orange only for trouble', () => {
    const trouble = renderToStaticMarkup(<DroneNowView data={{ ...data, chip: { text: 'Over your 23 kt limit · gusts 130%', tone: 'trouble' } }} rows={rows} />)
    expect(trouble).toContain('drp__chip--trouble')
    expect(html).not.toContain('drp__chip--trouble')
  })

  it('points the arrow where the wind blows', () => {
    expect(html).toContain('data-toward="203"')
  })

  it('draws a bar for each hour of light left, the limit line and sunset', () => {
    expect((html.match(/class="drp__bar /g) ?? []).length).toBe(bars!.bars.length)
    expect(html).toContain('drp__limitline')
    expect(html).toContain('drp__sunsetline')
    expect(words).toContain('sunset 4:53p')
  })

  it('four one-line rows, not cards; the Airspace row is a button', () => {
    expect([...html.matchAll(/class="drp__rlabel">([^<]+)</g)].map((m) => m[1])).toEqual(['Airspace', 'Battery', 'Sky', 'GPS'])
    expect(html).not.toContain('wtile')
    expect(html).toMatch(/<button type="button" class="drp__rowin drp__rowbtn">\s*<span class="drp__rlabel">Airspace</)
    expect(words).toContain('Class C · 100 ft')
  })

  it('no GPS row when there has never been a Kp', () => {
    const none = renderToStaticMarkup(<DroneNowView data={data} rows={rows.filter((r) => r.key !== 'gps')} />)
    expect(none).not.toContain('>GPS<')
    expect(text(none)).not.toMatch(/Kp not received/)
  })

  it('with no chip, says why', () => {
    const w = text(renderToStaticMarkup(<DroneNowView data={{ ...data, chip: null, note: 'Add your drone in Settings › My gear for its wind limit' }} rows={rows} />))
    expect(w).toContain('My gear')
  })

  it('never says safe or clear', () => {
    expect(words).not.toMatch(/\bsafe\b|\bclear\b/i)
  })
})

describe('By height (board Drone_Slim_2)', () => {
  const gh = Array.from({ length: 8 }, (_, i) => ({ at: new Date(Date.UTC(2026, 10, 16, 15 + i)), mps10: 9 * KT, mps120: (14 + i) * KT }))
  const data: DroneHeightData = {
    headline: 'Best 3–4:50 PM',
    sub: '9–21 kt from NNW at every height · limit 23',
    grid: heightGrid(gh, 23 * KT, 250, new Date('2026-11-16T21:53:00Z')),
    label: 'kt by height',
    ceilingLabel: 'your ceiling 250 ft',
    hourLabels: ['now', '11a', '12p', '1p', '2p', '3p', '4p', '5p'],
    value: (mps) => (mps === null ? '—' : `${Math.round(mps / KT)}`),
    legend: gridLegend(23 * KT, DRONE_LIGHT_RATIO, (m) => m / KT),
    none: 'n/a',
  }
  const html = renderToStaticMarkup(<DroneHeightView data={data} />)

  it('has the headline, five heights by eight hours, and the ceiling between 300 and 200', () => {
    expect(text(html)).toContain('Best 3–4:50 PM')
    expect(text(html)).toContain('9–21 kt from NNW at every height · limit 23')
    expect([...html.matchAll(/class="drp__rowk" role="rowheader">([^<]+)</g)].map((m) => m[1])).toEqual(['400', '300', '200', '100', 'gnd'])
    expect((html.match(/role="cell"/g) ?? []).length).toBe(40)
    expect(html).toMatch(/drp__row drp__row--ceiling"[^>]*>\s*<span class="drp__rowk" role="rowheader">200</)
    expect(text(html)).toContain('your ceiling 250 ft')
  })

  it('has no cards: they repeated Now’s and sat behind the buttons', () => {
    expect(html).not.toMatch(/wtile|drp__rowline/)
  })

  it('marks the sunset column and the legend from the same line', () => {
    expect((html.match(/drp__cell--sunset/g) ?? []).length).toBe(5)
    expect(text(html)).toContain('under 12')
    expect(text(html)).toContain('at your limit 23')
  })
})

describe('Plan (board Drone_Slim_4)', () => {
  const base: DronePlanData = {
    wind: { fromDeg: 337.5, mps: 15 * KT },
    ratedMin: 45,
    tempC: (47 - 32) / 1.8,
    tempWords: '47°F',
    speed: kt,
    distanceUnit: 'ft',
    sunAtHeight: { big: 'Sets 4:55 PM', small: '+2 min' },
    lens: { big: 'Low sun SE', small: 'until 9:29 AM' },
    lensFog: { big: 'Possible', small: 'dew 40°F / 46°F', notice: true },
    lastFlight: null,
    lastFlightNone: null,
    lastFlightError: null,
    onImport: () => undefined,
    onForget: () => undefined,
  }

  it('turns back at a battery %, one line, two pickers; the rest behind ⓘ; no bar', () => {
    const html = renderToStaticMarkup(<DronePlanView data={base} />)
    const words = text(html)
    expect(html).toMatch(/data-turn="\d+"/)
    expect(words).toMatch(/\d+% flying 0\.8 mi SSE · 15 kt headwind home/)
    expect((html.match(/<select/g) ?? []).length).toBe(2)
    expect(html).toContain('aria-label="How the turn-back is worked out"')
    expect(html).not.toMatch(/drp__turnbar|drp__turnout|drp__turnres/)
    expect(words).not.toContain('landing with 25% left')
  })

  it('four one-line rows: Sun at 400 ft · Sun in lens · Lens fog · Last flight', () => {
    const html = renderToStaticMarkup(<DronePlanView data={base} />)
    expect([...html.matchAll(/class="drp__rlabel">([^<]+)</g)].map((m) => m[1])).toEqual(['Sun at 400 ft', 'Sun in lens', 'Lens fog', 'Last flight'])
    const words = text(html)
    expect(words).toContain('Sets 4:55 PM +2 min')
    expect(words).toContain('Low sun SE until 9:29 AM')
    expect(words).toContain('Possible dew 40°F / 46°F')
    expect(html).toContain('drp__rbig--caution')
    expect(words).not.toMatch(/birds?/i)
    expect(html).not.toContain('wtile')
  })

  it('offers a CSV import that stays on the phone, and forgets on request', () => {
    const none = renderToStaticMarkup(<DronePlanView data={base} />)
    expect(none).toMatch(/<input type="file" accept="\.csv/)
    expect(text(none)).toContain('Import a log › on this phone')
    expect(none).not.toContain('Forget it')
    const kept = renderToStaticMarkup(<DronePlanView data={{ ...base, lastFlight: { big: 'Sep 10 · 23 min · max 240 ft', small: 'felt 13 kt · forecast 11 kt' } }} />)
    expect(text(kept)).toContain('Sep 10 · 23 min · max 240 ft')
    expect(kept).toContain('Forget it')
  })

  it('says when there is no wind to work from, rather than a number', () => {
    const words = text(renderToStaticMarkup(<DronePlanView data={{ ...base, wind: null }} />))
    expect(words).toContain('did not give the wind at 400 ft')
    expect(words).not.toMatch(/\d+% battery/)
  })
})

describe('the Wind tab and Preflight (Batch SIMPLE-1, Section 1)', () => {
  const nowData: DroneNowData = { speed: '0', unit: 'kt', fromLine: 'gusts 2 · at 400 ft', towardDeg: null, dial: 'calm', chip: null, note: null, bars: null, barsLabel: 'Today at 400 ft', marks: [], barsNone: 'n/a' }

  it('calm says "Calm" in the compass, never an empty circle', () => {
    const html = renderToStaticMarkup(<DroneNowView data={nowData} rows={[]} />)
    expect(html).toContain('data-calm')
    expect(text(html)).toContain('Calm')
    expect(html).not.toContain('data-toward')
    expect(html).toContain('Calm: no wind direction')
  })

  it('no direction and not calm is a dash, not an empty circle', () => {
    const html = renderToStaticMarkup(<DroneNowView data={{ ...nowData, speed: '12', dial: 'none' }} rows={[]} />)
    expect(html).toContain('data-nodir')
    expect(html).not.toContain('data-calm')
  })

  it('with no rows the Wind tab draws none', () => {
    const html = renderToStaticMarkup(<DroneNowView data={nowData} rows={[]} />)
    expect(html).not.toContain('drp__rows')
  })

  it('Preflight is a list of rows, green or amber, each with its words', () => {
    const rows = preflightRows({
      air: null, marked: null, mps400: null, gust400: null, limitMps: null, speed: kt, ratedMin: 38, tempC: null, temp: (c) => `${c}`,
      now: new Date('2026-11-18T14:00:00Z'), sunset: null, dusk: null, clock: () => '', tfr: { kind: 'failed' }, timeZone: 'America/New_York', fria: 'unknown', kp: null, kpWord: () => '',
    })
    const html = renderToStaticMarkup(<DronePreflightView rows={rows} />)
    expect((html.match(/<li /g) ?? []).length).toBe(8)
    expect(html).toContain('data-tone="amber"')
    expect(html).not.toContain('data-tone="green"')
    expect(text(html)).toContain('TFRs: couldn’t check')
    expect(text(html)).not.toMatch(/\b(clear|safe)\b/i)
  })
})
