import * as maplibregl from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  axisLine,
  bearingLineEnd,
  destinationPoint,
  toPosition,
  type LatLon,
} from '../core/geo.ts'
import { GOES_ATTRIBUTION, goesBandFor, GOES_MAX_TILE_ZOOM } from '../core/goes.ts'
import { classificationOf } from '../core/lighting.ts'
import { goesTileUrl } from '../lib/goesLayer.ts'
import {
  COLD_START_VIEW,
  labelDistances,
  FRAME_VENUE_BELOW_ZOOM,
  steppedBearingLineMeters,
  VENUE_ZOOM,
  viewportSpanMeters,
  type ViewportBounds,
} from '../core/viewport.ts'
import { fitLongEdge, resolveCaptureLongEdge } from '../core/capture.ts'
import type { SunArc } from '../core/sun.ts'
import type { PlannedPosition } from '../lib/plan.ts'
import type { MapBounds } from '../lib/planRequest.ts'
import {
  centredRect,
  isClear,
  overlaps,
  pad,
  slideOrder,
  type Rect,
} from '../core/labelPlacement.ts'
import { cellPolygon, type ForecastCell } from '../core/cloudGrid.ts'
import {
  appLayerIdsIn,
  CLOUD_FORECAST_SOURCE,
  CONE_SOURCE,
  FOOTPRINT_SOURCE,
  GOES_SOURCE,
  PILOT_SOURCE,
  RADIUS_SOURCE,
  RAY_SOURCE,
  SUN_SOURCE,
} from '../lib/captureLayers.ts'
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

/*
 * The sun line and the four rays used to be 1200m and 900m.
 *
 * A bearing has no length, so a fixed one is wrong at every zoom but the one
 * it was chosen at. Measured on the real map at 390x844, the sun ray was 15px
 * long at zoom 10 and 15,393px at zoom 20. Their length now comes from the
 * viewport, through src/core/viewport.ts.
 */
/*
 * The label distances used to be `span * 0.28` clamped between 50m and 700m,
 * and both clamps broke it: 11.7px from the pin at zoom 10 and 854px at zoom
 * 20, against an intended constant 109px. They are fractions of the span in
 * src/core/viewport.ts now, which is what makes them a constant number of
 * pixels at every zoom.
 */

/*
 * How far along the ray to step while looking for a clear spot, as a fraction
 * of the preferred distance. Small enough that a label rarely has to travel
 * far, large enough that the search is a handful of tries rather than a scan.
 */
const LABEL_SLIDE_FRACTION = 0.12

/** A breathing gap around every piece of floating chrome, in CSS pixels. */
const LABEL_CLEARANCE_PX = 6

/**
 * How much of a position's disc a warning word may cover before it is hidden.
 *
 * Square pixels, and not zero: a word is anchored directly above its OWN disc,
 * so a sliver of shared edge is the normal case and only a real overlap means
 * it is sitting on a neighbour's number.
 */
const FLAG_DISC_OVERLAP_PX = 24


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
  '.plat',
  '.newbuild',
  '.tapnote',
  '.locate',
  '.skykey',
  /*
   * MAPLIBRE'S OWN CONTROL CORNERS, which were the whole complaint and were
   * never in this list.
   *
   * The scale bar and the attribution (i) are added to 'bottom-left', so that
   * corner has had two pieces of chrome in it since those controls went in,
   * and the placement code could not see either of them. The one corner the
   * readouts were reported stacking in was the one corner nothing was
   * reserving. All four corners are listed rather than just the one, because
   * a control moved to a different corner later would otherwise reintroduce
   * exactly this.
   */
  '.maplibregl-ctrl-top-left',
  '.maplibregl-ctrl-top-right',
  '.maplibregl-ctrl-bottom-left',
  '.maplibregl-ctrl-bottom-right',
].join(', ')
/** How long a press has to be held before it drops a pin. */
const LONG_PRESS_MS = 550

/**
 * THE ONE CAPTURE PATH, AND IT CAPTURES IMAGERY ONLY.
 *
 * WHAT WENT WRONG. `capture()` read the WebGL canvas, and the WebGL canvas holds
 * every layer this app draws as well as the satellite tiles. So every generate
 * since captures began has sent the model a photograph with our own annotations
 * burned into it: a full height dashed sun axis through the subject, the sun and
 * shadow rays, and the translucent cone of any isolated position. The model was
 * then asked to read terrain off it, and told the image was a satellite view.
 *
 * Markers are not affected and never were: pins, shooter figures and ray labels
 * are DOM elements positioned over the canvas, not pixels inside it.
 *
 * Hidden, redrawn synchronously, encoded, then restored in a `finally` so a
 * failed encode cannot leave the map blank. The two redraws happen inside one
 * task, so nothing is painted in between and there is no flicker.
 */
