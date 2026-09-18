import { useState, type ReactNode } from 'react'

interface CollapsibleProps {
  index: string
  title: string
  summary: string
  /** Settings start shut once they have been configured; steps never do. */
  defaultOpen: boolean
  children: ReactNode
}

/**
 * A settings block that starts collapsed.
 *
 * NARROWLY SCOPED, ON PURPOSE. The accordion-inside-a-sheet pattern was removed
 * for good reason and this does not bring it back: it is used only for kit and
 * saved setups, which are settings rather than steps, only in SETUP, which has
 * no sheet over it, and only once they are configured. Everything that is part
 * of describing this shoot stays open and on the page.
 */
export function Collapsible({ index, title, summary, defaultOpen, children }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = `collapsible-${index}`

  return (
    <section className="section">
      <h2 className="section__heading">
        <button
          type="button"
          className="section__banner"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
        >
          <span className="section__index num">{index}</span>
          <span className="section__title">{title}</span>
          <span className="section__caret" aria-hidden="true">
            {open ? '▲' : '▼'}
          </span>
          {open ? null : <span className="section__summary">{summary}</span>}
        </button>
      </h2>
      <div className="section__body" id={bodyId} hidden={!open}>
        {children}
      </div>
    </section>
  )
}
