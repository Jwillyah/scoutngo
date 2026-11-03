import { noteCall, type CallChange, type SeenCall } from '../core/callChange.ts'
import type { Call } from '../core/briefing.ts'

/*
 * THE CALLS THIS PHONE HAS SHOWN (Batch J, Section 6): per event, the last
 * call and its last change, in localStorage on this phone only. Kept for
 * KEEP_MS after the event, then dropped.
 */
const KEY = 'scoutngo.calls.v1'
const KEEP_MS = 36 * 3_600_000

type Book = Record<string, { seen: SeenCall | null; change: CallChange | null; event: number }>

function read(): Book {
  try {
    const raw = localStorage.getItem(KEY)
    const b = raw === null ? {} : (JSON.parse(raw) as Book)
    return typeof b === 'object' && b !== null ? b : {}
  } catch {
    return {}
  }
}

/** Note what is shown now for an event; the change, if the call moved since it was last shown. */
export function remember(eventKey: string, event: Date, call: Call | null, by: string | null, now: Date): CallChange | null {
  const book = read()
  const had = book[eventKey]
  const next = noteCall(had?.seen ?? null, had?.change ?? null, call, by, now.getTime())
  book[eventKey] = { ...next, event: event.getTime() }
  for (const [k, v] of Object.entries(book)) if (now.getTime() - v.event > KEEP_MS) delete book[k]
  try {
    localStorage.setItem(KEY, JSON.stringify(book))
  } catch {
    /* storage full or off: the change is still said this time */
  }
  return next.change
}
