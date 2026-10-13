import type { LatLon } from '../core/geo.ts'

interface VenuePlateProps {
  name: string
  onName: (next: string) => void
  /** True while the name is still the app's guess rather than the shooter's. */
  nameFilled: boolean
  at: LatLon | null
  /** Off by default. Turned on under Settings, for people who want the numbers. */
  showCoords: boolean
}

/**
 * The resolved place.
 *
 * NO LATITUDE OR LONGITUDE FIELDS. The pin on the map is the coordinate, and
 * typing one by hand was never how anyone set a venue; it was how a form got
 * built.
 *
 * THE NAME IS EDITABLE HERE, AND NEVER REQUIRED. Dropping or dragging the pin
 * fills it from a reverse geocode, tagged as filled for you, the same way the
 * defaulted date and window are. Typing over it makes it yours. Nothing is
 * computed from it, so nothing waits on it.
 *
 * THE READOUT IS OFF BY DEFAULT NOW, and it is not a tap away either. Decimal
 * degrees are of no use to almost anyone standing on a dock, and a number that
 * appears when you tap a venue name is a number that appears by accident. It
 * lives behind a switch in Settings for the people who do want it.
 *
 * THE REACH NUMBER LEFT THIS PLATE. It now lives on the slider that sets it,
 * because a number printed away from its control is a number you have to go
 * looking for the control of.
 */
export function VenuePlate({ name, onName, nameFilled, at, showCoords }: VenuePlateProps) {
  return (
    <div className="plate">
      <input
        className="plate__name"
        type="text"
        value={name}
        placeholder={at === null ? 'Drop a pin or search for the venue' : 'Name this spot'}
        aria-label="Venue name"
        autoComplete="off"
        enterKeyHint="done"
        onChange={(event) => onName(event.target.value)}
      />
      {nameFilled ? <span className="pill__default">filled for you</span> : null}
      {!showCoords || at === null ? null : (
        <span className="plate__coords num">
          {at.lat.toFixed(5)}, {at.lon.toFixed(5)}
        </span>
      )}
    </div>
  )
}
