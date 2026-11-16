import { describe, expect, it } from 'vitest'
import { csvCells, readFlightCsv } from './flightLog.ts'

/* An Airdata UAV export's columns (a subset, in its order). */
const AIRDATA = [
  'time(millisecond),datetime(utc),latitude,longitude,height_above_takeoff(feet),height_above_ground_at_drone_location(feet),speed(mph)',
  '0,2026-09-10 20:02:11,36.8436,-75.9713,0,0,0',
  '60000,2026-09-10 20:03:11,36.8440,-75.9710,120.5,121,12',
  '1380000,2026-09-10 20:25:11,36.8436,-75.9713,240.2,240,8',
].join('\n')

/* A PhantomHelp-style export: "OSD." columns with units in brackets, metres, a wind column in mph. */
const PHANTOMHELP = [
  'CUSTOM.date [local],CUSTOM.updateTime [local],OSD.flyTime [s],OSD.latitude,OSD.longitude,OSD.height [m],WEATHER.windSpeed [MPH]',
  '9/10/2026,4:02:11.10 PM,0,36.8436,-75.9713,0,14',
  '9/10/2026,4:12:11.10 PM,600,36.8440,-75.9710,73.2,15',
  '9/10/2026,4:20:11.10 PM,1080,36.8436,-75.9713,10,16',
].join('\n')

describe('reading a flight log on the phone', () => {
  it('splits CSV cells, quotes respected', () => {
    expect(csvCells('a,"b,c",d')).toEqual(['a', 'b,c', 'd'])
    expect(csvCells('"say ""hi""",2')).toEqual(['say "hi"', '2'])
  })

  it('reads Airdata’s columns: 23 min, max 240 ft, no wind column, the takeoff and the date (UTC)', () => {
    const r = readFlightCsv(AIRDATA)
    if (!r.ok) throw new Error(r.why)
    expect(Math.round(r.summary.durationS / 60)).toBe(23)
    expect(Math.round(r.summary.maxHeightFt)).toBe(240)
    expect(r.summary.windMps).toBeNull()
    expect(r.summary.takeoff).toEqual({ lat: 36.8436, lon: -75.9713 })
    expect(r.summary.at?.toISOString()).toBe('2026-09-10T20:02:11.000Z')
  })

  it('reads PhantomHelp’s: seconds, metres to feet, the wind in mph to m/s', () => {
    const r = readFlightCsv(PHANTOMHELP)
    if (!r.ok) throw new Error(r.why)
    expect(r.summary.durationS).toBe(1080)
    expect(Math.round(r.summary.maxHeightFt)).toBe(240)
    expect(r.summary.windMps).toBeCloseTo(15 * 0.44704, 6)
  })

  it('says, in words, why an encrypted DJI .txt cannot be read', () => {
    const r = readFlightCsv(`\u0000\u0007DJI\u0000binary`)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.why).toMatch(/encrypted.*CSV/)
  })

  it('refuses a file with no flight columns rather than guessing', () => {
    expect(readFlightCsv('name,colour\nkite,red\n').ok).toBe(false)
    expect(readFlightCsv('time(millisecond),speed(mph)\n0,1\n1000,2\n').ok).toBe(false)
  })
})
