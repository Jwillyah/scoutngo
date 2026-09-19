import { useState } from 'react'
import type { LatLon } from '../core/geo.ts'

interface VenuePlateProps {
  name: string
  at: LatLon | null
  reachMeters: number
}

/**
 * The resolved place, and the ring around it.
 *
 * NO LATITUDE OR LONGITUDE FIELDS. The pin on the map is the coordinate, and
 * typing one by hand was never how anyone set a venue; it was how a form got
 * built. The numbers are still here for the times they are genuinely needed, one
 * tap away under the name, and nowhere else on the screen.
 */
export function VenuePlate({ name, at, reachMeters }: VenuePlateProps) {
  const [showCoords, setShowCoords] = useState(false)

  return (
    <div className="plate">
      <button
        type="button"
        className="plate__name"
        onClick={() => setShowCoords((open) => !open)}
        aria-expanded={showCoords}
      >
        {name.trim() === '' ? 'Drop a pin or search for the venue' : name.split(',')[0]}
      </button>
      <span className="plate__reach num">{Math.round(reachMeters)}m reach</span>
      {!showCoords || at === null ? null : (
        <span className="plate__coords num">
          {at.lat.toFixed(5)}, {at.lon.toFixed(5)}
        </span>
      )}
    </div>
  )
}
