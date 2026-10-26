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
  /** Null where there is no map to move. */
  onLocate: (() => void) | null
  locating: boolean
  /** Why locating did not work, in one plain sentence. Null when it did or was not asked. */
  locateNote: string | null
  /** One quiet word when there is no connection. See src/lib/useOnline.ts. */
  online: boolean
}

const icon = (path: ReactNode) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    {path}
  </svg>
)

export function TopBar({
  onMenu,
  menuOpen,
  pill,
  onAdd,
  adding,
  onLocate,
  locating,
  locateNote,
  online,
}: TopBarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar__btn"
        onClick={onMenu}
        aria-label="Menu"
        aria-expanded={menuOpen}
      >
        {icon(<path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />)}
      </button>

      <div className="topbar__pill">
        {pill}
        {online ? null : (
          <span className="topbar__offline" role="status" aria-label="No connection">
            offline
          </span>
        )}
      </div>

      <button
        type="button"
        className={`topbar__btn topbar__btn--add${adding ? ' topbar__btn--on' : ''}`}
        onClick={onAdd ?? undefined}
        disabled={onAdd === null}
        aria-pressed={adding}
        aria-label={adding ? 'Tap the map to place it' : 'Add a position'}
      >
        {icon(<path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />)}
      </button>
      {onLocate === null ? null : (
      <button
        type="button"
        className="topbar__btn"
        onClick={onLocate}
        disabled={locating}
        aria-label={locating ? 'Finding where you are' : 'Go to where I am'}
      >
        {icon(
          <path
            d="M16.5 3.5 3.5 9l5.6 1.9L11 16.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />,
        )}
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
