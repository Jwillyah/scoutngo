import { describe, expect, it } from 'vitest'
import { forming, formingLine, formingWhy, newCellsNear } from '../src/core/stormForming.ts'
import { hrrrPick, hrrrTileUrl } from '../src/lib/stormData.ts'
import type { Cell, Track } from '../src/core/stormCells.ts'
import { destinationPoint } from '../src/core/geo.ts'

/*
 * STORMS THAT FORM IN PLACE (Batch L, Section 3): new radar cells near the
 * venue, backed by the HRRR's next hour or by unstable air, said as a fact.
 */
const KORF = { lat: 36.8946, lon: -76.2012 }
const cellAt = (km: number, bearing: number): Cell => {
  const at = destinationPoint(KORF, bearing, km * 1000)
  return { at, maxDbz: 45, px: 6, points: [at] }
}
const track = (km: number, bearing: number, scans: number, v: { e: number; n: number } | null = { e: 4, n: 4 }): Track => ({ cell: cellAt(km, bearing), v, scans, borrowed: scans === 1 })
const NOON = new Date('2026-08-04T17:00:00Z')

describe('the forming signal', () => {
  it('a new cell 8 km away with unstable air: "New cells forming within 5 mi · moving slowly"', () => {
    const f = forming(KORF, [track(8, 300, 1)], null, { cape: 2640, cin: 10 })
    expect(f).not.toBeNull()
    expect(formingLine(f!, 'mi')).toBe('New cells forming within 5 mi · moving slowly')
    expect(formingWhy(f!, 'mi', (d) => d.toISOString().slice(11, 16))).toBe('CAPE 2,640 J/kg')
  })

  it('counts only cells born in the last two scans, within 30 mi', () => {
    const tracks = [track(10, 0, 3), track(20, 90, 2), track(60, 180, 1)]
    expect(newCellsNear(KORF, tracks).map((t) => t.scans)).toEqual([2])
  })

  it('an old cell passing by is the tracker’s business, not this', () => {
    expect(forming(KORF, [track(10, 0, 3)], { cells: [cellAt(5, 0)], validAt: NOON }, { cape: 3000, cin: 0 })).toBeNull()
  })

  it('a new cell with stable air and nothing on the HRRR: nothing said', () => {
    expect(forming(KORF, [track(10, 0, 1)], { cells: [], validAt: NOON }, { cape: 100, cin: 200 })).toBeNull()
  })

  it('the HRRR alone backs it, and says where and by when', () => {
    const f = forming(KORF, [track(30, 200, 2)], { cells: [cellAt(22, 210)], validAt: NOON }, null)
    expect(f?.hrrr?.cells).toBe(1)
    expect(formingLine(f!, 'mi')).toBe('New cells forming within 20 mi · moving slowly')
    expect(formingWhy(f!, 'mi', () => '1 PM')).toBe('HRRR has storms within 15 mi by 1 PM')
  })

  it('neither the HRRR nor the air read: two new cells on radar are enough, one is not', () => {
    expect(forming(KORF, [track(10, 0, 1)], null, null)).toBeNull()
    expect(forming(KORF, [track(10, 0, 1), track(15, 90, 2)], null, null)?.cells).toBe(2)
  })

  it('says the motion when it is not slow, in the shooter’s unit', () => {
    const f = forming(KORF, [track(10, 0, 1, { e: 20, n: 20 })], null, { cape: 1500, cin: null })
    expect(formingLine(f!, 'mi')).toBe('New cells forming within 10 mi · moving NE 18 mph')
    expect(formingLine(f!, 'km')).toBe('New cells forming within 10 km · moving NE 28 km/h')
  })

  it('never advises, never "safe" or "clear"', () => {
    const f = forming(KORF, [track(10, 0, 1)], null, { cape: 1500, cin: null })!
    expect(formingLine(f, 'mi')).not.toMatch(/safe|clear|should|take|seek|avoid/i)
  })
})

describe('the HRRR frame read', () => {
  it('the run two hours back, its frame for the top of the hour 45 minutes or more ahead', () => {
    const p = hrrrPick(new Date('2026-08-04T16:30:00Z'))
    expect(p.run.toISOString()).toBe('2026-08-04T14:00:00.000Z')
    expect(p.validAt.toISOString()).toBe('2026-08-04T18:00:00.000Z')
    expect(p.fmin).toBe(240)
    expect(hrrrTileUrl(p.run, p.fmin, 36, 49)).toBe('https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/hrrr::REFD-F0240-202608041400/7/36/49.png')
  })
})
