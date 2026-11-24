/*
 * ONE SURF NUMBER (Batch Map A2). On 9 Nov at the same minute the home said
 * "3–4 ft", the menu "2–3 ft" and the Surf page "2–4 ft": the home and the
 * menu took the whole day's smallest and biggest hour, the menu at a beach
 * picked weeks before, the page the honest band at this hour. Now one hook
 * gives every screen the same thing: the spot's surf beach (beachFor), its
 * sea, this phone's per-spot check, and the Surf page's own band at this
 * hour (rangeHourAt, rangeWords). The home, the menu's Water card and the
 * Surf page all read it; scripts/audit-one-number.mjs fails when any two
 * screens show a different value.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { spotKey, spotStats, type SpotStats } from '../core/spotSkill.ts'
import { BEACH_CAP } from '../core/surf.ts'
import { surfBand, surfCall, type SurfCall } from '../core/surfCall.ts'
import { buoySeaKinds } from '../core/surfTransform.ts'
import { obsFresh, type StationObs } from '../core/nowcast.ts'
import { sideWords } from '../core/homeDay.ts'
import { rangeWords } from '../core/surfRange.ts'
import { buoyParts, forecastParts, periodRead, rangeSizeWords, type PeriodRead, type SwellPart } from '../core/surfReads.ts'
import { hourlyAt } from './tideSheetData.ts'
import { saneRange } from '../core/sanity.ts'
import { venueToday } from '../core/eventDay.ts'
import { wallClock } from '../core/timezone.ts'
import { addDays, buoyLean, dayReadings, modelDayReadings, FIRST_HOUR, LAST_HOUR, LEAN_BUOY_MAX_AGE_MS, rangeHourAt, weekPeaks, type RangeHour, type SurfObs } from './surfPageData.ts'
import { modelTops, swellWatch, type SwellWatch, type WatchReading } from '../core/swellWatch.ts'
import { keepWatch, takeDailyModelsAsk } from './swellWatchStore.ts'
import { useFirstLoadSettled } from './firstLoad.ts'
import { onSkillBook, readSkillBook, skillBookVersion } from './spotSkillStore.ts'
import { awayFrom, beachName, sameBeach, useSurfBeach, type Beach } from './surfBeach.ts'
import { seaSettled, useSurfSea, type SurfSea } from './useSurfSea.ts'
import { fetchWaveModels, type ModelSea } from './waveModels.ts'
import { stationObsAnswered, useStationObs } from './useStationObs.ts'
import { useCoastCams } from './coastCamsLazy.ts'
import { leanHourly } from './windNow.ts'
import { keepWeek } from './weekBiasStore.ts'

export interface SurfNow {
  /** The spot's surf beach; null far from any. */
  beach: Beach | null
  /** Set when the spot is not on that beach: its short name and how far, in the user's unit. */
  away: { name: string; far: string } | null
  /** Where the surf is read: the beach when away, else the spot; null with no spot. */
  spot: LatLon | null
  sea: SurfSea
  stats: SpotStats
  /** This hour's band, and in words ("2–4 ft"); null while loading or where the forecast says nothing. */
  now: RangeHour | null
  nowWords: string | null
  /** Tomorrow's biggest hour, and in words. */
  tomorrow: RangeHour | null
  tomorrowWords: string | null
  /** Seven days, each called once (src/core/surfCall.ts): today by the hour now, the rest by their biggest hour. Every screen's day number. */
  week: SurfDay[]
  /** Batch FIX, Section 3.3: the hours from an hour ago to two days on, each at half past, read as the call reads them: the home card's chart line. */
  series: RangeHour[]
  /** Batch FIX, Section 3.4: the bigger-swell watch for the week page; null when nothing we hold reaches it. */
  watch: SwellWatch | null
  /**
   * Batch SIMPLE-3, Section 0: every input the call reads has answered: the
   * beach is chosen (the cams' list is in, src/lib/surfBeach.ts), its sea,
   * facing and buoy (src/lib/useSurfSea.ts seaSettled), and the station the
   * wind leans to. Before that the size can still move (23 Nov: "1–2 ft",
   * then "2–3 ft" in the same minute).
   */
  settled: boolean
}

