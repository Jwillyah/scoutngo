import type { ReactNode } from 'react'

/*
 * THE CARD: ONE SUBJECT, A HEADLINE NUMBER, THE DETAIL THAT DECIDES
 * SOMETHING, AND WHERE IT CAME FROM.
 *
 * That order is the argument. The number is what you opened the card for; the
 * detail is the part that changes what you do; the source is the receipt. A
 * card that leads with its method is a card nobody reads to the number.
 *
 * THE HEADLINE CARRIES ITS UNIT, always, beside it rather than inside it, so
 * the number stays a number at 50px and the unit stays readable at 16.
 *
 * NO SCROLL OF ITS OWN. The sheet scrolls. A card that scrolls inside a sheet
 * that scrolls is the nested-scroller problem the reachability audit exists
 * to catch, and it is also how a card quietly becomes a page.
 */

interface CardProps {
  title: string
  /** When the reading is for. Null where the card is not about a moment. */
  at?: string | null
  /** The circled i: the method, the caveats, the long version. */
  onAbout?: () => void
  onClose: () => void
  children: ReactNode
}

export function Card({ title, at = null, onAbout, onClose, children }: CardProps) {
  return (
    <section className="card2" aria-label={title}>
      <header className="card2__head">
        <h2 className="card2__title">{title}</h2>
        <div className="card2__tools">
          {at === null ? null : <span className="card2__at num">{at}</span>}
          {onAbout === undefined ? null : (
            <button
              type="button"
              className="card2__i"
              onClick={onAbout}
              aria-label={`About ${title.toLowerCase()}`}
            >
              i
            </button>
          )}
          <button type="button" className="card2__x" onClick={onClose} aria-label="Back to the shoot">
            ×
          </button>
        </div>
      </header>
      {children}
    </section>
  )
}

/** The headline: a big number and its unit. The thing the card is for. */
export function CardHeadline({
  value,
  unit,
  note,
  tone,
}: {
  value: string
  unit: string
  note?: string | null
  /** 'warn' where the number is the reason not to go. Data colour, not chrome. */
  tone?: 'plain' | 'warn'
}) {
  return (
    <>
      <p className="card2__headline">
        <span className="card2__big num">{value}</span>
        <span className="card2__unit">{unit}</span>
      </p>
      {note === null || note === undefined ? null : (
        <p className={`card2__note${tone === 'warn' ? ' card2__note--warn' : ''}`}>{note}</p>
      )}
    </>
  )
}

/**
 * THE JUDGEMENT, STATED ONCE.
 *
 * A rule, a reading, and whose decision it is. The last sentence is not
 * decoration: the app states the limit and the measurement and stops, because
 * it is not the thing that gets to say whether somebody flies.
 */
export function CardJudgement({
  rule,
  detail,
  tone = 'warn',
}: {
  rule: string
  detail: string
  tone?: 'warn' | 'plain'
}) {
  return (
    <div className={`judge judge--${tone}`}>
      <div className="judge__bar" aria-hidden="true" />
      <div className="judge__body">
        <p className="judge__rule">{rule}</p>
        <p className="judge__detail">{detail}</p>
      </div>
    </div>
  )
}

/** Where the number came from. Always last, always quiet. */
export function CardSource({ children }: { children: ReactNode }) {
  return <p className="card2__source">{children}</p>
}

/**
 * THE DOOR TO THE NEXT SUBJECT.
 *
 * ONE SUBJECT PER SURFACE IS THE RULE, which leaves a question: where do the
 * cards go that no chip opens? Four of them -- the sun's path through the day,
 * the sky cameras, what is mapped here, the airspace -- are each one subject
 * and none of them earns a chip, because a chip has to be a number that could
 * make you not go.
 *
 * SO THE CARD THAT OWNS THE PARENT SUBJECT CARRIES THE DOOR. The light card
 * opens the day; the cloud card opens the cameras that show the actual sky;
 * the layers card opens what the hazard and airspace layers are drawing. A
 * row, named for where it goes, above the source line.
 *
 * NOT A TAB BAR AND NOT A BREADCRUMB. One tap in, one tap back to the shoot:
 * stacking cards is how a sheet becomes a navigation hierarchy, and a
 * navigation hierarchy is the thing this shell was built to remove.
 */
export function CardMore({ links }: { links: readonly { label: string; onOpen: () => void }[] }) {
  if (links.length === 0) return null
  return (
    <div className="more2">
      {links.map((link) => (
        <button type="button" key={link.label} className="more2__row" onClick={link.onOpen}>
          <span className="more2__label">{link.label}</span>
          <svg className="more2__chev" width="7" height="12" viewBox="0 0 7 12" aria-hidden="true">
            <path d="M1 1 6 6 1 11" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      ))}
    </div>
  )
}
