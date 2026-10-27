import { describe, expect, it } from 'vitest'
import { parseRealtime } from '../../api/buoy.ts'
import { nearestBuoys } from './buoy.ts'

/* NDBC 44099's file on 27 Oct 2026 (two lines as published; MM is "missing"). */
const SAMPLE = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD   PRES  ATMP  WTMP  DEWP  VIS PTDY  TIDE
#yr  mo dy hr mn degT m/s  m/s     m   sec   sec degT   hPa  degC  degC  degC  nmi  hPa    ft
2026 10 27 15 26  MM   MM   MM    MM    MM   7.5  MM     MM    MM  17.2    MM   MM   MM    MM
2026 10 27 14 56  MM   MM   MM   0.8     9   7.5 104     MM    MM  17.2    MM   MM   MM    MM`

describe('the buoy check', () => {
  it("reads the newest line that has a wave height, skipping NDBC's missing marks", () => {
    expect(parseRealtime(SAMPLE)).toEqual({ at: '2026-10-27T14:56:00Z', waveM: 0.8, periodS: 9, fromDeg: 104 })
  })

  it('picks the buoys near Virginia Beach from the baked list, nearest first, none far inland', () => {
    const near = nearestBuoys({ lat: 36.8436, lon: -75.9713 })
    expect(near.length).toBeGreaterThan(0)
    expect(near[0].km).toBeLessThan(40)
    expect(near.map((b) => b.km)).toEqual([...near.map((b) => b.km)].sort((a, b) => a - b))
    expect(nearestBuoys({ lat: 39.74, lon: -104.99 })).toEqual([])
  })
})
