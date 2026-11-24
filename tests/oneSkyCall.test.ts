import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eventCall, type CallRead } from '../src/core/briefing.ts'
import { fireVerdict, type FireVerdict } from '../src/core/fireOutlook.ts'
import { goAlertDue } from '../src/core/goAlert.ts'
import { satRead, inNowcast } from '../src/core/goesNowcast.ts'
import { colorWords } from '../src/core/homeDay.ts'
import { skyMoment } from '../src/core/homeTiles.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { skyCalls, type SkyCalls, type SkyDayFull } from '../src/core/skyCall.ts'
import { clearBriefInputs, putSatRead, satFor } from '../src/lib/useBriefing.ts'
import { nearestHour, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

/*
 * BATCH SIMPLE-3, SECTION 0.2: ONE SKY CALL OBJECT, FIVE READERS.
 *
 * 23 Nov: Sky Tonight "Color possible" beside the Sky color page's "Color
 * likely" (4:57 PM); the home "Possible" and "Likely" in one minute (5:10).
 * The recorded 15 Nov inland sunset (tests/data/sunset-2026-11-15-vb-inland)
 * replays it: at 5:10 PM, 15 min after the sunset, a home mounted at 4:20 PM
 * held the T-30 satellite read and said Go; one mounted at 5:10 (Back from a
 * page) could not ask for it any more (the satellite is asked from 3 h to
 * 30 min before) and said Maybe, as did the Sky page and the color page.
 * measurements/2026-11-24-home-flicker.md has the printed run.
 *
 * Now the read is kept per spot and event for every screen (and on the
 * phone), and the five readers read one object (src/core/skyCall.ts skyCalls
 * through src/lib/useSkyCalls.ts). Here, the five readers' words from that
 * object, two mounts apart and across a reload, are one.
 */
const TZ = 'America/New_York'
const dir = 'tests/data/sunset-2026-11-15-vb-inland'
const kept = JSON.parse(readFileSync(`${dir}/paths.json`, 'utf8'))
const event = new Date(kept.event)
const venue = kept.venue as { lat: number; lon: number }
const paths = pathsAt(parseFirePaths(kept.payload)!, nearestHour(event))
const metars = readFileSync(`${dir}/metars.txt`, 'utf8').trim().split('\n').map((l) => ({ at: new Date(l.slice(0, 25)), raw: l.slice(26) })).filter((m) => m.raw !== '')
const g = JSON.parse(readFileSync(`${dir}/goes-T-30.json`, 'utf8'))
const sat = satRead(g.samples, new Date(g.frame), g.airC)
const stationAt = (now: Date) => {
  const m = metars.filter((x) => x.at <= now).at(-1)!
  return { sky: parseMetarSky(m.raw)!, at: m.at }
}

/** What useBriefing derives for the sunset from the shared inputs at `now`: the verdict and the call with the satellite read the store holds. */
function dayAt(now: Date): SkyDayFull[] {
  const station = stationAt(now)
  const v: FireVerdict | null = fireVerdict(paths, { event, kind: 'sunset', venue, station })
  const held = satFor(venue.lat, venue.lon, event.getTime())?.read ?? null
  const read: CallRead = eventCall(v, 'sunset', event, now, held, { venue, truth: null, gap: null, sky: station })
  return [{ events: { sunrise: null, sunset: event }, reads: { sunrise: null, sunset: read }, verdicts: { sunrise: null, sunset: v } }]
}
const callsAt = (now: Date): SkyCalls => skyCalls(dayAt(now), now, venue, stationAt(now), () => null, null, (d) => d.toISOString())

/**
 * The five readers, each as its screen words it (src/components/TileHome.tsx,
 * SkyPage.tsx, SkyFire.tsx; src/core/homeTiles.ts skyMoment; src/core/goAlert.ts).
 * The card and the alert exist only for a Go: either one saying it while the
 * call is not a Go, or missing while it is (and due), is a disagreement.
 */
function readers(c: SkyCalls, now: Date) {
  const word = colorWords(c.now?.call ?? null)
  const card = skyMoment(c.now, now, TZ)
  const alert = goAlertDue(c.now, now, [], TZ)
  const alertDue = c.now !== null && c.now.call === 'Go' && c.now.event.getTime() - now.getTime() <= 45 * 60_000
  return {
    homeTile: word,
    momentCard: card !== null ? (card.line.includes('color likely') ? 'color likely' : 'WRONG CARD') : c.now?.call === 'Go' ? 'CARD MISSING' : word,
    skyTonight: colorWords(c.sunset?.read?.call ?? null),
    skyColorPage: colorWords(c.sunset !== null && c.sunset.event.getTime() === event.getTime() ? c.sunset.call : null),
    goAlert: alert !== null ? (alert.includes('color likely') ? 'color likely' : 'WRONG ALERT') : alertDue ? 'ALERT MISSING' : word,
  }
}

describe('one sky call object, read by the home tile, the moment card, Sky Tonight, the Sky color page and the Go alert', () => {
  const store: Record<string, string> = {}
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] })
    clearBriefInputs()
  })
  afterEach(() => {
    clearBriefInputs()
    vi.unstubAllGlobals()
  })

  it('the race, as it was: the satellite is asked only from 3 h to 30 min before the event, so a later mount could not have it', () => {
    expect(inNowcast(event, new Date(event.getTime() - 35 * 60_000))).toBe(true)
    expect(inNowcast(event, new Date(event.getTime() + 15 * 60_000))).toBe(false)
    const at510 = new Date(event.getTime() + 15 * 60_000)
    const station = stationAt(at510)
    const v = fireVerdict(paths, { event, kind: 'sunset', venue, station })
    /* The two inputs two mounts held at the same minute gave two calls: shape A, two sources for one fact. */
    expect(eventCall(v, 'sunset', event, at510, sat, { venue, truth: null, gap: null, sky: station }).call).toBe('Go')
    expect(eventCall(v, 'sunset', event, at510, null, { venue, truth: null, gap: null, sky: station }).call).toBe('Maybe')
  })

  it('a mount at 4:20 PM keeps the read for the spot; a mount at 5:10 PM reads the same one: all five say "color likely", and the card says it is on now', () => {
    /* 4:20 PM: in the window, one screen asks and puts it for every screen. */
    putSatRead(venue.lat, venue.lon, event.getTime(), sat)
    const at510 = new Date(event.getTime() + 15 * 60_000)
    const c = callsAt(at510)
    const r = readers(c, at510)
    expect(new Set(Object.values(r))).toEqual(new Set(['color likely']))
    expect(skyMoment(c.now, at510, TZ)?.eyebrow).toBe('Color on now')
  })

  it('and after a reload at 5:10 PM (nothing in memory, the phone kept the read): the same call', () => {
    const at510 = new Date(event.getTime() + 15 * 60_000)
    /* The phone's clock that evening: the kept read is a day's, not forever. */
    vi.useFakeTimers({ now: at510, toFake: ['Date'] })
    putSatRead(venue.lat, venue.lon, event.getTime(), sat)
    const before = callsAt(at510).now?.call
    clearBriefInputs(true)
    expect(satFor(venue.lat, venue.lon, event.getTime())?.read?.canvas).toBe(sat?.canvas)
    expect(callsAt(at510).now?.call).toBe(before)
    expect(before).toBe('Go')
    vi.useRealTimers()
  })

  it('with no read ever taken, all five agree on the models\' word, minute by minute from T-60 to the colour\'s end', () => {
    for (let min = -60; min <= 25; min += 5) {
      const now = new Date(event.getTime() + min * 60_000)
      const c = callsAt(now)
      const r = readers(c, now)
      expect(new Set(Object.values(r)).size, `T${min >= 0 ? '+' : ''}${min}: ${JSON.stringify(r)}`).toBe(1)
    }
  })

  it('the station\'s doubt is part of the object, so Sky Tonight and the home cannot differ by it', () => {
    for (let min = -75; min <= 0; min += 15) {
      const now = new Date(event.getTime() + min * 60_000)
      const c = callsAt(now)
      expect(c.sunset?.call, `T${min}`).toBe(c.sunset?.read?.call ?? null)
      if (c.sunset?.doubt != null) expect(c.sunset.call).toBe('Maybe')
      expect(c.now?.call).toBe(c.sunset?.call)
    }
  })

  it('every reader reads the one object, not a second read of its own', () => {
    const src = (f: string) => readFileSync(f, 'utf8')
    expect(src('src/components/TileHome.tsx')).toMatch(/const calls = useSkyCalls\(brief, venue, now, timeZone\)/)
    expect(src('src/components/TileHome.tsx')).toMatch(/useGoAlert\(call, now, timeZone\)/)
    expect(src('src/components/TileHome.tsx')).not.toMatch(/skyCallNow\(/)
    expect(src('src/components/SkyPage.tsx')).toMatch(/useSkyCalls\(brief, venue, realNow, timeZone\)/)
    expect(src('src/components/SkyPage.tsx')).not.toMatch(/withDoubt\(|stationDoubt\(/)
    expect(src('src/components/SkyFire.tsx')).toMatch(/const call = same && one\.call !== null \? one\.call/)
    expect(src('src/lib/useSkyCalls.ts')).toMatch(/skyCalls\(brief\.days/)
  })
})
