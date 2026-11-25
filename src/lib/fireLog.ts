/*
 * WHAT THE SKY DID, KEPT ON THIS PHONE. After a sunrise or a sunset you can
 * say "It fired", "Meh" or "Nothing", with a photo if you like. Kept in
 * localStorage with the forecast's words beside it, so over time the log
 * says how far the forecast can be trusted here. Nothing is sent; the photo
 * is shrunk on the phone to a thumbnail and never leaves it.
 *
 * ENTRY #1 is 29 Oct 2026, sunrise at the Virginia Beach Fishing Pier: it
 * fired, under a low deck the forecast had at 87-100% overhead
 * (measurements/2026-10-29-sunrise.md). It is put in the first time the log
 * is read on a phone with no log.
 */
import { yoursChanged } from './backup.ts'
import type { PhotoFacts } from '../core/exif.ts'
import { zonedTimeToUtc } from '../core/timezone.ts'

export const FIRE_LOG_KEY = 'scoutngo.fireLog.v1'

/* 'clear' (Batch F, Section 7): no cloud at all, so nothing to fire; not the same as cloud that stayed grey. */
export type FireOutcome = 'fired' | 'meh' | 'nothing' | 'clear'
export const OUTCOME_LABEL: Record<FireOutcome, string> = { fired: 'It fired', meh: 'Meh', nothing: 'Nothing', clear: 'Clear sky' }

/*
 * THE FIVE-STEP RATING (Batch SIMPLE-3, Section 3.5): one tap, changeable,
 * in the call's own steps so the hit rate can hold the two side by side.
 *
 *   Nothing · A little · Some · Good · Fired
 *   Skip      Unlikely   Possible  Likely  Fire     (the hit-rate scale)
 *
 * The three-way outcome stays (the truth loop and the older entries read
 * it): Nothing is nothing, A little and Some are meh, Good and Fired fired.
 */
export type SkyRating = 'nothing' | 'little' | 'some' | 'good' | 'fired'
export const RATINGS: readonly SkyRating[] = ['nothing', 'little', 'some', 'good', 'fired']
export const RATING_LABEL: Record<SkyRating, string> = { nothing: 'Nothing', little: 'A little', some: 'Some', good: 'Good', fired: 'Fired' }
export type RatingLevel = 'Skip' | 'Unlikely' | 'Possible' | 'Likely' | 'Fire'
export const RATING_LEVEL: Record<SkyRating, RatingLevel> = { nothing: 'Skip', little: 'Unlikely', some: 'Possible', good: 'Likely', fired: 'Fire' }
export const OUTCOME_OF_RATING: Record<SkyRating, FireOutcome> = { nothing: 'nothing', little: 'meh', some: 'meh', good: 'fired', fired: 'fired' }

/** The call a forecast's words made: "Color likely" Go, "Color possible" Maybe, "Color unlikely" Skip; null when it said none. */
export function forecastCall(forecast: string | null): 'Go' | 'Maybe' | 'Skip' | null {
  if (forecast === null) return null
  if (/unlikely/i.test(forecast)) return 'Skip'
  if (/likely/i.test(forecast)) return 'Go'
  if (/possible/i.test(forecast)) return 'Maybe'
  return null
}

/** A hit: the rating sits on the call's step. Go: Likely or Fire. Maybe: Possible. Skip: Skip or Unlikely. */
export function ratingHit(rating: SkyRating, call: 'Go' | 'Maybe' | 'Skip'): boolean {
  const level = RATING_LEVEL[rating]
  if (call === 'Go') return level === 'Likely' || level === 'Fire'
  if (call === 'Maybe') return level === 'Possible'
  return level === 'Skip' || level === 'Unlikely'
}

