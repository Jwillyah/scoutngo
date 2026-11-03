/*
 * THE WEEK AS SEVEN ROWS (Batch J, Section 8): Special light's week had a
 * lane per overlapping thing, two screens tall. One row a day now, and a
 * thing at the same hour as another sits beside it.
 */
/** Positions in per cent along a row, at least ROW_GAP_PCT apart (an icon's width), in the order given, kept inside the row. */
export const ROW_GAP_PCT = 13
export function packRow(at: readonly number[]): number[] {
  const order = at.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x)
  const out = new Array<number>(at.length)
  let last = -Infinity
  for (const o of order) {
    const x = Math.max(o.x, last + ROW_GAP_PCT)
    out[o.i] = x
    last = x
  }
  /* Pushed past the end: slide the run back in from the right. */
  let right = 100 - ROW_GAP_PCT / 3
  for (const o of [...order].reverse()) {
    if (out[o.i] > right) out[o.i] = right
    right = out[o.i] - ROW_GAP_PCT
  }
  return out
}
