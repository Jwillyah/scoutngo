import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { axisLine, type LatLon } from '../core/geo.ts'
import type { PlannedPosition } from '../lib/plan.ts'
import { readToken } from '../lib/tokens.ts'
import { ShooterFigure } from './ShooterFigure.tsx'

/*
 * Point MapLibre at a worker the bundler actually emitted.
 *
 * maplibre-gl derives its own worker URL at runtime, roughly
 * `new URL('./' + name, import.meta.url)` where `name` is a variable. Bundlers
 * only emit assets for a STATIC `new URL('./literal', import.meta.url)`, so the
 * worker was never written into the build. In production the request for it fell
 * through to the SPA fallback, which answered index.html with a 200, and the
 * worker silently died on HTML. Raster tiles kept working because they decode on
 * the main thread, but every GeoJSON source is parsed in the worker, so the
 * style never finished loading and the cones and sun line never drew.
 *
 * `?worker&url` makes Vite bundle the worker with its own imports and hand back
 * a real emitted URL, in both dev and build.
 */
maplibregl.setWorkerUrl(maplibreWorkerUrl)

/**
 * Esri World Imagery. The tile path is {z}/{y}/{x}, row before column, which is
 * Esri's ordering and not the usual one. MapLibre fills in {x} as the column and
 * {y} as the row, so this template is correct as written.
 */
const ESRI_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

const ESRI_ATTRIBUTION =
  'Tiles by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

/** How far the sun line runs either side of the subject. */
const SUN_LINE_HALF_METERS = 1200

export type TapMode = 'venue' | 'subject' | null

interface MapViewProps {
  venue: LatLon | null
  onVenueChange: (next: LatLon) => void
  subject: LatLon | null
  onSubjectChange: (next: LatLon) => void
  mode: TapMode
  plan: PlannedPosition[]
  sunAzimuth: number | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Height of the bottom sheet, so the map keeps its content clear of it. */
  bottomInset: number
}

const CONE_SOURCE = 'fov-cones'
const SUN_SOURCE = 'sun-axis'

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

function coneCollection(plan: PlannedPosition[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: plan.map((p) => ({
      type: 'Feature',
      // Every value here came out of src/core. None of it is asserted.
      properties: {
        id: p.position.id,
        lighting: p.lighting.classification,
        hFOV: p.fov.hFOV,
      },
      geometry: { type: 'Polygon', coordinates: p.cone },
    })),
  }
}

function sunCollection(subject: LatLon | null, azimuth: number | null): GeoJSON.FeatureCollection {
  if (subject === null || azimuth === null) return emptyCollection()
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { azimuth },
        geometry: { type: 'LineString', coordinates: axisLine(subject, azimuth, SUN_LINE_HALF_METERS) },
      },
    ],
  }
}

/** A hard edged pin element, built by hand so it carries no library styling. */
function makeMarkerElement(className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  return el
}

