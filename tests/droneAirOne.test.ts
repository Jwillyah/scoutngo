import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { airspaceRead } from '../src/core/droneAirRead.ts'
import { shortPlace, spotNameAt } from '../src/core/spotName.ts'
import { airspaceAtPoint } from '../src/lib/airspaceAtPoint.ts'
import { facilityCellAt } from '../src/lib/uasfm.ts'

/*
 * ONE AIRSPACE LOOKUP PER POINT, READ BY EVERY TAB (Batch FIX, Section 6.1).
 *
 * 17 Nov, 7:13: the Now and By height cards said "Class D · 250 ft · LAANC
 * near KNTU", the Airspace sheet "Class C · max 100 ft · Norfolk Intl (KORF)".
 * The baked data, read here, gives both answers, each for its own point: the
 * cards had read the page's venue and the sheet its own marker.
 */
const CHICS_BEACH = { lat: 36.9268, lon: -76.126 }
const OCEANFRONT = { lat: 36.8529, lon: -75.978 }

describe('the baked FAA data at the two points', () => {
  it("Chic's Beach is under Norfolk Intl's Class C (KORF), not Oceana's Class D", async () => {
    const cell = facilityCellAt(CHICS_BEACH.lat, CHICS_BEACH.lon)
    expect(cell?.icao).toBe('KORF')
    expect(cell?.facility).toBe('Norfolk Intl')
    const r = airspaceRead(await airspaceAtPoint(CHICS_BEACH, 400), cell)
    expect(r.cls).toBe('C')
    expect(r.ceilingFt).toBe(200)
    expect(r.headline).toBe('Class C · max 200 ft here')
    expect(r.row).toEqual({ big: 'Class C · 200 ft', small: 'KORF' })
  })
  it('the Virginia Beach oceanfront is the Class D · 250 ft · KNTU the cards said', async () => {
    const cell = facilityCellAt(OCEANFRONT.lat, OCEANFRONT.lon)
    const r = airspaceRead(await airspaceAtPoint(OCEANFRONT, 400), cell)
    expect(r.cls).toBe('D')
    expect(r.row).toEqual({ big: 'Class D · 250 ft', small: 'KNTU' })
  })
})

describe('the tabs agree, because there is one read', () => {
  it('the Now row and the sheet headline say the same class and height at every point', async () => {
    let looked = 0
    for (const at of [CHICS_BEACH, OCEANFRONT, { lat: 36.92, lon: -76.15 }, { lat: 36.93, lon: -76.1 }, { lat: 37.5, lon: -77.2 }]) {
      const r = airspaceRead(await airspaceAtPoint(at, 400), facilityCellAt(at.lat, at.lon))
      const cls = /Class (\w)/.exec(r.headline)?.[1] ?? null
      const ft = /(\d+) ft/.exec(r.headline)?.[1] ?? null
      expect(/Class (\w)/.exec(r.row.big)?.[1] ?? null).toBe(cls)
      expect(/(\d+) ft/.exec(r.row.big)?.[1] ?? null).toBe(ft)
      looked += 1
    }
    expect(looked).toBe(5)
  })
  it('the page looks the point up once; the Airspace tab never looks on its own', () => {
    const page = readFileSync('src/components/DronePage.tsx', 'utf8')
    const sheet = readFileSync('src/components/DroneAirspace.tsx', 'utf8')
    expect(page.match(/airspaceAtPoint\(/g)?.length).toBe(1)
    expect(page).toContain('airspaceRead(here, facilityCellAt(venue.lat, venue.lon))')
    expect(sheet).not.toMatch(/airspaceAtPoint\(|facilityCellAt\(|markerHeadline\(/)
    expect(sheet).toContain('read.headline')
    /* The marker IS the page's point: the sheet's marker comes from the page and moving it tells the page. */
    expect(page).toMatch(/<DroneAirspace spot=\{spot\} marker=\{venue\} here=\{here\} read=\{read\} onMarker=/)
  })
})

describe('the header names your spot', () => {
  const spots = [
    { name: "Chic's Beach", venue: { latitude: '36.926800', longitude: '-76.126000' } },
    { name: 'Lynnhaven', venue: { latitude: '36.9100', longitude: '-76.0800' } },
    { name: 'Blank', venue: { latitude: '', longitude: '' } },
  ]
  it("a saved spot within 150 m gives its name; further, nothing", () => {
    expect(spotNameAt(spots, { lat: 36.9269, lon: -76.1262 })).toBe("Chic's Beach")
    expect(spotNameAt(spots, { lat: 36.9300, lon: -76.1260 })).toBeNull()
    expect(spotNameAt(spots, null)).toBeNull()
    expect(spotNameAt([], CHICS_BEACH)).toBeNull()
  })
  it('a search label is said short; the page header reads the point', () => {
    expect(shortPlace("Chic's Beach, Virginia Beach, Virginia, United States")).toBe("Chic's Beach")
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('placeName={spotNameAt(spots, centre) ?? venueShort}')
    expect(readFileSync('src/components/DronePage.tsx', 'utf8')).toContain('sub={`${pointName}')
  })
})
