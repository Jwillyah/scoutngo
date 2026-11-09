import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { skyCard, type CardDay } from '../src/core/menuCards.ts'
import type { FireVerdict } from '../src/core/fireOutlook.ts'

/*
 * C2: the Menu's Sky card still said "Fire" / "likely 5:12 PM" after Batch M
 * renamed Sky fire to Sky color. It says "Sunset color likely" now, and
 * possible and unlikely the same way, for sunrise and sunset.
 */
const clock = (d: Date) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`
const verdict = (word: FireVerdict['word']): FireVerdict => ({
  word,
  line: '',
  agree: word === 'likely' ? 4 : word === 'possible' ? 2 : 0,
  of: 5,
  perLayer: [],
  models: [],
  sky: { layers: [] } as unknown as FireVerdict['sky'],
  why: word === 'unlikely' ? 'lid' : null,
  station: null,
})
const day = (kind: 'sunrise' | 'sunset', word: FireVerdict['word']): CardDay => ({
  index: 0,
  events: { sunrise: kind === 'sunrise' ? new Date('2026-11-09T11:35:00Z') : null, sunset: kind === 'sunset' ? new Date('2026-11-08T21:59:00Z') : null },
  verdicts: { sunrise: kind === 'sunrise' ? verdict(word) : null, sunset: kind === 'sunset' ? verdict(word) : null },
  reads: { sunrise: null, sunset: null },
  call: null,
  surf: [],
  surfTag: null,
  surfClean: false,
  windTag: null,
  wind: [],
  tide: null,
})
const NOW = new Date('2026-11-08T18:00:00Z')

describe("the Menu's Sky card", () => {
  it('says Sunset color likely / possible / unlikely, never Fire', () => {
    const likely = skyCard([day('sunset', 'likely')], NOW, clock)
    expect(likely.value).toBe('Color')
    expect(likely.sub).toBe('Sunset color likely 21:59')
    expect(skyCard([day('sunset', 'possible')], NOW, clock).sub).toBe('Sunset color possible, 2 of 5')
    expect(skyCard([day('sunset', 'unlikely')], NOW, clock).sub).toBe('Sunset color unlikely')
  })

  it('says Sunrise color for a sunrise', () => {
    expect(skyCard([day('sunrise', 'likely')], NOW, clock).sub).toBe('Sunrise color likely 11:35')
    expect(skyCard([day('sunrise', 'possible')], NOW, clock).sub).toBe('Sunrise color possible, 2 of 5')
    expect(skyCard([day('sunrise', 'unlikely')], NOW, clock).sub).toBe('Sunrise color unlikely')
  })

  it('leaves no "Fire" wording in the card source', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'core', 'menuCards.ts'), 'utf8')
    expect(src).not.toMatch(/value: 'Fire'|Fire (likely|possible|unlikely)/)
  })
})
