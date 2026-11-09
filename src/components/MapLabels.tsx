import { useEffect, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { chooseLabels, type LabelCandidate, type PlacedLabel } from '../core/mapLabels.ts'
import { labelCandidates } from '../lib/mapLabelsData.ts'
import '../styles/labels.css'

/*
 * THE MAP'S LABELS (Batch Map, Section 3), drawn over the map in the app's
 * font: white with a soft dark halo, water names light and upright, towns
 * sized by importance, no route shields, at most twelve, never under the
 * crosshair or the spot's pin (src/core/mapLabels.ts chooses them). They
 * replace Esri's reference overlay. Placed again as the map moves.
 */
interface Props {
  map: maplibregl.Map | null
  on: boolean
  /** Points no label may cover: the spot's pin, and the crosshair when one is up. */
  keepClear: () => { lat: number; lon: number }[]
  crosshair: boolean
}

export function MapLabels({ map, on, keepClear, crosshair }: Props) {
  const [placed, setPlaced] = useState<PlacedLabel[]>([])
  const cands = useRef<LabelCandidate[]>([])
  const clear = useRef(keepClear)
  useEffect(() => {
    clear.current = keepClear
  }, [keepClear])

  useEffect(() => {
    if (map === null || !on) return
    let live = true
    let raf = 0
    const place = () => {
      const c = map.getContainer().getBoundingClientRect()
      const pts = clear.current().map((p) => {
        const s = map.project([p.lon, p.lat])
        return { x: s.x, y: s.y }
      })
      if (crosshair) pts.push({ x: c.width / 2, y: c.height / 2 })
      setPlaced(chooseLabels(cands.current, map.getZoom(), (lat, lon) => {
        const s = map.project([lon, lat])
        return { x: s.x, y: s.y }
      }, c.width, c.height, pts))
    }
    const load = () => {
      const b = map.getBounds()
      void labelCandidates({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() }, map.getZoom()).then((got) => {
        if (!live) return
        cands.current = got
        place()
      })
    }
    const onMove = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(place)
    }
    load()
    map.on('move', onMove)
    map.on('moveend', load)
    return () => {
      live = false
      cancelAnimationFrame(raf)
      map.off('move', onMove)
      map.off('moveend', load)
    }
  }, [map, on, crosshair])

  if (!on) return null
  return (
    <div className="mlabels" aria-hidden="true" data-labels={placed.length}>
      {placed.map((l) => (
        <span key={`${l.kind}|${l.name}`} className={`mlabel mlabel--${l.kind}`} style={{ left: `${l.x.toFixed(1)}px`, top: `${l.y.toFixed(1)}px`, fontSize: `${l.size}px` }}>
          {l.name}
        </span>
      ))}
    </div>
  )
}
