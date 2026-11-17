import { useEffect, useRef, type ReactNode } from 'react'
import type * as maplibregl from 'maplibre-gl'
import type { LatLon } from '../core/geo.ts'
import '../styles/timeline.css'

/*
 * THE ONE MARKER (Batch DRONE, Section 3; board docs/mockups/Map_Timeline_Wind.png).
 *
 * Where the layer is read: the spot by default, moved by holding anywhere on
 * the map (src/components/PlanMode.tsx). The readout sits beside it, not in
 * a pill under the search and not under a crosshair fixed to the middle of
 * the screen (both gone): the layer's value, its direction and gusts, the
 * swell at sea, the nearest station with its age.
 *
 * Placed on every frame the map moves by writing its transform directly,
 * never through React state, so a pan or a scrub costs no render.
 */
interface Props {
  map: maplibregl.Map | null
  at: LatLon | null
  /** The readout's lines; the first is the value. */
  lines: readonly string[]
  /** Extra content in the card (a Retry). */
  children?: ReactNode
  /** Which layer it reads, for the audits: wind, clouds, tide. */
  layer: string
  /** Whether the marker sits on the spot (the back-to-spot chip hides then). */
  atSpot: boolean
}

/** The card's gap from the marker's centre, and the screen's edge it keeps off. */
const GAP = 30
const EDGE = 8

export function LayerMarker({ map, at, lines, children, layer, atSpot }: Props) {
  const mark = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const lat = at?.lat ?? null
  const lon = at?.lon ?? null
  const placeNow = useRef<() => void>(() => undefined)
  useEffect(() => {
    if (map === null || lat === null || lon === null) return
    let raf = 0
    const place = () => {
      raf = 0
      const m = mark.current
      const c = card.current
      if (m === null || c === null) return
      const p = map.project([lon, lat])
      const box = map.getContainer().getBoundingClientRect()
      m.style.transform = `translate(${p.x}px, ${p.y}px)`
      /* The card to the right of the marker; to its left when it would leave the screen; held inside top and bottom. */
      const w = c.offsetWidth
      const h = c.offsetHeight
      const right = p.x + GAP + w <= box.width - EDGE
      const x = right ? p.x + GAP : Math.max(EDGE, p.x - GAP - w)
      const y = Math.max(EDGE, Math.min(box.height - h - EDGE, p.y - h / 2))
      c.style.transform = `translate(${x}px, ${y}px)`
      c.dataset.side = right ? 'right' : 'left'
      const off = p.x < -20 || p.y < -20 || p.x > box.width + 20 || p.y > box.height + 20
      m.dataset.off = off ? '1' : '0'
      c.dataset.off = off ? '1' : '0'
    }
    const later = () => {
      if (raf === 0) raf = requestAnimationFrame(place)
    }
    placeNow.current = place
    place()
    map.on('move', later)
    map.on('resize', later)
    return () => {
      cancelAnimationFrame(raf)
      placeNow.current = () => undefined
      map.off('move', later)
      map.off('resize', later)
    }
  }, [map, lat, lon])
  /* The card's size changes with its words: placed again after each render. */
  useEffect(() => {
    placeNow.current()
  })
  if (at === null) return null
  return (
    <>
      <div ref={mark} className="lmark" data-layer-marker={layer} data-at-spot={atSpot ? '1' : '0'} aria-hidden="true">
        <span className="lmark__ring" />
      </div>
      <div ref={card} className="lmark__card" role="status" data-marker-readout={layer}>
        {lines.map((l, i) => (
          <p key={i} className={`lmark__line lmark__line--${i === 0 ? 'value' : i === 1 ? 'second' : 'third'}`}>
            {l}
          </p>
        ))}
        {children}
      </div>
    </>
  )
}
