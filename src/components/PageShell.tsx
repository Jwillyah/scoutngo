import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { NetDebug } from './NetDebug.tsx'

/*
 * A PAGE OF ITS OWN (Batch Pages, Sections 2 and 3; boards WeatherPage and
 * SkyPage): the detail pages' look (the sky's ground, glass, light big
 * numbers) with a round back button, the page's name and "<place> · now"
 * instead of the Surf · Tide · Wind · Buoys tabs. "How we got this" opens
 * over it, as on the detail pages.
 */
interface PageShellProps {
  /** Its class: `wpage`, `spage`. */
  kind: string
  title: string
  sub: string
  /** The ground, as the home's (src/core/homeDay.ts groundOf). */
  ground: string
  onBack: () => void
  /** What "How we got this ›" opens; null: no such link. */
  how: ReactNode | null
  /** Any other links at the foot, before "How we got this ›". */
  foot?: ReactNode
  /** A view inside the page (Models, 7 days): Back closes it first. */
  inner?: { open: boolean; close: () => void }
  children: ReactNode
}

export function PageShell({ kind, title, sub, ground, onBack, how, foot, inner, children }: PageShellProps) {
  const [howOpen, setHowOpen] = useState(false)
  const [debug, setDebug] = useState(false)
  const back = () => {
    if (howOpen) setHowOpen(false)
    else if (inner?.open === true) inner.close()
    else onBack()
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return createPortal(
    <div className={`dpage ppage ${kind} home--${ground}`} role="dialog" aria-label={title}>
      <div className="ppage__top">
        <button type="button" className="dpage__back ppage__back" aria-label="Back" onClick={back}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <div className="ppage__titles">
          <p className="ppage__title">{title}</p>
          <p className="ppage__sub">{sub}</p>
        </div>
      </div>
      <div
        className="dpage__body ppage__body"
        onClick={(e) => {
          /* A triple tap on plain words: the network debug lines (Batch N E1), as on the detail pages. */
          if (e.detail >= 3 && !(e.target as Element).closest('button, a, input')) setDebug(true)
        }}
      >
        {children}
      </div>
      {debug ? <NetDebug onClose={() => setDebug(false)} /> : null}
      {foot === undefined && how === null ? null : (
        <div className="dpage__foot ppage__foot">
          {foot}
          {how === null ? null : (
            <button type="button" className="dpage__link" onClick={() => setHowOpen(true)}>
              How we got this ›
            </button>
          )}
        </div>
      )}
      {howOpen ? (
        <div className="dhow" role="dialog" aria-label={`${title}: how we got this`}>
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
