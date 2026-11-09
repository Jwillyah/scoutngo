import type { TruthEntry } from './truthLog.ts'

/* Saved's words for a pack's days and a past shoot (src/components/SavedLists.tsx). */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "30 Oct 2026" from a YYYY-MM-DD or an ISO instant's date part: a day, never a time. */
export function dayWords(isoDay: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDay)
  if (m === null) return '—'
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? '?'} ${m[1]}`
}

/** One past shoot in words: the day, the light the app worked out, and how it went when you said. */
export function shootLine(e: TruthEntry): string {
  const mins = Math.round(e.said.minutesFromEvent)
  const when = mins === 0 ? `at ${e.said.event}` : `${Math.abs(mins)} min ${mins < 0 ? 'before' : 'after'} ${e.said.event}`
  const parts = [dayWords(e.at), when]
  if (e.said.fire !== null) parts.push(`${e.said.event} color said ${e.said.fire}`)
  if (e.outcome !== null) parts.push(`you said ${String(e.outcome)}`)
  return parts.join(' · ')
}
