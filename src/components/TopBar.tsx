import type { ReactNode } from 'react'

/*
 * THE ONE BAR AT THE TOP, ON EVERY SCREEN.
 *
 * Laid out the way a map app is read: the menu on the left, the place in the
 * middle, the two things you do to the map on the right. It replaces the venue
 * bar, the search box that sat over the setup map, and the bottom tab row --
 * three strips of chrome that between them took a fifth of a phone screen.
 *
 * ONE ROW, AND SHORT. The map is the screen. Anything that is not one of these
 * four controls lives in a sheet that pulls up from the bottom, or in the menu.
 */
interface TopBarProps {
  onMenu: () => void
  menuOpen: boolean
  /** The search pill: the field itself, or the venue name that opens it. */
  pill: ReactNode
  /** Add a position. Null where there is nothing to add to yet. */
  onAdd: (() => void) | null
  /** Whether the next map tap places a position. */
  adding: boolean
  /** What the + says to a screen reader (Batch MAP2, Section 3: it opens Shoot setup now). */
  addLabel?: string
  /** Null where there is no map to move. */
  onLocate: (() => void) | null
  locating: boolean
  /** Why locating did not work, in one plain sentence. Null when it did or was not asked. */
  locateNote: string | null
  /** One quiet word when there is no connection. See src/lib/useOnline.ts. */
  online: boolean
  /** Batch Flow, Section 2: the map is a destination with its own back (to the home). */
  onBack?: () => void
  /** Batch Flow, Section 2: no + at all (it is "Plan a shoot", only when Shoot is picked). */
  addHidden?: boolean
}

/* Batch Beach, Section 6: the four on the 24-unit grid with one stroke (they were 20-unit, four stroke widths). */
export const TOP_ICON_STROKE = 2
const icon = (path: ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={TOP_ICON_STROKE} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
)

export function TopBar({
  onMenu,
  menuOpen,
  pill,
  onAdd,
  adding,
  addLabel,
  onLocate,
  locating,
  locateNote,
  online,
  onBack,
  addHidden = false,
}: TopBarProps) {
  return (
    <header className="topbar">
      {onBack === undefined ? null : (
        <button type="button" className="topbar__btn topbar__back" onClick={onBack} aria-label="Back to the home">
          {icon(<path d="M15 5.5 8.5 12l6.5 6.5" />)}
        </button>
      )}
      <button type="button" className="topbar__btn" onClick={onMenu} aria-label="Menu" aria-expanded={menuOpen}>
        {icon(<path d="M4 7h16M4 12h16M4 17h16" />)}
      </button>

      <div className="topbar__pill">
        {pill}
        {/*
          * A DOT, NOT A WORD. "OFFLINE" sat over the date on 27 Oct and read
          * "OTUE|27". One status at a time, never over the date: the dot sits
          * on the pill's edge, and says what it means to a screen reader and
          * to a long press.
          */}
        {online ? null : (
          <span className="topbar__offline" role="status" aria-label="No connection" title="No connection" />
        )}
      </div>

      {addHidden ? null : (
      <button
        type="button"
        className={`topbar__btn topbar__btn--add${adding ? ' topbar__btn--on' : ''}`}
        onClick={onAdd ?? undefined}
        disabled={onAdd === null}
        aria-pressed={adding}
        aria-label={addLabel ?? (adding ? 'Tap the map to place it' : 'Add a position')}
      >
        {icon(<path d="M12 5v14M5 12h14" />)}
      </button>
      )}
      {onLocate === null ? null : (
      <button
        type="button"
        className="topbar__btn"
        onClick={onLocate}
        disabled={locating}
        aria-label={locating ? 'Finding where you are' : 'Go to where I am'}
      >
        {icon(<path d="M19.8 4.2 4.2 10.8l6.7 2.3 2.3 6.7z" />)}
      </button>
      )}
      {locateNote === null ? null : (
        <p className="topbar__note" role="status">
          {locateNote}
        </p>
      )}
    </header>
  )
}
