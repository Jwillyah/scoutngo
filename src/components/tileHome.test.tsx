import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TileHome } from './TileHome.tsx'
import type { Persona } from '../lib/persona.ts'

/* Batch SIMPLE-2, Section 2: the tile home as drawn, before any forecast has answered (nothing invented while it waits). */
const html = (persona: Persona | null) =>
  renderToStaticMarkup(
    <TileHome venue={{ lat: 36.92, lon: -76.1 }} placeName="Chic's Beach" timeZone="America/New_York" units={{ wind: 'kt', distance: 'ft', clock: 12, temperature: 'F' }} drone={null} now={new Date('2026-11-19T19:30:00Z')} persona={persona} onClose={() => {}} onOpenMap={() => {}} onMenu={() => {}} onSwitchSpot={() => {}} onPersona={() => {}} onOpen={() => {}} />,
  )
const tiles = (h: string) => [...h.matchAll(/data-tile="([a-z]+)"/g)].map((m) => m[1])

describe('the tile home', () => {
  it('the weather, then six tiles in the persona’s order', () => {
    expect(tiles(html('surf'))).toEqual(['weather', 'surf', 'tide', 'wind', 'sky', 'fish', 'drone'])
    expect(tiles(html('fish'))).toEqual(['weather', 'fish', 'tide', 'wind', 'water', 'sky', 'surf'])
    expect(tiles(html('shoot'))).toEqual(['weather', 'sky', 'drone', 'wind', 'tide', 'surf', 'fish'])
    expect(tiles(html('drone'))).toEqual(['weather', 'surf', 'drone', 'tide', 'wind', 'sky', 'fish'])
  })
  it('the spot ⌄ and the persona pill up top; the dock is Map and ☰, nothing else', () => {
    const h = html('surf')
    expect(h).toContain('Chic&#x27;s Beach')
    expect(h).toContain('Surf first')
    expect(html(null)).toContain('Pick yours')
    const dock = h.slice(h.indexOf('homep__dock'))
    expect(dock.match(/<button/g)?.length).toBe(2)
    expect(dock).toContain('aria-label="Open the map"')
    expect(dock).toContain('aria-label="Menu"')
  })
  it('no moment while nothing has answered: the top is empty, never a made-up window', () => {
    expect(html('surf')).not.toContain('data-moment')
    expect(html('shoot')).not.toContain('data-moment')
  })
  it('while the forecast is asked, values say so, never a zero', () => {
    const h = html('surf')
    expect(h).not.toMatch(/>0 kt|>0°</)
  })
})
