import type { LatLon } from '../core/geo.ts'
import { thumbUrl } from '../lib/thumb.ts'

interface VenueThumbProps {
  at: LatLon | null
  label: string
}

/**
 * The venue, once there are coordinates to show it at.
 *
 * CONFIRMATION, NOT DECORATION. A geocoder can resolve a name to the wrong town
 * and every field below will look perfectly reasonable. One look at the imagery
 * settles it before any of the rest matters, which is why it sits at the top and
 * runs full width.
 *
 * It is also the only colour on this screen, and that is deliberate: everything
 * else in SETUP is chrome and type.
 */
export function VenueThumb({ at, label }: VenueThumbProps) {
  if (at === null) return null

  return (
    <figure className="thumb">
      <img
        className="thumb__img"
        src={thumbUrl(at)}
        alt={`Satellite view of ${label === '' ? 'the venue' : label}`}
        loading="lazy"
      />
      <figcaption className="thumb__cap">
        <span className="thumb__name">{label === '' ? 'Venue' : label.split(',')[0]}</span>
        <span className="num thumb__at">
          {at.lat.toFixed(5)}, {at.lon.toFixed(5)}
        </span>
      </figcaption>
    </figure>
  )
}
