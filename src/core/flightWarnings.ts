/*
 * THE PRACTICE FLIGHT HAS NO HEIGHT CAP: IT WARNS (Batch I, Section 5; board
 * "BATCH I · drone").
 *
 * It used to hold the drone at the lower of the grid ceiling and yours. A
 * practice flight is for seeing; the rules are said, not enforced in a
 * simulator. Each frame, from where the drone is (code, not the model):
 *
 *   above 400   higher than PART_107_FT above takeoff (the ground at takeoff
 *               stands in for the ground under it): "Above 400 ft · Part 107
 *               limit is 400 ft above ground. Practice only."
 *   airspace    inside a Class B, C or D surface area (the baked FAA extract,
 *               src/data/airspace.ts) or a facility-map cell with a class
 *               (src/data/uasfm.ts): "Inside Class D · <airport> · grid
 *               ceiling here X ft · needs LAANC"
 *
 * One at a time, the most pressing first (airspace over height: it is a
 * rule wherever you are in it, at any height), amber, never red. Never
 * "safe" or "clear": with no warning the line is "Check airspace before you
 * fly", because an extract is dated and says nothing about temporary
 * restrictions.
 */
export const PART_107_FT = 400
export const CHECK_AIRSPACE = 'Check airspace before you fly'

export interface WarningInputs {
  /** Height above takeoff, feet. */
  altFt: number
  /** The facility-map cell under the drone, or null outside the grid. */
  cell: { ceilingFeet: number; classes: readonly string[]; icao: string | null; facility: string | null } | null
  /** Surface-area shapes the drone is inside. */
  shapes: readonly { cls: string; name: string }[]
}

export interface FlightWarning {
  kind: 'airspace' | 'height'
  line: string
}

const CONTROLLED = /^[BCD]$/

export function flightWarnings(w: WarningInputs): FlightWarning[] {
  const out: FlightWarning[] = []
  const shape = w.shapes.find((s) => CONTROLLED.test(s.cls)) ?? null
  const cellCls = w.cell?.classes.find((c) => CONTROLLED.test(c)) ?? null
  const cls = shape?.cls ?? cellCls
  if (cls !== null) {
    const where = w.cell?.facility ?? shape?.name ?? w.cell?.icao ?? 'the airport'
    const grid = w.cell === null ? 'no grid ceiling in the extract here' : `grid ceiling here ${w.cell.ceilingFeet} ft`
    out.push({ kind: 'airspace', line: `Inside Class ${cls} · ${where} · ${grid} · needs LAANC` })
  }
  if (w.altFt > PART_107_FT) out.push({ kind: 'height', line: `Above ${PART_107_FT} ft · Part 107 limit is ${PART_107_FT} ft above ground. Practice only.` })
  return out
}

/** The one line shown: the first warning, else the reminder. */
export function warningLine(w: WarningInputs): { line: string; warn: boolean } {
  const all = flightWarnings(w)
  return all.length === 0 ? { line: CHECK_AIRSPACE, warn: false } : { line: all[0].line, warn: true }
}

/** The ladder's marks: 400 ft, and the grid ceiling when there is one and it differs. */
export function ladderMarks(cell: WarningInputs['cell']): { ft: number; label: string }[] {
  const marks = [{ ft: PART_107_FT, label: '400 ft' }]
  if (cell !== null && cell.ceilingFeet !== PART_107_FT) marks.push({ ft: cell.ceilingFeet, label: `grid ${cell.ceilingFeet}` })
  return marks.sort((a, b) => a.ft - b.ft)
}