/** When the photo was taken, ms: its own offset when the camera wrote one, else its wall clock read in the spot's zone; null when it did not say. */
export function photoTakenAt(facts: PhotoFacts, timeZone: string): number | null {
  if (facts.at !== null && facts.atHasOffset) return facts.at
  if (facts.wallClock !== null) {
    const [d, t] = facts.wallClock.split(' ')
    if (d !== undefined && t !== undefined) {
      const at = zonedTimeToUtc(d.replace(/:/g, '-'), t.slice(0, 5), timeZone)
      if (at !== null) return at.getTime() + (Number(t.slice(6, 8)) || 0) * 1000
    }
  }
  return facts.at
}

export interface FireEntry {
  id: string
  /** The venue's own date of the event, YYYY-MM-DD. */
  date: string
  event: 'sunrise' | 'sunset'
  place: string
  outcome: FireOutcome
  /** What the forecast said beforehand, when it was shown: "Fire possible". */
  forecast: string | null
  /** A thumbnail as a data URL, made on the phone. */
  photo: string | null
  /** The five-step rating (Batch SIMPLE-3, Section 3.5); older entries have none. */
  rating?: SkyRating | null
  /** When the photo was taken (its Exif DateTimeOriginal), ms; null when it did not say. */
  photoAt?: number | null
}

export const FIRST_ENTRY: FireEntry = {
  id: '2026-10-29-sunrise-vb-pier',
  date: '2026-10-29',
  event: 'sunrise',
  place: 'Virginia Beach Fishing Pier',
  outcome: 'fired',
  forecast: null,
  photo: null,
}

const valid = (e: unknown): e is FireEntry => {
  const x = e as Partial<FireEntry> | null
  return (
    typeof x?.id === 'string' &&
    typeof x.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.date) &&
    (x.event === 'sunrise' || x.event === 'sunset') &&
    typeof x.place === 'string' &&
    (x.outcome === 'fired' || x.outcome === 'meh' || x.outcome === 'nothing' || x.outcome === 'clear')
  )
}

export function parseFireLog(raw: string | null): FireEntry[] | null {
  if (raw === null) return null
  try {
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? list.filter(valid).map((e) => ({ ...e, forecast: e.forecast ?? null, photo: typeof e.photo === 'string' && e.photo.startsWith('data:image/') ? e.photo : null, rating: RATINGS.includes(e.rating as SkyRating) ? e.rating : null, photoAt: typeof e.photoAt === 'number' && Number.isFinite(e.photoAt) ? e.photoAt : null })) : []
  } catch {
    return []
  }
}

export function readFireLog(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): FireEntry[] {
  try {
    const list = parseFireLog(storage.getItem(FIRE_LOG_KEY))
    if (list !== null) return list
    storage.setItem(FIRE_LOG_KEY, JSON.stringify([FIRST_ENTRY]))
    return [FIRST_ENTRY]
  } catch {
    return [FIRST_ENTRY]
  }
}

/** Adds or replaces the entry for the same day, event and place. Newest first. */
export function withEntry(log: readonly FireEntry[], entry: FireEntry): FireEntry[] {
  return [entry, ...log.filter((e) => !(e.date === entry.date && e.event === entry.event && e.place === entry.place))].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export function writeFireLog(log: readonly FireEntry[], storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(FIRE_LOG_KEY, JSON.stringify(log))
    yoursChanged()
    return true
  } catch {
    /* Full, usually with photos: the caller says it was not kept. */
    return false
  }
}

/**
 * How often it fired when the forecast said so: "fired 3 of 4 times it said
 * likely or possible"; and, of the entries rated in five steps against a
 * call, how many sat on the call's step (`rated`, `hits`).
 */
export function trackRecord(log: readonly FireEntry[]): { said: number; fired: number; rated: number; hits: number } {
  const said = log.filter((e) => e.forecast !== null && /likely|possible/.test(e.forecast))
  const rated = log.flatMap((e) => {
    const call = forecastCall(e.forecast)
    return e.rating == null || call === null ? [] : [ratingHit(e.rating, call)]
  })
  return { said: said.length, fired: said.filter((e) => e.outcome === 'fired').length, rated: rated.length, hits: rated.filter(Boolean).length }
}