function captureImageryOnly(instance: maplibregl.Map): string {
  const hidden: string[] = []
  try {
    for (const id of appLayerIdsIn(instance.getStyle()?.layers ?? [])) {
      if (instance.getLayoutProperty(id, 'visibility') === 'none') continue
      instance.setLayoutProperty(id, 'visibility', 'none')
      hidden.push(id)
    }
    instance.redraw()
    return encodeCanvas(instance.getCanvas())
  } finally {
    for (const id of hidden) instance.setLayoutProperty(id, 'visibility', 'visible')
    if (hidden.length > 0) instance.redraw()
  }
}

/**
 * What a tap on the map does.
 *
 * ONE PIN AND ONE KIND OF TAP. There used to be a 'venue' mode and a 'subject'
 * mode, which put two near-identical white marks a few metres apart and asked
 * the shooter to know which was which. The pin is the thing being shot and
 * positions are where you shoot from; there is nothing else to move.
 */
/**
 * What the next tap on the map does.
 *
 * Both arming modes disarm themselves after one tap. A mode that stays on is a
 * mode you forget you are in and then wonder why the map stopped behaving.
 */
export type TapMode = 'add' | 'pilot' | null

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
  mode: TapMode
  /** Every position, drawn as a marker. */
  plan: PlannedPosition[]
  /** The subset whose cones are drawn. Filtering lives in App. */
  conePlan: PlannedPosition[]
  /**
   * Where the pilot is standing. Null until it is placed.
   *
   * Drawn as a marker with a dashed line to every air position. It is a
   * measured separation, not a statement that the flight is permitted.
   */
  pilotAt?: LatLon | null
  /** Dragged the pilot marker. */
  onPilotMove?: (at: LatLon) => void
  onPositionMove: (id: string, next: LatLon) => void
  /** Long press drops the venue if it is unset, otherwise the subject. */
  onLongPress: (at: LatLon) => void
  /** Where to drop a position, when the map is armed to place one. */
  onAddAt?: (at: LatLon) => void
  sunAzimuth: number | null
  /**
   * The sun's altitude, for choosing the GOES band.
   *
   * Separate from sunOverlay because the sky layer is useful with the sun
   * overlay switched off: the cloud is the subject, not the bearings.
   */
  sunAltitude?: number | null
  /**
   * Show the GOES-19 cloud layer over the imagery.
   *
   * The BAND is not a prop: it is chosen from the altitude above in
   * src/core/goes.ts, because visible light is black before sunrise and that
   * is when this app is used most.
   */
  showSky?: boolean
  /**
   * The GOES frame to show, or null when the scrubber is in the future.
   *
   * Null is what switches the satellite off and the forecast grid on. There is
   * no satellite image of the future and the layer must not pretend otherwise.
   */
  skyFrameAt?: Date | null
  /** The forecast cloud cells, empty unless the scrubber is in the future. */
  skyForecast?: readonly ForecastCell[]
  /** How solid to draw them, which falls with how far ahead they are. */
  skyForecastOpacity?: number
  /**
   * The camera's zoom and the map's width in CSS pixels, whenever either moves.
   *
   * The sky layer's zoom warning depends on how many SCREEN pixels one
   * satellite pixel covers, so it needs the real width rather than an assumed
   * phone. Reported from here because the map is the only thing that knows.
   */
  onViewChange?: (zoom: number, widthPx: number) => void
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
    /*
     * Only positions that HAVE a cone. plan.ts gives a top-down and a 360 an
     * empty one, because a cone is a claim about a direction and neither has
     * one. An empty polygon would be a feature with no coordinates rather than
     * no feature, which is the sort of thing that renders as a stray point.
     */
    features: plan
      .filter((p) => p.cone.length > 0)
      .map((p) => ({
        type: 'Feature' as const,
        // Every value here came out of src/core. None of it is asserted.
        properties: {
          id: p.position.id,
          /*
           * Only framed positions reach here: a cone is a claim about a
           * direction, and the other two shot types have none, so plan.ts
           * gives them an empty cone and the filter above drops them. The
           * lighting class is therefore always present.
           */
          lighting: classificationOf(p.read),
          hFOV: p.fov.hFOV,
          platform: p.position.platform,
        },
        geometry: { type: 'Polygon' as const, coordinates: p.cone },
      })),
  }
}

/**
 * The forecast cloud grid, as coarse squares.
 *
 * One feature per cell, carrying its cover so the paint expression can shade
 * it. A cell the forecast did not cover is DROPPED rather than drawn at zero:
 * an unshaded square would read as clear sky.
 */
function cloudForecastCollection(cells: readonly ForecastCell[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cells
      .filter((cell) => cell.cover !== null)
      .map((cell) => ({
        type: 'Feature' as const,
        properties: { cover: cell.cover },
        geometry: { type: 'Polygon' as const, coordinates: cellPolygon(cell.at) },
      })),
  }
}

/**
 * WHAT A TOP-DOWN AND A 360 SEE.
 *
 * Three kinds of feature in one source, told apart by a `kind` property so one
 * layer per kind can filter on it: the ground rectangle a nadir frame covers,
 * the shadow direction across that rectangle, and the horizon ring of a 360
 * with a tick where the sun is.
 *
 * NONE OF THEM IS A CONE, which is the point. A cone is a claim about a
 * direction and neither shot type has one. All of the geometry comes out of
 * src/core/footprint.ts; nothing here computes a coordinate.
 */
