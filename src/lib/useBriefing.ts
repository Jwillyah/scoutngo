/*
 * WHAT THE TODAY BRIEFING READS (Batch H, Section 2). Arithmetic is
 * src/core/briefing.ts; this fetches and assembles.
 *
 *   Sky colour sunrise and sunset for the week in one 16-point question
 *              (fetchFirePathsBoth, Batch M), each line on tomorrow's
 *              bearing; the Sky color page asks its own day's line, so the
 *              two can differ by a degree of bearing. The nearest
 *              stations only in the two hours before an event, as the page.
 *   Sea        Open-Meteo Marine, the week (the Surf page's question)
 *   Wind       the week by the hour, gusts and 400 ft (fetchBriefWind)
 *   Tide       the nearest NOAA station's highs and lows
 *   Facing     which way the beach faces (the map's own sea polygons)
 *   Satellite  GOES-East infrared along the sun's line, 3 h to 30 min
 *              before the next event only (src/lib/goesNowcast.ts)
 *
 * WHAT LEAVES THE PHONE: what those screens already send, coordinates
 * rounded to 2 decimals (src/lib/weatherStore.ts). Every answer is kept on
 * the phone for the hour, so opening the app again asks nothing new.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { getPosition, getTimes } from 'suncalc'
import { certainty, dayCall, eventCall, kt, moonOn, surfLine, surfTag, tideDay, windLevel, windTag, type CallRead, type Kind, type MoonDay, type SurfBar, type TideDay, type WindHourIn } from '../core/briefing.ts'
import { calmDirection } from './windNow.ts'
import { factorHere } from './beachFactorHere.ts'
import { saneGust, saneSunsetHour, saneWind } from '../core/sanity.ts'
import { saneAloft } from '../core/windProfile.ts'
import { wallClock } from '../core/timezone.ts'
import { fireVerdict, type FireVerdict } from '../core/fireOutlook.ts'
import type { LatLon } from '../core/geo.ts'
import { surfShape } from '../core/surf.ts'
import type { TideExtreme } from '../core/tide.ts'
import { venueToday } from '../core/eventDay.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'
import { coastFacing } from './coast.ts'
import { fetchFirePathsBoth, fetchStationSkies, nearestHour, pathsAt, type FirePaths, type StationSky } from './skyFireData.ts'
import { surfAt } from './surfDay.ts'
import { fetchBriefWind, fetchMarine, fetchMonthExtremes, hourlyAt, type Hourly } from './tideSheetData.ts'
import { useTide } from './useTide.ts'
import { fetchSatRead } from './goesNowcast.ts'
import { inNowcast, type SatRead } from '../core/goesNowcast.ts'
import { useWeatherEpoch } from './useWeatherStatus.ts'
import { obsDue, useSkyObs } from './useSkyObs.ts'

/** The drone the home and the menu read the wind against: the kit's, the lowest wind rating. */
export interface BriefingDrone {
  name: string
  maxWindMps: number | null
}

export const WEEK_DAYS = 7
const KINDS: Kind[] = ['sunrise', 'sunset']

export interface DayBrief {
  iso: string
  index: number
  start: Date
  end: Date
  events: Record<Kind, Date | null>
  verdicts: Record<Kind, FireVerdict | null>
  reads: Record<Kind, CallRead | null>
  /** The day's call: its better event still to come. Null: nothing left today, or no forecast. */
  call: CallRead | null
  surf: SurfBar[]
  surfWords: string | null
  surfTag: ReturnType<typeof surfTag> | null
  /** The biggest hour's face is offshore-clean (the week grid's bright bar). */
  surfClean: boolean
  wind: WindHourIn[]
  windTag: ReturnType<typeof windTag>
  /** The day's strongest steady wind, knots, and its gust; the direction at that hour. */
  windMaxKt: number | null
  gustMaxKt: number | null
  windFrom: number | null
  windLevel: ReturnType<typeof windLevel>
  windOffshore: boolean
  tide: TideDay | null
  moon: MoonDay
  certainty: 1 | 2 | 3
}

