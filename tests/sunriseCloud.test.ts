import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseVenueCloud } from '../src/lib/forecast.ts'

/*
 * SUNRISE AT THE FISHING PIER, 29 OCT 2026, REPLAYED.
 *
 * The CLOUD chip read 4% at 6:59 and 8% at 7:35 on 052b5f2, then 100% and 87%
 * on f68fe19. The cloud code was the same in both builds; the forecast moved.
 * Early HRRR runs had almost no low cloud at sunrise, later runs filled it in,
 * and KNTU and KORF reported broken to overcast at 2900 to 4000 ft through
 * sunrise. The responses and observations are in
 * measurements/2026-10-29-sunrise.md.
 *
 * The payloads below are the 05:00 to 09:00 rows of those responses, in the
 * shape Open-Meteo returns them.
 */
const TZ = 'America/New_York'
const SEVEN_AM = new Date('2026-10-29T11:00:00Z')
const TIMES = ['05', '06', '07', '08', '09'].map((h) => `2026-10-29T${h}:00`)

/* best_match (HRRR) as served at 08:04 EDT: agrees with the observed overcast. */
const NOW_SERVED = {
  hourly: {
    time: TIMES,
    cloud_cover: [48, 100, 87, 100, 100],
    cloud_cover_low: [48, 100, 87, 37, 10],
    cloud_cover_mid: [0, 5, 75, 100, 100],
    cloud_cover_high: [0, 0, 0, 0, 0],
  },
}

/* The 09Z HRRR run: the kind of answer behind the 4% chip. */
const RUN_09Z = {
  hourly: {
    time: TIMES,
    cloud_cover: [null, 7, 39, null, null],
    cloud_cover_low: [null, 7, 4, null, null],
    cloud_cover_mid: [null, null, null, null, null],
    cloud_cover_high: [null, null, null, null, null],
  },
}

/* What the chip shows: LOW cloud, src/components/PlanMode.tsx. */
const chipAt = (payload: unknown, at: Date) => parseVenueCloud(payload, at, TZ)?.low ?? null

describe('the CLOUD chip at sunrise, 29 Oct 2026, Virginia Beach Fishing Pier', () => {
  it('reads the low-cloud layer', () => {
    expect(readFileSync('src/components/PlanMode.tsx', 'utf8')).toContain('const cloudPct = venueCloud?.low ?? null')
  })

  it('reads 50% or more at 7:00, as the sky was', () => {
    const pct = chipAt(NOW_SERVED, SEVEN_AM)
    expect(pct).not.toBeNull()
    expect(pct!).toBeGreaterThanOrEqual(50)
  })

  it('takes the 07:00 row for 7:00 and the 06:00 row for 6:59', () => {
    expect(chipAt(NOW_SERVED, SEVEN_AM)).toBe(87)
    expect(chipAt(NOW_SERVED, new Date('2026-10-29T10:59:00Z'))).toBe(100)
  })

  /* The check can fail: the early run's answer is under 50 by the same path. */
  it('would catch the early-run answer', () => {
    expect(chipAt(RUN_09Z, SEVEN_AM)).toBe(4)
  })
})
