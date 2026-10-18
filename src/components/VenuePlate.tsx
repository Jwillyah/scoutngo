import { Receipt } from '../lib/numerals.tsx'
import { venueLabel, type ResolvedName } from '../core/venueName.ts'
import type { LatLon } from '../core/geo.ts'

interface VenuePlateProps {
  /** What the app knows about this place's name. Derived, never typed. */
  state: ResolvedName
  latitude: string
  longitude: string
  at: LatLon | null
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
/*
 * THE NAME IS NOT AN INPUT ANY MORE.
 *
 * It was a text field, which made it the SECOND writer of a fact the geocoder
 * also wrote, and that is how the header kept reading "Brew River Dock Bar"
 * after the pin moved to Shenandoah. A name typed here could not be reconciled
 * with the coordinate, because nothing recorded which place it was typed for.
 *
 * WHERE THE SHOOTER'S OWN WORDS WENT: nowhere, because they already had a
 * home. A saved spot carries a name the shooter chooses, and that one is about
 * the SPOT -- "the layby below the switchback" -- rather than about what the
 * place is called. Those were always two different things sharing one field.
 */
export function VenuePlate({ state, latitude, longitude, at }: VenuePlateProps) {
  return (
    <div className="plate">
      <p
        className={`plate__name plate__name--${state.kind}`}
        aria-label="Venue name"
      >
        {at === null
          ? 'Drop a pin or search for the venue'
          : venueLabel(state, latitude, longitude)}
      </p>
      {state.kind === 'looking' && at !== null ? (
        <span className="pill__default">looking it up</span>
      ) : null}
      {at === null ? null : (
        <Receipt kind="coordinate">
          <span className="plate__coords num">
            {at.lat.toFixed(5)}, {at.lon.toFixed(5)}
          </span>
        </Receipt>
      )}
    </div>
  )
}
