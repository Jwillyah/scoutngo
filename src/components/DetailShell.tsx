import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DETAIL_TABS, type DetailId } from '../lib/detailTabs.ts'

/*
 * THE DETAIL PAGES' SHELL (Batch N, Sections 1-4; boards "DETAIL v2 ·").
 * Surf, Tide, Wind and Buoys in the new home's look: the sky's ground, glass
 * cards, light big numbers, one graphic each, no monospace, no paragraphs.
 *
 *   top      a back button and Surf · Tide · Wind · Buoys
 *   body     the page; fits 390 x 844 and 412 x 915 with nothing scrolled
 *   bottom   "How we got this ›" (the detail, one tap deeper, in a sheet)
 *            and "See on map ›" (the map is under the page)
 *
 * The old pages' Simple / Advanced toggle is gone: what Advanced held is
 * under "How we got this".
 */

interface DetailShellProps {
  id: DetailId
  /** The ground, as the home's (src/core/homeDay.ts groundOf): 'day', 'cloud', 'rain', 'golden', 'night', 'storm', 'fog'. */
  ground: string
  onBack: () => void
  onSwitch: (id: DetailId) => void
  onMap: () => void
  /** What "How we got this ›" opens: models, sources, the arithmetic, in short lines. */
  how: ReactNode
  children: ReactNode
}

export function DetailShell({ id, ground, onBack, onSwitch, onMap, how, children }: DetailShellProps) {
  const [howOpen, setHowOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (howOpen) setHowOpen(false)
      else onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [howOpen, onBack])
  const label = DETAIL_TABS.find((t) => t.id === id)?.label ?? ''
  return createPortal(
    <div className={`dpage dpage--${id} home--${ground}`} role="dialog" aria-label={label}>
      <div className="dpage__top">
        <button type="button" className="dpage__back" aria-label="Back" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="dpage__seg" role="tablist" aria-label="Detail pages">
          {DETAIL_TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={t.id === id} className={`dpage__tab${t.id === id ? ' dpage__tab--on' : ''}`} onClick={() => onSwitch(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="dpage__body">{children}</div>
      <div className="dpage__foot">
        <button type="button" className="dpage__link" onClick={() => setHowOpen(true)}>
          How we got this ›
        </button>
        <button type="button" className="dpage__link" onClick={onMap}>
          See on map ›
        </button>
      </div>
      {howOpen ? (
        <div className="dhow" role="dialog" aria-label={`${label}: how we got this`}>
          <div className="dhow__panel">
            <div className="dhow__head">
              <p className="dhow__title">How we got this</p>
              <button type="button" className="dhow__x" aria-label="Close" onClick={() => setHowOpen(false)}>
                ×
              </button>
            </div>
            <div className="dhow__body">{how}</div>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  )
}

/** A glass card with an uppercase label: the pages' one building block. */
export function DCard({ label, children, className = '' }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`dcard ${className}`}>
      {label === undefined ? null : <p className="dcard__label">{label}</p>}
      {children}
    </section>
  )
}
