import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/*
 * A PAGE OF ITS OWN (29 Oct: Exposure, Tides, Surf): over everything, no map,
 * no time bar, no dock. A title, its tabs when it has them, Close, which goes
 * back to wherever it was opened from (nothing underneath moved), and the
 * page. Fits 390 x 844 with no scroll: the overflow audit opens each.
 */
interface PageProps {
  title: string
  /** e.g. Simple / Advanced. */
  tabs?: { id: string; label: string }[]
  tab?: string
  onTab?: (id: string) => void
  onClose: () => void
  className?: string
  children: ReactNode
}

export function Page({ title, tabs, tab, onTab, onClose, className = '', children }: PageProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className={`page ${className}`} role="dialog" aria-label={title}>
      <div className="page__head">
        <p className="page__title">{title}</p>
        {tabs === undefined ? null : (
          <div className="seg page__tabs" role="tablist" aria-label={`${title} views`}>
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" className={`seg__btn${t.id === tab ? ' seg__btn--on' : ''}`} aria-selected={t.id === tab} onClick={() => onTab?.(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="page__close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="page__body">{children}</div>
    </div>,
    document.body,
  )
}
