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
import { useMemo, useSyncExternalStore } from 'react'
import { distanceMeters, type LatLon } from '../core/geo.ts'
import { spotKey, spotStats, type SpotStats } from '../core/spotSkill.ts'
import { BEACH_CAP } from '../core/surf.ts'
import { rangeWords } from '../core/surfRange.ts'
import { buoyParts, forecastParts, periodRead, rangeSizeWords, type PeriodRead, type SwellPart } from '../core/surfReads.ts'
import { hourlyAt } from './tideSheetData.ts'
import { saneRange } from '../core/sanity.ts'
import { venueToday } from '../core/eventDay.ts'
import { addDays, buoyLean, rangeHourAt, weekPeaks, type RangeHour } from './surfPageData.ts'
import { onSkillBook, readSkillBook, skillBookVersion } from './spotSkillStore.ts'
import { awayFrom, beachName, sameBeach, useSurfBeach, type Beach } from './surfBeach.ts'
import { useSurfSea, type SurfSea } from './useSurfSea.ts'

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
}

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
  return [rangeSizeWords(h.range.lowFt, h.range.highFt), p?.words ?? null].filter((x) => x !== null).join(' · ')
}

/** The words for a band, the one way every screen says it. */
export const surfWords = (h: RangeHour | null): string | null => (h === null || saneRange(h.range.lowFt, h.range.highFt) === null ? null : rangeWords(h.range))

export function surfNowFrom(sea: SurfSea, stats: SpotStats, now: Date, timeZone: string): { now: RangeHour | null; tomorrow: RangeHour | null } {
  if (sea.marine === null) return { now: null, tomorrow: null }
  const today = venueToday(now, timeZone)
  /* Batch Beach, Section 2: the next 6 h lean to the live buoy, and the tag reads the leaned centre. */
  const lean = buoyLean(sea.marine, sea.wind, sea.buoy, sea.facing, stats, sea.factor ?? BEACH_CAP, now.getTime())
  const week = weekPeaks(sea.marine, sea.wind, today, timeZone, sea.facing, stats, sea.factor, lean)
  const tomorrow = week.find((d) => d.date === addDays(today, 1))?.peak ?? null
  /* Read at the hour's half past, as the day's bars are: two screens a few seconds apart read the same hour. */
  const half = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 + 1_800_000)
  return { now: rangeHourAt(sea.marine, sea.wind, half, sea.facing, stats, sea.factor, lean), tomorrow }
}

/** This phone's per-spot stats, read from the book (src/lib/spotSkillStore.ts); the Surf page's sampling writes it. */
export function storedStats(spot: LatLon, now: number): SpotStats {
  return spotStats(readSkillBook()[spotKey(spot)]?.samples ?? [], now)
}

/** `venue` null asks nothing (the menu before it has been open a moment). */
export function useSurfNow(venue: LatLon | null, now: Date, timeZone: string, miles: boolean, spotName: string | null = null): SurfNow {
  /* Batch Flow, Section 3: a spot named for a beach is on that beach (src/lib/surfBeach.ts namedBeach). */
  const [beach] = useSurfBeach(venue, spotName)
  /* Read where the beach's surf is; said to be elsewhere only when it is (a spot named for the beach is on it). */
  const away = awayFrom(venue, beach, spotName)
  const spot = venue !== null && beach !== null && !sameBeach(venue, beach) ? beach.at : venue
  const sea = useSurfSea(spot)
  /* The hour, not the minute: the stats move when a check lands (the Surf page's sampling) or the hour turns, not each render. */
  const hour = Math.floor(now.getTime() / 3_600_000)
  const version = useSyncExternalStore(onSkillBook, skillBookVersion, skillBookVersion)
  const use = useMemo(() => (spot === null ? storedStats({ lat: 0, lon: 0 }, 0) : storedStats(spot, hour * 3_600_000)), [spot?.lat, spot?.lon, hour, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const km = away && venue !== null && beach !== null ? distanceMeters(venue, beach.at) / 1000 : 0
  const read = useMemo(() => surfNowFrom(sea, use, now, timeZone), [sea, use, now, timeZone])
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
  }
}
