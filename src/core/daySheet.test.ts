import { describe, expect, it } from 'vitest'
import { dayWords, daySheet, lightEdges, lightWord, shiftDate, warningsLine, type DayWx } from './daySheet.ts'
import { sunApparentCrossings2, sunRiseSet2, sunPosition2 } from './ephemeris2.ts'
import { formatClock, zonedTimeToUtc } from './timezone.ts'

/*
 * THE DAY SHEET, AGAINST A SECOND EPHEMERIS (Batch SIMPLE-3, S4.7).
 *
 * Fixture: Atlantic Park Surf, Virginia Beach (36.851, -75.980), Sat 21 Nov
 * 2026. The batch gives sunrise 6:51, sunset 4:47, noon 33° at 11:49, golden
 * 6:51-7:26 and 4:12-4:47, blue 6:31-6:51 and 4:47-5:08, each "within 2 min of
 * a second ephemeris". Asserted twice: our edges against
 * src/core/ephemeris2.ts (Meeus, no suncalc code) to 2 minutes, and against
 * the batch's numbers.
 *
 * THE BATCH'S SUNRISE, SUNSET AND BLUE TIMES DISAGREE WITH BOTH EPHEMERIDES.
 * Ours and the second ephemeris agree to 0.4 min everywhere; the batch's
 * 6:51, 4:47 and the blue ends sit 2 to 4 min off both (sunrise 6:48, sunset
 * 4:50). Only golden and noon match the batch. The code is not bent: the
 * known gaps are pinned below (4.5 min at most) so a change in either
 * direction shows. Table: measurements/2026-11-24-day-sheet-fixture.md,
 * written by scripts/measure-day-sheet-fixture.mjs.
 */
const LAT = 36.851
const LON = -75.98
const TZ = 'America/New_York'
const DATE = '2026-11-21'
const TOL = 2 * 60_000

const at = (hhmm: string) => zonedTimeToUtc(DATE, hhmm, TZ)!
const dayFrom = at('00:00')
const dayTo = at('23:59')

describe('S4.7 fixture: the edges of the light', () => {
  const e = lightEdges(DATE, LAT, LON, TZ)
  const batch = {
    sunrise: at('06:51'),
    sunset: at('16:47'),
    goldenEnds: at('07:26'),
    goldenStarts: at('16:12'),
    blueFrom: at('06:31'),
    blueTo: at('17:08'),
  }
  const second = {
    sunrise: sunRiseSet2(dayFrom, dayTo, LAT, LON).find((x) => x.rising)!.at,
    sunset: sunRiseSet2(dayFrom, dayTo, LAT, LON).find((x) => !x.rising)!.at,
    goldenEnds: sunApparentCrossings2(dayFrom, dayTo, LAT, LON, 6).find((x) => !x.rising ? false : true)!.at,
    goldenStarts: sunApparentCrossings2(dayFrom, dayTo, LAT, LON, 6).find((x) => !x.rising)!.at,
    blueFrom: sunApparentCrossings2(dayFrom, dayTo, LAT, LON, -4).find((x) => x.rising)!.at,
    blueTo: sunApparentCrossings2(dayFrom, dayTo, LAT, LON, -4).find((x) => !x.rising)!.at,
  }
  const matchesBatch = ['goldenEnds', 'goldenStarts']
  for (const k of Object.keys(batch) as (keyof typeof batch)[]) {
    it(`${k}: ours within 2 min of the second ephemeris; ${matchesBatch.includes(k) ? 'within 2 min of' : 'known gap, under 4.5 min, from'} the batch`, () => {
      const ours = e[k]!
      expect(Math.abs(ours.getTime() - second[k].getTime())).toBeLessThanOrEqual(TOL)
      const gap = Math.abs(ours.getTime() - batch[k].getTime())
      expect(gap).toBeLessThanOrEqual(matchesBatch.includes(k) ? TOL : 4.5 * 60_000)
    })
  }
  it('noon: 33° at 11:49, and the second ephemeris agrees on the height', () => {
    expect(e.noon).not.toBeNull()
    expect(Math.abs(e.noon!.at.getTime() - at('11:49').getTime())).toBeLessThanOrEqual(TOL)
    expect(Math.round(e.noon!.altitude)).toBe(33)
    expect(Math.round(sunPosition2(e.noon!.at, LAT, LON).altitude)).toBe(33)
  })
  it('the printed times are what the two ephemerides say, not the batch\'s 6:51 and 4:47', () => {
    expect(formatClock(e.sunrise!, TZ)).toBe('6:48 AM')
    expect(formatClock(e.sunset!, TZ)).toBe('4:50 PM')
  })
})

