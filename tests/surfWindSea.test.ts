import { describe, expect, it } from 'vitest'
import { buoySeaKinds, forecastSeaKinds, seaEnergyAtBeach, seaKind, windSeaDominates, WIND_SEA_MAX_S, SWELL_FROM_S } from '../src/core/surfTransform.ts'
import { CHOP_WIND_KT, nearOffshore, OFFSHORE_HALF_DEG, seaChop, surfCall } from '../src/core/surfCall.ts'
import { forecastParts, buoyParts } from '../src/core/surfReads.ts'
import { hourlyAt } from '../src/lib/tideSheetData.ts'
import { rangeHourAt } from '../src/lib/surfPageData.ts'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { capeHenryAt, recordedDay, seaAt, spotPlace, TZ, VB } from './surfReplay.ts'

/*
 * THE QUALITY KEYS ON THE CHOP (Batch FIX, Section 3.1). 16 Nov 10:50 AM the
 * beach was wind-chopped by a N wind sea (fixtures/truth/2026-11-16-vb-surf.json)
 * and the model's NNW counted as cross-offshore, so "Poor · choppy" never
 * fired. Now: the wind sea against the swell at the beach, after the
 * transform, and the wind from anywhere but near offshore.
 */
const stats = spotStats([], 0)

describe('which part is wind sea', () => {
  it('by period first: under 6 s wind sea, 8 s and over swell, between as the source named it', () => {
    expect(WIND_SEA_MAX_S).toBe(6)
    expect(SWELL_FROM_S).toBe(8)
    expect(seaKind(3.5, 'swell')).toBe('wind')
    expect(seaKind(9, 'wind')).toBe('swell')
    expect(seaKind(7, 'swell')).toBe('swell')
    expect(seaKind(7, 'wind')).toBe('wind')
    expect(seaKind(null, 'swell')).toBe('swell')
  })

  it("17 Nov 7 AM: the forecast's 3.5 s \"swell\" is wind sea; NDBC's 11 s swell and 4.3 s wind waves keep their names", () => {
    const d = recordedDay('tests/data/surf-2026-11-17')
    const t = new Date('2026-11-17T12:30:00Z')
    const kinds = forecastSeaKinds((n) => hourlyAt(d.marine, n, t))
    expect(kinds.length).toBeGreaterThan(1)
    expect(kinds.every((k) => k.kind === 'wind')).toBe(true)
    const b = d.buoyAt('44099', new Date('2026-11-17T12:05:00Z'))
    if (b === null || b.status !== 'ok') throw new Error('no 44099 reading at 7:05 in the kept data')
    expect(b.split).toMatchObject({ swellS: 11.1, windWaveS: 4.3, windWaveFrom: 'NE' })
    expect(buoySeaKinds(b).map((k) => k.kind)).toEqual(['swell', 'wind'])
  })

  it('the parts on screen are named by the same rule: the map can no longer call a 3 s sea "swell"', () => {
    const d = recordedDay('tests/data/surf-2026-11-17')
    const t = new Date('2026-11-17T12:30:00Z')
    const parts = forecastParts((n) => hourlyAt(d.marine, n, t))
    expect(parts.length).toBeGreaterThan(0)
    expect(parts.filter((p) => p.name === 'Wind waves').length).toBe(1)
    expect(parts.some((p) => p.name === 'Swell' && (p.periodS ?? 0) < WIND_SEA_MAX_S)).toBe(false)
    expect(buoyParts({ swellM: 0.1, swellS: 11.1, swellFrom: 'E', windWaveM: 0.9, windWaveS: 4.3, windWaveFrom: 'NE' }).map((p) => p.name)).toEqual(['Swell', 'Wind waves'])
  })
})