export function MapView({
  venue,
  onVenueChange,
  subject,
  onSubjectChange,
  mode,
  plan,
  sunAzimuth,
  selectedId,
  onSelect,
  bottomInset,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const venueMarker = useRef<maplibregl.Marker | null>(null)
  const subjectMarker = useRef<maplibregl.Marker | null>(null)
  const figureMarkers = useRef(new Map<string, maplibregl.Marker>())

  const [ready, setReady] = useState(false)
  const [figureEls, setFigureEls] = useState<Record<string, HTMLElement>>({})

  // Handlers registered on the map read the current props through refs, so the
  // map is built once and never torn down to pick up a new callback.
  const latest = useRef({ mode, onVenueChange, onSubjectChange, onSelect })
  useEffect(() => {
    latest.current = { mode, onVenueChange, onSubjectChange, onSelect }
  }, [mode, onVenueChange, onSubjectChange, onSelect])

  // Set when a coordinate change came from the map itself, so the map does not
  // then chase its own tail by recentering on the pin the user just dragged.
  const selfMoved = useRef(false)

  /* ------------------------------------------------------------ build once */
  useEffect(() => {
    if (container.current === null) return

    const instance = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {
          esri: {
            type: 'raster',
            tiles: [ESRI_TILES],
            tileSize: 256,
            maxzoom: 19,
            attribution: ESRI_ATTRIBUTION,
          },
        },
        layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
      },
      center: venue === null ? [-75.6069, 38.3648] : [venue.lon, venue.lat],
      zoom: 16.5,
      attributionControl: false,
    })

    /*
     * MapLibre swallows tile and style failures otherwise, which turns any
     * problem into a silently black canvas. Everything it reports goes to the
     * console, in full.
     */
    instance.on('error', (event) => {
      console.error('[maplibre error]', event.error?.message ?? '(no message)', event)
    })

    instance.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    instance.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    instance.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-right')

    instance.on('click', (event) => {
      const { mode: tapMode, onVenueChange: setVenue, onSubjectChange: setSubject, onSelect: select } =
        latest.current
      const next = { lat: event.lngLat.lat, lon: event.lngLat.lng }
      if (tapMode === 'venue') {
        selfMoved.current = true
        setVenue(next)
      } else if (tapMode === 'subject') {
        setSubject(next)
      } else {
        select(null)
      }
    })

    instance.on('load', () => {
      const lighting = [
        'match',
        ['get', 'lighting'],
        'backlit',
        readToken('--light-back'),
        'front-lit',
        readToken('--light-front'),
        readToken('--light-side'),
      ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>

      instance.addSource(CONE_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(SUN_SOURCE, { type: 'geojson', data: emptyCollection() })

      // Data overlays are hard edged. Low opacity fill, full strength outline.
      instance.addLayer({
        id: 'cone-fill',
        type: 'fill',
        source: CONE_SOURCE,
        paint: { 'fill-color': lighting, 'fill-opacity': 0.22 },
      })
      instance.addLayer({
        id: 'cone-line',
        type: 'line',
        source: CONE_SOURCE,
        paint: { 'line-color': lighting, 'line-width': 1.5, 'line-opacity': 0.95 },
      })
      instance.addLayer({
        id: 'sun-line',
        type: 'line',
        source: SUN_SOURCE,
        paint: {
          'line-color': readToken('--sun'),
          'line-width': 2,
          'line-dasharray': [3, 2],
          'line-opacity': 0.9,
        },
      })

      setReady(true)
    })

    map.current = instance
    return () => {
      instance.remove()
      map.current = null
      setReady(false)
    }
    // Built once. Everything else flows in through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* --------------------------------------------------------- venue marker */
  useEffect(() => {
    const instance = map.current
    if (instance === null || venue === null) return

    if (venueMarker.current === null) {
      const el = makeMarkerElement('pin pin--venue')
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' })
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat()
        selfMoved.current = true
        latest.current.onVenueChange({ lat, lon: lng })
      })
      marker.setLngLat([venue.lon, venue.lat]).addTo(instance)
      venueMarker.current = marker
    } else {
      venueMarker.current.setLngLat([venue.lon, venue.lat])
    }

    // Typing coordinates moves the map. Dragging the pin does not re-move it.
    if (selfMoved.current) {
      selfMoved.current = false
    } else {
      instance.easeTo({ center: [venue.lon, venue.lat], duration: 600 })
    }
  }, [venue])

  /* ------------------------------------------------------- subject marker */
  useEffect(() => {
    const instance = map.current
    if (instance === null) return

    if (subject === null) {
      subjectMarker.current?.remove()
      subjectMarker.current = null
      return
    }

    if (subjectMarker.current === null) {
      const el = makeMarkerElement('reticle-mark')
      el.innerHTML =
        '<span class="reticle-mark__bar reticle-mark__bar--h"></span>' +
        '<span class="reticle-mark__bar reticle-mark__bar--v"></span>' +
        '<span class="reticle-mark__box"></span>'
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat()
        latest.current.onSubjectChange({ lat, lon: lng })
      })
      marker.setLngLat([subject.lon, subject.lat]).addTo(instance)
      subjectMarker.current = marker
    } else {
      subjectMarker.current.setLngLat([subject.lon, subject.lat])
    }
  }, [subject])

  /* -------------------------------------------------- cones and sun line */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    const cones = instance.getSource(CONE_SOURCE) as maplibregl.GeoJSONSource | undefined
    cones?.setData(coneCollection(plan))
  }, [plan, ready])

  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    const sun = instance.getSource(SUN_SOURCE) as maplibregl.GeoJSONSource | undefined
    sun?.setData(sunCollection(subject, sunAzimuth))
  }, [subject, sunAzimuth, ready])

  /* ------------------------------------------------- shooter figure markers */
  useEffect(() => {
    const instance = map.current
    if (instance === null) return

    const live = new Set(plan.map((p) => p.position.id))

    for (const [id, marker] of figureMarkers.current) {
      if (!live.has(id)) {
        marker.remove()
        figureMarkers.current.delete(id)
      }
    }

    let added = false
    const els: Record<string, HTMLElement> = {}

    for (const planned of plan) {
      const id = planned.position.id
      const existing = figureMarkers.current.get(id)
      if (existing === undefined) {
        const el = makeMarkerElement('shooter-host')
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        marker.setLngLat([planned.position.at.lon, planned.position.at.lat]).addTo(instance)
        figureMarkers.current.set(id, marker)
        els[id] = el
        added = true
      } else {
        existing.setLngLat([planned.position.at.lon, planned.position.at.lat])
        els[id] = existing.getElement()
      }
    }

    if (added || Object.keys(els).length !== Object.keys(figureEls).length) {
      setFigureEls(els)
    }
    // figureEls is compared, not depended on, to avoid a render loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  useEffect(() => {
    // The Map identity never changes, so capturing it here is safe and explicit.
    const markers = figureMarkers.current
    return () => {
      for (const marker of markers.values()) marker.remove()
      markers.clear()
    }
  }, [])

  /* ------------------------------------------------------ sheet clearance */
  useEffect(() => {
    map.current?.setPadding({ top: 0, left: 0, right: 0, bottom: bottomInset })
  }, [bottomInset])

  return (
    <div className={`map${mode === null ? '' : ' map--picking'}`}>
      <div className="map__canvas" ref={container} />
      {plan.map((planned) => {
        const host = figureEls[planned.position.id]
        if (host === undefined) return null
        return createPortal(
          <ShooterFigure
            number={planned.position.number}
            focalLength={planned.position.focalLength}
            classification={planned.lighting.classification}
            selected={selectedId === planned.position.id}
            onSelect={() => onSelect(planned.position.id)}
          />,
          host,
          planned.position.id,
        )
      })}
    </div>
  )
}
