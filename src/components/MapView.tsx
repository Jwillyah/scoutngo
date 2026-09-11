import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  axisLine,
  destinationPoint,
  distanceMeters,
  toPosition,
  type LatLon,
} from '../core/geo.ts'
import type { SunArc } from '../core/sun.ts'
import type { PlannedPosition } from '../lib/plan.ts'
import type { MapBounds } from '../lib/planRequest.ts'
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

const SUN_LINE_HALF_METERS = 1200
/** Length of the four radiating sun lines drawn from the venue pin. */
const SUN_RAY_METERS = 900
/** Where the degree labels sit, as a fraction of the shorter visible span. */
const LABEL_SPAN_FRACTION = 0.28
const LABEL_MIN_METERS = 50
const LABEL_MAX_METERS = 700
/** How long a press has to be held before it drops a pin. */
const LONG_PRESS_MS = 550
const CONE_SOURCE = 'fov-cones'
const SUN_SOURCE = 'sun-axis'
const RAY_SOURCE = 'sun-rays'

export type TapMode = 'venue' | 'subject' | null

export interface CameraState {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

export interface MapCapture {
  dataUrl: string
  mediaType: string
  bounds: MapBounds
  /** CSS pixel size of the canvas, which is what unproject works in. */
  width: number
  height: number
  camera: CameraState
}

export interface MapHandle {
  /** Grabs the current view as a JPEG plus everything needed to invert it later. */
  capture(): MapCapture | null
  /**
   * Turns normalized image coordinates back into real positions, using the
   * camera as it was at capture time rather than wherever the map is now.
   */
  unprojectFromCapture(capture: MapCapture, points: { x: number; y: number }[]): LatLon[]
  /**
   * The other direction: real positions into normalized image coordinates for a
   * capture. Used to tell the model where the subject sits in the image it is
   * looking at, which it otherwise has to guess.
   */
  projectToCapture(
    capture: MapCapture,
    points: LatLon[],
  ): { x: number; y: number }[]
  flyTo(at: LatLon, zoom?: number): void
  fitAll(points: LatLon[]): void
  setPitch(pitch: number): void
  zoomBy(delta: number): void
}

export interface SunOverlay {
  azimuth: number
  shadowBearing: number
  arc: SunArc
}

interface MapViewProps {
  handle?: React.Ref<MapHandle>
  venue: LatLon | null
  onVenueChange: (next: LatLon) => void
  subject: LatLon | null
  onSubjectChange: (next: LatLon) => void
  mode: TapMode
  /** Every position, drawn as a marker. */
  plan: PlannedPosition[]
  /** The subset whose cones are drawn. Filtering lives in App. */
  conePlan: PlannedPosition[]
  onPositionMove: (id: string, next: LatLon) => void
  /** Long press drops the venue if it is unset, otherwise the subject. */
  onLongPress: (at: LatLon) => void
  sunAzimuth: number | null
  /** PhotoPills style rays from the venue pin. All four bearings from core. */
  sunOverlay: SunOverlay | null
  showSun: boolean
  showArc: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onPitchChange: (pitch: number) => void
  bottomInset: number
}

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
        platform: p.position.platform,
      },
      geometry: { type: 'Polygon', coordinates: p.cone },
    })),
  }
}

function sunCollection(
  subject: LatLon | null,
  azimuth: number | null,
): GeoJSON.FeatureCollection {
  if (subject === null || azimuth === null) return emptyCollection()
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { azimuth },
        geometry: {
          type: 'LineString',
          coordinates: axisLine(subject, azimuth, SUN_LINE_HALF_METERS),
        },
      },
    ],
  }
}

/**
 * Sunrise, sunset, current sun, and current shadow, radiating from the venue.
 * Every bearing here is computed by src/core/sun.ts. No solar math happens in
 * this file.
 */
