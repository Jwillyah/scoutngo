/*
 * WHERE THE PER-SPOT SURF ACCURACY IS KEPT (Batch N, Section 5): this phone's
 * localStorage, nothing else. Keyed by the spot rounded to two decimals
 * (src/core/spotSkill.ts spotKey); the coordinate never leaves the phone.
 *
 * In the backup file: the key starts with "scoutngo." and is not in
 * backup.ts's NOT_BACKED_UP, so buildBackup carries it and restoreBackup puts
 * it back (tests/spotSkill.test.ts holds that). Not in WORTH_KEEPING: that
 * list drives the "Back up?" nudge, and samples the app takes by itself every
 * hour are not something you did that would nag you to save. Privacy › Clear
 * this phone removes every "scoutngo." key, this one with them.
 *
 * Stored compact, one tuple a sample: [hour index, forecast ft x100, buoy ft
 * x100, rating], so a full month for MAX_SPOTS spots is a few hundred KB at
 * most.
 */
import { addSample, HOUR_MS, type SessionRating, type SkillSample } from '../core/spotSkill.ts'

export const SPOT_SKILL_KEY = 'scoutngo.spotSkill.v1'
/* The spots you surf, not every pin you ever dropped; the least recently sampled go first. */
export const MAX_SPOTS = 12

type Tuple = [number, number, number, SessionRating | null]
export interface SpotEntry {
  /** When this phone last tried a sample here, ms: the hourly limit. */
  triedAt: number
  samples: SkillSample[]
}
export type SkillBook = Record<string, SpotEntry>

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

const RATINGS: readonly SessionRating[] = ['Fun', 'Meh', 'Bad']

export function readSkillBook(store: Store | null = local()): SkillBook {
  if (store === null) return {}
  try {
    const raw = JSON.parse(store.getItem(SPOT_SKILL_KEY) ?? '{}') as Record<string, { t?: unknown; s?: unknown }>
    const out: SkillBook = {}
    for (const [k, v] of Object.entries(raw ?? {})) {
      if (v === null || typeof v !== 'object' || !Array.isArray(v.s)) continue
      const samples: SkillSample[] = []
      for (const row of v.s as unknown[]) {
        if (!Array.isArray(row) || typeof row[0] !== 'number' || typeof row[1] !== 'number' || typeof row[2] !== 'number') continue
        const rating = RATINGS.includes(row[3] as SessionRating) ? (row[3] as SessionRating) : null
        samples.push({ at: row[0] * HOUR_MS, forecastFt: row[1] / 100, buoyFt: row[2] / 100, rating })
      }
      out[k] = { triedAt: typeof v.t === 'number' ? v.t : 0, samples }
    }
    return out
  } catch {
    return {}
  }
}

export function writeSkillBook(book: SkillBook, store: Store | null = local()): void {
  if (store === null) return
  const raw: Record<string, { t: number; s: Tuple[] }> = {}
  for (const [k, e] of Object.entries(book)) {
    raw[k] = { t: e.triedAt, s: e.samples.map((s) => [Math.round(s.at / HOUR_MS), Math.round(s.forecastFt * 100), Math.round(s.buoyFt * 100), s.rating ?? null]) }
  }
  try {
    store.setItem(SPOT_SKILL_KEY, JSON.stringify(raw))
  } catch {
    /* Storage full or refused: this hour's sample is lost, nothing else. */
  }
  bookVersion += 1
  for (const f of bookListeners) f()
}

/* Batch Map A2: the screens reading the stats (src/lib/useSurfNow.ts) read them again when a check lands. */
let bookVersion = 0
const bookListeners = new Set<() => void>()
export const skillBookVersion = (): number => bookVersion
export function onSkillBook(f: () => void): () => void {
  bookListeners.add(f)
  return () => {
    bookListeners.delete(f)
  }
}

const lastAt = (e: SpotEntry) => Math.max(e.triedAt, e.samples.at(-1)?.at ?? 0)

/** The book with this try recorded (and the sample, when there was one), trimmed to the window and MAX_SPOTS. */
export function withSample(book: SkillBook, key: string, sample: SkillSample | null, now: number): SkillBook {
  const was = book[key] ?? { triedAt: 0, samples: [] }
  const next: SkillBook = { ...book, [key]: { triedAt: now, samples: sample === null ? was.samples : addSample(was.samples, sample, now) } }
  const keys = Object.keys(next).sort((a, b) => lastAt(next[b]) - lastAt(next[a]))
  const out: SkillBook = {}
  for (const k of keys.slice(0, MAX_SPOTS)) out[k] = next[k]
  return out
}

/** Whether an hour has passed since the last try at this spot. */
export const sampleDue = (book: SkillBook, key: string, now: number): boolean => now - (book[key]?.triedAt ?? 0) >= HOUR_MS
