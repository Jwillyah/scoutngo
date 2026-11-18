import type { PreflightRow } from '../core/dronePreflight.ts'

/*
 * THE DRONE PAGE'S PREFLIGHT TAB (Batch SIMPLE-1, Section 1). Renders only: a
 * checklist, one row per fact, each green or amber with one line. The colours
 * and the words are src/core/dronePreflight.ts's. The buttons are the page
 * foot's ("Get LAANC ›", "Plan a shoot ›"), not this tab's.
 *
 * Green and amber are the roles in src/styles/tokens.css (--good, --caution);
 * the word "green" or "amber" is also on the row for a screen reader, so the
 * colour is never the only signal.
 */
export function DronePreflightView({ rows }: { rows: readonly PreflightRow[] }) {
  return (
    <ul className="drp__pf" aria-label="Preflight checklist">
      {rows.map((r) => (
        <li key={r.key} className={`drp__pfrow drp__pfrow--${r.tone}`} data-pf={r.key} data-tone={r.tone}>
          <span className="drp__pfdot" aria-hidden="true" />
          <span className="drp__pfwords">
            <b className="drp__pflabel">{r.label}</b>
            <span className="drp__pfline">
              <span className="visually-hidden">{r.tone === 'green' ? 'Green: ' : 'Amber: '}</span>
              {r.line}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