function rayCollection(
  venue: LatLon | null,
  overlay: SunOverlay | null,
  showSun: boolean,
  showArc: boolean,
): GeoJSON.FeatureCollection {
  if (venue === null || overlay === null || !showSun) return emptyCollection()

  const rays: { kind: string; bearing: number }[] = [
    { kind: 'sun', bearing: overlay.azimuth },
    { kind: 'shadow', bearing: overlay.shadowBearing },
  ]
  // Sunrise and sunset matter less inside a midday window, so they are opt in.
  if (showArc && overlay.arc.sunrise !== null) {
    rays.push({ kind: 'sunrise', bearing: overlay.arc.sunrise.azimuth })
  }
  if (showArc && overlay.arc.sunset !== null) {
    rays.push({ kind: 'sunset', bearing: overlay.arc.sunset.azimuth })
  }

  return {
    type: 'FeatureCollection',
    features: rays.map((ray) => ({
      type: 'Feature',
      properties: { kind: ray.kind, bearing: ray.bearing },
      geometry: {
        type: 'LineString',
        coordinates: [
          toPosition(venue),
          toPosition(destinationPoint(venue, ray.bearing, SUN_RAY_METERS)),
        ],
      },
    })),
  }
}

function makeMarkerElement(className: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = className
  return el
}

