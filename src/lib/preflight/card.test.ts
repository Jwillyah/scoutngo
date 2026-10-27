import { describe, expect, it } from 'vitest'
import { destinationPoint } from '../../core/geo.ts'
import { FLIGHT_CARD_CLOSE, pathFor, type Move } from '../../core/flight.ts'
import { flightCard } from './card.ts'

const PIER = { lat: 36.8436, lon: -75.9713 }

describe('the flight card', () => {
  const move: Move = { kind: 'fly-along', points: [destinationPoint(PIER, 90, 50), destinationPoint(PIER, 90, 250)], heightFt: 450 }
  const path = pathFor(move, { speedMps: 5, capFt: 400, stepS: 0.5 })
  const card = flightCard({
    move,
    path,
    capFt: 400,
    pilot: PIER,
    heights: { groundAt: () => 2, surfaceAt: () => 2 },
    boxes: [],
    scanYear: 2013,
    ceilingAt: () => 200,
    winds: [
      { heightMeters: 120, speedMps: 6, fromDegrees: 90 },
      { heightMeters: 80, speedMps: 5, fromDegrees: 90 },
    ],
    flightMinutes: 45,
  })

  it('says the length and time two ways that agree', () => {
    expect(card.lengthM).toBeCloseTo(200, 0)
    expect(Math.abs(card.lengthM - card.lengthCheckM)).toBeLessThan(0.5)
    expect(card.durationS).toBeCloseTo(40, 1)
  })

  it('holds the move at the cap and says so; flags the stretch over a 200 ft grid ceiling', () => {
    expect(card.highestFt).toBe(400)
    expect(card.lines.some((l) => l.startsWith('Held at 400 ft'))).toBe(true)
    expect(card.overCeiling.length).toBe(1)
  })

  it('reads the wind per leg and never calls the flight safe', () => {
    expect(card.legs.every((l) => l.wind === 'headwind')).toBe(true)
    const text = card.lines.join(' ').toLowerCase()
    expect(text).not.toMatch(/\bsafe\b|\blegal\b|\bcleared\b|\ball clear\b/)
    expect(card.lines[card.lines.length - 1]).toBe(FLIGHT_CARD_CLOSE)
  })
})
