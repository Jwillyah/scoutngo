import { useNumerals } from '../lib/numeralsContext.ts'
import * as maplibregl from 'maplibre-gl'
import { loadTile, PROTOCOL, viaProtocol } from '../lib/offlineCache.ts'
import { RAY_SCREEN_FRACTION } from '../lib/rayLength.ts'
import { FLOATING_CHROME_SELECTORS, floatingChromeNodes } from '../lib/floatingChrome.ts'
import { IMAGERY_TEMPLATE, TERRAIN_TEMPLATE } from '../lib/offlineSources.ts'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SunInSky } from './SunInSky.tsx'
import { readSkyFrame, type SkyFrame } from '../lib/skyFrame.ts'
import { readHorizonProfile } from '../lib/horizonProfile.ts'
import type { HorizonInput } from '../core/skyWindow.ts'
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
  BEARING_LINE_MIN_METERS,
  viewportDiagonalMeters,
  VENUE_ZOOM,
  viewportSpanMeters,
  type ViewportBounds,
} from '../core/viewport.ts'
import { fitLongEdge, resolveCaptureLongEdge } from '../core/capture.ts'
import type { SunArc } from '../core/sun.ts'
import type { MoonArc } from '../core/moonArc.ts'
import { edgePoint } from '../core/edgePoint.ts'
import type { PlannedPosition } from '../lib/plan.ts'
import type { MapBounds } from '../lib/generation.ts'
import {
  centredRect,
  isClear,
  overlaps,
  pad,
  slideOrder,
  type Rect,
} from '../core/labelPlacement.ts'
import type { ForecastCell } from '../core/cloudGrid.ts'
import {
  appLayerIdsIn,
  CLOUD_FORECAST_SOURCE,
  CONE_SOURCE,
  FOOTPRINT_SOURCE,
  GOES_SOURCE,
  MARK_DRAFT_SOURCE,
  MARK_SOURCE,
  AIRSPACE_SOURCE,
  MEASURE_SOURCE,
  SHADOW_SOURCE,
  PILOT_SOURCE,
  RADIUS_SOURCE,
  RAY_SOURCE,
  SUN_SOURCE,
} from '../lib/captureLayers.ts'
import { markCollection, draftCollection } from '../lib/markLayer.ts'
import { cloudForecastCollection } from '../lib/skyLayerSource.ts'
import type { SkyLayerKind } from '../core/skyLayer.ts'
import { plateLabels } from '../core/mapLabel.ts'
import type { SiteMark } from '../core/siteMark.ts'
import { readToken } from '../lib/tokens.ts'
import type { AirspaceOverlay } from '../lib/airspaceOverlay.ts'
import { ShooterFigure } from './ShooterFigure.tsx'
import { CreditsSheet } from './MapCredits.tsx'
import { creditLines } from '../lib/mapCredits.ts'

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

/*
 * SAVED TILES FIRST, AND NEVER A HANG. Every imagery and terrain URL below
 * carries the scoutngo:// scheme, and this is what answers it. Registered once,
 * at module scope, because MapLibre keeps protocols globally. See
 * src/lib/offlineCache.ts.
 */
maplibregl.addProtocol(PROTOCOL, loadTile)

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
/*
 * THROUGH THE scoutngo:// PROTOCOL, so a saved tile is read from the device
 * and a dead network fails fast instead of hanging. The real template lives in
 * src/lib/offlineSources.ts, the one place the cache, the measuring script and
 * the map all read it from. See src/lib/offlineCache.ts.
 */
const ESRI_TILES = viaProtocol(IMAGERY_TEMPLATE)

/**
 * THE LAST ZOOM ESRI ACTUALLY HAS IMAGERY FOR, over rural ground.
 *
 * MEASURED, because the service's own declaration is wrong by four levels: it
 * advertises maxLOD 23 and at z20 returns a single shared "no data" tile. Big
 * Meadow and rural Nevada both come back as 2521 bytes, md5 f27d9de7f80c —
 * byte-identical, hundreds of miles apart, so neither is a photograph.
 * Manhattan still has real imagery at z20, so the limit is per-location.
 *
 * Declaring it here is what makes MapLibre SCALE the real z19 tile above this
 * zoom instead of requesting tiles that do not exist.
 *
 * Full table, both services, three locations, z14 to z20:
 *   measurements/2026-10-17-imagery-sources.md
 */
export const ESRI_NATIVE_MAX_ZOOM = 19


export const ESRI_ATTRIBUTION =
  'Tiles by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

/*
 * THE REFERENCE OVERLAYS: place names and roads, drawn ON TOP of the imagery.
 *
 * WHY THESE TWO SERVICES. They are Esri's own reference layers, published for
 * exactly this purpose by the same organisation as the World Imagery basemap
 * already in use, with no key and no account. Verified before being wired:
 * both answer 200, both are PNG32 with a real alpha channel (colour type 6,
 * so they composite rather than covering), both serve 256px tiles from zoom 0
 * to 23, and both send access-control-allow-origin: *.
 *
 * SAME {z}/{y}/{x} ORDERING as the basemap, row before column, which is
 * Esri's convention rather than the usual one.
 *
 * OFF BY DEFAULT. The clean image is the point when reading a venue: labels
 * sit exactly where the subject is and the shadows are. They are for the
 * other job, hunting for somewhere to shoot, where an unlabelled satellite
 * image is guesswork unless you already know the area.
 */
const ESRI_PLACES_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
const ESRI_ROADS_TILES =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'

export const ESRI_REFERENCE_ATTRIBUTION =
  'Reference layers by Esri, HERE, Garmin, and OpenStreetMap contributors'

/*
 * REAL ELEVATION, FROM AWS'S KEYLESS TERRARIUM TILES.
 *
 * WHY THIS SOURCE. MapLibre reads raster-dem natively and terrarium is one of
 * the two encodings it understands, so there is no decode step and no second
 * renderer. The tiles are public, keyless, and account-free, which is the same
 * bar every other source in this app has to clear.
 *
 * VERIFIED BEFORE BEING WIRED, by decoding three tiles and checking them
 * against elevations known independently:
 *
 *   Skyline Drive, Shenandoah    1027.4 m   (ridge, about 1000)
 *   Sandbridge beach                1.1 m   (sea level)
 *   Death Valley                  -79.0 m   (below sea level)
 *
 * The last one matters more than it looks: terrarium stores elevation as
 * (R * 256 + G + B / 256) - 32768, so a sign error reads Death Valley as
 * +32689 m and every ridge as a plateau. It decodes signed, correctly.
 *
 * THE TILES ARE 256 PIXELS, NOT 512, and this is the one that would have been
 * a silent bug: MapLibre's raster-dem default is tileSize 512. At the wrong
 * size the DEM is sampled at half scale, so every slope is wrong and nothing
 * on screen looks broken enough to notice. Measured, not assumed.
 *
 * {z}/{x}/{y}, standard XYZ, which is NOT the {z}/{y}/{x} the Esri imagery
 * above uses. Two sources, two orderings, both correct as written.
 */
const TERRAIN_SOURCE = 'terrain-dem'
/* Through the protocol too, for the same reason as ESRI_TILES. */
const TERRARIUM_TILES = viaProtocol(TERRAIN_TEMPLATE)

export const TERRAIN_ATTRIBUTION =
  'Elevation tiles by Mapzen and AWS Open Data, from SRTM, NED, and other public sources'

/**
 * No vertical exaggeration.
 *
 * 1.0 BECAUSE THE HEIGHTS ARE THE POINT. Every other value makes a prettier
 * picture of a lie: the whole reason for terrain here is that the sun goes
 * behind a ridge at the altitude it actually goes behind it, and an
 * exaggerated ridge moves that moment. A map that flatters Shenandoah is no
 * more use than a flat one.
 */
export const TERRAIN_EXAGGERATION = 1

/*
 * THERE IS NO ZOOM AT WHICH TERRAIN STOPS, AND THE OLD ONE WAS A MISTAKE.
 *
 * It used to suspend above zoom 15, reasoning that 15 is the DEM's own maxzoom
 * so there was no more detail to pay for. That is true about the DATA and
 * wrong about the USE: venue zoom is 17 to 19, so terrain never drew during
 * actual planning, which is the only time anybody wanted it. Reported from
 * Big Meadow and measured here at z17: terrain drawing = false.
 *
 * MapLibre overzooms DEM tiles perfectly well, and a coarse hillside is still
 * a hillside. Suspension is now about whether the DEVICE can hold a frame, not
 * about where the data runs out: see TERRAIN_SUSPEND_ON_GESTURE.
 */

export const BUILDING_SOURCE = 'osm-buildings'
export const BUILDING_LAYER = 'osm-buildings-extrusion'

/**
 * The zoom buildings start at.
 *
 * Below this a city is a grey smear and the Overpass query covers a box too
 * big to answer, so the layer stays empty rather than asking for something it
 * cannot draw.
 */
export const BUILDINGS_MIN_ZOOM = 15

/**
 * Put the map into the terrain state an image was taken in, and give back the
 * means to undo it.
 *
 * Both round trips do the same snap-there-and-back as they already do for the
 * camera, in one tick, so no frame is drawn in between.
 *
 * WHEN THE STATE ALREADY MATCHES THIS DOES NOTHING, which is the common case
 * and matters: setTerrain triggers a re-render of the whole tile pyramid, and
 * doing that twice per generate for no reason would be a visible stall.
 */
