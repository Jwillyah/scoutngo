import type { LatLon } from '../core/geo.ts'
import { useCoast } from '../lib/coastData.ts'
import type { Units } from '../lib/units.ts'

/*
 * THE NWS ON THE WATER (Batch K, Section 5): the rip current risk from the
 * surf zone forecast, the nearest marine zone's forecast, and any tropical
 * storm within 1000 km with the NHC's wind odds. Facts with their source;
 * never advice (ux-rules 28).
 */
export function CoastFacts({ beach, venue, units }: { beach: LatLon; venue: LatLon; units: Units }) {
  const { coast, tropics } = useCoast(beach, venue, units.distance === 'ft' ? 'mi' : 'km', true)
  if (coast === null && tropics === null) return <p className="spage__line">Asking the NWS about the water…</p>
  return (
    <section className="coastf" aria-label="The NWS on the water">
      {(tropics?.lines ?? []).map((l) => (
        <p key={l} className="spage__line coastf__tropics">{l}</p>
      ))}
      {tropics?.odds == null ? null : <p className="spage__line num">{tropics.odds}</p>}
      {coast === null ? null : coast.rip !== null ? (
        <p className="spage__line coastf__rip">{coast.rip}{coast.surf === null ? '' : ` · surf ${coast.surf}`}</p>
      ) : (
        <p className="spage__line coastf__none">Rip current risk not said: {coast.ripWhy ?? 'no surf zone forecast here'}.</p>
      )}
      {coast?.marine == null ? null : (
        <details className="frow coastf__marine">
          <summary>Marine forecast · {coast.marine.text.split(/(?<=\.)\s/).slice(0, 2).join(' ')}</summary>
          <p className="spage__line">{coast.marine.period}: {coast.marine.text} (NWS, zone {coast.marine.zone})</p>
        </details>
      )}
    </section>
  )
}