export interface SurfDay {
  date: string
  hour: RangeHour | null
  call: SurfCall | null
  /** The readings the bigger-swell watch sets against the call (src/lib/surfPageData.ts dayReadings). */
  readings?: WatchReading[]
}

/** The wind to the beach as the call says it. */
export const sideWord = (h: RangeHour): string | null => (h.side === null ? null : sideWords(h.side))

/** surfCall(spot, time): one hour of one spot, called (Batch TRUTH, Section 1). */
export const callOf = (h: RangeHour | null, dayIndex: number): SurfCall | null => (h === null ? null : surfCall({ centerFt: h.centerFt, shape: h.shape, side: sideWord(h), chop: h.chop }, dayIndex))

/**
 * THE SEA NOW, ONE SOURCE (Batch QA, Section 0B; field 10 Nov: one Surf page
 * said "12 s at 44099" up top, "1.7 ft · 9 s" on the swell bar and "swell
 * 2.0 ft · 12 s" on the buoy card). The buoy's own parts when it reported in
 * the last 2 hours with its spectral split, else the forecast's at the hour;
 * the period every screen says is the swell part's, from the same source.
 */
export interface SeaNow {
  parts: SwellPart[]
  period: PeriodRead | null
  from: 'buoy' | 'forecast' | null
}
export function seaNow(sea: SurfSea, now: Date, meanS: number | null = null): SeaNow {
  const b = sea.buoy
  const fresh = b !== null && b.status === 'ok' && Math.abs(now.getTime() - b.at.getTime()) <= 2 * 3_600_000
  const own = fresh && b !== null && b.status === 'ok' ? buoyParts(b.split) : []
  const swellOf = (parts: SwellPart[]) => parts.find((p) => p.name === 'Swell')?.periodS ?? null
  if (own.length > 0 && b !== null && b.status === 'ok') {
    const s = swellOf(own) ?? b.periodS
    return { parts: own, period: s === null || !(s > 0) ? null : { s: Math.round(s), words: `${Math.round(s)} s at ${b.buoy.id}`, from: 'buoy' }, from: 'buoy' }
  }
  const half = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + 1_800_000)
  const marine = sea.marine
  const parts = marine === null ? [] : forecastParts((n) => hourlyAt(marine, n, half))
  const s = swellOf(parts)
  const period = s !== null && s > 0 ? { s: Math.round(s), words: `${Math.round(s)} s`, from: 'forecast-peak' as const } : periodRead(null, false, marine === null ? null : hourlyAt(marine, 'swell_wave_peak_period', half), meanS)
  return { parts, period, from: marine === null ? null : 'forecast' }
}

/** "knee to chest · 13 s at 44099": the size from the band's own ends and the swell's period (seaNow), the home's and the Surf page's. */
export function surfLine(sea: SurfSea, h: RangeHour | null, now: Date): string | null {
  if (h === null) return null
  const p = seaNow(sea, now, h.periodS).period
  const [lo, hi] = surfBand(h.centerFt)
  return [rangeSizeWords(lo, hi), p?.words ?? null].filter((x) => x !== null).join(' · ')
}

/** The words for a band, the one way every screen says it. */
export const surfWords = (h: RangeHour | null): string | null => (h === null || saneRange(h.range.lowFt, h.range.highFt) === null ? null : rangeWords(h.range))

