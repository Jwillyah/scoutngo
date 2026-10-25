/*
 * EVERY NUMBER IN A MODEL'S ANSWER MUST HAVE COME FROM OUR CODE.
 *
 * WHY. The model proposes, code computes. A call sheet that says "sunset
 * 7:12 PM" when the sun code said 6:55 PM is worse than no call sheet: it is
 * a confident, specific, wrong instruction a pilot will follow. So every
 * number the model writes is checked against the tool results it was given,
 * and any number that is not among them is rejected; repair() then puts the
 * code's own value in its place, or marks it plainly when there is no code
 * value to put.
 *
 * WHAT COUNTS AS THE SAME NUMBER. Formats differ and the arithmetic does not:
 *
 *   18:55 and 6:55 PM ............ one time of day (minutes since midnight)
 *   200 ft and 200 ............... one number; units are context, not value
 *   2.8 and 2.80 ................. one number
 *   1 h 16 m and 76 .............. one duration, in minutes
 *
 * The same tokenizer reads the tool results and the answer, so a format the
 * code produced is always a format the check understands.
 *
 * WHAT IS NOT CHECKED: list numbering at the start of a line ("1.", "2)"),
 * which is layout, not a claim.
 */

export type NumberKind = 'time' | 'duration' | 'number'

export interface NumberToken {
  kind: NumberKind
  /** Minutes since midnight for a time, minutes for a duration, the value otherwise. */
  value: number
  /** Exactly as written. */
  text: string
  /** Where in the source string it starts. */
  index: number
}

/* "PM" or "p.m.", but never the full stop that ends a sentence after "PM". */
const TIME = /\b(\d{1,2}):(\d{2})(?:\s*(?:([AaPp])[Mm]\b|([AaPp])\.[Mm]\.))?/g
const DURATION = /\b(\d+)\s*h(?:ours?|rs?)?\s+(\d+)\s*m(?:in(?:utes?)?)?\b/g
const NUMBER = /(?<![\d.])\d+(?:\.\d+)?(?![\d])/g
const LIST_MARKER = /^[ \t]*\d+[.)][ \t]/gm

function minutesOfDay(h: number, m: number, meridiem: string | undefined): number | null {
  if (m > 59) return null
  if (meridiem === undefined) return h <= 23 ? h * 60 + m : null
  if (h < 1 || h > 12) return null
  const pm = meridiem.toLowerCase() === 'p'
  const hour = (h % 12) + (pm ? 12 : 0)
  return hour * 60 + m
}

/** Every number in a string, times and durations first so their digits are not read twice. */
export function tokenize(text: string): NumberToken[] {
  const taken: [number, number][] = []
  const free = (start: number, end: number) => !taken.some(([a, b]) => start < b && end > a)
  const out: NumberToken[] = []

  for (const m of text.matchAll(LIST_MARKER)) taken.push([m.index, m.index + m[0].length])

  for (const m of text.matchAll(TIME)) {
    const value = minutesOfDay(Number(m[1]), Number(m[2]), m[3] ?? m[4])
    if (value === null || !free(m.index, m.index + m[0].length)) continue
    taken.push([m.index, m.index + m[0].length])
    out.push({ kind: 'time', value, text: m[0], index: m.index })
  }
  for (const m of text.matchAll(DURATION)) {
    if (!free(m.index, m.index + m[0].length)) continue
    taken.push([m.index, m.index + m[0].length])
    out.push({ kind: 'duration', value: Number(m[1]) * 60 + Number(m[2]), text: m[0], index: m.index })
  }
  for (const m of text.matchAll(NUMBER)) {
    if (!free(m.index, m.index + m[0].length)) continue
    out.push({ kind: 'number', value: Number(m[0]), text: m[0], index: m.index })
  }
  return out.sort((a, b) => a.index - b.index)
}

/** Every number anywhere in the tool results: numeric values, and numbers inside strings. */
export function knownNumbers(results: unknown): NumberToken[] {
  const out: NumberToken[] = []
  const walk = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out.push({ kind: 'number', value, text: String(value), index: -1 })
    } else if (typeof value === 'string') {
      out.push(...tokenize(value))
    } else if (Array.isArray(value)) {
      value.forEach(walk)
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(walk)
    }
  }
  walk(results)
  return out
}

/** Equal to the precision written: 2.8 matches 2.80 and 2.8000. */
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9

function isKnown(token: NumberToken, known: readonly NumberToken[]): boolean {
  return known.some((k) => {
    if (token.kind === 'time') return k.kind === 'time' && same(k.value, token.value)
    /* A duration can be stated in minutes by the code: "76" covers "1 h 16 m". */
    if (token.kind === 'duration') return (k.kind === 'duration' || k.kind === 'number') && same(k.value, token.value)
    return (k.kind === 'number' || k.kind === 'duration') && same(k.value, token.value)
  })
}

export interface CheckResult {
  ok: boolean
  /** Numbers in the answer that no tool result contains. */
  unknown: { text: string; index: number; kind: NumberKind }[]
  /** How many numbers were checked, so "ok over zero" is visible as such. */
  checked: number
}

export function checkNumbers(answer: string, toolResults: unknown): CheckResult {
  const known = knownNumbers(toolResults)
  const tokens = tokenize(answer)
  const unknown = tokens
    .filter((t) => !isKnown(t, known))
    .map(({ text, index, kind }) => ({ text, index, kind }))
  return { ok: unknown.length === 0, unknown, checked: tokens.length }
}

export interface RepairResult {
  text: string
  /** Invented numbers replaced with the code's value, and the label that matched. */
  replaced: { was: string; now: string; label: string }[]
  /** Invented numbers with no code value to replace them, marked in the text. */
  marked: string[]
}

/** How far before a number to look for the word it is about. */
export const LABEL_WINDOW_CHARS = 40

/**
 * Puts the code's value where the model invented one.
 *
 * `codeValues` maps a label to the value the code computed, already formatted
 * for reading: { sunset: '6:55 PM' }. A number is matched to a label when the
 * label appears in the LABEL_WINDOW_CHARS before it ("Sunset is at 7:12 PM").
 * With no label in reach it is marked rather than guessed at.
 */
export function repair(
  answer: string,
  unknown: CheckResult['unknown'],
  codeValues: Record<string, string>,
): RepairResult {
  const replaced: RepairResult['replaced'] = []
  const marked: string[] = []
  let text = answer
  /* Right to left, so earlier indices stay valid as the text changes length. */
  for (const item of [...unknown].sort((a, b) => b.index - a.index)) {
    const before = answer.slice(Math.max(0, item.index - LABEL_WINDOW_CHARS), item.index).toLowerCase()
    const label = Object.keys(codeValues)
      .filter((key) => new RegExp(`\\b${key.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(before))
      .sort((a, b) => before.lastIndexOf(b.toLowerCase()) - before.lastIndexOf(a.toLowerCase()))[0]
    const end = item.index + item.text.length
    if (label !== undefined) {
      text = text.slice(0, item.index) + codeValues[label] + text.slice(end)
      replaced.unshift({ was: item.text, now: codeValues[label], label })
    } else {
      text = `${text.slice(0, item.index)}[${item.text}, not from the app]${text.slice(end)}`
      marked.unshift(item.text)
    }
  }
  return { text, replaced, marked }
}