function withTerrain(
  instance: maplibregl.Map,
  wanted: boolean,
): { restore: () => void } {
  const current = instance.getTerrain() !== null && instance.getTerrain() !== undefined
  if (current === wanted) return { restore: () => {} }

  if (wanted) {
    if (instance.getSource(TERRAIN_SOURCE) === undefined) {
      /*
       * The image was taken with terrain on, but this session has never had
       * terrain enabled, so the DEM source does not exist. Nothing can be
       * restored and pretending otherwise would invert against the flat plane
       * while claiming it had not. The caller gets the flat answer, which is
       * at least the answer it would have got before terrain existed.
       */
      return { restore: () => {} }
    }
    instance.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION })
  } else {
    instance.setTerrain(null)
  }
  return {
    restore: () => {
      if (current) {
        instance.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION })
      } else {
        instance.setTerrain(null)
      }
    },
  }
}

export const LABEL_SOURCE_PLACES = 'esri-places'
export const LABEL_SOURCE_ROADS = 'esri-roads'
export const LABEL_LAYER_PLACES = 'esri-places-layer'
export const LABEL_LAYER_ROADS = 'esri-roads-layer'

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
/* One list for the map and the label audit: src/lib/floatingChrome.ts. */
const FLOATING_CHROME = FLOATING_CHROME_SELECTORS.join(', ')
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
/**
 * Take the terrain off for the moment of capture, and put it back.
 *
 * SYNCHRONOUS, with an explicit redraw, because the canvas is read immediately
 * afterwards: without the redraw the pixels still show the terrain frame while
 * the recorded camera says flat, which is the exact mismatch this exists to
 * remove.
 *
 * See src/core/captureTerrain.ts for why the image is flat at all.
 */
function flattenForCapture(instance: maplibregl.Map): {
  flattened: boolean
  restore: () => void
} {
  const terrain = instance.getTerrain()
  if (terrain === null || terrain === undefined) return { flattened: false, restore: () => {} }

  instance.setTerrain(null)
  instance.redraw()
  return {
    flattened: true,
    restore: () => {
      instance.setTerrain(terrain)
      instance.redraw()
    },
  }
}

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
/*
 * MARKING IS THE ONE MODE THAT STAYS ON. The two above disarm after one tap,
 * because dropping one position or one pilot is one decision. Marking a site
 * is not: a car park with wires down two sides is six or seven marks in a row,
 * and a mode that disarmed between each would be six trips to the button.
 * It is turned off explicitly, and the screen says it is on the whole time.
 */
export const MARK_LINE_LAYER = 'site-mark-line'
export const MARK_NODE_LAYER = 'site-mark-node'

/*
 * 'aim' is the reverse sun search picking a thing to aim at. It is a pure
 * READ of a coordinate: it adds nothing to the plan and moves nothing, which
 * is why it sits beside the placing modes rather than inside them.
 */
/** A stable empty list, so a default prop does not re-run the effect every render. */
const NO_PINS: readonly LatLon[] = []
const NO_LINK_PINS: readonly { id: string; label: string; at: LatLon; href: string }[] = []

export type TapMode = 'add' | 'pilot' | 'mark' | 'aim' | 'measure' | 'flight' | null

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
  /**
   * WHETHER TERRAIN WAS ON WHEN THIS IMAGE WAS TAKEN.
   *
   * PART OF THE CAMERA, NOT A DETAIL. With terrain on, unproject raycasts the
   * elevation surface; with it off, the flat plane. Those are different
   * answers for the same pixel, by hundreds of metres on a ridge. The capture
   * records which one produced the image so the inversion can put the map back
   * into that state before asking, exactly as it already does for pitch and
   * bearing.
   *
   * Without this, turning terrain on between the capture and the model's reply
   * silently moved every generated position. Nothing would have looked broken:
   * the positions would simply have been somewhere else on the hill.
   */
  terrain: boolean
  /**
   * TRUE WHEN TERRAIN WAS ON AND WAS SWITCHED OFF TO TAKE THIS IMAGE.
   *
   * `terrain` above says what the image and the inversion agree on, which is
   * always flat. This says whether anything was given up to get there, so the
   * app can tell the shooter the model never saw the hillside. See
   * src/core/captureTerrain.ts for the measurement behind it.
   */
  flattenedTerrain: boolean
}

/** The cheap half of a capture: everything except the image encode. */
export type MapViewport = Omit<MapCapture, 'dataUrl' | 'mediaType'>

export interface MapHandle {
  /**
   * The skyline all the way round at a venue, from the DEM already in memory.
   *
   * ON THE HANDLE because only this component owns the maplibre instance, and
   * queryTerrainElevation is a method on it. The sky window needs the whole
   * circle rather than one bearing, so it cannot reuse readSkyFrame.
   *
   * Returns a FLAT horizon, labelled, when terrain is off or the DEM is
   * silent. It never returns a terrain profile it does not have.
   */
  horizonAt(venue: LatLon | null): HorizonInput
  /**
   * Ground elevation in metres from the terrain already loaded, or null when
   * terrain is off or the DEM has no answer there. For Suggest's terrain
   * line-of-sight; never fetches anything.
   */
  elevationAt(at: LatLon): number | null
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
  /** Turns the map. `instant` for following a heading, eased otherwise. */
  setBearing(bearing: number, instant?: boolean): void
  zoomBy(delta: number): void
  /** Goes to an exact zoom, keeping the centre. Used by the sky layer nudge. */
  zoomTo(zoom: number): void
}

export interface SunOverlay {
  azimuth: number
  shadowBearing: number
  arc: SunArc
  /** The moon's rise, set and place, when the dock's moon switch is on. See src/core/moonArc.ts. */
  moon?: MoonArc | null
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
   * The position whose cone is drawn filled, when one is isolated. Every
   * other cone in conePlan is drawn as an outline. Null fills them all.
   */
  isolatedId: string | null
  /**
   * Where the pilot is standing. Null until it is placed.
   *
   * Drawn as a marker with a dashed line to every air position. It is a
   * measured separation, not a statement that the flight is permitted.
   */
  pilotAt?: LatLon | null
  /** Dragged the pilot marker. */
  onPilotMove?: (at: LatLon) => void
  /** Where the sun-search is pointed. Reads a coordinate, changes no plan. */
  onAimAt?: (at: LatLon) => void
  onPositionMove: (id: string, next: LatLon) => void
  /** Long press drops the venue if it is unset, otherwise the subject. */
  onLongPress: (at: LatLon) => void
  /** Where to drop a position, when the map is armed to place one. */
  onAddAt?: (at: LatLon) => void
  /**
   * The marked hazards and notes to draw, and the drawing in progress.
   *
   * `markDraft` is a line being built tap by tap. It is NOT a mark: it has no
   * kind and no height, and nothing can compute a sightline from it.
   */
  marks?: readonly SiteMark[]
  /** Which measure the sky layer paints: cloud, or wind at the flown height. */
  skyLayer?: SkyLayerKind
  /** The height the wind layer reads at, in metres. */
  windMeters?: number
  /** The aircraft's published wind rating, or null when none is known. */
  ratedWindMps?: number | null
  markDraft?: readonly LatLon[]
  /** A tap while marking: adds a point, or a vertex to the line being drawn. */
  onMarkAt?: (at: LatLon) => void
  /** Tapped an existing mark. */
  onSelectMark?: (id: string) => void
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
  /** Esri place-name and road overlays on top of the imagery. */
  showLabels?: boolean
  /** Real elevation under the imagery, with a sky above the horizon. */
  showTerrain?: boolean
  /**
   * The venue's skyline, pushed up whenever the DEM has finished arriving.
   *
   * MapView OWNS THIS because it owns the map and its events. PlanMode used to
   * poll MapHandle.horizonAt until two reads agreed, which settled on whatever
   * tiles happened to be loaded at the time -- at a Shenandoah hollow that was
   * a 1.2 degree skyline where the real one is 16.5. Recomputing on the map's
   * own `idle` event asks at the one moment the answer is actually ready.
   */
  onHorizon?: (horizon: HorizonInput) => void
  /** OSM building footprints, extruded to their mapped heights. */
  /** Told when terrain is paused for a gesture, so the UI can say so. */
  onTerrainPaused?: (paused: boolean) => void
  showBuildings?: boolean
  /** The footprints themselves, fetched by the owner. Empty is a real state. */
  buildings?: GeoJSON.FeatureCollection | null
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
  /**
   * The airspace overlay, or null when it is off. A function of the view, so
   * the map redraws it on every pan from data already loaded. See
   * src/lib/airspaceOverlay.ts.
   */
  airspace?: AirspaceOverlay | null
  /** Whether the grid was left out because the view held too many squares. */
  onAirspaceDense?: (dense: boolean) => void
  /**
   * The venue's clock, for the time pills where the sunrise, sunset and moon
   * rays leave the screen. Absent, no pills.
   */
  rayClock?: (at: Date) => string
  /**
   * Pins that are links: the cameras, each opening its operator's own page.
   * The map draws an anchor and nothing else; it never loads what is behind it.
   */
  linkPins?: readonly { id: string; label: string; at: LatLon; href: string }[]
  /** Building shadows and the subject's shadow, as features. See src/lib/shadowLayer.ts. */
  shadowFeatures?: GeoJSON.FeatureCollection | null
  /** The two-pin measure's pins, none to two. The numbers are src/core/measure.ts. */
  measurePins?: readonly LatLon[]
  /** A tap while measuring. */
  onMeasureAt?: (at: LatLon) => void
  /* Preflight: a tap in 'flight' mode adds a point to the move being drawn. */
  onFlightAt?: (at: LatLon) => void
  /* The move's path: 'line', 'hidden' (amber: out of the pilot's sight) and 'vertex' features. */
  flight?: GeoJSON.FeatureCollection | null
  /* The waterline over the scanned patch, as an image (src/lib/waterline/useWaterline.ts). */
  waterline?: { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } | null
  /* The light map around the venue, as an image (src/lib/lightmap/lightMapFor.ts). */
  lightmap?: { url: string; coordinates: [[number, number], [number, number], [number, number], [number, number]] } | null
  /** PhotoPills style rays from the venue pin. All four bearings from core. */
  sunOverlay: SunOverlay | null
  showSun: boolean
  showArc: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
  onPitchChange: (pitch: number) => void
  /** The map's rotation in degrees, reported as it turns, for the compass needle. */
  onBearingChange?: (bearing: number) => void
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

function coneCollection(
  plan: PlannedPosition[],
  /** The position whose cone is filled. Null fills every one of them. */
  isolatedId: string | null,
): GeoJSON.FeatureCollection {
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
          /*
           * FILLED, OR ONLY OUTLINED. With one position isolated the others
           * keep their edge and lose their wash, so the comparison stays on
           * screen without three translucent fills compounding into a mass.
           */
          filled: isolatedId === null || p.position.id === isolatedId,
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

    /* A framed drone shot: the tilted frame on the ground, drawn like a top-down rectangle. */
    if (draw.shotType === 'framed') {
      features.push({
        type: 'Feature',
        properties: { kind: 'rect', id: p.position.id },
        geometry: { type: 'Polygon', coordinates: draw.ground },
      })
      continue
    }

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
  /*
   * A LENGTH PER BEARING, not one length for all of them.
   *
   * It was a single number, and the projection audit caught what that costs
   * under pitch: one ground length drawn in four directions came back as four
   * different lengths on the glass. At zoom 12 pitch 60 the axis measured
   * 0.436 of the diagonal, the sun ray 0.63 and the shadow 0.242, from the
   * same metres. A ray pointing toward the horizon is stretched and one
   * pointing toward the camera is compressed, so holding a screen fraction
   * means asking the camera per direction.
   */
  lengthFor: (bearing: number) => number,
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
  /* The moon, when asked for: where it rises and sets, and where it is if it is up. */
  const moon = overlay.moon ?? null
  if (moon !== null) {
    if (moon.rise !== null) rays.push({ kind: 'moonrise', bearing: moon.rise.azimuth })
    if (moon.set !== null) rays.push({ kind: 'moonset', bearing: moon.set.azimuth })
    if (moon.altitude > 0) rays.push({ kind: 'moon', bearing: moon.azimuth })
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
          toPosition(bearingLineEnd(venue, ray.bearing, lengthFor(ray.bearing))),
        ],
      },
    })),
  }
}