/** What was measured near now, for every screen alike (src/lib/surfPageData.ts SurfObs): the station's wind when fresh, the buoy's parts when fresh. */
export function surfObs(sea: SurfSea, now: Date, station: StationObs | null): SurfObs {
  const b = sea.buoy
  const fresh = b !== null && b.status === 'ok' && Number.isFinite(b.at.getTime()) && Math.abs(now.getTime() - b.at.getTime()) <= LEAN_BUOY_MAX_AGE_MS
  return { station: obsFresh(station, now) ? station : null, buoy: fresh && b !== null && b.status === 'ok' ? { at: b.at.getTime(), parts: buoySeaKinds(b) } : null }
}

/** The hour's half past: two screens a few seconds apart read the same hour. */
const halfOf = (t: Date) => new Date(Math.floor(t.getTime() / 3_600_000) * 3_600_000 + 1_800_000)

/** The series' reach: from an hour before now to two days on. */
export const SERIES_FROM_H = -1
export const SERIES_TO_H = 48

/*
 * ONE SURF SERIES (Batch FIX, Section 3.3; 17 Nov 7:05 AM the home card said
 * 1-2 while its chart line read about 0.3, and the map said "swell 1.0 ft
 * 3 s NE" while the Surf page said 0.3 ft 11 s and wind waves 3.0 ft 4 s).
 * Every screen's surf for an hour is this: the same sea, the same lean to
 * the buoy, the same measured wind and sea near now, read at the hour's half
 * past, called by surfCall. The home's text and line, the Surf page's head
 * and chart, the map's readout at the spot and the week all come from here;
 * tests/surfOneSeries.test.ts holds them to it.
 */
