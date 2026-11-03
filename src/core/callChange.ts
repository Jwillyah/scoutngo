/*
 * CALLS THAT CHANGE, SAID (Batch J, Section 6). The 2 Nov sunset went from
 * Maybe at 4:28 PM to Go at 4:52 PM on KNTU's report. The phone keeps the
 * last call it showed for each event (src/lib/callHistory.ts, on the phone
 * only) and says the change in one line: "Upgraded to Go at 4:52 PM from
 * KNTU". A change the models alone made names no station.
 */
import type { Call } from './briefing.ts'

const RANK: Record<Call, number> = { Skip: 0, Maybe: 1, Go: 2 }

export interface SeenCall {
  call: Call
  /** When it was first shown, ms. */
  at: number
  by: string | null
}

export interface CallChange {
  from: Call
  to: Call
  at: number
  by: string | null
}

/** The next record for an event, and the change when the call moved. */
export function noteCall(prev: SeenCall | null, prevChange: CallChange | null, call: Call | null, by: string | null, now: number): { seen: SeenCall | null; change: CallChange | null } {
  if (call === null) return { seen: prev, change: prevChange }
  if (prev === null) return { seen: { call, at: now, by }, change: null }
  if (prev.call === call) return { seen: prev, change: prevChange }
  return { seen: { call, at: now, by }, change: { from: prev.call, to: call, at: now, by } }
}

/** "Upgraded to Go at 4:52 PM from KNTU", "Down to Skip at 4:40 PM". */
export function changeWords(c: CallChange, clock: (d: Date) => string): string {
  const up = RANK[c.to] > RANK[c.from]
  return `${up ? 'Upgraded' : 'Down'} to ${c.to} at ${clock(new Date(c.at))}${c.by === null ? '' : ` from ${c.by}`}`
}
