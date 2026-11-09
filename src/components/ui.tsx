import type { ReactNode } from 'react'

/*
 * ONE SCOUTNGO STYLE (Batch Map, Section 0; board docs/mockups/StyleGuide.png).
 * The pieces every screen is built from, and nothing else:
 *
 *   Card         glass: white at 15%, a 22% edge, 22 px corners
 *   RoundButton  a circle (icon) or a pill (words); active is white
 *   Chip         a pill; on is white with dark ink
 *   Toggle       teal when on
 *   Segmented    a glass track, the chosen one white
 *   Sheet        the sky gradient, never black
 *   StatPill     the map's WIND · TIDE · GOLDEN · CLOUD, in plain words
 *
 * Archivo only, no monospace; big numbers light. The look is in
 * src/styles/one-style.css (the .ui-* classes); scripts/audit-style.mjs fails
 * a screen that steps outside it.
 */

export function Card({ label, children, className = '', onClick }: { label?: string; children: ReactNode; className?: string; onClick?: () => void }) {
  const inner = (
    <>
      {label === undefined ? null : <p className="ui-card__label">{label}</p>}
      {children}
    </>
  )
  return onClick === undefined ? (
    <div className={`ui-card ${className}`}>{inner}</div>
  ) : (
    <button type="button" className={`ui-card ui-card--tap ${className}`} onClick={onClick}>
      {inner}
    </button>
  )
}

export function RoundButton({ label, icon, children, active = false, primary = false, onClick, className = '', disabled = false }: { label: string; icon?: ReactNode; children?: ReactNode; active?: boolean; primary?: boolean; onClick?: () => void; className?: string; disabled?: boolean }) {
  const kind = children === undefined ? 'ui-round--icon' : 'ui-round--words'
  return (
    <button type="button" className={`ui-round ${kind}${active || primary ? ' ui-round--on' : ''} ${className}`} aria-label={label} aria-pressed={active || undefined} onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  )
}

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

export function Sheet({ title, onClose, children, className = '' }: { title: string; onClose?: () => void; children: ReactNode; className?: string }) {
  return (
    <div className={`ui-sheet ${className}`} role="dialog" aria-label={title}>
      <div className="ui-sheet__head">
        <h2 className="ui-sheet__title">{title}</h2>
        {onClose === undefined ? null : (
          <button type="button" className="ui-round ui-round--icon ui-sheet__x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export function StatPill({ label, value, onClick, active = false }: { label: string; value: string; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" className={`ui-stat${active ? ' ui-stat--on' : ''}`} onClick={onClick} aria-label={`${label}: ${value}`}>
      <span className="ui-stat__label">{label}</span>
      <span className="ui-stat__value">{value}</span>
    </button>
  )
}
