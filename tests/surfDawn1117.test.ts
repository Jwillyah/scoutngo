import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { surfNowFrom } from '../src/lib/useSurfNow.ts'
import { spotStats } from '../src/core/spotSkill.ts'
import { capeHenryAt, recordedDay, seaAt, spotPlace, TZ, VB } from './surfReplay.ts'

/*
 * 17 NOV 7:05 AM, THE DAWN LOOK (Batch FIX, Section 3.5;
 * fixtures/truth/2026-11-17-vb-dawn.json): 1st St 0-1, shin to knee, N 13
 * g15 cross-shore; ours said 1-2 "ankle to knee", the buoy 44099 3.0 ft 4 s
 * NE "as faces 1.2 ft". 0-1 or 1-2 is a fair call; "clean" must not show.
 * The data is tests/data/surf-2026-11-17/, read 20-30 minutes after the look.
 */
const truth = JSON.parse(readFileSync('fixtures/truth/2026-11-17-vb-dawn.json', 'utf8')) as { observedAt: string; truth: { observed: string; wind: string } }
const d = recordedDay('tests/data/surf-2026-11-17')
const now = new Date(truth.observedAt)
const stats = spotStats([], 0)

describe('17 Nov 7:05 AM, VB and 1st St', () => {
  it('the look and the reading the phone had: 44099 0.9 m (3.0 ft), 4 s, NE', () => {
    expect(now.toISOString()).toBe('2026-11-17T12:05:00.000Z')
    expect(truth.truth.observed).toContain('0-1')
    const b = d.buoyAt('44099', now)
    if (b === null || b.status !== 'ok') throw new Error('no 44099 reading at 7:05 in the kept data')
    expect([b.waveM, b.periodS, b.fromDeg]).toEqual([0.9, 4, 49])
  })

  for (const place of [VB, spotPlace('vb-1st-street-jetty')]) {
    for (const withStation of [false, true]) {
      it(`${place.name}, ${withStation ? 'with Cape Henry' : 'the forecast’s wind alone'}: 0-1 or 1-2, and not clean`, () => {
        const st = withStation ? (capeHenryAt(now, place.facing)?.obs ?? null) : null
        if (withStation) expect(st).not.toBe(null)
        const r = surfNowFrom(seaAt(d, place, now), stats, now, TZ, st)
        const call = r.week[0].call
        expect(['0–1 ft', '1–2 ft']).toContain(call?.words)
        expect(r.now?.clean).toBe(false)
        expect(r.now?.shape).not.toBe('Clean')
        expect(call?.wind).not.toMatch(/^clean/)
      })
    }
  }

  it('with the station, the N wind sea that dominated the beach makes it "Poor · choppy" at VB', () => {
    const r = surfNowFrom(seaAt(d, VB, now), stats, now, TZ, capeHenryAt(now, VB.facing)?.obs ?? null)
    expect(r.now?.windSeaDominant).toBe(true)
    expect(r.week[0].call?.quality).toBe('Poor · choppy')
  })
})
