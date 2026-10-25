import type { ReactNode } from 'react'

/*
 * THE TOOL DOCK: five things you reach for while planning light, in one glass
 * pill over the map, above the sheet.
 *
 *   Sun / Moon   the moon's line on the time bar and its rays on the map
 *   Calendar     the Sky card, at the calendar
 *   Lens         what each position frames: the cones
 *   Layers       the map and its layers
 *   Reset        back to the venue, north up, flat, and the shoot window
 *
 * Plain words on each button for a screen reader and on a long press; the
 * glyph is the label at a glance.
 */
interface ToolDockProps {
  moon: boolean
  onMoon: () => void
  onCalendar: () => void
  lens: boolean
  onLens: () => void
  layersOpen: boolean
  onLayers: () => void
  onReset: () => void
}

const glyph = (body: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    {body}
  </svg>
)

export function ToolDock({ moon, onMoon, onCalendar, lens, onLens, layersOpen, onLayers, onReset }: ToolDockProps) {
  const button = (label: string, body: ReactNode, onClick: () => void, on?: boolean) => (
    <button type="button" className={`tooldock__btn${on === true ? ' tooldock__btn--on' : ''}`} aria-label={label} aria-pressed={on} onClick={onClick}>
      {glyph(body)}
    </button>
  )
  return (
    <nav className="tooldock" aria-label="Tools">
      {button(
        moon ? 'Sun and moon. Tap for sun only' : 'Sun only. Tap to add the moon',
        moon ? (
          <path d="M14.5 4.5a6.5 6.5 0 1 0 3 9.5 5 5 0 0 1-3-9.5z" />
        ) : (
          <>
            <circle cx="11" cy="11" r="4" />
            <path d="M11 2.5v2M11 17.5v2M2.5 11h2M17.5 11h2M5 5l1.4 1.4M15.6 15.6 17 17M5 17l1.4-1.4M15.6 6.4 17 5" />
          </>
        ),
        onMoon,
        moon,
      )}
      {button(
        'Calendar of the sky',
        <>
          <rect x="3.5" y="5" width="15" height="13" rx="2" />
          <path d="M3.5 9h15M7.5 3v4M14.5 3v4" />
        </>,
        onCalendar,
      )}
      {button(
        lens ? 'What each lens sees, shown. Tap to hide' : 'Show what each lens sees',
        <>
          <path d="M11 18 4 5h14z" />
          <circle cx="11" cy="18" r="1.4" />
        </>,
        onLens,
        lens,
      )}
      {button(
        'Map and layers',
        <>
          <path d="M11 3 19 7.5 11 12 3 7.5z" />
          <path d="M3.8 11 11 15l7.2-4M3.8 14.5 11 18.5l7.2-4" />
        </>,
        onLayers,
        layersOpen,
      )}
      {button(
        'Reset: the venue, north up, the shoot window',
        <>
          <path d="M5 10a6 6 0 1 1 1.8 4.3" />
          <path d="M4 5v5h5" />
        </>,
        onReset,
      )}
    </nav>
  )
}
