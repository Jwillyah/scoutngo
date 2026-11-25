import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { CallRead } from '../src/core/briefing.ts'
import { ABOVE_FOG_LINE, type FogHour } from '../src/core/fogRisk.ts'
import { colorWords } from '../src/core/homeDay.ts'
import { skyMoment } from '../src/core/homeTiles.ts'
import { goAlertDue } from '../src/core/goAlert.ts'
import { skyCalls, type SkyDayFull } from '../src/core/skyCall.ts'
import { inlandFirst } from '../src/core/fogInland.ts'

/*
 * BATCH SIMPLE-3, SECTION 1.3 ON THE ONE SKY CALL. 23 Nov, 4:20-4:55 PM: sea
 * fog on the beach at Atlantic Park while inland the sky fired. A coastal
 * call drops a step for it (src/core/fogRisk.ts fogSkyCall); the drop is made
 * inside the one sky call object (src/core/skyCall.ts skyCalls, fed by
 * src/lib/useSkyCalls.ts with src/lib/useFogRain.ts fogAt), so the home
 * tile, its moment card, the Go alert, the Sky page and the color page all
 * read the dropped call. An inland spot, and a spot with no fog read, keep it.
 */
const TZ = 'America/New_York'
const venue = { lat: 36.851, lon: -75.98 }
const sunset = new Date('2026-11-23T21:50:00Z')
const now = new Date('2026-11-23T21:20:00Z')
const read: CallRead = { kind: 'sunset', event: sunset, call: 'Go', why: 'Mid deck lit with a gap toward the sun.', confirmed: true, colorFrom: new Date(sunset.getTime() - 10 * 60_000), colorTo: new Date(sunset.getTime() + 15 * 60_000), setUp: null, agree: 4, of: 5 }
const days: SkyDayFull[] = [{ events: { sunrise: null, sunset }, reads: { sunrise: null, sunset: read }, verdicts: { sunrise: null, sunset: null } }]
const hour = (o: Partial<FogHour>): FogHour => ({ at: sunset, level: 'high', kind: 'sea', reasons: ['dew 58 °F (KNTU) at or above the water 57 °F less 1', 'wind 6 kt onshore'], visMi: 10, coastal: true, ...o })
const callsWith = (fogAt: ((t: Date) => FogHour | null) | null) => skyCalls(days, now, venue, null, () => null, null, (d) => d.toISOString(), fogAt)

describe('the fog is inside the one sky call', () => {
  it('sea fog on the beach at the sunset: Go drops to Maybe, for every reader', () => {
    const c = callsWith(() => hour({}))
    expect(c.sunset?.call).toBe('Maybe')
    expect(c.sunset?.read?.call).toBe('Maybe')
    expect(c.sunset?.word).toBe(colorWords('Maybe'))
    expect(c.sunset?.fog?.dropped).toBe(true)
    expect(c.sunset?.fog?.line).toBe(ABOVE_FOG_LINE)
    /* The event the sky is about now is the same object: the home tile and the Sky page read `now` and `sunset`. */
    expect(c.now?.call).toBe('Maybe')
    expect(c.now?.read?.call).toBe(c.sunset?.read?.call)
    /* The moment card and the Go alert exist only for a Go: neither fires on the dropped call. */
    expect(skyMoment(c.now, now, TZ)).toBeNull()
    expect(goAlertDue(c.now, now, [], TZ)).toBeNull()
    /* And they do fire on the same Go without the fog: the check can fail. */
    const clear = callsWith(null)
    expect(skyMoment(clear.now, now, TZ)).not.toBeNull()
  })

  it('the five readers agree, fog or no fog', () => {
    for (const fogAt of [null, () => hour({}), () => hour({ coastal: false })]) {
      const c = callsWith(fogAt)
      const words = [c.now?.word, c.sunset?.word, colorWords(c.now?.read?.call ?? null), colorWords(c.sunset?.read?.call ?? null), colorWords(c.sunset?.call ?? null)]
      expect(new Set(words).size, JSON.stringify(words)).toBe(1)
    }
  })

  it('inland, or radiation fog, or no fog read: the call stands', () => {
    expect(callsWith(() => hour({ coastal: false })).sunset?.call).toBe('Go')
    expect(callsWith(() => hour({ kind: 'radiation' })).sunset?.call).toBe('Go')
    expect(callsWith(() => hour({ level: 'low', kind: null })).sunset?.fog?.dropped).toBe(false)
    expect(callsWith(null).sunset?.fog).toBeNull()
    expect(callsWith(() => null).sunset?.call).toBe('Go')
  })

  it('the hook hands the fog in: useSkyCalls passes useFogRain fogAt to skyCalls', () => {
    const src = readFileSync('src/lib/useSkyCalls.ts', 'utf8')
    expect(src).toMatch(/useFogRain\(venue, now, timeZone, \{ facing: brief\.facing \}\)\.fogAt/)
    expect(src).toMatch(/formatClock\(d, timeZone\), fogAt\)/)
  })
})

describe('Best spot near me, above the fog', () => {
  const r = (id: string, water: boolean, facing: number | null) => ({ spot: { id, water, facing } }) as unknown as Parameters<typeof inlandFirst>[0][number]
  const ranked = [r('beach', true, 100), r('pier', true, 95), r('lake-park', false, null), r('ridge', false, null)]
  it('with the fog line, the spots away from the water go first, in their own order', () => {
    expect(inlandFirst(ranked, true).map((x) => x.spot.id)).toEqual(['lake-park', 'ridge', 'beach', 'pier'])
  })
  it('without it, the ranking is untouched', () => {
    expect(inlandFirst(ranked, false).map((x) => x.spot.id)).toEqual(['beach', 'pier', 'lake-park', 'ridge'])
  })
  it('the page reads the line from the one sky call', () => {
    const src = readFileSync('src/components/BestSkyPage.tsx', 'utf8')
    expect(src).toMatch(/evCall\.fog\?\.line/)
    expect(src).toMatch(/inlandFirst\(found\.ranked, fogLine !== null\)/)
  })
})
