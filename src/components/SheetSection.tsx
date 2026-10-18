import { useState, type ReactNode } from 'react'

/**
 * ONE SECTION OF THE SHEET AT FULL.
 *
 * WHAT THIS IS INSTEAD OF. Five things that each floated over the map with
 * their own absolute positioning, their own bottom offset computed against the
 * live sheet height, and their own rule about which other surface it was
 * allowed to coexist with. The arithmetic produced three separate bugs and the
 * coexistence rules produced a hand-written list of elements a panel must not
 * cover, assembled from whichever ones had already gone wrong.
 *
 * COLLAPSIBLE, BUT OPEN BY DEFAULT. Five sections is a long scroll and
 * somebody who only ever reads Conditions should be able to shut the rest.
 * Open by default because a sheet that opens on five closed headers has
 * replaced a surface problem with a discovery problem: FULL should show
 * content, not a menu of content.
 *
 * NOT A NEW DISCLOSURE MECHANISM. The app had three ways to reveal things at
 * once and that was the thing the sheet rewrite removed. This is the sheet's
 * own detents doing the revealing; a section header only chooses whether its
 * body is in the scroll.
 */
export function SheetSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className={`sect${open ? '' : ' sect--shut'}`} data-section={title}>
      <h2 className="sect__head">
        <button
          type="button"
          className="sect__toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="sect__title">{title}</span>
          <span className="sect__chev" aria-hidden="true">
            {open ? '−' : '+'}
          </span>
        </button>
      </h2>
      {open ? <div className="sect__body">{children}</div> : null}
    </section>
  )
}
