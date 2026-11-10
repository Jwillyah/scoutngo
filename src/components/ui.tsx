import type { ReactNode } from 'react'

/*
 * ONE SCOUTNGO STYLE (Batch Map, Section 0; board docs/mockups/StyleGuide.png).
 * The shared controls:
 *
 *   Chip         a pill; on is white with dark ink
 *   Toggle       teal when on
 *   Segmented    a glass track, the chosen one white
 *
 * Archivo only, no monospace; big numbers light. The look is in
 * src/styles/one-style.css (the .ui-* classes); scripts/audit-style.mjs fails
 * a screen that steps outside it.
 */

export function Chip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={`ui-chip${on ? ' ui-chip--on' : ''}`} aria-pressed={on} onClick={onClick}>
      {children}
    </button>
  )
}

export function Toggle({ on, label, onChange, feature }: { on: boolean; label: string; onChange: (on: boolean) => void; feature?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} data-feature={feature} className={`ui-toggle${on ? ' ui-toggle--on' : ''}`} onClick={() => onChange(!on)}>
      <span className="ui-toggle__knob" />
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="ui-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} className={`ui-seg__opt${o.id === value ? ' ui-seg__opt--on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