function footprintCollection(plan: PlannedPosition[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []

  for (const p of plan) {
    const draw = p.footprint
    if (draw === null) continue

    if (draw.shotType === 'top-down') {
      if (draw.rect.length > 0) {
        features.push({
          type: 'Feature',
          properties: { kind: 'rect', id: p.position.id },
          geometry: { type: 'Polygon', coordinates: draw.rect },
        })
      }
      if (draw.shadow.length > 0) {
        features.push({
          type: 'Feature',
          properties: { kind: 'shadow', id: p.position.id },
          geometry: { type: 'LineString', coordinates: draw.shadow },
        })
      }
      continue
    }

    if (draw.ring.length > 0) {
      features.push({
        type: 'Feature',
        properties: { kind: 'ring', id: p.position.id },
        geometry: { type: 'LineString', coordinates: draw.ring },
      })
    }
    if (draw.sunTick.length > 0) {
      features.push({
        type: 'Feature',
        properties: { kind: 'suntick', id: p.position.id },
        geometry: { type: 'LineString', coordinates: draw.sunTick },
      })
    }
  }

  return { type: 'FeatureCollection', features }
}

/**
 * The line from the pilot to each air position.
 *
 * ONE PILOT, SEVERAL AIRCRAFT POSITIONS. The pilot stands in one place and the
 * aircraft moves between hover points, so there is one line per air position
 * rather than one line. Ground positions get none: there is nothing to measure.
 */
function pilotCollection(
  pilot: LatLon | null,
  plan: PlannedPosition[],
): GeoJSON.FeatureCollection {
  if (pilot === null) return emptyCollection()
  const air = plan.filter((p) => p.position.platform === 'air')
  if (air.length === 0) return emptyCollection()
  return {
    type: 'FeatureCollection',
    features: air.map((p) => ({
      type: 'Feature',
      properties: { id: p.position.id, number: p.position.number },
      geometry: {
        type: 'LineString',
        coordinates: [toPosition(pilot), toPosition(p.position.at)],
      },
    })),
  }
}

/** What the map reports visible, in the shape src/core/viewport.ts takes. */
function boundsOf(instance: maplibregl.Map): ViewportBounds {
  const b = instance.getBounds()
  return { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() }
}

function sunCollection(
  pin: LatLon | null,
  azimuth: number | null,
  halfLengthMeters: number,
): GeoJSON.FeatureCollection {
  if (pin === null || azimuth === null) return emptyCollection()
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { azimuth },
        geometry: {
          type: 'LineString',
          coordinates: axisLine(pin, azimuth, halfLengthMeters),
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
  lengthMeters: number,
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
        /*
         * A rhumb point, not destinationPoint. A ray shows a compass
         * direction, and the map draws this two point line as a straight
         * segment, which in Mercator IS the constant bearing line. See
         * src/core/geo.ts.
         */
        coordinates: [
          toPosition(venue),
          toPosition(bearingLineEnd(venue, ray.bearing, lengthMeters)),
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
  mode,
  plan,
  conePlan,
  onPositionMove,
  onLongPress,
  onAddAt,
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
  sunAltitude = null,
  showSky = false,
  skyFrameAt = null,
  skyForecast = [],
  skyForecastOpacity = 0.5,
  onViewChange,
  pilotAt = null,
  onPilotMove,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const venueMarker = useRef<maplibregl.Marker | null>(null)
  const hintMarker = useRef<maplibregl.Marker | null>(null)
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
    onSelect,
    onPositionMove,
    onPitchChange,
    onLongPress,
    onPinDrag,
    onAddAt,
    onPilotMove,
  })
  useEffect(() => {
    latest.current = {
      mode,
      onVenueChange,
        onSelect,
      onPositionMove,
      onPitchChange,
      onLongPress,
      onPinDrag,
      onAddAt,
      onPilotMove,
    }
  }, [
    mode,
    onVenueChange,
    onSelect,
    onPositionMove,
    onPitchChange,
    onLongPress,
    onPinDrag,
    onAddAt,
    onPilotMove,
  ])

  /* Read through a ref so a handler bound once at build stays current. */
  const latestView = useRef(onViewChange)
  latestView.current = onViewChange

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
      /*
       * NO PIN, NO PLACE. The map opens on a wide view that is asking rather
       * than answering; see COLD_START_VIEW. It used to open at zoom 16.5 on
       * the calibration venue in Salisbury Maryland, which told every new user
       * they were standing in a particular car park on the Eastern Shore.
       */
      center: venue === null ? COLD_START_VIEW.center : [venue.lon, venue.lat],
      zoom: venue === null ? COLD_START_VIEW.zoom : VENUE_ZOOM,
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
      if (target?.closest('.shooter-host, .pin, .ray-label') != null) return

      const next = { lat: event.lngLat.lat, lon: event.lngLat.lng }
      if (l.mode === 'add') {
        l.onAddAt?.(next)
      } else if (l.mode === 'pilot') {
        l.onPilotMove?.(next)
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
    /*
     * Zoom and width, on every move rather than on moveend: the sky layer's
     * warning should appear while a pinch is still happening, not a beat after
     * it stops.
     */
    const reportView = () => {
      latestView.current?.(instance.getZoom(), instance.getCanvas().clientWidth)
    }
    instance.on('move', reportView)
    instance.once('load', reportView)

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

      /*
       * THE SKY, UNDER EVERYTHING THIS APP DRAWS.
       *
       * Added first so it sits directly on the satellite imagery and beneath
       * every cone, ray and marker: it is weather over the ground, not an
       * annotation, and a cloud layer on top of the plan would hide the plan.
       *
       * Both bands get a source, so switching between them at dawn is a
       * visibility change rather than a source swap that drops the tiles and
       * refetches. Neither is visible until asked for.
       */
      for (const band of ['visible', 'infrared'] as const) {
        instance.addSource(`${GOES_SOURCE}-${band}`, {
          type: 'raster',
          tiles: [goesTileUrl(band)],
          tileSize: 256,
          /*
           * MAXZOOM IS WHAT GIBS ACTUALLY SERVES: level 6 for infrared and 7
           * for visible, from its own tile matrix set names. Without it
           * maplibre requests tiles that do not exist and gets nothing at all
           * close in, instead of stretching the deepest ones it has.
           */
          maxzoom: GOES_MAX_TILE_ZOOM[band],
          attribution: GOES_ATTRIBUTION,
        })
        instance.addLayer({
          id: `${GOES_SOURCE}-${band}`,
          type: 'raster',
          source: `${GOES_SOURCE}-${band}`,
          layout: { visibility: 'none' },
          /*
           * Partly transparent, because the point is cloud OVER a place you
           * recognise. An opaque satellite image of cloud is a weather map,
           * and this app already has a map.
           */
          paint: { 'raster-opacity': 0.55 },
        })
      }

      /*
       * The forecast grid sits with the satellite, under everything this app
       * draws, because it is weather over the ground rather than annotation.
       */
      instance.addSource(CLOUD_FORECAST_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addLayer({
        id: 'cloud-forecast-fill',
        type: 'fill',
        source: CLOUD_FORECAST_SOURCE,
        layout: { visibility: 'none' },
        paint: {
          /*
           * Plain white cloud over the imagery, and hard edged: the squares
           * ARE the signal that this is a model and not a photograph.
           */
          'fill-color': readToken('--white', '#ffffff', container.current),
          'fill-opacity': 0,
          'fill-outline-color': readToken('--color-accent-2', '#c9a227', container.current),
        },
      })

      instance.addSource(RADIUS_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(CONE_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(SUN_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(RAY_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(PILOT_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(FOOTPRINT_SOURCE, { type: 'geojson', data: emptyCollection() })

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

      /*
       * THE PILOT LINE. Where the pilot is standing, to where the aircraft is.
       *
       * Dashed, like the air cone, because it is not something on the ground
       * you can walk along. It is a MEASURED SEPARATION and nothing more: it
       * does not say the aircraft can be seen from there, and it does not say
       * a flight is permitted. The length is printed on the card.
       *
       * The secondary accent, not red. Red is hazard in this app and a measured
       * distance is not a hazard.
       */
      /*
       * THE NADIR FOOTPRINT: a rectangle, not a cone.
       *
       * Faint fill and a hard edge, in the same lighting colour the cones use,
       * because it is the same kind of fact: this is what the frame contains.
       * Square corners on purpose, since that is literally what the sensor
       * lays on the ground.
       */
      instance.addLayer({
        id: 'footprint-fill',
        type: 'fill',
        source: FOOTPRINT_SOURCE,
        filter: ['==', ['get', 'kind'], 'rect'],
        paint: { 'fill-color': lighting, 'fill-opacity': 0.16 },
      })
      instance.addLayer({
        id: 'footprint-line',
        type: 'line',
        source: FOOTPRINT_SOURCE,
        filter: ['==', ['get', 'kind'], 'rect'],
        paint: { 'line-color': lighting, 'line-width': 1.5, 'line-opacity': 0.95 },
      })

      /*
       * THE SHADOW DIRECTION ACROSS THE FRAME. The whole reason the yaw is
       * adjustable: you line the frame up with the shadows by eye against
       * this. Drawn in the shadow colour, which is what the sun axis already
       * uses, so the two read as the same fact.
       */
      instance.addLayer({
        id: 'footprint-shadow',
        type: 'line',
        source: FOOTPRINT_SOURCE,
        filter: ['==', ['get', 'kind'], 'shadow'],
        paint: {
          'line-color': readToken('--sun-shadow', '#8b8f7a', container.current),
          'line-width': 2,
          'line-dasharray': [2, 2],
          'line-opacity': 0.95,
        },
      })

      /*
       * THE HORIZON RING OF A 360, at the distance the horizon actually sits:
       * about 28km at 200ft. A line, not a fill, because it is the edge of
       * what the shot contains rather than an area it covers.
       */
      instance.addLayer({
        id: 'footprint-ring',
        type: 'line',
        source: FOOTPRINT_SOURCE,
        filter: ['==', ['get', 'kind'], 'ring'],
        paint: {
          'line-color': readToken('--color-accent-2', '#c9a227', container.current),
          'line-width': 1.5,
          'line-dasharray': [6, 4],
          'line-opacity': 0.9,
        },
      })
      /* Where the sun sits on that ring. The sun's own colour, not the ring's. */
      instance.addLayer({
        id: 'footprint-suntick',
        type: 'line',
        source: FOOTPRINT_SOURCE,
        filter: ['==', ['get', 'kind'], 'suntick'],
        paint: {
          'line-color': readToken('--sun', '#f2c14e', container.current),
          'line-width': 4,
          'line-opacity': 1,
        },
      })

      instance.addLayer({
        id: 'pilot-line-casing',
        type: 'line',
        source: PILOT_SOURCE,
        paint: {
          'line-color': readToken('--mark-edge'),
          'line-width': 5,
          'line-opacity': 0.3,
        },
      })
      instance.addLayer({
        id: 'pilot-line',
        type: 'line',
        source: PILOT_SOURCE,
        paint: {
          'line-color': readToken('--color-accent-2', '#c9a227', container.current),
          'line-width': 2,
          'line-dasharray': [4, 3],
          'line-opacity': 0.95,
        },
      })

      setReady(true)
    })

    map.current = instance

    /*
     * A TEST SEAM, and a deliberately narrow one.
     *
     * Projection bugs have shipped three times in this repo and each was found
     * by eye rather than by a check. They cannot be caught from the outside:
     * a marker in the wrong place looks identical to a marker in the right
     * place on a map that has since panned, which is exactly what confounded
     * the first attempt to measure this one.
     *
     * So with ?probe=1 the map instance is reachable and
     * scripts/audit-projection.mjs can assert the round trips directly. Absent
     * otherwise, including in production, where the query string is not set.
     */
    if (new URLSearchParams(window.location.search).get('probe') === '1') {
      ;(window as unknown as { __probe?: unknown }).__probe = { map: instance }
    }

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
       * and it is why the venue pin and the shooter figures were invisible in
       * dev while working in a production build.
       *
       * ANY NEW MARKER REF BELONGS IN THIS LIST. The first-run pin hint was
       * added without it and was invisible in dev for exactly this reason,
       * creating itself against the first map and then updating an orphan.
       */
      venueMarker.current = null
      hintMarker.current = null
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
          // Imagery only. See captureImageryOnly for what used to leak.
          dataUrl: captureImageryOnly(instance),
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
      /*
       * Coming off the wide cold start view, the centre on its own is not
       * enough: the venue would be a dot in the middle of an ocean. Above the
       * threshold the zoom is the user's and is left alone.
       */
      const tooWide = instance.getZoom() < FRAME_VENUE_BELOW_ZOOM
      instance.easeTo({
        center: [venue.lon, venue.lat],
        ...(tooWide ? { zoom: VENUE_ZOOM } : {}),
        duration: 600,
      })
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

  /* --------------------------------------------------- cones and sun line */
  useEffect(() => {
    if (map.current === null || !ready) return
    const cones = map.current.getSource(CONE_SOURCE) as maplibregl.GeoJSONSource | undefined
    cones?.setData(coneCollection(conePlan))
  }, [conePlan, ready])

  /*
   * THE PILOT MARKER. Draggable, like the venue pin, because where you stand
   * is a decision made by looking at the site rather than by typing.
   */
  const pilotMarker = useRef<maplibregl.Marker | null>(null)
  useEffect(() => {
    const instance = map.current
    if (instance === null) return
    if (pilotAt === null) {
      pilotMarker.current?.remove()
      pilotMarker.current = null
      return
    }
    if (pilotMarker.current === null) {
      const el = makeMarkerElement('pin pin--pilot')
      el.textContent = 'P'
      el.title = 'Pilot position'
      const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' })
      marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat()
        latest.current.onPilotMove?.({ lat, lon: lng })
      })
      marker.setLngLat([pilotAt.lon, pilotAt.lat]).addTo(instance)
      pilotMarker.current = marker
    } else {
      pilotMarker.current.setLngLat([pilotAt.lon, pilotAt.lat])
    }
  }, [pilotAt])

  /*
   * The footprints and rings. Driven by the same conePlan the cones are, so
   * the one control that reveals shapes reveals all of them.
   */
  useEffect(() => {
    if (map.current === null || !ready) return
    const source = map.current.getSource(FOOTPRINT_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined
    source?.setData(footprintCollection(conePlan))
  }, [conePlan, ready])

  /*
   * The pilot lines. Sized from real coordinates, so unlike the bearing lines
   * they have a length of their own and do not care about the viewport.
   */
  useEffect(() => {
    if (map.current === null || !ready) return
    const links = map.current.getSource(PILOT_SOURCE) as maplibregl.GeoJSONSource | undefined
    links?.setData(pilotCollection(pilotAt, plan))
  }, [pilotAt, plan, ready])

  /*
   * THE SKY LAYER, AND WHICH BAND OF IT.
   *
   * The band follows the sun rather than a setting: visible light is black
   * before sunrise, which is exactly when a backlit cloud shoot happens, so
   * leaving a shooter to remember the switch is how somebody stares at a black
   * rectangle at 05:40 and concludes it is broken. src/core/goes.ts decides.
   */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    const wanted = sunAltitude === null ? 'infrared' : goesBandFor(sunAltitude)

    /*
     * THE SATELLITE SHOWS ONLY PAST AND NOW. There is no GOES frame of the
     * future, so when the scrubber goes past now both bands go dark and the
     * forecast grid below takes over. Never both: a model result under a
     * caption that says observed is the failure this whole split exists to
     * avoid.
     */
    const satellite = showSky && skyFrameAt !== null

    for (const band of ['visible', 'infrared'] as const) {
      const id = `${GOES_SOURCE}-${band}`
      instance.setLayoutProperty(
        id,
        'visibility',
        satellite && band === wanted ? 'visible' : 'none',
      )
    }

    /*
     * RETILED FOR THE FRAME, which is what makes the scrub animate. maplibre
     * has no public API for changing a raster source's tile template, so the
     * source's own tiles array is replaced and its cache cleared through the
     * documented setTiles where available, falling back to removing and
     * re-adding the source.
     */
    if (!satellite || skyFrameAt === null) return
    const source = instance.getSource(`${GOES_SOURCE}-${wanted}`) as
      | (maplibregl.RasterTileSource & { setTiles?: (tiles: string[]) => void })
      | undefined
    source?.setTiles?.([goesTileUrl(wanted, skyFrameAt)])
  }, [showSky, sunAltitude, skyFrameAt, ready])

  /*
   * THE FORECAST GRID, which is what the future looks like.
   *
   * Coarse squares on purpose: the satellite layer is a photograph and this is
   * a model, and they must not be mistakable at a glance. Hard edges beside
   * real imagery is the difference, visible before any label is read. The
   * opacity comes from how far ahead it is, so a forecast a week out is drawn
   * faint and one past a week is not drawn at all.
   */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    const source = instance.getSource(CLOUD_FORECAST_SOURCE) as
      | maplibregl.GeoJSONSource
      | undefined
    source?.setData(cloudForecastCollection(skyForecast))
    instance.setLayoutProperty(
      'cloud-forecast-fill',
      'visibility',
      showSky && skyForecast.length > 0 ? 'visible' : 'none',
    )
    instance.setPaintProperty('cloud-forecast-fill', 'fill-opacity', [
      'min',
      ['*', ['get', 'cover'], 0.01, skyForecastOpacity],
      skyForecastOpacity,
    ])
  }, [showSky, skyForecast, skyForecastOpacity, ready])

  /*
   * THE SUN LINE AND THE RAYS, SIZED TO THE VIEWPORT.
   *
   * Their length is not a constant, so it cannot live in a dependency array:
   * it changes as the camera moves. It is also not React state, because the
   * camera moves every frame of a pinch and re-rendering this component sixty
   * times a second to redraw four two point lines would be absurd.
   *
   * So the inputs are held in a ref and the drawing is a function the map's
   * own `move` event calls directly. The length is stepped to a power of two
   * (src/core/viewport.ts), so the sources are actually written a handful of
   * times per gesture rather than once per frame, and the comparison below is
   * what skips the rest.
   */
  const bearingInputs = useRef({ venue, sunAzimuth, sunOverlay, showSun, showArc })
  bearingInputs.current = { venue, sunAzimuth, sunOverlay, showSun, showArc }
  const bearingLengthDrawn = useRef(0)

  const drawBearingLines = useCallback((instance: maplibregl.Map, force: boolean) => {
    const input = bearingInputs.current
    /*
     * No pin, no bearing to draw from. Length still has to be reset, or the
     * next pin inherits the length of a frame it was never measured against.
     */
    if (input.venue === null) {
      if (!force) return
      bearingLengthDrawn.current = 0
    }
    const length =
      input.venue === null
        ? 0
        : steppedBearingLineMeters(input.venue, boundsOf(instance))
    if (!force && length === bearingLengthDrawn.current) return
    bearingLengthDrawn.current = length

    const sun = instance.getSource(SUN_SOURCE) as maplibregl.GeoJSONSource | undefined
    sun?.setData(sunCollection(input.venue, input.sunAzimuth, length))
    const rays = instance.getSource(RAY_SOURCE) as maplibregl.GeoJSONSource | undefined
    rays?.setData(
      rayCollection(input.venue, input.sunOverlay, input.showSun, input.showArc, length),
    )
  }, [])

  /* The inputs changed, so redraw whatever the camera happens to be showing. */
  useEffect(() => {
    if (map.current === null || !ready) return
    drawBearingLines(map.current, true)
  }, [venue, sunAzimuth, sunOverlay, showSun, showArc, ready, drawBearingLines])

  /* And the camera changed, so re-length them. */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    const onMove = () => drawBearingLines(instance, false)
    instance.on('move', onMove)
    return () => {
      instance.off('move', onMove)
    }
  }, [ready, drawBearingLines])

  /*
   * WARNING WORDS THAT WOULD BE UNREADABLE ARE HIDDEN, NOT SHRUNK.
   *
   * A word is wider than the "!" it replaced, so zoomed out far enough the
   * words of neighbouring positions overlap each other and each other's
   * numbers. Measured by scripts/audit-labels.mjs with three flagged positions
   * at zoom 11 and 13: three word-on-word collisions and two words covering a
   * neighbour's disc.
   *
   * The rule is the one the ray readouts already follow: show it where it can
   * be read, hide it where it cannot, and never show it wrong. What survives a
   * hidden word is the marker's own magenta colouring, which still says
   * something is wrong here, and the full phrase on the card, which still says
   * what. Nothing is lost that was not already unreadable.
   *
   * First come, first served, in document order, so the result is stable
   * across a pan rather than flickering between equally valid choices.
   *
   * DECLARED BEFORE THE RAY LABEL EFFECT ON PURPOSE. Effects run in
   * declaration order, and the ray readouts treat these flags as obstacles, so
   * the flags have to settle first or the readouts place themselves against
   * last pass's layout. Measured: with the order the other way round a shadow
   * readout landed on a "wide" flag at zoom 15. The dependency is one way,
   * because a flag's position is fixed and only the readouts move.
   */
  useEffect(() => {
    const flags = [...document.querySelectorAll<HTMLElement>('.shooter__flag')]
    if (flags.length === 0) return

    /*
     * Shown first, so a flag hidden on the last pass can be measured on this
     * one. `display`, not `visibility`: getBoundingClientRect still returns a
     * full box for a visibility-hidden element, so the collision pass below
     * and the audit would both keep seeing a word nobody can read.
     */
    for (const flag of flags) flag.style.display = ''

    const discs = [...document.querySelectorAll('.shooter__disc')].map((node) => {
      const r = node.getBoundingClientRect()
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    })

    const kept: Rect[] = []
    for (const flag of flags) {
      const r = flag.getBoundingClientRect()
      const box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom }

      /*
       * Its OWN disc sits directly underneath by design, so a disc only counts
       * as covered when the shared area is more than a sliver.
       */
      const coversADisc = discs.some((disc) => {
        if (!overlaps(box, disc)) return false
        const w = Math.min(box.right, disc.right) - Math.max(box.left, disc.left)
        const h = Math.min(box.bottom, disc.bottom) - Math.max(box.top, disc.top)
        return w * h > FLAG_DISC_OVERLAP_PX
      })

      if (coversADisc || kept.some((other) => overlaps(box, other))) {
        flag.style.display = 'none'
        continue
      }
      kept.push(box)
    }
  }, [plan, viewTick, chromeTick, figureEls])

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
    const spanMeters = viewportSpanMeters(boundsOf(instance))
    const distances_ = labelDistances(spanMeters)
    const labelMeters = distances_.preferredMeters

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
    /*
     * THE PIN IS AN OBSTACLE TOO.
     *
     * A readout printed over the venue pin hides the one mark on the map that
     * says where the venue is, and the labels all radiate FROM that pin, so
     * the shortest candidate distance puts them straight on top of it. Found
     * by scripts/audit-labels.mjs with the pin near the top-left of the view,
     * where two readouts landed on it and on each other.
     */
    /*
     * AND THE WARNING WORDS ON THE MARKERS.
     *
     * A readout can slide along its own ray; a warning word cannot move at
     * all, because it belongs to the marker underneath it and detaching it
     * from that marker would make it meaningless. So the fixed thing is the
     * obstacle and the movable thing moves. Measured by
     * scripts/audit-labels.mjs with three flagged positions, which found the
     * shadow readout sitting on top of a "wide" flag.
     */
    const obstacles: Rect[] = [
      ...document.querySelectorAll(`${FLOATING_CHROME}, .pin, .shooter__flag`),
    ]
      .map((node) => node.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) =>
        pad({ left: box.left, top: box.top, right: box.right, bottom: box.bottom },
          LABEL_CLEARANCE_PX),
      )

    const distances = slideOrder(
      labelMeters,
      distances_.minMeters,
      distances_.maxMeters,
      Math.max(1, labelMeters * LABEL_SLIDE_FRACTION),
    )

    /** Where the labels placed so far ended up, so the next one avoids them. */
    const takenBoxes: Rect[] = []

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
      let placedBox: Rect | null = null
      for (const meters of distances) {
        const candidate = destinationPoint(venue, label.bearing, meters)
        const point = instance.project([candidate.lon, candidate.lat])
        const box = centredRect(
          canvas.left + point.x,
          canvas.top + point.y,
          size.width,
          size.height,
        )
        /*
         * AND AGAINST THE LABELS ALREADY PLACED. Two readouts in one place is
         * one unreadable readout, and at a wide zoom the rays converge enough
         * that Shadow, Rise and Set all wanted the same spot. Measured by the
         * audit at zoom 12: three overlaps at once.
         */
        if (isClear(box, [...obstacles, ...takenBoxes], viewport)) {
          placed = candidate
          placedBox = box
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
      if (placedBox !== null) takenBoxes.push(placedBox)
      rayLabels.current.push(marker)
    }
  }, [venue, sunOverlay, showSun, showArc, viewTick, chromeTick, bottomInset])

  /*
   * KEEP THE CANVAS THE SIZE OF ITS BOX.
   *
   * THE BUG THIS FIXES. Every map container in this app is ultimately sized in
   * dvh: SETUP's map is `clamp(300px, 52dvh, 560px)` and PLAN and FIELD fill a
   * shell that is `100dvh`. `dvh` is the DYNAMIC viewport, so it recalculates
   * the moment Safari's bars collapse or appear. The container changes height
   * at runtime, with no reload and no window resize, and a WebGL canvas that is
   * not told about it keeps whatever size it had: imagery across the top, black
   * underneath, exactly as far down as the container used to end.
   *
   * MapLibre does run its own ResizeObserver on the container, which is why
   * this never reproduced in a desktop browser. What it does NOT do is listen
   * to `visualViewport` — there is not one reference to it in the shipped
   * bundle — and on iOS that is the event that actually fires when the bars
   * animate away, while ResizeObserver callbacks are deferred during the
   * scroll that triggered them.
   *
   * So all three signals are wired, and all three funnel into one rAF so a
   * burst cannot cost more than a single resize per frame:
   *
   *   ResizeObserver   the container's own box, whatever changed it
   *   visualViewport   the bars collapsing, and the keyboard opening
   *   orientation      a rotation, which changes both at once
   *
   * It lives here rather than in a mode, so SETUP, PLAN and FIELD all get it.
   */
  useEffect(() => {
    const node = container.current
    if (node === null) return

    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      // After layout, so the box being measured is the settled one.
      frame = requestAnimationFrame(() => map.current?.resize())
    }

    const observer = new ResizeObserver(resize)
    observer.observe(node)

    window.addEventListener('orientationchange', resize)
    const visual = window.visualViewport
    visual?.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('orientationchange', resize)
      visual?.removeEventListener('resize', resize)
    }
  }, [])

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
   * this component. Size changes are caught by the ResizeObserver below
   * instead, which only watches the chrome itself and so never sees a marker.
   */
  useEffect(() => {
    const parent = container.current?.closest('.mode-plan, .mode-setup, .mode-field')
    if (parent === null || parent === undefined) return
    let frame = 0
    const bump = () => {
      cancelAnimationFrame(frame)
      // One bump per frame, after layout, so rects are read settled.
      frame = requestAnimationFrame(() => setChromeTick((tick) => tick + 1))
    }

    /*
     * AND WHEN A PIECE OF CHROME CHANGES SIZE, not only when one appears.
     *
     * The sheet does not appear, it GROWS: measured, opening it animates its
     * top edge from 508px to 192px over about 400ms. Its height reaches React
     * as state the moment the gesture ends, so the label effect re-ran once,
     * early, against a rect the animation had not finished moving, placed a
     * readout at y=263, and the sheet then rose to 192 and swallowed it. The
     * label was never re-placed because nothing had changed since.
     *
     * Found by scripts/audit-labels.mjs, which measures the real rectangles
     * with the sheet open. A ResizeObserver rather than a transitionend
     * listener, because the thing that matters is the size changing, whatever
     * moved it: a keyboard, a rotation, or a drag that never ends in a
     * transition at all.
     */
    const resize = new ResizeObserver(bump)
    const watchChrome = () => {
      resize.disconnect()
      for (const node of parent.querySelectorAll(FLOATING_CHROME)) resize.observe(node)
    }

    const observer = new MutationObserver(() => {
      // Chrome comes and goes, so what is being watched has to be re-read.
      watchChrome()
      bump()
    })
    observer.observe(parent, { childList: true })
    watchChrome()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      resize.disconnect()
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
            focalLength={planned.focalLength}
            opticName={planned.optic.name}
            classification={classificationOf(planned.read)}
            shotType={planned.position.shotType}
            warnings={planned.warnings}
            framingWarnings={planned.framingWarnings}
            frameSubjectRatio={planned.frameSubjectRatio}
            platform={planned.position.platform}
            altitudeFeet={planned.position.altitudeFeet}
            moved={planned.position.moved}
            origin={planned.position.origin}
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
