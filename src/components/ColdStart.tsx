import type { Spot } from '../lib/spots.ts'

/**
 * THE FIRST SCREEN WHEN THERE IS NO PIN YET.
 *
 * WHAT WAS ASKED FOR. "Opening on the mid-Atlantic is useless. Do not add IP
 * geolocation, that rule stands. Instead put my saved spots on that screen. I
 * shoot the same places, so a list gets me in faster than any guess about
 * where I am."
 *
 * WHY THE MAP OPENS ON THE ATLANTIC AT ALL. Because the app does not know
 * where you are and will not find out: an approximate position derived from an
 * IP address is user data, and the way not to hold it is not to ask. See
 * COLD_START_VIEW in src/core/viewport.ts and tests/noIpGeolocation.test.ts.
 *
 * So the answer is not a better guess, it is the thing that needs no guessing.
 * A list of places the shooter has already been is not an inference about
 * them; it is something they typed, on this device, and it is almost always
 * the right answer because people shoot the same places.
 *
 * NOTHING HERE WHEN THERE ARE NO SPOTS. A first run has nothing true to show,
 * and an empty list with an explanation is worse than a map: the search field
 * and the pin are right there.
 */
export function ColdStart({
  spots,
  onLoad,
}: {
  spots: readonly Spot[]
  onLoad: (spot: Spot) => void
}) {
  if (spots.length === 0) return null

  /* Most recently saved first: the one you are most likely to want. */
  const recent = [...spots]
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, 6)

  return (
    <div className="cold">
      <p className="cold__head">
        <span className="cold__label">Your spots</span>
        <span className="cold__note">
          The map does not know where you are, and does not ask.
        </span>
      </p>
      <ul className="cold__list">
        {recent.map((spot) => (
          <li key={spot.id}>
            <button type="button" className="cold__spot" onClick={() => onLoad(spot)}>
              <span className="cold__name">{spot.name}</span>
              <span className="cold__meta num">
                {spot.savedAt.slice(0, 10)}
                {spot.positions.length === 0
                  ? ''
                  : ` · ${spot.positions.length} position${spot.positions.length === 1 ? '' : 's'}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
