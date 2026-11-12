import { describe, expect, it } from 'vitest'
import { betterColorLine, rankSpots, scoreAt } from '../src/core/bestSky.ts'
import { STARTER_SPOTS } from '../src/data/bestSkySpots.ts'
import { eventOf, replay, spot } from './bestSkyReplay.ts'

/* THE HOME'S ROW (Batch BEST SKY, Section 4): when the best spot beats where you are. */
describe('the home row', () => {
  it('11 Nov from the pier: "Better color … · Lynnhaven Inlet · 4:55"; none when here is as good', () => {
    const grid = replay('2026-11-11', 'sunset', null)
    const pier = spot('vb-pier')
    const ranked = rankSpots(grid, STARTER_SPOTS, eventOf('2026-11-11', 'sunset').az, pier)
    expect(betterColorLine(ranked, scoreAt(grid, pier), pier, '4:55', true)).toMatch(/^Better color \d+ mi W?N\w* · Lynnhaven Inlet · 4:55$/)
    const inlet = spot('lynnhaven-inlet')
    expect(betterColorLine(rankSpots(grid, STARTER_SPOTS, eventOf('2026-11-11', 'sunset').az, inlet), scoreAt(grid, inlet), inlet, '4:55', true)).toBeNull()
  })
})