export interface Briefing {
  status: 'loading' | 'ready'
  days: DayBrief[]
  facing: number | null
  /** When the newest forecast in it arrived, ms; null before any did. */
  checkedAt: number | null
  /** The next event's observations are due and not in yet: its call is not settled (Batch J, Section 6). */
  obsPending?: boolean
  /** The week by the hour (wind, air, the sky's code, rain): the home's weather block (Batch M). */
  wx: Hourly | null
  /** The station's highs and lows from the start of today on (the map's tide source, useTide's station): the home's next turn after midnight too (Batch N E6). */
  turns: TideExtreme[]
  /** Batch SIMPLE-3, Section 0: which parts have answered for this spot (or said there is none): the home draws a part only once it has. */
  settled: { sky: boolean; sea: boolean; facing: boolean; tide: boolean }
}

const dayIso = (start: string, n: number) => {
  const d = new Date(`${start}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function eventsOn(iso: string, venue: LatLon, timeZone: string): Record<Kind, Date | null> {
  const noon = zonedTimeToUtc(iso, '12:00', timeZone) ?? new Date(`${iso}T17:00:00Z`)
  const t = getTimes(noon, venue.lat, venue.lon)
  const ok = (d: Date | null | undefined) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : null)
  /* Batch QA, Section 4: a sunset outside 4 to 9 PM at the spot is not believed (src/core/sanity.ts): "—", never a wrong time. */
  const set = ok(t.sunset)
  const w = set === null ? null : wallClock(set, timeZone)
  return { sunrise: ok(t.sunrise), sunset: set !== null && w !== null && saneSunsetHour(w.hour + w.minute / 60) ? set : null }
}


/*
 * ONE BRIEFING PER SPOT (Batch SIMPLE-3, Section 0; 23 Nov 5:10 PM the home
 * said "Possible" and "Likely" for the same sunset in the same minute). Each
 * screen's useBriefing used to keep what it had fetched in its own state:
 * the satellite read is asked only from 3 h to 30 min before the event, so a
 * home mounted at 4:20 PM still held it at 5:10 and called the sunset a Go,
 * while the home mounted again at 5:10 (Back from the Surf page, the spot
 * search closed) and the Sky page, opened then, had none and said Maybe
 * (measurements/2026-11-24-home-flicker.md has the printed evidence).
 * Now what was fetched for a spot and day lives here, once, for every
 * screen and every mount: the same inputs give the same calls. The
 * satellite read is kept on this phone for its event (BRIEF_SAT_KEY), so a
 * reload at 5:10 does not lose it either.
 */
interface BriefInputs {
  fire?: { week: Record<Kind, FirePaths | null> }
  sea?: { marine: Hourly | null; wind: Hourly | null }
  /** The beach's facing; undefined until the map's sea polygons have answered. */
  facing?: number | null
  stations?: StationSky[]
  /** The station's highs and lows; undefined until asked and answered. */
  tides?: TideExtreme[]
}
const inputs = new Map<string, BriefInputs>()
const asked = new Map<string, number>()
const inputListeners = new Set<() => void>()
let inputsVersion = 0
function putInputs(key: string, patch: Partial<BriefInputs>): void {
  inputs.set(key, { ...inputs.get(key), ...patch })
  if (inputs.size > 12) inputs.delete(inputs.keys().next().value as string)
  inputsVersion += 1
  for (const l of [...inputListeners]) l()
}
/** True the first time a part is asked for a spot in this weather epoch: every screen after it reads the one answer. */
function firstAsk(key: string, part: string, epoch: number): boolean {
  const k = `${key}|${part}`
  if (asked.get(k) === epoch) return false
  asked.set(k, epoch)
  return true
}
const subscribeInputs = (l: () => void) => {
  inputListeners.add(l)
  return () => inputListeners.delete(l)
}
const inputsNow = () => inputsVersion

/** For tests: the inputs a spot's briefing reads, as one fetch would put them. */
export function putBriefInputs(key: string, patch: Partial<BriefInputs>): void {
  putInputs(key, patch)
}
export function clearBriefInputs(memoryOnly = false): void {
  inputs.clear()
  asked.clear()
  sats.clear()
  satsLoaded = false
  inputsVersion += 1
  if (memoryOnly) return
  try {
    localStorage.removeItem(BRIEF_SAT_KEY)
  } catch {
    /* none kept */
  }
}
export const briefKey = (at: LatLon, today: string) => `${at.lat.toFixed(3)},${at.lon.toFixed(3)},${today}`

/* The satellite reads, per spot and event, kept on this phone until a day after the event. */
export const BRIEF_SAT_KEY = 'scoutngo.briefSat.v1'
const SAT_KEEP_MS = 86_400_000
const sats = new Map<string, { event: number; read: SatRead | null }>()
let satsLoaded = false
const satKey = (lat: number, lon: number, event: number) => `${lat.toFixed(2)},${lon.toFixed(2)}@${event}`
function loadSats(): void {
  if (satsLoaded) return
  satsLoaded = true
  try {
    const raw = JSON.parse(localStorage.getItem(BRIEF_SAT_KEY) ?? '{}') as Record<string, { event: number; read: (Omit<SatRead, 'at'> & { at: string }) | null }>
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v?.event !== 'number' || Date.now() - v.event > SAT_KEEP_MS) continue
      sats.set(k, { event: v.event, read: v.read === null ? null : { ...v.read, at: new Date(v.read.at) } })
    }
  } catch {
    /* Nothing kept, or no storage: asked again in its window. */
  }
}
export function putSatRead(lat: number, lon: number, event: number, read: SatRead | null): void {
  loadSats()
  sats.set(satKey(lat, lon, event), { event, read })
  try {
    const keep: Record<string, unknown> = {}
    for (const [k, v] of sats) if (Date.now() - v.event <= SAT_KEEP_MS) keep[k] = v
    localStorage.setItem(BRIEF_SAT_KEY, JSON.stringify(keep))
  } catch {
    /* Kept for this session only. */
  }
  inputsVersion += 1
  for (const l of [...inputListeners]) l()
}
/** The satellite read kept for a spot's event (this session's, else this phone's), or null when none was taken. */
export function satFor(lat: number, lon: number, event: number): { read: SatRead | null } | null {
  loadSats()
  return sats.get(satKey(lat, lon, event)) ?? null
}

/*
 * SCOPE. 'week' is the briefing: today, tomorrow and the week. 'next' is the
 * menu's cards (Batch H, Section 3): only the next two sunrises or sunsets,
 * the sea and the wind, so opening the menu costs a few questions, most of
 * them the Sky fire page's own, kept for the hour.
 */
export function useBriefing(venue: LatLon | null, timeZone: string, now: Date, open: boolean, scope: 'week' | 'next' | 'sea' = 'week'): Briefing {
  /* 'sea' (Batch J, Section 7): the Water card's own beach, when it is not the venue: the sea, the wind and the tide only. */
  const sky = scope !== 'sea'
  const today = venueToday(now, timeZone)
  const lat = venue?.lat ?? null
  const lon = venue?.lon ?? null
  const key = lat === null || lon === null ? null : briefKey({ lat, lon }, today)
  const epoch = useWeatherEpoch()
  const version = useSyncExternalStore(subscribeInputs, inputsNow, inputsNow)
  const got = key === null ? undefined : inputs.get(key)

  /*
   * Sky colour: sunrise and sunset, the whole week, in ONE request (Batch M,
   * Section 1: fetchFirePathsBoth). Each line on tomorrow's bearing; the menu
   * ('next') asks the same question, so it is the same kept answer.
   */
  useEffect(() => {
    if (!open || !sky || key === null || lat === null || lon === null || !firstAsk(key, 'fire', epoch)) return
    const at = { lat, lon }
    void (async () => {
      const mid = eventsOn(dayIso(today, 1), at, timeZone)
      const first = eventsOn(dayIso(today, 0), at, timeZone)
      const last = eventsOn(dayIso(today, WEEK_DAYS - 1), at, timeZone)
      const both = { sunrise: null as FirePaths | null, sunset: null as FirePaths | null }
      if (mid.sunrise !== null && mid.sunset !== null) {
        const startIso = (first.sunrise ?? first.sunset ?? new Date(`${today}T12:00:00Z`)).toISOString().slice(0, 10)
        const endIso = (last.sunset ?? last.sunrise ?? new Date(`${dayIso(today, WEEK_DAYS - 1)}T12:00:00Z`)).toISOString().slice(0, 10)
        Object.assign(both, await fetchFirePathsBoth(at, getPosition(mid.sunrise, lat, lon).azimuth, getPosition(mid.sunset, lat, lon).azimuth, startIso, endIso))
      }
      putInputs(key, { fire: { week: both } })
    })()
  }, [open, key, lat, lon, today, timeZone, epoch, sky])

  /* The sea, the wind, the beach's facing. */
  useEffect(() => {
    if (!open || key === null || lat === null || lon === null || !firstAsk(key, 'sea', epoch)) return
    const at = { lat, lon }
    /*
     * The forecasts first, the beach's facing after (Batch M, Section 1): the
     * facing asks the map's sea polygons, which on a slow link took 8 s and
     * held the kept forecast off the home with it.
     */
    void (async () => {
      const [m, w] = await Promise.all([fetchMarine(at).catch(() => null), fetchBriefWind(at)])
      putInputs(key, { sea: { marine: m?.value ?? null, wind: w } })
      if (inputs.get(key)?.facing !== undefined) return
      const f = await coastFacing(at).catch(() => 'unavailable' as const)
      putInputs(key, { facing: f === 'inland' || f === 'unavailable' ? null : Math.round(f.facing) })
    })()
  }, [open, key, lat, lon, epoch])

  /* The stations, only in the two hours before today's or tomorrow's next event (as the Sky fire page). */
  const nextEvent = useMemo(() => {
    if (lat === null || lon === null) return null
    const all = [0, 1].flatMap((n) => KINDS.map((k) => eventsOn(dayIso(today, n), { lat, lon }, timeZone)[k])).filter((e): e is Date => e !== null && e.getTime() > now.getTime() - 30 * 60_000)
    return all.sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  }, [lat, lon, today, timeZone, now])
  const soon = nextEvent !== null && nextEvent.getTime() - now.getTime() <= 2 * 3_600_000
  const stationsEvent = soon ? nextEvent.getTime() : null
  useEffect(() => {
    if (!open || !sky || stationsEvent === null || key === null || lat === null || lon === null || !firstAsk(key, `stations@${stationsEvent}`, epoch)) return
    void fetchStationSkies({ lat, lon }).then((list) => putInputs(key, { stations: list }))
  }, [open, sky, stationsEvent, key, lat, lon, epoch])

  /*
   * THE SATELLITE, in the nowcast window only (3 h to 30 min before the next
   * event, src/core/goesNowcast.ts): its look toward the sun overrides the
   * models where infrared can speak. Advected by the wind at 500 hPa; the
   * ground reference is the forecast's air at 2 m. Kept per spot and event
   * (putSatRead), so every screen and every later mount reads the same one.
   */
  const satDue = nextEvent !== null && inNowcast(nextEvent, now)
  const satEvent = satDue ? nextEvent.getTime() : null
  const seaWind = got?.sea?.wind ?? null
  useEffect(() => {
    if (!open || !sky || satEvent === null || key === null || lat === null || lon === null || seaWind === null || !firstAsk(key, `sat@${satEvent}`, epoch)) return
    const e = new Date(satEvent)
    const mps = hourlyAt(seaWind, 'wind_speed_500hPa', e)
    const from = hourlyAt(seaWind, 'wind_direction_500hPa', e)
    const airC = hourlyAt(seaWind, 'temperature_2m', e)
    void fetchSatRead({ lat, lon }, getPosition(e, lat, lon).azimuth, e, new Date(), mps === null || from === null ? null : { mps, fromDeg: from }, airC).then((read) => {
      /* A read that saw nothing does not replace one that did. */
      if (read !== null || satFor(lat, lon, satEvent) === null) putSatRead(lat, lon, satEvent, read)
    })
  }, [open, sky, satEvent, key, lat, lon, seaWind, epoch])

  /* The observations before the next event (Batch J): the deck over you by its real height. */
  const stationList = soon ? (got?.stations ?? null) : null
  const st0 = stationList?.[0] ?? null
  const obs = useSkyObs(!sky || lat === null || lon === null ? null : { lat, lon }, nextEvent, st0 === null ? null : { id: st0.sky.station, sky: st0.sky }, null, now)

  /* The tide: the nearest station's month of highs and lows, from the start of today. */
  const tide = useTide(open ? venue : null, open ? now : null)
  const stationId = tide.status === 'ok' ? tide.station.id : null
  const tideNone = tide.status === 'no-station' || tide.status === 'unavailable'
  useEffect(() => {
    if (!open || key === null || stationId === null || !firstAsk(key, `tides@${stationId}`, epoch)) return
    const from = zonedTimeToUtc(today, '00:00', timeZone) ?? now
    void fetchMonthExtremes(stationId, from).then((m) => putInputs(key, { tides: m?.value ?? [] }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key, stationId, epoch])

  return useMemo((): Briefing => {
    if (key === null || lat === null || lon === null) return { status: 'loading', days: [], facing: null, checkedAt: null, wx: null, turns: [], settled: { sky: false, sea: false, facing: false, tide: false } }
    const at = { lat, lon }
    const f = got?.fire ?? null
    const s = got?.sea ?? null
    const st = stationList
    const station = st?.[0] !== undefined && st[0].at !== '' ? { sky: st[0].sky, at: new Date(st[0].at) } : null
    const ext = got?.tides ?? null
    const facing = got?.facing ?? null
    const factor = factorHere(at)
    const days: DayBrief[] = []
    for (let n = 0; n < (scope === 'week' ? WEEK_DAYS : 2); n += 1) {
      const iso = dayIso(today, n)
      const start = zonedTimeToUtc(iso, '00:00', timeZone) ?? new Date(`${iso}T00:00:00Z`)
      const end = new Date(start.getTime() + 86_400_000)
      const events = eventsOn(iso, at, timeZone)
      const verdicts: Record<Kind, FireVerdict | null> = { sunrise: null, sunset: null }
      const reads: Record<Kind, CallRead | null> = { sunrise: null, sunset: null }
      for (const kind of KINDS) {
        const e = events[kind]
        if (e === null || f === null) continue
        const data = f.week[kind]
        const paths = data === null ? [] : pathsAt(data, nearestHour(e))
        verdicts[kind] = paths.length === 0 ? null : fireVerdict(paths, { event: e, kind, venue: at, station, facing })
        const satHere = satFor(lat, lon, e.getTime())?.read ?? null
        const obsHere = nextEvent !== null && e.getTime() === nextEvent.getTime() ? obs : null
        reads[kind] = eventCall(verdicts[kind], kind, e, now, satHere, { venue: at, truth: obsHere?.truth ?? null, gap: obsHere?.gap ?? null, sky: station })
      }
      const left = KINDS.map((k) => reads[k]).filter((r): r is CallRead => r !== null && (n > 0 || r.event.getTime() > now.getTime() - 30 * 60_000))
      const call = dayCall(left)

      /* The sea and the wind, by the hour, 5 AM to 8 PM local: the hours you shoot. */
      const hours = Array.from({ length: 16 }, (_, i) => new Date(start.getTime() + (5 + i) * 3_600_000 + 1_800_000))
      const w = s?.wind ?? null
      const wind: WindHourIn[] = hours.map((h) => ({
        at: h,
        /* Sanity (Batch QA, Section 4): no negative wind, no gust under it. */
        mps: w === null ? null : saneWind(hourlyAt(w, 'wind_speed_10m', h)),
        gustMps: w === null ? null : saneGust(hourlyAt(w, 'wind_gusts_10m', h), hourlyAt(w, 'wind_speed_10m', h)),
        /* Calm has no direction (src/lib/windNow.ts calmDirection, Batch QA, Section 0B). */
        fromDeg: w === null ? null : calmDirection(hourlyAt(w, 'wind_speed_10m', h), hourlyAt(w, 'wind_direction_10m', h)),
        /* Batch SIMPLE-3, Section 1c: never under 0.9 of the hour's own 10 m wind (src/core/windProfile.ts saneAloft). */
        highMps: w === null ? null : (saneAloft(saneWind(hourlyAt(w, 'wind_speed_10m', h)), hourlyAt(w, 'wind_speed_120m', h))?.mps ?? null),
      }))
      const surf: SurfBar[] = []
      let periodAtMax: number | null = null
      if (s?.marine != null) {
        for (const [i, h] of hours.entries()) {
          const sh = surfAt(s.marine, h, facing, factor)
          if (sh === null) continue
          const wh = wind[i]
          /* The Surf page's shape (src/core/surf.ts): Clean is light or offshore; with no direction, never Messy. */
          const shape = wh.mps === null ? null : surfShape(wh.mps, wh.fromDeg ?? 0, wh.fromDeg === null ? null : facing)
          surf.push({ at: h, faceFt: sh.estimate.faceFt, clean: shape === 'Clean', shape, swellFt: sh.swellFt, windWaveFt: sh.windWaveFt })
          if (periodAtMax === null || sh.estimate.faceFt >= Math.max(...surf.map((b) => b.faceFt))) periodAtMax = sh.periodS
        }
      }
      const maxBar = surf.length === 0 ? null : surf.reduce((a, b) => (b.faceFt > a.faceFt ? b : a))
      const strongest = wind.filter((x) => x.mps !== null).reduce<WindHourIn | null>((a, b) => (a === null || (b.mps ?? 0) > (a.mps ?? 0) ? b : a), null)
      const gustMax = wind.reduce<number | null>((a, b) => (b.gustMps === null ? a : Math.max(a ?? 0, b.gustMps)), null)
      /* The wind's side at the day's call, else at noon. */
      const callHour = call?.event ?? new Date(start.getTime() + 12 * 3_600_000)
      const atCall = wind.reduce<WindHourIn | null>((a, b) => (a === null || Math.abs(b.at.getTime() - callHour.getTime()) < Math.abs(a.at.getTime() - callHour.getTime()) ? b : a), null)
      const tag = windTag(atCall?.fromDeg ?? null, facing)
      days.push({
        iso,
        index: n,
        start,
        end,
        events,
        verdicts,
        reads,
        call,
        surf,
        surfWords: surfLine(surf, periodAtMax),
        surfTag: maxBar === null ? null : surfTag(maxBar.faceFt, maxBar.shape),
        surfClean: maxBar?.clean ?? false,
        wind,
        windTag: tag,
        windMaxKt: kt(strongest?.mps ?? null),
        gustMaxKt: kt(gustMax),
        windFrom: strongest?.fromDeg ?? null,
        windLevel: windLevel(kt(strongest?.mps ?? null)),
        windOffshore: tag === 'Offshore',
        tide: ext === null || ext.length === 0 ? null : tideDay(ext, start, end, n === 0 ? now : null),
        moon: moonOn(new Date(start.getTime() + 12 * 3_600_000)),
        certainty: certainty(call ?? reads.sunset ?? reads.sunrise, n),
      })
    }
    const times = [f, s].filter((x) => x !== null)
    const fetched = f === null ? [] : [f.week.sunrise, f.week.sunset].map((x) => x?.fetchedAt).filter((t): t is number => typeof t === 'number')
    const obsPending = obsDue(nextEvent, now) && (obs === null || (soon && got?.stations === undefined))
    /* Section 0: whether each part has answered (or said why not), so a screen can wait for a whole answer rather than draw half of one. */
    const settled = {
      sky: !sky || (f !== null && (!soon || got?.stations !== undefined) && (satEvent === null || satFor(lat, lon, satEvent) !== null) && !obsPending),
      sea: s !== null,
      facing: got?.facing !== undefined,
      tide: ext !== null || tideNone,
    }
    return { status: times.length === (sky ? 2 : 1) ? 'ready' : 'loading', days, facing, checkedAt: fetched.length === 0 ? null : Math.max(...fetched), obsPending, wx: s?.wind ?? null, turns: ext ?? [], settled }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, lat, lon, got, version, stationList, satEvent, tideNone, obs, nextEvent, soon, sky, today, timeZone, now, scope])
}

