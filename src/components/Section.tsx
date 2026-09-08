import type { ReactNode } from 'react'

interface SectionProps {
  /** Chart panel number, shown in the monospace variant. */
  index: string
  title: string
  /** Shown in the banner when collapsed, so the header carries the state. */
  summary?: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export function Section({ index, title, summary, open, onToggle, children }: SectionProps) {
  const bodyId = `section-${index}-body`

  return (
    <section className="section">
      <h2 className="section__heading">
        <button
          type="button"
          className="section__banner"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="section__index num">{index}</span>
          <span className="section__title">{title}</span>
          <span className="section__caret" aria-hidden="true">
            {open ? '▲' : '▼'}
          </span>
          {!open && summary !== undefined ? (
            <span className="section__summary">{summary}</span>
          ) : null}
        </button>
      </h2>
      <div className="section__body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  )
}

interface GroupProps {
  title: string
  /** Optional right hand annotation, for counts and the like. */
  meta?: ReactNode
  children: ReactNode
}

export function Group({ title, meta, children }: GroupProps) {
  return (
    <div className="group">
      <div className="group__head">
        <h3 className="group__title">{title}</h3>
        {meta === undefined ? null : <span className="group__count">{meta}</span>}
      </div>
      {children}
    </div>
  )
}
