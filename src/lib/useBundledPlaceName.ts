import { useEffect, useState } from 'react'
import type { LatLon } from '../core/geo.ts'
import { bundledPlaceName, type NamedPoint } from '../core/nearestPlace.ts'

/*
 * THE PIN'S NAME FROM BUNDLED DATA (E9), for while the reverse lookup is out,
 * offline or refused. Nothing is fetched: the coast cams' spots and the
 * weather stations' towns ship with the app, loaded on first use so the
 * station list (2478 rows) stays out of the first paint.
 */
let loaded: Promise<{ spots: NamedPoint[]; towns: NamedPoint[] }> | null = null

export function bundledPlaces(): Promise<{ spots: NamedPoint[]; towns: NamedPoint[] }> {
  loaded ??= Promise.all([import('../data/coastCams.ts'), import('../data/asosStations.ts')]).then(([cams, asos]) => ({
    spots: cams.COAST_CAMS.map((c) => ({ name: c.name, at: c.at })),
    towns: asos.ASOS_STATIONS.map(([, name, lat, lon]) => ({ name, at: { lat, lon } })),
  }))
  return loaded
}

/** "Sandbridge", "near Sandbridge", or null when nothing bundled is near; null until the data has loaded. */
export function useBundledPlaceName(at: LatLon | null): string | null {
  const [named, setNamed] = useState<{ key: string; name: string | null } | null>(null)
  const key = at === null ? '' : `${at.lat}|${at.lon}`
  useEffect(() => {
    if (at === null) return
    let live = true
    void bundledPlaces().then(({ spots, towns }) => {
      if (live) setNamed({ key, name: bundledPlaceName(at, spots, towns) })
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  /* A name for another coordinate is not this one's (src/core/venueName.ts). */
  return named !== null && named.key === key ? named.name : null
}
