import { describe, expect, it } from 'vitest'
import { getPosition, getTimes } from 'suncalc'
import { lightMarks, lightTimeline, type LightSegment } from '../src/core/skyPage.ts'
import { formatClock } from '../src/core/timezone.ts'

/*
 * THE SKY PAGE'S LIGHT, IN ORDER AND NEVER ON TOP OF ITSELF (Batch SIMPLE-3,
 * Section 3.4). 23 Nov at Atlantic Park the page read Golden 4:12–5:07 PM
 * past a 4:50 PM sunset, and Color 5:07–5:17 over Blue 5:10–5:21: the color
 * segment was the call's window, and golden ran up to it.
 */
const LAT = 36.851
const LON = -75.98
const TZ = 'America/New_York'
const alt = (t: Date) => getPosition(t, LAT, LON).altitude
const clock = (d: Date) => formatClock(d, TZ, 12)
const spans = (segs: LightSegment[]) => segs.map((s) => `${s.key} ${clock(s.from)}–${clock(s.to)}`)

function ordered(segs: LightSegment[]): void {
  for (const s of segs) expect(s.to.getTime()).toBeGreaterThan(s.from.getTime())
  for (let i = 1; i < segs.length; i += 1) expect(segs[i].from.getTime()).toBeGreaterThanOrEqual(segs[i - 1].to.getTime())
}

describe('23 Nov 2026 at Atlantic Park Surf, the call saying 5:07–5:17 PM', () => {
  const set = getTimes(new Date('2026-11-23T17:00:00Z'), LAT, LON).sunset as Date
  const rise = getTimes(new Date('2026-11-23T17:00:00Z'), LAT, LON).sunrise as Date

  it('sunset: golden ends at the sunset, color to −4°, blue to −6°', () => {
    const segs = lightTimeline('sunset', set, lightMarks('sunset', set, alt), new Date('2026-11-23T22:07:00Z'), new Date('2026-11-23T22:17:00Z'))
    expect(spans(segs)).toEqual(['golden 4:12 PM–4:50 PM', 'color 4:50 PM–5:10 PM', 'blue 5:10 PM–5:21 PM', 'dark 5:21 PM–5:51 PM'])
  })

  it('sunrise with no call: blue, color up to the sunrise, golden from it', () => {
    const segs = lightTimeline('sunrise', rise, lightMarks('sunrise', rise, alt), null, null)
    expect(spans(segs)).toEqual(['dark 5:50 AM–6:20 AM', 'blue 6:20 AM–6:31 AM', 'color 6:31 AM–6:50 AM', 'golden 6:50 AM–7:28 AM'])
  })
})

describe('a year of days: every bar ordered and disjoint, golden meeting the sun at the horizon', () => {
  /* Call windows that start early, late, and run long into blue and dark. */
  const calls: [number, number][] = [[-10, 10], [-1, 17], [17, 27], [5, 60], [-40, -20]]

  it('365 sunsets and 365 sunrises at Atlantic Park', () => {
    let examined = 0
    for (let d = 0; d < 365; d += 1) {
      const noon = new Date(Date.UTC(2026, 0, 1 + d, 17))
      const t = getTimes(noon, LAT, LON)
      for (const kind of ['sunset', 'sunrise'] as const) {
        const event = (kind === 'sunset' ? t.sunset : t.sunrise) as Date
        const marks = lightMarks(kind, event, alt)
        for (const [a, b] of calls) {
          const segs = lightTimeline(kind, event, marks, new Date(event.getTime() + a * 60_000), new Date(event.getTime() + b * 60_000))
          expect(segs.map((s) => s.key)).toEqual(kind === 'sunset' ? ['golden', 'color', 'blue', 'dark'] : ['dark', 'blue', 'color', 'golden'])
          ordered(segs)
          const golden = segs.find((s) => s.key === 'golden')!
          if (kind === 'sunset') expect(golden.to).toEqual(event)
          else expect(golden.from).toEqual(event)
          const color = segs.find((s) => s.key === 'color')!
          const blue = segs.find((s) => s.key === 'blue')!
          if (kind === 'sunset') expect(color.to).toEqual(blue.from)
          else expect(color.from).toEqual(blue.to)
          examined += 1
        }
      }
    }
    /* Not a pass on nothing: every day and every call window was looked at. */
    expect(examined).toBe(365 * 2 * calls.length)
  })

  it('far north in June (the sun never reaches −4°): still ordered, color from the call', () => {
    const lat = 64.8
    const lon = -147.7
    const t = getTimes(new Date('2026-06-21T21:00:00Z'), lat, lon)
    const set = t.sunset as Date
    const a = (x: Date) => getPosition(x, lat, lon).altitude
    const segs = lightTimeline('sunset', set, lightMarks('sunset', set, a), null, new Date(set.getTime() + 25 * 60_000))
    expect(segs.length).toBeGreaterThan(0)
    ordered(segs)
    expect(segs.find((s) => s.key === 'golden')?.to).toEqual(set)
  })
})