describe('the hour rows', () => {
  const wx: DayWx = (name, t) => {
    const h = Number(formatClock(t, TZ).split(':')[0])
    return { cloud_cover: 70, wind_speed_10m: 4 + (h % 12) * 0.5, wind_direction_10m: 45, precipitation_probability: h === 4 ? 60 : 5 }[name]
  }
  const now = at('09:20')
  const sheet = daySheet({ date: DATE, lat: LAT, lon: LON, timeZone: TZ, now, wx })
  it('runs first light to last light: 6a to 5p, twelve rows', () => {
    expect(sheet.rows.map((r) => r.label)).toEqual(['6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p'])
  })
  it('names the windows where they start, and the current hour is 9a', () => {
    expect(sheet.rows[0].word).toBe('Blue 6:29 AM')
    expect(sheet.rows[1].word).toBe('Golden')
    expect(sheet.rows[10].word).toBe('Golden 4:13 PM')
    expect(sheet.rows[11].word).toBe('Blue to 5:11 PM')
    expect(sheet.rows.filter((r) => r.current).map((r) => r.label)).toEqual(['9a'])
  })
  it('the arrow is the way the light travels: the sun bearing plus 180', () => {
    for (const r of sheet.rows) expect(Math.round((r.travel - r.azimuth + 360) % 360)).toBe(180)
    /* Morning sun is in the south east, so the light runs north west. */
    expect(sheet.rows[3].azimuth).toBeGreaterThan(90)
    expect(sheet.rows[3].azimuth).toBeLessThan(180)
    expect(sheet.rows[3].travel).toBeGreaterThan(270)
  })
  it('cloud, wind and rain come through; the wind is read as a direction word', () => {
    expect(sheet.rows[3].cloud).toBe(70)
    expect(sheet.rows[3].windFrom).toBe('NE')
    expect(sheet.rows[10].rain).toBe(60)
  })
  it('a warnings line comes from the rows, and no fog input is no fog mark', () => {
    expect(sheet.rows.some((r) => r.fog)).toBe(false)
    expect(warningsLine(sheet, true)).toContain('Rain chance 60% at 4p')
  })
  it('fog is an input: a high hour gets the mark and the line', () => {
    const fogged = daySheet({ date: DATE, lat: LAT, lon: LON, timeZone: TZ, now, wx, fogAt: (h) => formatClock(h, TZ).startsWith('7:') || formatClock(h, TZ).startsWith('8:') })
    expect(fogged.rows.filter((r) => r.fog).map((r) => r.label)).toEqual(['7a', '8a'])
    expect(warningsLine(fogged, true)).toContain('Fog risk is high 7a–9a')
  })
  it('without a forecast the cells are null (dashes), never zero, and the line says so', () => {
    const none = daySheet({ date: DATE, lat: LAT, lon: LON, timeZone: TZ, now, wx: null })
    expect(none.rows.every((r) => r.cloud === null && r.windMps === null && r.rain === null && r.windFrom === null)).toBe(true)
    expect(warningsLine(none, false)).toMatch(/forecast did not say/)
  })
  it('the strip has bands that tile the span, a curve and a now line', () => {
    expect(sheet.bands[0].band).toBe('blue')
    expect(sheet.bands[sheet.bands.length - 1].band).toBe('blue')
    expect(sheet.bands.some((b) => b.band === 'golden')).toBe(true)
    expect(sheet.bands.some((b) => b.band === 'top')).toBe(true)
    for (let i = 1; i < sheet.bands.length; i += 1) expect(sheet.bands[i].from).toBe(sheet.bands[i - 1].to)
    expect(sheet.nowAt).toBe(now.getTime())
    expect(daySheet({ date: DATE, lat: LAT, lon: LON, timeZone: TZ, now: at('22:00'), wx }).nowAt).toBeNull()
  })
})

describe('the words', () => {
  it('light words by height and cloud', () => {
    expect(lightWord(3, 10)).toBe('Golden')
    expect(lightWord(12, 10)).toBe('Warm side')
    expect(lightWord(20, 70)).toBe('Side · soft')
    expect(lightWord(33, 80)).toBe('Top · soft')
    expect(lightWord(33, null)).toBe('Top')
    expect(lightWord(33, 95)).toBe('Flat')
  })
  it('dates', () => {
    expect(dayWords(DATE)).toBe('Sat, Nov 21')
    expect(shiftDate('2026-11-30', 1)).toBe('2026-12-01')
  })
})
