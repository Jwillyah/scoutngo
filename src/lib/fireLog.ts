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
export const FIRE_LOG_KEY = 'scoutngo.fireLog.v1'

export type FireOutcome = 'fired' | 'meh' | 'nothing'
export const OUTCOME_LABEL: Record<FireOutcome, string> = { fired: 'It fired', meh: 'Meh', nothing: 'Nothing' }

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
    (x.outcome === 'fired' || x.outcome === 'meh' || x.outcome === 'nothing')
  )
}

export function parseFireLog(raw: string | null): FireEntry[] | null {
  if (raw === null) return null
  try {
    const list = JSON.parse(raw) as unknown
    return Array.isArray(list) ? list.filter(valid).map((e) => ({ ...e, forecast: e.forecast ?? null, photo: typeof e.photo === 'string' && e.photo.startsWith('data:image/') ? e.photo : null })) : []
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
    return true
  } catch {
    /* Full, usually with photos: the caller says it was not kept. */
    return false
  }
}

/** How often it fired when the forecast said so: "fired 3 of 4 times it said likely or possible". */
export function trackRecord(log: readonly FireEntry[]): { said: number; fired: number } {
  const said = log.filter((e) => e.forecast !== null && /likely|possible/.test(e.forecast))
  return { said: said.length, fired: said.filter((e) => e.outcome === 'fired').length }
}
