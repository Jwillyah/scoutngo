import type { PreflightKey, PreflightRow } from '../core/dronePreflight.ts'
import type { TapInRow } from '../components/TapInPage.tsx'

/*
 * THE DRONE PREFLIGHT, AS THE TAP-IN PAGE'S ROWS (Batch SIMPLE-2, Section 4;
 * board Drone_Preflight). Rows, colours and words are src/core/dronePreflight.ts's;
 * this only (1) counts the amber ones for the headline, (2) splits a row's
 * one line into the bold fact and its small detail, (3) says which rows open
 * a tab (Airspace → the Airspace tab, Wind → the Wind tab).
 *
 * Green means "read, and under its line". It never means go, and no word here
 * says "safe", "clear" or "legal".
 */
export type PreflightTarget = 'airspace' | 'wind'

/** The rows that open a tab when tapped. */
export const PREFLIGHT_OPENS: Partial<Record<PreflightKey, PreflightTarget>> = { airspace: 'airspace', wind: 'wind' }

/** The labels the board shows (the core's "Wind at 400 ft" is longer than the row holds). */
const LABEL: Record<PreflightKey, string> = { airspace: 'Airspace', wind: 'Wind 400 ft', gusts: 'Gusts', battery: 'Battery', sunset: 'Sunset', tfr: 'TFRs', remoteid: 'Remote ID', kp: 'Kp' }

export const preflightToCheck = (rows: readonly PreflightRow[]): number => rows.filter((r) => r.tone === 'amber').length

/** "3 to check"; "0 to check" is still not an approval, and the sub line says so. */
export function preflightHeadline(rows: readonly PreflightRow[]): { eyebrow: string; value: string; sub: string } {
  const amber = rows.filter((r) => r.tone === 'amber')
  return {
    eyebrow: 'Preflight · right now',
    value: `${amber.length} to check`,
    sub: rows.length === 0 ? '—' : amber.length === 0 ? 'Every row was read and sits under its line · not an approval' : `${amber.map((r) => LABEL[r.key]).join(' · ')} ${amber.length === 1 ? 'needs' : 'need'} a look`,
  }
}

/** The bold fact is the line's first part, the small detail the rest ("Class C · ceiling 100 ft · LAANC needed"). */
export function splitLine(line: string): { value: string; detail?: string } {
  /* "8 kt against your 23 kt limit" reads as "8 kt" and "limit 23 kt", as the board has it. */
  const lim = /^(.+?) against your (.+?) limit$/.exec(line)
  if (lim !== null) return { value: lim[1], detail: `limit ${lim[2]}` }
  const i = line.indexOf(' · ')
  return i < 0 ? { value: line } : { value: line.slice(0, i), detail: line.slice(i + 3) }
}

export function preflightTapRows(rows: readonly PreflightRow[], open: (t: PreflightTarget) => void): TapInRow[] {
  return rows.map((r) => {
    const target = PREFLIGHT_OPENS[r.key]
    const { value, detail } = splitLine(r.line)
    return { label: LABEL[r.key], value, ...(detail === undefined ? {} : { detail }), dot: r.tone === 'green' ? 'good' : 'caution', ...(target === undefined ? {} : { onClick: () => open(target) }) }
  })
}