export function MapView({
  handle,
  venue,
  onVenueChange,
  subject,
  onSubjectChange,
  mode,
  plan,
  conePlan,
  onPositionMove,
  onLongPress,
  sunAzimuth,
  sunOverlay,
  showSun,
  showArc,
  selectedId,
  onSelect,
  onPitchChange,
  bottomInset,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const venueMarker = useRef<maplibregl.Marker | null>(null)
  const subjectMarker = useRef<maplibregl.Marker | null>(null)
  const figureMarkers = useRef(new Map<string, maplibregl.Marker>())
  const rayLabels = useRef<maplibregl.Marker[]>([])
  const draggedRecently = useRef(new Set<string>())

  const [ready, setReady] = useState(false)
  /* Bumped on every map move so the ray labels can re-place themselves. */
  const [viewTick, setViewTick] = useState(0)
  const [figureEls, setFigureEls] = useState<Record<string, HTMLElement>>({})

  const latest = useRef({
    mode,
    onVenueChange,
    onSubjectChange,
    onSelect,
    onPositionMove,
    onPitchChange,
    onLongPress,
  })
  useEffect(() => {
    latest.current = {
      mode,
      onVenueChange,
      onSubjectChange,
      onSelect,
      onPositionMove,
      onPitchChange,
      onLongPress,
    }
  }, [
    mode,
    onVenueChange,
    onSubjectChange,
    onSelect,
    onPositionMove,
    onPitchChange,
    onLongPress,
  ])

  const selfMoved = useRef(false)
  const insetRef = useRef(bottomInset)
  insetRef.current = bottomInset

  /* ------------------------------------------------------------ build once */
  useEffect(() => {
    if (container.current === null) return
    // Captured for the cleanup below; the Map identity itself never changes.
    const figures = figureMarkers.current

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
      center: venue === null ? [-75.605912, 38.364236] : [venue.lon, venue.lat],
      zoom: 16.5,
      attributionControl: false,
      // Tilt and rotate. Flat imagery only, no 3D meshes: coverage in these
      // towns is bad enough that a mesh would be a lie, per docs/brief.md.
      pitchWithRotate: true,
      maxPitch: 60,
      /*
       * getCanvas().toDataURL() reads back an empty image unless the drawing
       * buffer survives the frame. Off by default in maplibre.
       */
      canvasContextAttributes: { preserveDrawingBuffer: true },
    })

    instance.touchZoomRotate.enable({ around: 'center' })
    instance.touchPitch.enable()
    instance.dragRotate.enable()

    instance.on('error', (event) => {
      console.error('[maplibre error]', event.error?.message ?? '(no message)', event)
    })

    const attribution = new maplibregl.AttributionControl({ compact: true })
    instance.addControl(attribution, 'bottom-left')

    /*
     * COLLAPSE THE ATTRIBUTION TO THE (i).
     *
     * `compact: true` is necessary but not sufficient. maplibre 6.8's
     * _updateCompact() adds BOTH `maplibregl-compact` and
     * `maplibregl-compact-show` on first render, so the control mounts expanded
     * and only folds away the first time the map is dragged. On a phone that put
     * a line of Esri credit across the bottom of the map until the user happened
     * to pan.
     *
     * Stripping the show class and the `open` attribute once, after mount, leaves
     * it collapsed. Clicking the (i) still expands it: maplibre's own
     * _toggleAttribution handler is bound to that button and toggles the same
     * class back on. The credit is legally required and is still one tap away; it
     * is only being folded up, never removed.
     */
    const collapseAttribution = () => {
      const el = instance.getContainer().querySelector('.maplibregl-ctrl-attrib')
      el?.classList.remove('maplibregl-compact-show')
      el?.removeAttribute('open')
    }
    collapseAttribution()
    instance.once('load', collapseAttribution)

    instance.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left')

    instance.on('click', (event) => {
      const l = latest.current
      /*
       * Markers are appended into maplibre's own canvas container, so a click on
       * a shooter bubbles up and arrives here as a map click too. Without this
       * guard, tapping a figure selected it and then this handler immediately
       * deselected it, and the card never appeared.
       */
      const target = event.originalEvent.target as HTMLElement | null
      if (target?.closest('.shooter-host, .pin, .reticle-mark, .ray-label') != null) return

      const next = { lat: event.lngLat.lat, lon: event.lngLat.lng }
      if (l.mode === 'venue') {
        selfMoved.current = true
        l.onVenueChange(next)
      } else if (l.mode === 'subject') {
        l.onSubjectChange(next)
      } else {
        l.onSelect(null)
      }
    })

    /*
     * Long press drops a pin. Cancelled by any pan, zoom, or release, so a drag
     * of the map never turns into a dropped pin by accident.
     */
    let pressTimer: number | null = null
    const cancelPress = () => {
      if (pressTimer !== null) {
        window.clearTimeout(pressTimer)
        pressTimer = null
      }
    }
    const beginPress = (event: { lngLat: maplibregl.LngLat }) => {
      cancelPress()
      const at = { lat: event.lngLat.lat, lon: event.lngLat.lng }
      pressTimer = window.setTimeout(() => {
        pressTimer = null
        latest.current.onLongPress(at)
      }, LONG_PRESS_MS)
    }

    instance.on('touchstart', beginPress)
    instance.on('mousedown', beginPress)
    for (const event of ['touchend', 'touchcancel', 'touchmove', 'mouseup', 'movestart', 'zoomstart', 'dragstart'] as const) {
      instance.on(event, cancelPress)
    }

    instance.on('pitchend', () => latest.current.onPitchChange(instance.getPitch()))
    instance.on('moveend', () => setViewTick((tick) => tick + 1))

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
      instance.addSource(RAY_SOURCE, { type: 'geojson', data: emptyCollection() })

      const rayColor = [
        'match',
        ['get', 'kind'],
        'sunrise',
        readToken('--sun-rise'),
        'sunset',
        readToken('--sun-set'),
        'shadow',
        readToken('--sun-shadow'),
        readToken('--sun'),
      ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>

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
        filter: ['!=', ['get', 'platform'], 'air'],
        paint: { 'line-color': lighting, 'line-width': 1.5, 'line-opacity': 0.95 },
      })
      // A drone is not standing on the ground, so its cone is drawn dashed.
      instance.addLayer({
        id: 'cone-line-air',
        type: 'line',
        source: CONE_SOURCE,
        filter: ['==', ['get', 'platform'], 'air'],
        paint: {
          'line-color': lighting,
          'line-width': 1.5,
          'line-dasharray': [3, 2],
          'line-opacity': 0.95,
        },
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

      // Thick enough to read over satellite imagery, with a dark casing so they
      // survive both bright sand and dark water.
      // Thin and quiet. These are orientation, not the subject of the map.
      instance.addLayer({
        id: 'ray-casing',
        type: 'line',
        source: RAY_SOURCE,
        paint: {
          'line-color': readToken('--mark-edge'),
          'line-width': 4,
          'line-opacity': 0.28,
        },
      })
      instance.addLayer({
        id: 'ray-line',
        type: 'line',
        source: RAY_SOURCE,
        paint: { 'line-color': rayColor, 'line-width': 2, 'line-opacity': 0.35 },
      })

      setReady(true)
    })

    map.current = instance
    return () => {
      cancelPress()
      instance.remove()
      map.current = null
      /*
       * Every marker belonged to the map just removed, so drop the references
       * too. Without this the next map gets no markers at all: the marker
       * effects see a non-null ref, take their "already exists" branch, and
       * call setLngLat on an orphan that was never added to the new map. React
       * StrictMode remounts once in development, which is exactly this path,
       * and it is why the venue pin and the subject reticle were invisible in
       * dev while working in a production build.
       */
      venueMarker.current = null
      subjectMarker.current = null
      figures.clear()
      setFigureEls({})
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ------------------------------------------------------ imperative handle */
  useImperativeHandle(
    handle,
    (): MapHandle => ({
      capture() {
        const instance = map.current
        if (instance === null) return null
        const canvas = instance.getCanvas()
        const bounds = instance.getBounds()
        const centre = instance.getCenter()
        return {
          dataUrl: canvas.toDataURL('image/jpeg', 0.85),
          mediaType: 'image/jpeg',
          bounds: {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          },
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          camera: {
            center: [centre.lng, centre.lat],
            zoom: instance.getZoom(),
            bearing: instance.getBearing(),
            pitch: instance.getPitch(),
          },
        }
      },

      unprojectFromCapture(capture, points) {
        const instance = map.current
        if (instance === null) return []
        const now = instance.getCenter()
        const restore: CameraState = {
          center: [now.lng, now.lat],
          zoom: instance.getZoom(),
          bearing: instance.getBearing(),
          pitch: instance.getPitch(),
        }
        /*
         * Snap back to the camera that produced the image, invert, then snap
         * forward again. Both jumps happen in one tick so no frame is drawn in
         * between, and this stays exact under pitch and rotation, which a
         * bounds based conversion would not.
         */
        instance.jumpTo(capture.camera)
        const out = points.map((p) => {
          const ll = instance.unproject([p.x * capture.width, p.y * capture.height])
          return { lat: ll.lat, lon: ll.lng }
        })
        instance.jumpTo(restore)
        return out
      },

      projectToCapture(capture, points) {
        const instance = map.current
        if (instance === null) return []
        const now = instance.getCenter()
        const restore: CameraState = {
          center: [now.lng, now.lat],
          zoom: instance.getZoom(),
          bearing: instance.getBearing(),
          pitch: instance.getPitch(),
        }
        // Same snap-there-and-back as unprojectFromCapture, for the same reason.
        instance.jumpTo(capture.camera)
        const out = points.map((point) => {
          const p = instance.project([point.lon, point.lat])
          return { x: p.x / capture.width, y: p.y / capture.height }
        })
        instance.jumpTo(restore)
        return out
      },

      flyTo(at, zoom) {
        map.current?.flyTo({
          center: [at.lon, at.lat],
          zoom: zoom ?? Math.max(map.current.getZoom(), 17),
          duration: 900,
        })
      },

      fitAll(points) {
        const instance = map.current
        if (instance === null || points.length === 0) return
        const bounds = new maplibregl.LngLatBounds()
        for (const p of points) bounds.extend([p.lon, p.lat])
        instance.fitBounds(bounds, {
          // Top clears the search field and the mode row; bottom clears the sheet.
      padding: { top: 150, left: 52, right: 68, bottom: insetRef.current + 56 },
          maxZoom: 18,
          duration: 900,
        })
      },

      setPitch(pitch) {
        map.current?.easeTo({ pitch, duration: 400 })
        latest.current.onPitchChange(pitch)
      },

      zoomBy(delta) {
        map.current?.easeTo({ zoom: (map.current.getZoom() ?? 16) + delta, duration: 250 })
      },
    }),
    [],
  )

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
      // Moving the subject re-aims every cone at once.
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

  /* --------------------------------------------------- cones and sun line */
  useEffect(() => {
    if (map.current === null || !ready) return
    const cones = map.current.getSource(CONE_SOURCE) as maplibregl.GeoJSONSource | undefined
    cones?.setData(coneCollection(conePlan))
  }, [conePlan, ready])

  useEffect(() => {
    if (map.current === null || !ready) return
    const sun = map.current.getSource(SUN_SOURCE) as maplibregl.GeoJSONSource | undefined
    sun?.setData(sunCollection(subject, sunAzimuth))
  }, [subject, sunAzimuth, ready])

  useEffect(() => {
    if (map.current === null || !ready) return
    const rays = map.current.getSource(RAY_SOURCE) as maplibregl.GeoJSONSource | undefined
    rays?.setData(rayCollection(venue, sunOverlay, showSun, showArc))
  }, [venue, sunOverlay, showSun, showArc, ready])

  /* Degree labels at the end of each ray, in the monospace variant. */
  useEffect(() => {
    const instance = map.current
    if (instance === null) return
    for (const marker of rayLabels.current) marker.remove()
    rayLabels.current = []
    if (venue === null || sunOverlay === null || !showSun) return

    const labels: { kind: string; bearing: number; text: string }[] = [
      { kind: 'sun', bearing: sunOverlay.azimuth, text: 'Sun' },
      { kind: 'shadow', bearing: sunOverlay.shadowBearing, text: 'Shadow' },
    ]
    if (showArc && sunOverlay.arc.sunrise !== null) {
      labels.push({ kind: 'sunrise', bearing: sunOverlay.arc.sunrise.azimuth, text: 'Rise' })
    }
    if (showArc && sunOverlay.arc.sunset !== null) {
      labels.push({ kind: 'sunset', bearing: sunOverlay.arc.sunset.azimuth, text: 'Set' })
    }

    /*
     * Sit the labels a fraction of the way across the current view rather than
     * at the far end of the ray. At a 900m ray they were always off screen,
     * which made the degree readouts useless.
     */
    const bounds = instance.getBounds()
    const spanMeters = Math.min(
      distanceMeters(
        { lat: bounds.getSouth(), lon: bounds.getWest() },
        { lat: bounds.getSouth(), lon: bounds.getEast() },
      ),
      distanceMeters(
        { lat: bounds.getSouth(), lon: bounds.getWest() },
        { lat: bounds.getNorth(), lon: bounds.getWest() },
      ),
    )
    const labelMeters = Math.min(
      LABEL_MAX_METERS,
      Math.max(LABEL_MIN_METERS, spanMeters * LABEL_SPAN_FRACTION),
    )

    for (const label of labels) {
      const el = makeMarkerElement(`ray-label ray-label--${label.kind}`)
      el.innerHTML =
        `<span class="ray-label__text">${label.text}</span>` +
        `<span class="ray-label__deg num">${label.bearing.toFixed(1)}\u00B0</span>`
      const at = destinationPoint(venue, label.bearing, labelMeters)
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([at.lon, at.lat])
        .addTo(instance)
      rayLabels.current.push(marker)
    }
  }, [venue, sunOverlay, showSun, showArc, viewTick])

  /* ----------------------------------------------- shooter figure markers */
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

    const els: Record<string, HTMLElement> = {}
    let changed = false

    for (const planned of plan) {
      const id = planned.position.id
      const existing = figureMarkers.current.get(id)
      if (existing === undefined) {
        const el = makeMarkerElement('shooter-host')
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom', draggable: true })
        marker.on('dragstart', () => draggedRecently.current.add(id))
        marker.on('dragend', () => {
          const { lng, lat } = marker.getLngLat()
          latest.current.onPositionMove(id, { lat, lon: lng })
          // The click that ends a drag must not also open the card.
          window.setTimeout(() => draggedRecently.current.delete(id), 0)
        })
        marker.setLngLat([planned.position.at.lon, planned.position.at.lat]).addTo(instance)
        figureMarkers.current.set(id, marker)
        els[id] = el
        changed = true
      } else {
        existing.setLngLat([planned.position.at.lon, planned.position.at.lat])
        els[id] = existing.getElement()
      }
    }

    if (changed || Object.keys(els).length !== Object.keys(figureEls).length) {
      setFigureEls(els)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  useEffect(() => {
    const markers = figureMarkers.current
    return () => {
      for (const marker of markers.values()) marker.remove()
      markers.clear()
    }
  }, [])

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
            warnings={planned.warnings}
            framingWarnings={planned.framingWarnings}
            platform={planned.position.platform}
            altitudeFeet={planned.position.altitudeFeet}
            moved={planned.position.moved}
            selected={selectedId === planned.position.id}
            onSelect={() => {
              if (draggedRecently.current.has(planned.position.id)) return
              onSelect(planned.position.id)
            }}
          />,
          host,
          planned.position.id,
        )
      })}
    </div>
  )
}
