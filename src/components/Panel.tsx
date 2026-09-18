import type { ReactNode } from 'react'

interface PanelProps {
  /** Chart panel number, shown in the monospace variant. */
  index: string
  title: string
  children: ReactNode
}

/**
 * A titled block of content. Always open.
 *
 * REPLACES the Section accordion. The old shell had three ways to reveal things
 * at once, tabs and a draggable sheet and accordions inside it, so finding a
 * field meant guessing which of the three was hiding it. Content is now either
 * on the screen you are on or it is one deliberate control away, never folded
 * inside something that is itself folded.
 */
export function Panel({ index, title, children }: PanelProps) {
  return (
    <section className="section">
      <h2 className="section__heading">
        <div className="section__banner section__banner--static">
          <span className="section__index num">{index}</span>
          <span className="section__title">{title}</span>
        </div>
      </h2>
      <div className="section__body">{children}</div>
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