describe('the wind sea dominates', () => {
  it('at twice the swell energy at the beach, after the transform', () => {
    expect(windSeaDominates({ windFt2: 2, swellFt2: 1 })).toBe(true)
    expect(windSeaDominates({ windFt2: 1.99, swellFt2: 1 })).toBe(false)
    expect(windSeaDominates({ windFt2: 0, swellFt2: 0 })).toBe(false)
    expect(windSeaDominates(null)).toBe(null)
  })

  it('a wind sea heading away from the beach reaches it with nothing, and does not dominate', () => {
    const away = [{ heightM: 1, periodS: 4, fromDeg: 280, kind: 'wind' as const }, { heightM: 0.2, periodS: 10, fromDeg: 100, kind: 'swell' as const }]
    const e = seaEnergyAtBeach(away, 100, 0.833)
    expect(e?.windFt2).toBe(0)
    expect(windSeaDominates(e)).toBe(false)
  })
})

describe('the chop rule', () => {
  it(`${CHOP_WIND_KT} kt or more, from anywhere but within ${OFFSHORE_HALF_DEG}° of straight offshore`, () => {
    /* A beach facing 100°: offshore is from 280°. */
    expect(nearOffshore(280, 100)).toBe(true)
    expect(nearOffshore(310, 100)).toBe(true)
    expect(nearOffshore(311, 100)).toBe(false)
    expect(nearOffshore(337.5, 100)).toBe(false)
    expect(seaChop(10, 337.5, 100, true)).toBe(true)
    expect(seaChop(9.9, 337.5, 100, true)).toBe(false)
    expect(seaChop(14, 290, 100, true)).toBe(false)
    expect(seaChop(14, 337.5, 100, false)).toBe(false)
    /* Not known is not chop. */
    expect(seaChop(14, null, 100, true)).toBe(false)
    expect(seaChop(14, 0, null, true)).toBe(false)
    expect(seaChop(null, 0, 100, true)).toBe(false)
  })

  it('a choppy hour is never clean and says "Poor · choppy" at Small', () => {
    const c = surfCall({ centerFt: 1.3, shape: 'Bumpy', side: 'cross-offshore', chop: true }, 0)
    expect(c?.quality).toBe('Poor · choppy')
  })
})

describe('16 Nov 10:50 AM, replayed with the forecast and with Cape Henry', () => {
  const d = recordedDay('tests/data/surf-2026-11-16')
  const t = new Date('2026-11-16T15:50:00Z')

  it('the NNW the model blew counted as cross-offshore, and the wind sea dominated at the beach', () => {
    const h = rangeHourAt(d.marine, d.wind, new Date('2026-11-16T15:30:00Z'), VB.facing, stats, 0.833)
    expect(h?.side).toBe('Cross-offshore')
    expect(h?.windSeaDominant).toBe(true)
  })

  it('with the station the phone had (Cape Henry, 13 kt N at 15:42Z), no beach is "clean"; 1st St is Poor · choppy; Croatan, in its lee, is neither', () => {
    const at = (p: ReturnType<typeof spotPlace>) => {
      const st = capeHenryAt(t, p.facing)
      expect(st?.rawKt).toBe(13.02)
      return surfNowFrom(seaAt(d, p, t), stats, t, TZ, st?.obs ?? null)
    }
    const vb = at(VB)
    expect(vb.now?.clean).toBe(false)
    const first = at(spotPlace('vb-1st-street-jetty'))
    expect(first.week[0].call?.quality).toBe('Poor · choppy')
    const croatan = at(spotPlace('vb-croatan'))
    expect(croatan.now?.clean).toBe(false)
    expect(croatan.week[0].call?.quality).toBe(null)
  })

  it('VB itself: the station carried to 10 m reads under 10 kt, so "Poor · choppy" does not fire there (measurements/2026-11-17-surf-fix.md)', () => {
    const st = capeHenryAt(t, VB.facing)
    const r = surfNowFrom(seaAt(d, VB, t), stats, t, TZ, st?.obs ?? null)
    expect(r.now?.windKt ?? 0).toBeLessThan(CHOP_WIND_KT)
    expect(r.week[0].call?.quality).toBe(null)
  })
})
