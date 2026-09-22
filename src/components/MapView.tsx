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
import { fitLongEdge, resolveCaptureLongEdge } from '../core/capture.ts'
import type { SunArc } from '../core/sun.ts'
import type { PlannedPosition } from '../lib/plan.ts'
import type { MapBounds } from '../lib/planRequest.ts'
import {
  centredRect,
  isClear,
  pad,
  slideOrder,
  type Rect,
} from '../core/labelPlacement.ts'
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
 * The map canvas as a JPEG data URL, downscaled if it is over the configured
 * long edge.
 *
 * See src/core/capture.ts for what the long edge costs and how to A/B it. The
 * downscale goes through an intermediate canvas because drawImage is the only
 * resampler available here; it is a one off per generate and measured at a few
 * milliseconds, so it is not worth moving off the main thread.
 *
 * IMPORTANT: this changes the IMAGE only, never the coordinate mapping. The model
 * answers in normalized 0 to 1 image coordinates and unprojectFromCapture scales
 * those by the canvas CSS size, which is unaffected by how many device pixels the
 * JPEG happens to carry. Resolution can be changed freely without moving a pin.
 */
function encodeCanvas(canvas: HTMLCanvasElement): string {
  const source = { width: canvas.width, height: canvas.height }
  const target = fitLongEdge(source, resolveCaptureLongEdge(window.location.search))

  if (target.width === source.width && target.height === source.height) {
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  const scaled = document.createElement('canvas')
  scaled.width = target.width
  scaled.height = target.height
  const context = scaled.getContext('2d')
  if (context === null) return canvas.toDataURL('image/jpeg', 0.85)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(canvas, 0, 0, target.width, target.height)
  return scaled.toDataURL('image/jpeg', 0.85)
}

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

/*
 * How far along the ray to step while looking for a clear spot, as a fraction
 * of the preferred distance. Small enough that a label rarely has to travel
 * far, large enough that the search is a handful of tries rather than a scan.
 */
const LABEL_SLIDE_FRACTION = 0.12

/** A breathing gap around every piece of floating chrome, in CSS pixels. */
const LABEL_CLEARANCE_PX = 6

/*
 * How close to the pin a label may be pushed WHEN IT HAS TO BE.
 *
 * LABEL_MIN_METERS is where a label is allowed to sit by preference; this is
 * how far the search may go past that to save a reading. The two are different
 * numbers because the rule is "hide it only if no clear point exists", and a
 * preference is not an absence.
 *
 * It matters most in exactly the reported case. With the venue near the top of
 * the view the shadow ray runs north, straight off the screen: measured at a
 * typical zoom, 50m north of the pin was already y=60, inside the HUD, and
 * every larger distance was further up. The only clear points on that ray are
 * between the pin and the HUD, which is under 50m.
 */
const LABEL_SLIDE_MIN_METERS = 12

/*
 * EVERY FLOATING CONTROL, and the sheet. These are the things that sit OVER the
 * map; anything drawn IN the map is not an obstacle, because a label among the
 * cones and figures is a label in its natural habitat.
 *
 * Add to this list when a new floating surface is added to a mode, or the
 * labels will go back to hiding underneath it.
 */
const FLOATING_CHROME = [
  '.hud',
  '.mapctl',
  '.sheet',
  '.dock',
  '.card',
  '.confirm',
  '.setup__search',
  '.picker__menu',
  '.overflow__menu',
].join(', ')
/** How long a press has to be held before it drops a pin. */
const LONG_PRESS_MS = 550
const RADIUS_SOURCE = 'reach-radius'
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

/** The cheap half of a capture: everything except the image encode. */
export type MapViewport = Omit<MapCapture, 'dataUrl' | 'mediaType'>

export interface MapHandle {
  /**
   * Bounds, camera and canvas size, WITHOUT encoding the image.
   *
   * Split out from capture() so the Overpass request can be sent before the
   * JPEG encode starts: Overpass only needs the bounding box, and waiting for a
   * ~65ms canvas encode before opening that socket is pure serial dead time.
   */
  viewport(): MapViewport | null
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
  /**
   * Frame these points.
   *
   * `duration` in ms; pass 0 for a live drag, where a 900ms ease would still be
   * catching up several slider steps later. `padding` overrides the default
   * insets, which are sized for PLAN's full height map and leave almost nothing
   * of SETUP's 270px one.
   */
  fitAll(
    points: LatLon[],
    duration?: number,
    padding?: { top: number; left: number; right: number; bottom: number },
  ): void
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
  /**
   * How far from the venue the shooter can actually get, in metres. DISPLAY
   * ONLY: the ring is drawn from this and has no handle on it, because the one
   * way to change it is the slider under the map. Null hides it entirely, which
   * is what PLAN and FIELD pass.
   */
  radiusMeters?: number | null
  /**
   * One sentence under the pin, for a first run. Null hides it.
   *
   * It rides on the pin as a marker rather than sitting on the map surface, so
   * it stays under the thing it is talking about through any pan or zoom.
   */
  pinHint?: string | null
  /** Fired when the venue pin is DRAGGED, as opposed to moved any other way. */
  onPinDrag?: () => void
  /**
   * Fired once the map has loaded and the imperative handle is usable.
   *
   * Needed because fitting the view is meaningless before the style exists, and
   * guessing a delay is how you get a fit that silently does nothing on a slow
   * connection and works on a fast one.
   */
  onReady?: () => void
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
  radiusMeters = null,
  pinHint = null,
  onPinDrag,
  onReady,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const venueMarker = useRef<maplibregl.Marker | null>(null)
  const hintMarker = useRef<maplibregl.Marker | null>(null)
  const subjectMarker = useRef<maplibregl.Marker | null>(null)
  const figureMarkers = useRef(new Map<string, maplibregl.Marker>())
  const rayLabels = useRef<maplibregl.Marker[]>([])
  const draggedRecently = useRef(new Set<string>())

  const [ready, setReady] = useState(false)
  /* Bumped on every map move so the ray labels can re-place themselves. */
  const [viewTick, setViewTick] = useState(0)
  /*
   * Bumped when the FLOATING CHROME changes, which the map never hears about.
   *
   * Label placement depends on where the panels are, and panels appear and
   * vanish without the map moving. Measured: tapping a position flies the map
   * with the card open, so a label was correctly hidden behind the card; then
   * closing the card moved nothing, so nothing re-ran, and the label stayed
   * hidden with an empty screen to sit in.
   */
  const [chromeTick, setChromeTick] = useState(0)
  const [figureEls, setFigureEls] = useState<Record<string, HTMLElement>>({})

  const latest = useRef({
    mode,
    onVenueChange,
    onSubjectChange,
    onSelect,
    onPositionMove,
    onPitchChange,
    onLongPress,
    onPinDrag,
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
      onPinDrag,
    }
  }, [
    mode,
    onVenueChange,
    onSubjectChange,
    onSelect,
    onPositionMove,
    onPitchChange,
    onLongPress,
    onPinDrag,
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

      instance.addSource(RADIUS_SOURCE, { type: 'geojson', data: emptyCollection() })
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

      /*
       * The reachable ring. Added FIRST so every marker and cone sits above it:
       * it is a boundary, not a subject, and it must never obscure a position.
       */
      instance.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: RADIUS_SOURCE,
        paint: {
          'fill-color': readToken('--color-accent', '#2dd4bf', container.current),
          'fill-opacity': 0.08,
        },
      })
      instance.addLayer({
        id: 'radius-line',
        type: 'line',
        source: RADIUS_SOURCE,
        paint: {
          'line-color': readToken('--color-accent', '#2dd4bf', container.current),
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      })

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
       *
       * ANY NEW MARKER REF BELONGS IN THIS LIST. The first-run pin hint was
       * added without it and was invisible in dev for exactly this reason,
       * creating itself against the first map and then updating an orphan.
       */
      venueMarker.current = null
      hintMarker.current = null
      subjectMarker.current = null
      figures.clear()
      setFigureEls({})
      setReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (ready) onReady?.()
  }, [ready, onReady])

  /* ----------------------------------------------------------- reach ring */
  /*
   * A RING WITH NOTHING TO GRAB. It used to carry a draggable dot on its east
   * edge, which was the only way to change the reach and looked like a map
   * decoration. The slider under the map owns the number now; this just draws
   * whatever that number currently is.
   */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return

    const source = instance.getSource(RADIUS_SOURCE) as maplibregl.GeoJSONSource | undefined
    if (source === undefined) return

    if (venue === null || radiusMeters === null) {
      source.setData(emptyCollection())
      return
    }

    /*
     * The ring as a polygon, from the same destinationPoint the cones use. 64
     * steps is smooth at every zoom this map reaches and costs nothing.
     */
    const ring: [number, number][] = []
    for (let i = 0; i <= 64; i++) {
      const edge = destinationPoint(venue, (i * 360) / 64, radiusMeters)
      ring.push([edge.lon, edge.lat])
    }
    source.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }],
    })

  }, [venue, radiusMeters, ready])

  /* ------------------------------------------------------ imperative handle */
  useImperativeHandle(
    handle,
    (): MapHandle => ({
      viewport() {
        const instance = map.current
        if (instance === null) return null
        const canvas = instance.getCanvas()
        const bounds = instance.getBounds()
        const centre = instance.getCenter()
        return {
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

      capture() {
        const instance = map.current
        if (instance === null) return null
        const canvas = instance.getCanvas()
        const bounds = instance.getBounds()
        const centre = instance.getCenter()
        return {
          dataUrl: encodeCanvas(canvas),
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

      fitAll(points, duration = 900, padding) {
        const instance = map.current
        if (instance === null || points.length === 0) return
        const bounds = new maplibregl.LngLatBounds()
        for (const p of points) bounds.extend([p.lon, p.lat])
        instance.fitBounds(bounds, {
          // Top clears the search field and the mode row; bottom clears the sheet.
          padding: padding ?? {
            top: 150,
            left: 52,
            right: 68,
            bottom: insetRef.current + 56,
          },
          maxZoom: 18,
          duration,
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
        // A DRAG, specifically. Not a search, not a long press. The first-run
        // hint is about the gesture, so only the gesture retires it.
        latest.current.onPinDrag?.()
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

  /* ------------------------------------------------- the one sentence hint */
  /*
   * A pin is obviously a place. It is not obviously a THING YOU CAN MOVE, and
   * the geocoder being a street off is the common case. So the first run says
   * so once, under the pin, and never again after the first drag.
   */
  useEffect(() => {
    const instance = map.current
    if (instance === null) return

    if (venue === null || pinHint === null) {
      hintMarker.current?.remove()
      hintMarker.current = null
      return
    }

    if (hintMarker.current === null) {
      const el = makeMarkerElement('pin-hint')
      el.textContent = pinHint
      hintMarker.current = new maplibregl.Marker({
        element: el,
        anchor: 'top',
        // Clear of the pin's own footprint so it never covers the tip.
        offset: [0, 10],
      })
        .setLngLat([venue.lon, venue.lat])
        .addTo(instance)
    } else {
      hintMarker.current.getElement().textContent = pinHint
      hintMarker.current.setLngLat([venue.lon, venue.lat])
    }
  }, [venue, pinHint])

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

    /*
     * KEEP THE LABELS OUT FROM UNDER THE CHROME.
     *
     * Read the obstacles ONCE for the whole batch, and the label's own size
     * once per label, then do the search in arithmetic against projected
     * points. Measuring a moved marker on every candidate would force a layout
     * per try, and this effect runs on every map move.
     */
    /*
     * getContainer(), NOT getCanvasContainer(). `project()` returns pixels
     * relative to the map's own container, so that is the element whose origin
     * the projected points must be added to. The canvas container is a
     * positioned child that does not stretch: measured at 390x34 on a full
     * height map, which as a viewport rejected every candidate and hid every
     * label.
     */
    const canvas = instance.getContainer().getBoundingClientRect()
    const viewport: Rect = {
      left: canvas.left,
      top: canvas.top,
      right: canvas.right,
      bottom: canvas.bottom,
    }
    const obstacles: Rect[] = [...document.querySelectorAll(FLOATING_CHROME)]
      .map((node) => node.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) =>
        pad({ left: box.left, top: box.top, right: box.right, bottom: box.bottom },
          LABEL_CLEARANCE_PX),
      )

    const distances = slideOrder(
      labelMeters,
      LABEL_SLIDE_MIN_METERS,
      LABEL_MAX_METERS,
      Math.max(1, labelMeters * LABEL_SLIDE_FRACTION),
    )

    for (const label of labels) {
      const el = makeMarkerElement(`ray-label ray-label--${label.kind}`)
      el.innerHTML =
        `<span class="ray-label__text">${label.text}</span>` +
        `<span class="ray-label__deg num">${label.bearing.toFixed(1)}\u00B0</span>`
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([venue.lon, venue.lat])
        .addTo(instance)

      const size = el.getBoundingClientRect()
      let placed: { lat: number; lon: number } | null = null
      for (const meters of distances) {
        const candidate = destinationPoint(venue, label.bearing, meters)
        const point = instance.project([candidate.lon, candidate.lat])
        const box = centredRect(
          canvas.left + point.x,
          canvas.top + point.y,
          size.width,
          size.height,
        )
        if (isClear(box, obstacles, viewport)) {
          placed = candidate
          break
        }
      }

      /*
       * NOTHING ON THE RAY IS CLEAR, so the label goes. The ray is still drawn:
       * the direction survives, only the degrees are dropped, which is the
       * right thing to lose when the alternative is a number half hidden under
       * a button and read wrong.
       */
      if (placed === null) {
        marker.remove()
        continue
      }
      marker.setLngLat([placed.lon, placed.lat])
      rayLabels.current.push(marker)
    }
  }, [venue, sunOverlay, showSun, showArc, viewTick, chromeTick, bottomInset])

  /*
   * Watch for floating chrome appearing and disappearing.
   *
   * Watched on the MODE container, which is where the chrome actually lives:
   * the card, the sheet, the dock and the HUD are all direct children of
   * .mode-plan, while the map is two levels down. Watching the map's own parent
   * saw only the shooter figures.
   *
   * childList only, no subtree: a subtree observer would also fire on every
   * scrubber tick and every marker update, which is most of a frame's work in
   * this component.
   */
  useEffect(() => {
    const parent = container.current?.closest('.mode-plan, .mode-setup, .mode-field')
    if (parent === null || parent === undefined) return
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      // One bump per frame, after layout, so rects are read settled.
      frame = requestAnimationFrame(() => setChromeTick((tick) => tick + 1))
    })
    observer.observe(parent, { childList: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

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
