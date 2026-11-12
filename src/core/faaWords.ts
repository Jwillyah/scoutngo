/*
 * THE FAA'S RAW VALUES, IN WORDS (Batch TRUTH, Section 6). The extract
 * carries the FAA's own codes: an upper limit of -9998 is the FAA's "up to
 * the overlying airspace" (807 airspace shapes and 77 restricted areas in
 * the baked files; no other negative code occurs), which the sheet printed
 * as "to -9998". Names come in capitals ("OCEANA NAS CLASS D").
 */

/** The FAA's codes for an upper limit, said in words. */
export const FAA_SENTINELS: Record<number, string> = {
  [-9998]: 'up to the airspace above',
}

/** An upper limit in words: "to 2,500 ft", "to flight level 180", "up to the airspace above"; null when not given. */
export function upperWords(value: number | null, uom: string): string | null {
  if (value === null || !Number.isFinite(value)) return null
  const code = FAA_SENTINELS[value]
  if (code !== undefined) return code
  /* Any other negative number is a code this app does not know: said as not given, never printed. */
  if (value < 0) return null
  if (uom === 'FL') return `to flight level ${value}`
  return `to ${value.toLocaleString('en-US')} ft`
}

/* Kept in capitals: the abbreviations a pilot reads as letters. */
const ACRONYMS = new Set(['NAS', 'AFB', 'MCAS', 'NAF', 'NAAS', 'NAVAL', 'USCG', 'ARTCC', 'FAA', 'TFR', 'MOA', 'VOR', 'NWR', 'NPS', 'AAF', 'ANGB', 'ARB', 'JRB', 'JB', 'RGNL', 'US', 'USA', 'NE', 'NW', 'SE', 'SW', 'II', 'III', 'IV'])

/** "OCEANA NAS CLASS D" → "Oceana NAS Class D"; ids with digits ("R-2202D") and the class letter stay as they are. */
export function titleName(name: string): string {
  return name
    .split(/(\s+|-|\/)/)
    .map((w, i, all) => {
      if (/^\s+$|^[-/]$/.test(w) || w === '') return w
      if (/\d/.test(w)) return w
      const up = w.toUpperCase()
      if (up === 'NAVAL') return 'Naval'
      if (ACRONYMS.has(up)) return up
      /* The class letter after "CLASS". */
      const prev = all.slice(0, i).reverse().find((x) => !/^\s+$/.test(x) && x !== '')
      if (w.length === 1 && prev?.toUpperCase() === 'CLASS') return up
      if (/^[A-Z]{1,2}$/.test(w) && w.length === 1) return up
      return up.charAt(0) + up.slice(1).toLowerCase()
    })
    .join('')
}
