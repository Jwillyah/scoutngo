import { Icon, type GlyphId } from './Icon.tsx'

/*
 * THE TOOL DOCK: five things you reach for while planning light, in one glass
 * pill over the map, above the sheet.
 *
 *   Sun / Moon   the moon's line on the time bar and its rays on the map
 *   Calendar     the Sky card, at the calendar
 *   Lens         what each position frames: the cones
 *   Layers       the map and its layers
 *   Back to now  the venue, north up, flat, and the current time; today
 *                becomes the shoot day if it was another (src/lib/backToNow.ts)
 *
 * Plain words on each button for a screen reader and on a long press; the
 * tile is the label at a glance. Blue hour colours, src/lib/iconPalette.ts.
 * A pressed toggle gets a white ring: the tile keeps its colour either way.
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

export function ToolDock({ moon, onMoon, onCalendar, lens, onLens, layersOpen, onLayers, onReset }: ToolDockProps) {
  const button = (label: string, glyph: GlyphId, onClick: () => void, on?: boolean, cap?: string) => (
    <button type="button" className={`tooldock__btn tooldock__btn--${glyph}${on === true ? ' tooldock__btn--on' : ''}`} aria-label={label} aria-pressed={on} onClick={onClick}>
      <Icon glyph={glyph} size={40} />
      {cap === undefined ? null : <span className="tooldock__cap">{cap}</span>}
    </button>
  )
  return (
    <nav className="tooldock" aria-label="Tools">
      {/* Dim while off; lit and labelled "Moon on" while on (29 Oct: "nobody can tell"). */}
      {button(moon ? 'Moon on. Tap to turn it off' : 'Moon off. Tap to show where it rises and sets', 'sunmoon', onMoon, moon, moon ? 'Moon on' : undefined)}
      {button('Calendar of the sky', 'calendar', onCalendar)}
      {button(lens ? 'What each lens sees, shown. Tap to hide' : 'Show what each lens sees', 'lens', onLens, lens)}
      {button('Map and layers', 'layers', onLayers, layersOpen)}
      {button('Back to now: the venue, north up, the current time', 'now', onReset)}
    </nav>
  )
}