/**
 * The ray length in metres that lands RAY_SCREEN_FRACTION of the way across
 * the frame, whatever the zoom.
 *
 * QUANTISED ON A LOG GRID, eight steps to the octave. The length has to be
 * recomputed as the camera moves and a pinch moves it every frame; feeding a
 * slightly different number into the source sixty times a second re-tiles the
 * geometry for no visible gain. Eight steps per octave means the drawn length
 * is within about 9% of the target, which is invisible, and the number only
 * changes a few times across a whole pinch.
 *
 * The old core rule quantised to whole powers of two, which is a 41% swing:
 * fine when the only requirement was "long enough to leave the frame", and far
 * too coarse now that the length itself is the thing being held constant.
 */
function raySeedMetres(bounds: ViewportBounds): number {
  const target = viewportDiagonalMeters(bounds) * RAY_SCREEN_FRACTION
  if (!Number.isFinite(target) || target <= 0) return BEARING_LINE_MIN_METERS

  /*
   * NO GROUND FLOOR. The core rule applies BEARING_LINE_MIN_METERS, 100m, so
   * a ray is never degenerate — and measured at z19 that floor is what breaks
   * this: the frame there is about 110m across the diagonal, so a 100m ray is
   * 0.92 of it and runs off the edge. Fraction 0.92 against a wanted 0.28,
   * which is the exact bug this cap exists to remove, reappearing at the other
   * end of the zoom range.
   *
   * The floor belongs in SCREEN space, and the target already is one: a fixed
   * fraction of the diagonal cannot be degenerate while the diagonal is not.
   * The only case left is a zero or non-finite viewport, which is guarded
   * above, and that is why it returns the core minimum there and nowhere else.
   */
  return 2 ** (Math.round(Math.log2(target) * 8) / 8)
}

/*
 * THE RAY LENGTH, SOLVED THROUGH THE CAMERA.
 *
 * WHAT WAS WRONG, AND IT WAS WRONG FROM THE MOMENT IT WAS WRITTEN. The cap was
 * asked for in SCREEN space and computed in GROUND space: a fraction of
 * viewportDiagonalMeters, which is the ground distance across what the map
 * reports visible. Those two agree looking straight down and diverge the
 * instant the camera tilts, because a pitched view reports a vastly larger
 * ground box while the far half of it compresses into a few rows of pixels.
 *
 * Measured by scripts/audit-projection.mjs: flat, every zoom from 10 to 20
 * landed on 0.27 against a wanted 0.28. Pitched, the same code gave 0.436,
 * 0.63 and 0.242 in three directions at once, and the long ones ran off the
 * edge of the frame, which is the exact behaviour the cap exists to remove.
 *
 * THE FIX IS TO STOP APPROXIMATING THE CAMERA AND ASK IT. Project a trial
 * length, measure the pixels it actually drew, scale by the ratio, repeat. In
 * the near field pixel length is close to linear in ground distance so this
 * converges in two or three steps; the loop is capped anyway so a pathological
 * camera costs a fixed handful of projections rather than hanging.
 *
 * WHY SCALING AND NOT A BISECTION. Scaling needs no bracket. A bracket needs
 * an upper bound that is known to overshoot, and under pitch there may not be
 * one: a line toward the horizon converges ON the horizon, so its pixel length
 * has a ceiling that no distance can beat. Shortening is always in the
 * well behaved region, and shortening is the only thing this is ever asked to
 * do, since the seed is the flat answer and the flat answer is the longest.
 *
 * STILL QUANTISED, same log grid as before and for the same reason: the number
 * is recomputed on every move event and feeding a slightly different one into
 * the source re-tiles the geometry for no visible gain. Eight steps to the
 * octave is within about 9% of the target, well inside the audit's 0.12.
 */
const RAY_SOLVER_STEPS = 4

/** Close enough to stop, as a fraction of the target pixel length. */
const RAY_SOLVER_TOLERANCE = 0.02

/** The ray length wanted on the glass, in CSS pixels. */
function rayTargetPx(instance: maplibregl.Map): number {
  const canvas = instance.getCanvas()
  return Math.hypot(canvas.clientWidth, canvas.clientHeight) * RAY_SCREEN_FRACTION
}

function quantiseMetres(metres: number): number {
  return 2 ** (Math.round(Math.log2(metres) * 8) / 8)
}

/**
 * The ground distance whose DRAWN length is `targetPx` on the glass.
 *
 * `ends` returns the two coordinates of the line for a trial distance, so the
 * same solver serves a one sided ray and a two sided axis: the axis passes its
 * end-to-end pair and asks for twice the fraction, which is how
 * scripts/audit-projection.mjs measures it.
 */
