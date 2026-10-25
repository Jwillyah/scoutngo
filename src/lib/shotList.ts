/*
 * A PASTED SHOT LIST, SPLIT INTO LINES.
 *
 * What is left of the old describe module once the model calls went. The shot list
 * was always split in code: a list someone sent is already a list, and asking
 * a model to restate it invites it to rewrite, merge or invent entries.
 */

/** Lines kept from a pasted list. */
export const SHOT_LIST_CAP = 12
/** Words kept per line. */
export const SHOT_LINE_WORD_CAP = 20

export interface DesiredShot {
  id: string
  text: string
}

const words = (text: string, cap: number): string => {
  const list = text.trim().split(/\s+/).filter((w) => w !== '')
  if (list.length <= cap) return list.join(' ')
  return `${list.slice(0, cap).join(' ')}…`
}

/**
 * Bullets, numbering and stray punctuation are stripped; everything else is
 * kept as the sender wrote it.
 */
export function parseShotList(text: string): DesiredShot[] {
  return text
    .split(/[\n\r]+/)
    // Leading bullet, dash or numbering, in whatever form the sender used.
    .map((line) => line.replace(/^\s*(?:[-*•·–—]+|\d+[.)])\s*/, '').trim())
    .filter((line) => line.length > 1)
    .slice(0, SHOT_LIST_CAP)
    .map((line, index) => ({ id: `want-${index + 1}`, text: words(line, SHOT_LINE_WORD_CAP) }))
}
