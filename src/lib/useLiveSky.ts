import { useMemo } from 'react'
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc'
import { liveSkyOf, type LiveSky as Sky, type LiveSkyIn } from '../core/liveSky.ts'
import { liveSkyOn, readForcedSky, useLiveSkySetting } from './liveSkySetting.ts'

/* The eight states as the contact sheet draws them (FORCE_KEY, src/lib/liveSkySetting.ts). */
const FORCED: Record<Sky['state'], Omit<LiveSkyIn, 'moon'> & { moon: LiveSkyIn['moon'] }> = {
  'clear-day': { sunDeg: 40, code: 0, cover: { low: 0, mid: 0, high: 5 }, word: 'Clear', moon: null },
  cloudy: { sunDeg: 40, code: 2, cover: { low: 45, mid: 20, high: 10 }, word: 'Partly cloudy', moon: null },
  overcast: { sunDeg: 30, code: 3, cover: { low: 95, mid: 60, high: 0 }, word: 'Overcast', moon: null },
  rain: { sunDeg: 30, code: 63, cover: { low: 95, mid: 80, high: 0 }, word: null, moon: null },
  fog: { sunDeg: 20, code: 45, cover: { low: 100, mid: 0, high: 0 }, word: 'Fog', moon: null },
  golden: { sunDeg: 3, code: 1, cover: { low: 5, mid: 30, high: 20 }, word: 'Few clouds', moon: null },
  'night-clear': { sunDeg: -30, code: 0, cover: { low: 0, mid: 0, high: 0 }, word: 'Clear', moon: { alt: 35, az: 135, fraction: 0.35, waxing: true } },
  'night-cloudy': { sunDeg: -30, code: 3, cover: { low: 85, mid: 40, high: 0 }, word: 'Mostly cloudy', moon: null },
}

/** The live sky for a page, or null where the setting has it off. */
export function useLiveSky(page: 'home' | 'sky' | 'weather', venue: { lat: number; lon: number }, now: Date, code: number | null, cover: LiveSkyIn['cover'], word: string | null): Sky | null {
  const [where] = useLiveSkySetting()
  const minute = Math.floor(now.getTime() / 60_000)
  const sky = useMemo(() => {
    const forced = readForcedSky()
    if (forced !== null) return liveSkyOf(FORCED[forced])
    const t = new Date(minute * 60_000)
    const m = getMoonPosition(t, venue.lat, venue.lon)
    const ill = getMoonIllumination(t)
    return liveSkyOf({ sunDeg: getPosition(t, venue.lat, venue.lon).altitude, code, cover, word, moon: { alt: m.altitude, az: m.azimuth, fraction: ill.fraction, waxing: ill.phase < 0.5 } })
  }, [minute, venue.lat, venue.lon, code, cover?.low, cover?.mid, cover?.high, word]) // eslint-disable-line react-hooks/exhaustive-deps
  return liveSkyOn(where, page) ? sky : null
}