function solveRayMetres(
  instance: maplibregl.Map,
  ends: (metres: number) => readonly GeoJSON.Position[],
  targetPx: number,
  seedMetres: number,
): number {
  let metres = seedMetres
  for (let step = 0; step < RAY_SOLVER_STEPS; step += 1) {
    const line = ends(metres)
    const first = line[0]
    const last = line[line.length - 1]
    if (first === undefined || last === undefined) break
    const a = instance.project([first[0] ?? 0, first[1] ?? 0])
    const b = instance.project([last[0] ?? 0, last[1] ?? 0])
    const px = Math.hypot(b.x - a.x, b.y - a.y)
    /*
     * A degenerate measurement is the one case where scaling cannot help: a
     * sub-pixel line gives a ratio with no information in it, and projecting
     * through a camera mid-resize can give a non-finite one. Keep what we had.
     */
    if (!Number.isFinite(px) || px < 1) break
    if (Math.abs(px - targetPx) <= targetPx * RAY_SOLVER_TOLERANCE) break
    const next = metres * (targetPx / px)
    if (!Number.isFinite(next) || next <= 0) break
    metres = next
  }
  return quantiseMetres(metres)
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
  isolatedId,
  onPositionMove,
  onLongPress,
  onAddAt,
  marks,
  skyLayer = 'cloud',
  windMeters = 10,
  ratedWindMps = null,
  markDraft,
  onMarkAt,
  onSelectMark,
  sunAzimuth,
  sunOverlay,
  showSun,
  showArc,
  selectedId,
  onSelect,
  onPitchChange,
  onBearingChange,
  bottomInset,
  radiusMeters = null,
  pinHint = null,
  onPinDrag,
  onReady,
  sunAltitude = null,
  showSky = false,
  showLabels = false,
  showTerrain = false,
  onHorizon,
  onTerrainPaused,
  showBuildings = false,
  buildings = null,
  skyFrameAt = null,
  skyForecast = [],
  skyForecastOpacity = 0.5,
  onViewChange,
  airspace = null,
  onAirspaceDense,
  measurePins = NO_PINS,
  rayClock,
  shadowFeatures = null,
  linkPins = NO_LINK_PINS,
  onMeasureAt,
  onFlightAt,
  flight = null,
  waterline = null,
  lightmap = null,
  pilotAt = null,
  onPilotMove,
  onAimAt,
}: MapViewProps) {
  /*
   * The ray plates are built imperatively into marker elements, so the switch
   * has to arrive as a value and sit in the effect's dependencies rather than
   * being read inside JSX.
   */
  const showNumerals = useNumerals()

  const container = useRef<HTMLDivElement>(null)
  /* The credits sheet, open with its lines, or null (MapCredits.tsx). */
  const [credits, setCredits] = useState<string[] | null>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const venueMarker = useRef<maplibregl.Marker | null>(null)
  const hintMarker = useRef<maplibregl.Marker | null>(null)
  const figureMarkers = useRef(new Map<string, maplibregl.Marker>())
  const rayLabels = useRef<maplibregl.Marker[]>([])
  const draggedRecently = useRef(new Set<string>())

  const [ready, setReady] = useState(false)
  /*
   * WHAT EACH PLATE SAYS, DECIDED ACROSS THE WHOLE SET. What one plate should
   * carry depends on what the others carry, so it cannot be worked out one
   * position at a time: that is how it came to print SIGMA six times.
   */
  const plates = plateLabels(
    plan.map((p) => ({ opticName: p.optic.name, focalLength: p.focalLength })),
  )

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

  /*
   * THE SUN'S PLACE IN THE SKY, recomputed whenever the camera or the sun
   * moves.
   *
   * Held as a snapshot of plain numbers rather than read inside the render,
   * because the camera lives in MapLibre and the arithmetic lives in
   * src/core/sunSky.ts. viewTick is already bumped on every map move for the
   * ray labels, so this comes along for free on pan, zoom, rotate and tilt.
   */
  const [skyFrame, setSkyFrame] = useState<SkyFrame | null>(null)

  /** True while the camera is being dragged, rotated, zoomed or pitched. */
  const [gesturing, setGesturing] = useState(false)

  const latest = useRef({
    mode,
    onVenueChange,
    onSelect,
    onPositionMove,
    onPitchChange,
    onBearingChange,
    onLongPress,
    onPinDrag,
    onAddAt,
    onPilotMove,
    onAimAt,
    onMarkAt,
    onSelectMark,
    onMeasureAt,
    onFlightAt,
  })
  useEffect(() => {
    latest.current = {
      mode,
      onVenueChange,
      onSelect,
      onPositionMove,
      onPitchChange,
      onBearingChange,
      onLongPress,
      onPinDrag,
      onAddAt,
      onPilotMove,
      onAimAt,
      onMarkAt,
      onSelectMark,
      onMeasureAt,
      onFlightAt,
    }
  }, [
    mode,
    onVenueChange,
    onSelect,
    onPositionMove,
    onPitchChange,
    onBearingChange,
    onLongPress,
    onPinDrag,
    onAddAt,
    onPilotMove,
    onAimAt,
    onMarkAt,
    onSelectMark,
    onMeasureAt,
    onFlightAt,
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
            maxzoom: ESRI_NATIVE_MAX_ZOOM,
            attribution: ESRI_ATTRIBUTION,
          },
          /*
           * Declared at init and left EMPTY of layers until asked for, so
           * nothing is fetched for a shooter who never turns labels on. A
           * source with no layer costs no requests.
           */
          [LABEL_SOURCE_ROADS]: {
            type: 'raster',
            tiles: [ESRI_ROADS_TILES],
            tileSize: 256,
            maxzoom: ESRI_NATIVE_MAX_ZOOM,
            attribution: ESRI_REFERENCE_ATTRIBUTION,
          },
          [LABEL_SOURCE_PLACES]: {
            type: 'raster',
            tiles: [ESRI_PLACES_TILES],
            tileSize: 256,
            maxzoom: ESRI_NATIVE_MAX_ZOOM,
            attribution: ESRI_REFERENCE_ATTRIBUTION,
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
      /*
       * ROTATE, NO TILT BY HAND. 2D is 2D: the 3D button opens the clay
       * model (src/components/Clay3D.tsx) instead of tilting this map. Code
       * can still pitch it, which the sun-in-the-sky view and the audits use.
       */
      pitchWithRotate: false,
      touchPitch: false,
      /*
       * 85, NOT 60, SO THERE IS A SKY TO PUT A SUN IN.
       *
       * At 60 degrees with MapLibre's 36.87 degree vertical field of view the
       * horizon sits above the top edge: half the field of view is 18.4
       * degrees, so the horizon only enters frame past about 72. The old
       * ceiling made the sun-in-the-sky view geometrically impossible, which
       * is why the pitch control "did almost nothing". See horizonInFrame in
       * src/core/sunSky.ts, which is the arithmetic rather than my eye.
       *
       * 85 is MapLibre's own limit. Past that the far plane runs away and the
       * tile pyramid at the horizon becomes unbounded.
       */
      maxPitch: 85,
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

    /*
     * THE CREDITS, AS A SMALL "i" THAT OPENS A SHEET (MapCredits.tsx).
     * MapLibre's own box opened itself whenever the sources changed and covered
     * the dock. A control in the same corner, so it rides up with the sheet as
     * the old one did; the sheet is the app's, and only a tap opens it.
     */
    instance.addControl(
      {
        onAdd: () => {
          const wrap = document.createElement('div')
          wrap.className = 'maplibregl-ctrl credits__ctrl'
          const button = document.createElement('button')
          button.type = 'button'
          button.className = 'credits__i'
          button.setAttribute('aria-label', 'Map credits')
          button.textContent = 'i'
          button.addEventListener('click', () => {
            const sources = Object.values(instance.getStyle()?.sources ?? {}) as { attribution?: string }[]
            setCredits(creditLines(sources.map((source) => source.attribution)))
          })
          wrap.appendChild(button)
          return wrap
        },
        onRemove: () => {},
      },
      'bottom-left',
    )

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
      if (target?.closest('.shooter-host, .pin, .ray-label, .linkpin') != null) return

      const next = { lat: event.lngLat.lat, lon: event.lngLat.lng }
      if (l.mode === 'mark') {
        /*
         * A TAP ON AN EXISTING MARK OPENS IT; a tap on empty map adds to the
         * one being drawn. Queried against the mark layers rather than against
         * a radius, so what counts as a hit is exactly what is drawn.
         */
        const hit = instance.queryRenderedFeatures(event.point, {
          layers: [MARK_LINE_LAYER, MARK_NODE_LAYER],
        })[0]
        const id = hit?.properties?.id
        if (typeof id === 'string' && hit?.properties?.draft !== true) {
          l.onSelectMark?.(id)
        } else {
          l.onMarkAt?.(next)
        }
        return
      }
      if (l.mode === 'add') {
        l.onAddAt?.(next)
      } else if (l.mode === 'pilot') {
        l.onPilotMove?.(next)
      } else if (l.mode === 'aim') {
        l.onAimAt?.(next)
      } else if (l.mode === 'measure') {
        l.onMeasureAt?.(next)
      } else if (l.mode === 'flight') {
        l.onFlightAt?.(next)
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
    instance.on('rotate', () => latest.current.onBearingChange?.(instance.getBearing()))
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

    /*
     * THE OVERLAYS ARE BUILT WHEN THE STYLE IS READY, NOT WHEN THE TILES ARE.
     *
     * This was `instance.on('load', ...)`. MapLibre fires `load` only once
     * every tile in view has loaded or errored, and a dead cell does neither:
     * the request is sent and never answered. So on a mountain with no bars
     * the cones, the sun and shadow rays, the radius ring and the sun in the
     * sky waited for imagery that was never coming, and the computed geometry
     * -- which needs no network at all -- never reached the glass.
     *
     * scripts/audit-offline.mjs in hang mode, run before the change, found
     * cones and rays not drawn because no overlay layer existed. The style is
     * an inline object with no glyphs and no sprite, so `style.load` needs no
     * network and fires on any connection.
     */
    const buildOverlays = () => {
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
           * CLOUD: plain white over the imagery, and hard edged. The squares
           * ARE the signal that this is a model and not a photograph.
           *
           * WIND: coloured by band against the aircraft's published rating,
           * because a wind speed on its own is a number and a wind speed
           * against what the machine is rated for is a decision. Calm is left
           * almost clear so the eye goes to the cells that are not.
           */
          'fill-color': [
            'match',
            ['get', 'band'],
            'calm',
            readToken('--platform-air', '#3fd0e6', container.current),
            'workable',
            readToken('--platform-air', '#3fd0e6', container.current),
            'near-limit',
            readToken('--sun-rise', '#ffa04a', container.current),
            'over',
            readToken('--color-hazard', '#ff3da6', container.current),
            'unrated',
            readToken('--white', '#ffffff', container.current),
            readToken('--white', '#ffffff', container.current),
          ],
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
      instance.addSource(MARK_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(MARK_DRAFT_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(AIRSPACE_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource(MEASURE_SOURCE, { type: 'geojson', data: emptyCollection() })
      instance.addSource('flight', { type: 'geojson', data: emptyCollection() })
      instance.addSource(SHADOW_SOURCE, { type: 'geojson', data: emptyCollection() })

      const rayColor = [
        'match',
        ['get', 'kind'],
        'sunrise',
        readToken('--sun-rise'),
        'sunset',
        readToken('--sun-set'),
        'shadow',
        readToken('--sun-shadow'),
        'moonrise',
        readToken('--grey-1'),
        'moonset',
        readToken('--grey-1'),
        'moon',
        readToken('--white'),
        readToken('--sun'),
      ] as unknown as maplibregl.DataDrivenPropertyValueSpecification<string>

      /*
       * THE AIRSPACE OVERLAY, under everything the shooter placed.
       *
       * Grid squares are filled darker the lower their ceiling, so a 0 ft
       * square reads as the darkest thing on the map; the number is on the
       * square. Controlled airspace is a white dashed outline: paperwork, not
       * danger. Restricted and prohibited areas and park units are red,
       * because they are the hazard layer of the sky: no flying, no launch.
       */
      instance.addLayer({
        id: 'airspace-cell-fill',
        type: 'fill',
        source: AIRSPACE_SOURCE,
        filter: ['==', ['get', 'kind'], 'cell'],
        paint: {
          'fill-color': readToken('--black', '#0a090c', container.current),
          'fill-opacity': ['interpolate', ['linear'], ['get', 'feet'], 0, 0.55, 400, 0.08],
        },
      })
      instance.addLayer({
        id: 'airspace-cell-line',
        type: 'line',
        source: AIRSPACE_SOURCE,
        filter: ['==', ['get', 'kind'], 'cell'],
        paint: { 'line-color': readToken('--white', '#ffffff', container.current), 'line-width': 0.75, 'line-opacity': 0.45 },
      })
      instance.addLayer({
        id: 'airspace-class-fill',
        type: 'fill',
        source: AIRSPACE_SOURCE,
        filter: ['all', ['==', ['get', 'kind'], 'class'], ['==', ['get', 'draw'], 'fill']],
        paint: { 'fill-color': readToken('--white', '#ffffff', container.current), 'fill-opacity': 0.1 },
      })
      instance.addLayer({
        id: 'airspace-closed-fill',
        type: 'fill',
        source: AIRSPACE_SOURCE,
        filter: ['all', ['in', ['get', 'kind'], ['literal', ['restricted', 'park']]], ['==', ['get', 'draw'], 'fill']],
        paint: { 'fill-color': readToken('--hazard', '#ff3b30', container.current), 'fill-opacity': 0.14 },
      })
      instance.addLayer({
        id: 'airspace-class-line',
        type: 'line',
        source: AIRSPACE_SOURCE,
        filter: ['all', ['==', ['get', 'kind'], 'class'], ['==', ['get', 'draw'], 'line']],
        paint: {
          'line-color': readToken('--white', '#ffffff', container.current),
          'line-width': 2.5,
          'line-dasharray': [3, 2],
        },
      })
      instance.addLayer({
        id: 'airspace-closed-line',
        type: 'line',
        source: AIRSPACE_SOURCE,
        filter: ['all', ['in', ['get', 'kind'], ['literal', ['restricted', 'park']]], ['==', ['get', 'draw'], 'line']],
        paint: {
          'line-color': readToken('--hazard', '#ff3b30', container.current),
          'line-width': 3,
        },
      })

      /*
       * SHADOWS: dark, translucent, under everything placed. The subject's own
       * shadow is a short heavy line from the pin.
       */
      instance.addLayer({
        id: 'shadow-fill',
        type: 'fill',
        source: SHADOW_SOURCE,
        filter: ['==', ['get', 'kind'], 'building'],
        paint: { 'fill-color': readToken('--black', '#0a090c', container.current), 'fill-opacity': 0.45 },
      })
      instance.addLayer({
        id: 'shadow-subject',
        type: 'line',
        source: SHADOW_SOURCE,
        filter: ['==', ['get', 'kind'], 'subject'],
        paint: { 'line-color': readToken('--black', '#0a090c', container.current), 'line-width': 6, 'line-opacity': 0.6 },
      })

      /*
       * PREFLIGHT: the move's path, white with a dark edge; the stretches the
       * drone is hidden from the pilot drawn over it in amber, the sun's
       * colour (src/core/flight.ts); its points as small rings. Never red.
       */
      instance.addLayer({ id: 'flight-edge', type: 'line', source: 'flight', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': readToken('--mark-edge', '#0a0b09', container.current), 'line-width': 6 } })
      instance.addLayer({ id: 'flight-line', type: 'line', source: 'flight', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': readToken('--white', '#ffffff', container.current), 'line-width': 3 } })
      instance.addLayer({ id: 'flight-hidden', type: 'line', source: 'flight', filter: ['==', ['get', 'kind'], 'hidden'], paint: { 'line-color': readToken('--sun', '#ffd54a', container.current), 'line-width': 4 } })
      instance.addLayer({
        id: 'flight-vertex',
        type: 'circle',
        source: 'flight',
        filter: ['==', ['get', 'kind'], 'vertex'],
        paint: { 'circle-radius': 5, 'circle-color': readToken('--white', '#ffffff', container.current), 'circle-stroke-color': readToken('--mark-edge', '#0a0b09', container.current), 'circle-stroke-width': 2 },
      })

      /* The two-pin measure: a plain white line with a dark edge, readable on imagery. */
      instance.addLayer({
        id: 'measure-edge',
        type: 'line',
        source: MEASURE_SOURCE,
        filter: ['==', ['get', 'kind'], 'line'],
        paint: { 'line-color': readToken('--mark-edge', '#0a0b09', container.current), 'line-width': 5 },
      })
      instance.addLayer({
        id: 'measure-line',
        type: 'line',
        source: MEASURE_SOURCE,
        filter: ['==', ['get', 'kind'], 'line'],
        paint: { 'line-color': readToken('--white', '#ffffff', container.current), 'line-width': 2.5 },
      })
      instance.addLayer({
        id: 'measure-pin',
        type: 'circle',
        source: MEASURE_SOURCE,
        filter: ['==', ['get', 'kind'], 'pin'],
        paint: {
          'circle-radius': 6,
          'circle-color': readToken('--white', '#ffffff', container.current),
          'circle-stroke-color': readToken('--mark-edge', '#0a0b09', container.current),
          'circle-stroke-width': 2,
        },
      })

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
        /* Outlined-only cones keep their line and lose their wash. */
        filter: ['==', ['get', 'filled'], true],
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
       * you can walk along. It is a COMPUTED SEPARATION and nothing more: it
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
       * WHAT IS DANGEROUS AND WHAT IS IN THE WAY.
       *
       * Drawn like a chart draws an obstruction: hard lines, no fill, and the
       * line is the thing rather than a label pointing at it.
       *
       * THREE THINGS ARE ENCODED, and they are encoded SEPARATELY because
       * they are separate questions:
       *
       *   COLOUR says hazard or note. Hazard takes the same magenta the site
       *   warnings use, because it is the same kind of fact. A note, a launch
       *   spot or a car park, takes the cyan that air positions use: useful,
       *   not dangerous.
       *
       *   DASH says where it came from. Solid for something the shooter
       *   marked standing there. Dashed for what OpenStreetMap has mapped,
       *   because "somebody surveyed this" and "I saw this" are different
       *   claims and the shooter is entitled to know which they are looking
       *   at. Transmission lines are mapped well; local distribution is
       *   patchy, and a dash that says "this came from a database" is the
       *   only honest way to draw a layer with holes in it.
       *
       *   OPACITY says confirmed or not. Everything is confirmed today. The
       *   dimmer treatment is the seam for a later model pass, whose
       *   proposals must never look like the other two.
       */
      instance.addLayer({
        id: MARK_LINE_LAYER,
        type: 'line',
        source: MARK_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': [
            'case',
            ['get', 'hazard'],
            readToken('--color-hazard', '#ff3da6', container.current),
            readToken('--platform-air', '#3fd0e6', container.current),
          ],
          'line-width': 3,
          'line-opacity': ['case', ['get', 'confirmed'], 0.95, 0.5],
          'line-dasharray': ['case', ['==', ['get', 'source'], 'osm'], ['literal', [2, 2]], ['literal', [1, 0]]],
        },
      })
      instance.addLayer({
        id: MARK_NODE_LAYER,
        type: 'circle',
        source: MARK_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'case',
            ['get', 'hazard'],
            readToken('--color-hazard', '#ff3da6', container.current),
            readToken('--platform-air', '#3fd0e6', container.current),
          ],
          'circle-opacity': ['case', ['get', 'confirmed'], 0.95, 0.5],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': readToken('--mark-edge', '#0a0b09', container.current),
        },
      })

      /*
       * THE LINE BEING DRAWN. White, so it reads as the thing under the thumb
       * rather than as a finished mark, and it carries no kind or colour
       * because it has neither until it is finished.
       */
      instance.addLayer({
        id: 'site-mark-draft-line',
        type: 'line',
        source: MARK_DRAFT_SOURCE,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: {
          'line-color': readToken('--mark', '#ffffff', container.current),
          'line-width': 2,
          'line-dasharray': [3, 2],
        },
      })
      instance.addLayer({
        id: 'site-mark-draft-node',
        type: 'circle',
        source: MARK_DRAFT_SOURCE,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': readToken('--mark', '#ffffff', container.current),
          'circle-stroke-width': 1.5,
          'circle-stroke-color': readToken('--mark-edge', '#0a0b09', container.current),
        },
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
    }
    instance.once('style.load', buildOverlays)

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
      /*
       * MERGED, NOT REPLACED. This effect runs after the imperative handle is
       * committed, so assigning a fresh object here threw the handle away and
       * the probe silently had only the map on it.
       */
      const w = window as unknown as { __probe?: Record<string, unknown> }
      w.__probe = { ...(w.__probe ?? {}), map: instance }
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
  /*
   * THE HANDLE IS REACHABLE UNDER ?probe=1 TOO, not just the map.
   *
   * The projection audit can exercise map.project and map.unproject directly,
   * and that is how it has always worked, but it is NOT the code the app
   * runs: capture, unprojectFromCapture and projectToCapture do their own
   * camera and terrain snapping around those calls, and the terrain work is
   * entirely in that layer. An audit that reimplements the snapping proves the
   * audit's copy of it, which is the blind-check pattern again.
   *
   * Same gate and same reasoning as the map: absent unless the query string
   * asks, so absent in production.
   */
  const probeHandle = useCallback((api: MapHandle) => {
    if (new URLSearchParams(window.location.search).get('probe') === '1') {
      const w = window as unknown as { __probe?: { map?: unknown; handle?: MapHandle } }
      w.__probe = { ...(w.__probe ?? {}), handle: api }
    }
    return api
  }, [])

  /*
   * THE SKYLINE, RECOMPUTED WHEN THE TILES STOP ARRIVING.
   *
   * `idle` fires when MapLibre has finished loading and rendering everything
   * for the current view, which is exactly the condition
   * queryTerrainElevation needs and the one a timer cannot express. The shape
   * is compared before reporting so a pan that changes nothing does not push
   * an identical profile up and re-render the sheet.
   */
  const horizonShape = useRef('')
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready || onHorizon === undefined) return

    const report = () => {
      const got = readHorizonProfile(instance, venue)
      const shape =
        got.kind === 'terrain'
          ? got.samples.map((s) => `${s.azimuth}:${s.angleDegrees.toFixed(2)}`).join(',')
          : 'flat'
      if (shape === horizonShape.current) return
      horizonShape.current = shape
      onHorizon(got)
    }

    report()
    instance.on('idle', report)
    return () => {
      instance.off('idle', report)
    }
  }, [venue, showTerrain, ready, onHorizon])

  useImperativeHandle(
    handle,
    (): MapHandle => probeHandle({
      horizonAt(venue: LatLon | null): HorizonInput {
        const instance = map.current
        if (instance === null) return { kind: 'flat' }
        return readHorizonProfile(instance, venue)
      },
      elevationAt(at) {
        const instance = map.current
        if (instance === null || instance.getTerrain() === null) return null
        const metres = instance.queryTerrainElevation([at.lon, at.lat])
        return typeof metres === 'number' && Number.isFinite(metres) ? metres : null
      },
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
          /*
           * FLAT, LIKE THE CAPTURE. The viewport is the cheap half of the same
           * record and is used for the Overpass bounds; reporting a different
           * terrain state from the image half would be two answers to one
           * question.
           */
          terrain: false,
          flattenedTerrain:
            instance.getTerrain() !== null && instance.getTerrain() !== undefined,
        }
      },

      capture() {
        const instance = map.current
        if (instance === null) return null
        /*
         * FLATTENED FIRST, so the image, the recorded camera and the later
         * inversion are all describing the same projection. Measured: with
         * terrain on, the round trip is out by up to 57 pixels at capture
         * resolution. See src/core/captureTerrain.ts.
         */
        const flat = flattenForCapture(instance)
        try {
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
            terrain: false,
            flattenedTerrain: flat.flattened,
          }
        } finally {
          /*
           * TERRAIN GOES BACK ON EVEN IF THE ENCODE THROWS. A finally rather
           * than a line after the return: a capture that failed and left the
           * map flat would look like terrain had silently switched itself off.
           */
          flat.restore()
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
        /*
         * TERRAIN IS RESTORED WITH THE CAMERA. See MapCapture.terrain: the
         * elevation surface is part of what unproject answers against, so
         * inverting against a different one is the same class of error as
         * inverting against a different pitch.
         */
        const terrainNow = withTerrain(instance, capture.terrain)
        instance.jumpTo(capture.camera)
        const out = points.map((p) => {
          const ll = instance.unproject([p.x * capture.width, p.y * capture.height])
          return { lat: ll.lat, lon: ll.lng }
        })
        instance.jumpTo(restore)
        terrainNow.restore()
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
        const terrainNow = withTerrain(instance, capture.terrain)
        instance.jumpTo(capture.camera)
        const out = points.map((point) => {
          const p = instance.project([point.lon, point.lat])
          return { x: p.x / capture.width, y: p.y / capture.height }
        })
        instance.jumpTo(restore)
        terrainNow.restore()
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

      setBearing(bearing, instant) {
        if (instant === true) map.current?.setBearing(bearing)
        else map.current?.easeTo({ bearing, duration: 400 })
      },
      setPitch(pitch) {
        map.current?.easeTo({ pitch, duration: 400 })
        latest.current.onPitchChange(pitch)
      },

      zoomTo(zoom) {
        map.current?.easeTo({ zoom, duration: 400 })
      },
      zoomBy(delta) {
        map.current?.easeTo({ zoom: (map.current.getZoom() ?? 16) + delta, duration: 250 })
      },
    }),
    [probeHandle],
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
    cones?.setData(coneCollection(conePlan, isolatedId))
  }, [conePlan, isolatedId, ready])

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
   * THE AIRSPACE OVERLAY, redrawn for the view after every move.
   *
   * The ceiling numbers are small markers rather than a symbol layer, because
   * this style carries no glyphs. They are decoration -- aria-hidden, no
   * pointer events -- and the same number is on the airspace card in words.
   */
  const latestDense = useRef(onAirspaceDense)
  latestDense.current = onAirspaceDense
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    const source = instance.getSource(AIRSPACE_SOURCE) as maplibregl.GeoJSONSource | undefined
    let tags: maplibregl.Marker[] = []
    const clearTags = () => {
      for (const tag of tags) tag.remove()
      tags = []
    }
    if (airspace === null) {
      source?.setData(emptyCollection())
      latestDense.current?.(false)
      return
    }
    const draw = () => {
      const b = instance.getBounds()
      const layer = airspace({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() })
      source?.setData(layer.collection)
      latestDense.current?.(layer.gridTooDense)
      clearTags()
      for (const label of layer.gridLabels) {
        const el = document.createElement('div')
        el.className = 'gridtag num'
        el.setAttribute('aria-hidden', 'true')
        el.textContent = String(label.feet)
        tags.push(new maplibregl.Marker({ element: el }).setLngLat([label.at.lon, label.at.lat]).addTo(instance))
      }
      /*
       * NOT UNDER THE CHROME. A ceiling half hidden by the scale bar or the
       * chip row reads as a different number, so a tag under any floating
       * surface -- the same reserved list the ray labels avoid -- is hidden.
       */
      /*
       * A maplibre control CORNER is a tall empty column (408 px measured on a
       * 390 x 844 phone) with the scale bar at its foot, so its controls are
       * what is reserved here, not the empty box around them.
       */
      const chrome = floatingChromeNodes(document, FLOATING_CHROME_SELECTORS).map((n) => n.getBoundingClientRect())
      for (const tag of tags) {
        const r = tag.getElement().getBoundingClientRect()
        const under = chrome.some((c) => r.left < c.right && r.right > c.left && r.top < c.bottom && r.bottom > c.top)
        tag.getElement().style.visibility = under ? 'hidden' : ''
      }
    }
    draw()
    instance.on('moveend', draw)
    return () => {
      instance.off('moveend', draw)
      clearTags()
    }
  }, [airspace, ready])

  /* Link pins: an anchor per camera, opened in a new tab, nothing fetched. */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    const markers = linkPins.map((pin) => {
      const el = document.createElement('a')
      el.className = 'linkpin'
      el.href = pin.href
      el.target = '_blank'
      el.rel = 'noreferrer noopener'
      el.textContent = pin.label
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([pin.at.lon, pin.at.lat]).addTo(instance)
    })
    return () => markers.forEach((m) => m.remove())
  }, [linkPins, ready])

  /* The shadows for the moment on the time bar. */
  useEffect(() => {
    if (map.current === null || !ready) return
    const source = map.current.getSource(SHADOW_SOURCE) as maplibregl.GeoJSONSource | undefined
    source?.setData(shadowFeatures ?? emptyCollection())
  }, [shadowFeatures, ready])

  /* The waterline: an image source over the scan's patch, added under everything drawn on top. */
  useEffect(() => {
    const m = map.current
    if (m === null || !ready) return
    const src = m.getSource('waterline') as maplibregl.ImageSource | undefined
    if (waterline === null) {
      if (m.getLayer('waterline')) m.removeLayer('waterline')
      if (src !== undefined) m.removeSource('waterline')
      return
    }
    if (src !== undefined) src.updateImage({ url: waterline.url, coordinates: waterline.coordinates })
    else {
      m.addSource('waterline', { type: 'image', url: waterline.url, coordinates: waterline.coordinates })
      m.addLayer({ id: 'waterline', type: 'raster', source: 'waterline', paint: { 'raster-opacity': 1, 'raster-resampling': 'nearest' } }, m.getLayer('flight-edge') ? 'flight-edge' : undefined)
    }
  }, [waterline, ready])

  /* The light map: the same kind of image, under the waterline. */
  useEffect(() => {
    const m = map.current
    if (m === null || !ready) return
    const src = m.getSource('lightmap') as maplibregl.ImageSource | undefined
    if (lightmap === null) {
      if (m.getLayer('lightmap')) m.removeLayer('lightmap')
      if (src !== undefined) m.removeSource('lightmap')
      return
    }
    if (src !== undefined) src.updateImage({ url: lightmap.url, coordinates: lightmap.coordinates })
    else {
      m.addSource('lightmap', { type: 'image', url: lightmap.url, coordinates: lightmap.coordinates })
      const above = m.getLayer('waterline') ? 'waterline' : m.getLayer('flight-edge') ? 'flight-edge' : undefined
      m.addLayer({ id: 'lightmap', type: 'raster', source: 'lightmap', paint: { 'raster-opacity': 0.85, 'raster-resampling': 'nearest' } }, above)
    }
  }, [lightmap, ready])

  /* Preflight's path (PlanMode builds the features). */
  useEffect(() => {
    if (map.current === null || !ready) return
    const source = map.current.getSource('flight') as maplibregl.GeoJSONSource | undefined
    source?.setData(flight ?? emptyCollection())
  }, [flight, ready])

  /* The two-pin measure: its pins, and the line once there are two. */
  useEffect(() => {
    if (map.current === null || !ready) return
    const source = map.current.getSource(MEASURE_SOURCE) as maplibregl.GeoJSONSource | undefined
    const points: GeoJSON.Feature[] = measurePins.map((p) => ({
      type: 'Feature',
      properties: { kind: 'pin' },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    }))
    const line: GeoJSON.Feature[] =
      measurePins.length === 2
        ? [
            {
              type: 'Feature',
              properties: { kind: 'line' },
              geometry: { type: 'LineString', coordinates: measurePins.map((p) => [p.lon, p.lat]) },
            },
          ]
        : []
    source?.setData({ type: 'FeatureCollection', features: [...line, ...points] })
  }, [measurePins, ready])

  /* The marked hazards and notes, and the line being drawn over them. */
  useEffect(() => {
    if (map.current === null || !ready) return
    const marked = map.current.getSource(MARK_SOURCE) as maplibregl.GeoJSONSource | undefined
    marked?.setData(markCollection(marks ?? []))
    const draft = map.current.getSource(MARK_DRAFT_SOURCE) as maplibregl.GeoJSONSource | undefined
    draft?.setData(draftCollection(markDraft ?? []))
  }, [marks, markDraft, ready])

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
    if (sunAzimuth === null || sunAltitude === null) {
      setSkyFrame(null)
      return
    }
    setSkyFrame(readSkyFrame(instance, venue, sunAzimuth, sunAltitude))
  }, [sunAzimuth, sunAltitude, venue, viewTick, showTerrain, ready])

  /*
   * THE BUILDINGS, EXTRUDED.
   *
   * GREY BOXES, DELIBERATELY. The heights are the point and the look is not:
   * these exist so the shadow casting and the sightline check have a real
   * obstruction to work against, and anything more decorative would compete
   * with the plan drawn on top of them.
   *
   * A SURVEYED HEIGHT AND A NOMINAL ONE ARE DRAWN DIFFERENTLY. An unmapped
   * height is a nominal box, and a city block of identical nominal boxes that
   * looked surveyed would be the map asserting something nobody recorded. The
   * measured ones are solid; the nominal ones are flatter and more
   * transparent, which reads as "something is here, height unknown".
   */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return

    if (instance.getSource(BUILDING_SOURCE) === undefined) {
      instance.addSource(BUILDING_SOURCE, { type: 'geojson', data: emptyCollection() })
    }
    const source = instance.getSource(BUILDING_SOURCE)
    if (source !== undefined && 'setData' in source) {
      ;(source as maplibregl.GeoJSONSource).setData(
        (buildings ?? emptyCollection()) as GeoJSON.FeatureCollection,
      )
    }

    const present = instance.getLayer(BUILDING_LAYER) !== undefined
    if (showBuildings && !present) {
      /*
       * UNDER EVERYTHING THE APP DRAWS. A position cone behind a building
       * would make the plan read as being inside the geometry rather than on
       * top of it; the first app layer is the insertion point.
       */
      const first = instance.getStyle().layers.find((l) => l.id !== 'esri')?.id
      instance.addLayer(
        {
          id: BUILDING_LAYER,
          type: 'fill-extrusion',
          source: BUILDING_SOURCE,
          minzoom: BUILDINGS_MIN_ZOOM,
          paint: {
            /*
             * THE SURVEYED/NOMINAL DISTINCTION LIVES IN THE COLOUR, NOT THE
             * OPACITY. fill-extrusion-opacity takes no data expression in
             * MapLibre: passing one made the whole layer invalid and it was
             * never added, so nothing drew at all and the only hint was a
             * console line. The colour property does take one, and a darker
             * box reads as "height unknown" just as well.
             */
            'fill-extrusion-color': [
              'case',
              ['get', 'measured'],
              '#8d8f98',
              /* Nominal: darker, so it does not read as surveyed. */
              '#4a4c55',
            ],
            'fill-extrusion-height': ['get', 'drawMetres'],
            'fill-extrusion-base': ['get', 'baseMetres'],
            'fill-extrusion-opacity': 0.8,
          },
        },
        first,
      )
    } else if (!showBuildings && present) {
      instance.removeLayer(BUILDING_LAYER)
    }
  }, [showBuildings, buildings, ready])

  /*
   * TERRAIN ON OR OFF, AND THE SKY THAT COMES WITH IT.
   *
   * THE SOURCE IS ADDED ON FIRST USE rather than at init, so a shooter who
   * never turns terrain on never fetches a DEM tile. Once added it stays:
   * removing a source that terrain has referenced is how you get a style in a
   * half-torn-down state, and the cost of keeping it is zero once setTerrain
   * is null because nothing requests its tiles.
   *
   * THE SKY IS PART OF TERRAIN, NOT A SEPARATE TOGGLE. Tilted over real
   * elevation with no sky, the horizon is a hard edge against the page
   * background and the ridge beyond it reads as a cut-out. With a sky it reads
   * as a horizon, which is the whole point of tilting. Flat and north-up there
   * is no horizon in frame, so there is nothing for a sky to do.
   *
   * THE COLOURS ARE THE APP'S OWN. The same dark ground and the same ocean
   * blue as every other screen, so a tilted map still looks like this app
   * rather than like a different product that happens to be embedded in it.
   */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return

    /* Off for the duration of a gesture. See the note below. */
    if (showTerrain && !gesturing) {
      if (instance.getSource(TERRAIN_SOURCE) === undefined) {
        instance.addSource(TERRAIN_SOURCE, {
          type: 'raster-dem',
          tiles: [TERRARIUM_TILES],
          encoding: 'terrarium',
          /* 256, measured. The default is 512 and would halve every slope. */
          tileSize: 256,
          maxzoom: 15,
          attribution: TERRAIN_ATTRIBUTION,
        })
      }
      instance.setTerrain({ source: TERRAIN_SOURCE, exaggeration: TERRAIN_EXAGGERATION })
      instance.setSky({
        'sky-color': '#1a2740',
        'horizon-color': '#6a7e9c',
        'fog-color': '#0b0b0b',
        'fog-ground-blend': 0.6,
        'horizon-fog-blend': 0.6,
        'sky-horizon-blend': 0.7,
        'atmosphere-blend': 0.8,
      })
    } else {
      instance.setTerrain(null)
      /*
       * atmosphere-blend 0 is how a sky is turned OFF. setSky(undefined) is
       * not in the typed surface and leaving the sky painted with terrain off
       * puts a gradient across a flat top-down map, which is a horizon drawn
       * where there is no horizon.
       */
      instance.setSky({ 'atmosphere-blend': 0 })
    }
  }, [showTerrain, ready, gesturing])

  /*
   * TERRAIN IS SUSPENDED DURING A GESTURE, NOT BY ZOOM.
   *
   * TERRAIN PERFORMANCE IS UNMEASURED ON REAL HARDWARE, and no numbers are
   * written here.
   *
   * There were figures in this comment -- an fps and heap pair for terrain on
   * and off. They came off a throttled desktop profile standing in for a
   * phone, through a harness that was abandoned as unreliable, and they were
   * deleted rather than re-run: a number from a proxy for the device, taken
   * with a harness nobody trusts, is worse than no number, because it reads
   * like evidence.
   *
   * What the design below rests on is not a measurement but a mechanism:
   * rotation is continuous re-tiling, which is what a gesture is, and that is
   * where the cost obviously comes from. Suspending during the gesture
   * follows from that. A real figure needs the phone it is about.
   *
   * WHY NOT BY ZOOM. Because venue zoom is 17 to 19 and that is the only zoom
   * anybody plans at, so a zoom rule suspended it exactly where it was wanted.
   */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    const start = () => setGesturing(true)
    const end = () => setGesturing(false)
    for (const event of ['dragstart', 'rotatestart', 'zoomstart', 'pitchstart'] as const) {
      instance.on(event, start)
    }
    for (const event of ['dragend', 'rotateend', 'zoomend', 'pitchend'] as const) {
      instance.on(event, end)
    }
    return () => {
      for (const event of ['dragstart', 'rotatestart', 'zoomstart', 'pitchstart'] as const) {
        instance.off(event, start)
      }
      for (const event of ['dragend', 'rotateend', 'zoomend', 'pitchend'] as const) {
        instance.off(event, end)
      }
    }
  }, [ready])

  useEffect(() => {
    onTerrainPaused?.(showTerrain && gesturing)
  }, [showTerrain, gesturing, onTerrainPaused])

  /*
   * LABELS ON OR OFF.
   *
   * The layers are ADDED AND REMOVED rather than hidden with a visibility
   * paint property, because a hidden raster layer still has its source in the
   * style and MapLibre will keep its tiles warm. Removing the layer is what
   * actually stops the requests, which is the point of a default-off overlay
   * on a tool used on mobile data.
   *
   * ROADS UNDER PLACES, both above the imagery and BELOW everything the app
   * draws. A place name over a position cone would be the labels competing
   * with the plan; under it they are context, which is what they are for.
   */
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return

    const first = instance.getStyle().layers.find((l) => l.id !== 'esri')?.id
    for (const [source, layer] of [
      [LABEL_SOURCE_ROADS, LABEL_LAYER_ROADS],
      [LABEL_SOURCE_PLACES, LABEL_LAYER_PLACES],
    ] as const) {
      const present = instance.getLayer(layer) !== undefined
      if (showLabels && !present) {
        instance.addLayer({ id: layer, type: 'raster', source }, first)
      } else if (!showLabels && present) {
        instance.removeLayer(layer)
      }
    }
  }, [showLabels, ready])

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
    const data = cloudForecastCollection(skyForecast, skyLayer, windMeters, ratedWindMps)
    source?.setData(data)
    instance.setLayoutProperty(
      'cloud-forecast-fill',
      'visibility',
      showSky && data.features.length > 0 ? 'visible' : 'none',
    )
    instance.setPaintProperty(
      'cloud-forecast-fill',
      'fill-opacity',
      skyLayer === 'wind'
        ? /*
           * WIND IS BANDED, NOT A GRADIENT. The question is which side of the
           * aircraft's rating a cell is on, and a smooth ramp blurs exactly
           * the boundary that decides whether it flies.
           */
          [
            'match',
            ['get', 'band'],
            'calm',
            0.18,
            'workable',
            0.34,
            'near-limit',
            0.5,
            'over',
            0.62,
            0.34,
          ]
        : ['min', ['*', ['get', 'cover'], 0.01, skyForecastOpacity], skyForecastOpacity],
    )
  }, [showSky, skyForecast, skyForecastOpacity, skyLayer, windMeters, ratedWindMps, ready])

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
  /*
   * The lengths last drawn, joined, so a move that changes none of them does
   * no work. It was one number; there is a length per ray now.
   */
  const bearingLengthDrawn = useRef('')

  const drawBearingLines = useCallback((instance: maplibregl.Map, force: boolean) => {
    const input = bearingInputs.current
    /*
     * No pin, no bearing to draw from. Length still has to be reset, or the
     * next pin inherits the length of a frame it was never measured against.
     */
    if (input.venue === null) {
      if (!force) return
      bearingLengthDrawn.current = ''
    }

    const pin = input.venue
    const azimuth = input.sunAzimuth
    const targetPx = rayTargetPx(instance)
    /*
     * THE FLAT ANSWER IS THE SEED. It is exact looking straight down, which
     * is the common case, so the solver usually confirms it in one step and
     * only works when the camera is tilted.
     */
    const seed = raySeedMetres(boundsOf(instance))

    /*
     * THE AXIS IS SOLVED END TO END, which is also how the audit measures it:
     * its two halves have different pixel lengths under pitch, so there is no
     * single half length that is right for both and the honest thing to hold
     * constant is the whole line.
     */
    const halfLength =
      pin === null || azimuth === null
        ? 0
        : solveRayMetres(
            instance,
            (metres) => axisLine(pin, azimuth, metres),
            targetPx * 2,
            seed,
          )

    /* Recorded as they are solved, for the redraw key. */
    const solved: number[] = []
    const lengthFor =
      pin === null
        ? () => 0
        : (bearing: number) => {
            const metres = solveRayMetres(
              instance,
              (trial) => [toPosition(pin), toPosition(bearingLineEnd(pin, bearing, trial))],
              targetPx,
              seed,
            )
            solved.push(metres)
            return metres
          }

    const sunData = sunCollection(pin, azimuth, halfLength)
    const rayData = rayCollection(pin, input.sunOverlay, input.showSun, input.showArc, lengthFor)

    const key = `${halfLength}|${solved.join(',')}`
    if (!force && key === bearingLengthDrawn.current) return
    bearingLengthDrawn.current = key

    const sun = instance.getSource(SUN_SOURCE) as maplibregl.GeoJSONSource | undefined
    sun?.setData(sunData)
    const rays = instance.getSource(RAY_SOURCE) as maplibregl.GeoJSONSource | undefined
    rays?.setData(rayData)
  }, [])

  /*
   * THE TIME PILLS AT THE RAYS' ENDS.
   *
   * Each sunrise, sunset, moonrise and moonset ray ends in a pill saying
   * when, placed where the ray leaves the free map -- below the top bar and
   * chips, above the sheet -- so the time is read where the eye follows the
   * line to. Imperative, on every move, like the rays themselves. Decoration:
   * the same times are in words on the Sky card and the time bar.
   */
  const pillLayer = useRef<HTMLDivElement>(null)
  const latestClock = useRef(rayClock)
  latestClock.current = rayClock
  const drawPills = useCallback((instance: maplibregl.Map) => {
    const layer = pillLayer.current
    if (layer === null) return
    const input = bearingInputs.current
    const clock = latestClock.current
    const overlay = input.sunOverlay
    const pin = input.venue
    const wanted: { kind: string; bearing: number; at: Date }[] = []
    if (clock !== undefined && pin !== null && overlay !== null && input.showSun) {
      if (input.showArc && overlay.arc.sunrise !== null) wanted.push({ kind: 'sunrise', ...overlay.arc.sunrise, bearing: overlay.arc.sunrise.azimuth })
      if (input.showArc && overlay.arc.sunset !== null) wanted.push({ kind: 'sunset', ...overlay.arc.sunset, bearing: overlay.arc.sunset.azimuth })
      const moon = overlay.moon ?? null
      if (moon?.rise) wanted.push({ kind: 'moonrise', at: moon.rise.at, bearing: moon.rise.azimuth })
      if (moon?.set) wanted.push({ kind: 'moonset', at: moon.set.at, bearing: moon.set.azimuth })
    }
    while (layer.children.length > wanted.length) layer.lastElementChild?.remove()
    while (layer.children.length < wanted.length) {
      const el = document.createElement('span')
      layer.append(el)
    }
    if (pin === null || wanted.length === 0) return
    const frame = instance.getContainer().getBoundingClientRect()
    const below = (sel: string) => Math.max(0, ...[...document.querySelectorAll(sel)].map((n) => n.getBoundingClientRect().bottom - frame.top))
    const above = (sel: string) => Math.min(frame.height, ...[...document.querySelectorAll(sel)].map((n) => n.getBoundingClientRect().top - frame.top))
    const box = { left: 8, right: frame.width - 8, top: below('.topbar, .chips2') + 6, bottom: above('.sheet, .tooldock') - 6 }
    const origin = instance.project([pin.lon, pin.lat])
    wanted.forEach((pill, i) => {
      const el = layer.children[i] as HTMLElement
      el.className = `raypill raypill--${pill.kind} num`
      el.textContent = clock?.(pill.at) ?? ''
      const far = bearingLineEnd(pin, pill.bearing, 50_000)
      const end = instance.project([far.lon, far.lat])
      const size = el.getBoundingClientRect()
      const at = edgePoint(origin, { x: end.x - origin.x, y: end.y - origin.y }, box, { w: size.width / 2 + 2, h: size.height / 2 + 2 })
      el.hidden = at === null
      if (at !== null) el.style.transform = `translate(${at.x - size.width / 2}px, ${at.y - size.height / 2}px)`
    })
  }, [])
  useEffect(() => {
    const instance = map.current
    if (instance === null || !ready) return
    drawPills(instance)
    const onMove = () => drawPills(instance)
    instance.on('move', onMove)
    return () => {
      instance.off('move', onMove)
    }
  }, [ready, drawPills, venue, sunOverlay, showSun, showArc, rayClock])

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
      ...floatingChromeNodes(document, [...FLOATING_CHROME_SELECTORS, '.pin', '.shooter__flag']),
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
      /*
       * THE PLATE KEEPS ITS WORD AND LOSES ITS NUMBER.
       *
       * "SUN" and "SHADOW" are what the ray is; the bearing is the receipt for
       * it. With the receipts off the plate is still a labelled ray pointing
       * somewhere, which is the whole content of the overlay.
       *
       * BOTH PLATES OR NEITHER. showNumerals is one flag for every ray, so SUN
       * and SHADOW cannot end up with one carrying a bearing and the other
       * bare -- which would read as "we know where the sun is and not the
       * shadow", a claim about the data rather than about the setting.
       */
      el.innerHTML =
        `<span class="ray-label__text">${label.text}</span>` +
        (showNumerals
          ? `<span class="ray-label__deg num">${label.bearing.toFixed(1)}\u00B0</span>`
          : '')
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
  }, [venue, sunOverlay, showSun, showArc, viewTick, chromeTick, bottomInset, showNumerals])

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
      <div className="raypills" ref={pillLayer} aria-hidden="true" />
      {/*
        * THE SUN, IN THE SKY, OVER THE CANVAS.
        *
        * A DOM overlay rather than a map layer because it is not on the map:
        * it is a direction at infinity, which has no coordinate to attach a
        * marker to. See src/core/sunSky.ts.
        */}
      <SunInSky frame={skyFrame} />
      {credits === null ? null : <CreditsSheet lines={credits} onClose={() => setCredits(null)} />}
      {plan.map((planned, index) => {
        const host = figureEls[planned.position.id]
        if (host === undefined) return null
        return createPortal(
          <ShooterFigure
            number={planned.position.number}
            focalLength={planned.focalLength}
            /*
             * NULL WHEN EVERY PLATE WOULD CARRY THE SAME WORD. Six plates
             * reading SIGMA is six copies of a constant; see core/mapLabel.ts.
             */
            opticName={planned.optic.name}
            opticTag={plates[index]?.tag ?? null}
            classification={classificationOf(planned.read)}
            shotType={planned.position.shotType}
            warnings={planned.warnings}
            framingWarnings={planned.framingWarnings}
            frameSubjectRatio={planned.frameSubjectRatio}
            blockedCount={planned.blockedBy.length}
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