const weekdayOf = (iso: string) => new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`))

export function surfNowFrom(sea: SurfSea, stats: SpotStats, now: Date, timeZone: string, station: StationObs | null = null): { now: RangeHour | null; tomorrow: RangeHour | null; week: SurfDay[]; series: RangeHour[]; watch: SwellWatch | null } {
  if (sea.marine === null) return { now: null, tomorrow: null, week: [], series: [], watch: null }
  const today = venueToday(now, timeZone)
  /* Batch Beach, Section 2: the next 6 h lean to the live buoy, and the tag reads the leaned centre. */
  const shelter = sea.shelter ?? null
  const lean = buoyLean(sea.marine, sea.wind, sea.buoy, sea.facing, stats, sea.factor ?? BEACH_CAP, now.getTime(), sea.buoys ?? [], shelter)
  const obs = surfObs(sea, now, station)
  const week = weekPeaks(sea.marine, sea.wind, today, timeZone, sea.facing, stats, sea.factor, lean, shelter, obs)
  const tomorrow = week.find((d) => d.date === addDays(today, 1))?.peak ?? null
  /* Read at the hour's half past, as the day's bars are: two screens a few seconds apart read the same hour. */
  const half = halfOf(now)
  const marine = sea.marine
  const series: RangeHour[] = []
  for (let k = SERIES_FROM_H; k <= SERIES_TO_H; k += 1) {
    const h = rangeHourAt(marine, sea.wind, new Date(half.getTime() + k * 3_600_000), sea.facing, stats, sea.factor, lean, shelter, obs)
    if (h !== null) series.push(h)
  }
  const hourNow = series.find((h) => h.at.getTime() === half.getTime()) ?? null
  /* Today is called by the hour now, the home card's and the Surf page's head; the other days by their biggest hour. */
  const days = week.map((d, i) => {
    const hour = i === 0 ? hourNow : d.peak
    /* Batch 3D, Section 3.2: and each other wave model's, where the screen asked them. */
    return { date: d.date, hour, call: callOf(hour, i), readings: [...dayReadings(marine, d.date, timeZone, sea.facing, sea.factor), ...modelDayReadings(sea.models ?? [], d.date, timeZone, sea.facing, sea.factor)] }
  })
  const watch = swellWatch(days.map((d) => ({ date: d.date, callHighFt: d.call?.highFt ?? null, readings: d.readings })), weekdayOf)
  return { now: hourNow, tomorrow, week: days, series, watch }
}

/** The series' hours a day's chart draws: FIRST_HOUR to LAST_HOUR local (the hours you surf, the briefing's), each at half past. */
export function surfDayHours(series: readonly RangeHour[], timeZone: string): RangeHour[] {
  return series.filter((h) => {
    const n = wallClock(h.at, timeZone)?.hour ?? null
    return n !== null && n >= FIRST_HOUR && n <= LAST_HOUR
  })
}

/** The series' hour for a time (its half past), and its call; null outside the series. The map's readout at the spot reads this. */
export function surfHourOf(series: readonly RangeHour[], at: Date, dayIndex: number): { hour: RangeHour; call: SurfCall } | null {
  const t = halfOf(at).getTime()
  const hour = series.find((h) => h.at.getTime() === t) ?? null
  const call = callOf(hour, dayIndex)
  return hour === null || call === null ? null : { hour, call }
}

/** This phone's per-spot stats, read from the book (src/lib/spotSkillStore.ts); the Surf page's sampling writes it. */
export function storedStats(spot: LatLon, now: number): SpotStats {
  return spotStats(readSkillBook()[spotKey(spot)]?.samples ?? [], now)
}

/*
 * The other wave models at a spot (Batch 3D, Section 3.2), asked only by a
 * screen that shows the bigger-swell watch (the home's week): one request,
 * kept by the weather store. `at` null asks nothing.
 */
function useWaveModels(at: LatLon | null): ModelSea[] | null {
  const key = at === null ? null : `${at.lat.toFixed(3)},${at.lon.toFixed(3)}`
  const [got, setGot] = useState<{ key: string; v: ModelSea[] } | null>(null)
  useEffect(() => {
    if (key === null || at === null) return
    let live = true
    fetchWaveModels(at)
      .then((v) => {
        if (live) setGot({ key, v })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return got !== null && got.key === key ? got.v : null
}

/**
 * `venue` null asks nothing (the menu before it has been open a moment). `models`: ask the other wave models too (the
 * home's week, Batch 3D Section 3.2); 'daily' (the home, Batch SIMPLE-1 Section 5): once a day per spot, after the first
 * load has settled (src/lib/firstLoad.ts), so the bigger-swell log has them on a day the Surf page and the Week are not
 * opened.
 */
export function useSurfNow(venue: LatLon | null, now: Date, timeZone: string, miles: boolean, spotName: string | null = null, station: StationObs | null = null, models: boolean | 'daily' = false): SurfNow {
  /* Batch Flow, Section 3: a spot named for a beach is on that beach (src/lib/surfBeach.ts namedBeach). */
  const [beach] = useSurfBeach(venue, spotName)
  /* Read where the beach's surf is; said to be elsewhere only when it is (a spot named for the beach is on it). */
  const away = awayFrom(venue, beach, spotName)
  const spot = venue !== null && beach !== null && !sameBeach(venue, beach) ? beach.at : venue
  const seaOwn = useSurfSea(spot)
  /*
   * Batch SIMPLE-1, Section 5: the daily check. One request (every model in it, src/lib/waveModels.ts) through the
   * weather store, at a spot with a sea forecast, once the first load has settled; not when today's row already has the
   * models or the check already asked today (src/lib/swellWatchStore.ts takeDailyModelsAsk). Held for the session once
   * asked, so the row it writes keeps them.
   */
  const settled = useFirstLoadSettled()
  const dailyKey = spot === null ? null : spotKey(spot)
  const dailyDay = venueToday(now, timeZone)
  const seaReady = seaOwn.marine !== null
  const [dailyAsked, setDailyAsked] = useState<string | null>(null)
  useEffect(() => {
    if (models !== 'daily' || !settled || !seaReady || dailyKey === null || dailyAsked === dailyKey) return
    /* oxlint-disable react/set-state-in-effect -- the day's mark is taken from this phone's storage (an external system) once, then held */
    if (takeDailyModelsAsk(dailyKey, dailyDay)) setDailyAsked(dailyKey)
    /* oxlint-enable react/set-state-in-effect */
  }, [models, settled, seaReady, dailyKey, dailyDay]) // eslint-disable-line react-hooks/exhaustive-deps
  const waveModels = useWaveModels(models === true || (dailyKey !== null && dailyAsked === dailyKey) ? spot : null)
  const seaRaw = useMemo(() => (waveModels === null ? seaOwn : { ...seaOwn, models: waveModels }), [seaOwn, waveModels])
  /* Batch FIX, Section 1: the wind the call reads leans to the one station now, the home's and the Wind page's (src/lib/useStationObs.ts). */
  const near = useStationObs(venue)
  const camsIn = useCoastCams() !== null
  const answered = camsIn && seaSettled(seaOwn) && stationObsAnswered(venue)
  const sea = useMemo(() => {
    const wind = leanHourly(seaRaw.wind, near, now)
    return wind === seaRaw.wind ? seaRaw : { ...seaRaw, wind }
  }, [seaRaw, near, now])
  /* The hour, not the minute: the stats move when a check lands (the Surf page's sampling) or the hour turns, not each render. */
  const hour = Math.floor(now.getTime() / 3_600_000)
  const version = useSyncExternalStore(onSkillBook, skillBookVersion, skillBookVersion)
  const use = useMemo(() => (spot === null ? storedStats({ lat: 0, lon: 0 }, 0) : storedStats(spot, hour * 3_600_000)), [spot?.lat, spot?.lon, hour, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const km = away && venue !== null && beach !== null ? distanceMeters(venue, beach.at) / 1000 : 0
  /*
   * One lean, not two (Batch FIX, Sections 1 and 3 merged): when the hourly
   * wind already leans to the one station above, the call reads that and the
   * station is not applied again; otherwise the station a caller passes (or
   * the one picked) is the call's measured wind. The buoy's split reads alike.
   */
  const measured = sea !== seaRaw ? null : (station ?? near)
  const read = useMemo(() => surfNowFrom(sea, use, now, timeZone, measured), [sea, use, now, timeZone, measured])
  /* Batch DRONE, Section 1.7: the week's calls, kept on this phone for the week's bias (src/core/weekBias.ts); written when a call changes, not each minute. */
  const spotK = spot === null ? null : spotKey(spot)
  const weekSig = `${read.week.map((d) => `${d.date}:${d.call?.lowFt ?? '-'}`).join(',')}|${waveModels === null ? '' : waveModels.map((m) => m.id).join(',')}`
  useEffect(() => {
    if (spotK === null || read.week.length === 0) return
    keepWeek(spotK, read.week[0].date, read.week.map((d) => ({ date: d.date, lowFt: d.call?.lowFt ?? null })), Date.now())
    /* Batch FIX, Section 3.4: and the bigger-swell log, each day's call and its top reading (Mon 23 Nov is the first it watches). */
    keepWatch(spotK, read.week[0].date, read.week.map((d) => ({ date: d.date, callLowFt: d.call?.lowFt ?? null, callHighFt: d.call?.highFt ?? null, topFt: (d.readings ?? []).reduce<number | null>((m, r) => Math.max(m ?? 0, r.faceFt), null), ...(waveModels === null ? {} : { models: modelTops(d.readings ?? []) }) })), Date.now())
  }, [spotK, weekSig]) // eslint-disable-line react-hooks/exhaustive-deps
  return {
    beach,
    away: away && beach !== null ? { name: beachName(beach.name), far: miles ? `${Math.max(1, Math.round(km / 1.609))} mi` : `${Math.max(1, Math.round(km))} km` } : null,
    spot,
    sea,
    stats: use,
    now: read.now,
    nowWords: surfWords(read.now),
    tomorrow: read.tomorrow,
    tomorrowWords: surfWords(read.tomorrow),
    week: read.week,
    series: read.series,
    watch: read.watch,
    settled: answered,
  }
}
