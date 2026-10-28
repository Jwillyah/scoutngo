/*
 * THE CLAY MODEL: CesiumJS drawing the place from the map data this app
 * already has, and nothing else.
 *
 *   ground     aerial imagery draped on AWS Terrarium elevation, lit by the
 *              sun so ridgelines read: the sharpest free source covering
 *              the venue (src/data/imagerySources.ts), Esri's elsewhere and
 *              for any tile it lacks; one zoom for everything within
 *              NEAR_M of the view, so neighbouring tiles match
 *   sea        offshore of the map's coastline, the animated water
 *              (src/three/cinema.ts) instead of the photo's sea
 *   buildings  OpenStreetMap footprints, extruded in warm clay, each with
 *              its outline on the ground; a building with no recorded
 *              height is drawn a flat lighter tone at the nominal picture
 *              height, and casts NO shadow (as in 2D: src/core/shadowMap.ts,
 *              "no height, no shadow"). With a kept 3D scan, the heights,
 *              the ground and the trees are the scan's (src/lib/lidar/)
 *   trees      mapped single trees as rounded clay-green shapes, or none
 *              where the mapping is sparse (src/lib/trees.ts)
 *   light      one directional light along suncalc's sun (src/core/sky3d.ts),
 *              always at the day's strength so dawn and dusk read; shadows
 *              only while the sun is up. The engine's own sun and moon are
 *              not added
 *   loading    the canvas stays hidden, with the 2D map showing through,
 *              until the first view's tiles have all arrived (whenShown):
 *              no white sky and no blank globe while it loads
 *   sky        the sun and moon arcs from suncalc, hour dots, time pills
 *
 * NO CESIUM ION, NO BING, NO GOOGLE. The base layer is turned off, there is
 * no geocoder, and every tile the engine asks for goes through loadTile
 * (src/lib/offlineCache.ts): the same saved copy the 2D map reads, else the
 * same Esri or AWS URL, under the same timeout. scripts/audit-3d-network.mjs
 * fails the gate on any other host.
 *
 * Loaded only when 3D is opened (src/components/Clay3D.tsx imports it).
 */
import '@cesium/engine/Source/Widget/CesiumWidget.css'
import {
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  Cartographic,
  CesiumWidget,
  Color,
  ColorMaterialProperty,
  ConstantPositionProperty,
  Credit,
  CustomHeightmapTerrainProvider,
  DirectionalLight,
  Entity,
  HeadingPitchRange,
  HeightReference,
  ImageryLayer,
  JulianDate,
  LabelStyle,
  Math as CMath,
  Rectangle,
  Matrix4,
  sampleTerrain,
  ShadowMode,
  Transforms,
  UrlTemplateImageryProvider,
  VerticalOrigin,
  WebMercatorTilingScheme,
  CameraEventType,
  type ImageryTypes,
  type TerrainProvider,
} from '@cesium/engine'
import { NOMINAL_DRAW_HEIGHT } from '../core/buildingHeight.ts'
import type { LatLon } from '../core/geo.ts'
import { CLAY_LIGHT_INTENSITY, clayLight, domePoint, skyArc, sunlightEnu, type SkyArc } from '../core/sky3d.ts'
import { getSunPosition } from '../core/sun.ts'
import { heightGrid, sourceFor } from '../core/terrarium.ts'
import { lowerSea, overlayDtm } from '../lib/lidar/terrain.ts'
import { horizontalFov, previewNote, WATERMARK, type FlightPlay } from '../lib/preflight/play.ts'
import { buildSea, createCinema, type Cinema, type CinemaInputs } from './cinema.ts'
import { drift, easedTime, FPS, frameTimes, subframeTimes } from '../core/gimbal.ts'
import { clipEncoder, clipSize } from '../lib/cinema/encode.ts'
import { bearingBetween, distanceMeters } from '../core/geo.ts'
import type { Rasters } from '../lib/lidar/raster.ts'
import { formatHour } from '../core/timezone.ts'
import type { Building } from '../lib/buildings.ts'
import { loadTile } from '../lib/offlineCache.ts'
import { IMAGERY_TEMPLATE, TERRAIN_TEMPLATE } from '../lib/offlineSources.ts'
import { covers, pickImagery, sourceTileUrl, type ImagerySource } from '../data/imagerySources.ts'
import { tileUrl } from '../lib/tileRange.ts'
import { NOMINAL_TREE_HEIGHT, type MappedTree } from '../lib/trees.ts'

/*
 * WARM CLAY, NOT WHITE (27 Oct, the pier: "pure white boxes glare"). The
 * walls a sand clay, the roofs a step darker so a block reads as a block
 * from above; the sun's light shades each face by its angle to the sun, and
 * the engine's ambient occlusion darkens the ground at the walls' feet.
 */
export const CLAY = '#d8c3a5'
export const CLAY_ROOF = '#bba68a'
/* Unknown height: lighter. */
const CLAY_UNKNOWN = '#ece2d2'
const CLAY_UNKNOWN_ROOF = '#ddd1bf'
/* The footprint drawn on the ground as the shade at a building's foot: a dark warm brown. */
const FOOT_SHADE = '#3a2a1c'
const TREE_GREEN = '#a9b694'
const SKY_RADIUS = 1500
/* The longest the canvas stays hidden waiting for its first tiles. */
export const SHOW_WITHIN_MS = 30_000
/* 129 across a 256 px tile: every other pixel, close enough to read within a metre of the 2D map. */
const HEIGHT_SAMPLES = 129
const ESRI_CREDIT = 'Tiles by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
/*
 * ONE ZOOM NEAR THE VIEW. Within NEAR_M of the view's centre every tile is
 * drawn at NEAR_ZOOM, whatever the engine would pick for it, so neighbours
 * match: at the pier on 27 Oct the photo was a patchwork of strips from
 * different zooms, each flown on a different day. Beyond, FAR_ZOOM at most:
 * the far layer is drawn under the near one too, so each zoom it may use is
 * tiles fetched and hidden. At 1000 m and 17 the 3D network audit's globe
 * had not settled in 60 s (598 imagery tiles); 800 m and 16 is about 200
 * tiles of some 120 m at zoom 18 near, and the rest far.
 */
export const NEAR_M = 800
/* Frames a second in the plain view (see the widget's targetFrameRate below). */
const PLAIN_FPS = 20
export const NEAR_ZOOM = 18
/* Ground tiles at this level are about 1.2 km across: at most 64 near-zoom tiles each. */
const NEAR_MIN_TERRAIN = 15
const FAR_ZOOM = 16

const token = (name: string, fallback: string) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v === '' ? fallback : v
}

/** Twice a ring's area in square degrees, unsigned: zero for a line or a point. */
function ringDegrees2(ring: readonly [number, number][]): number {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1])
  return Math.abs(sum)
}

/* ------------------------------------------------------------- tile sources */

/* How many tiles the model has drawn from, for the network audit's "did it look at all". */
export const tileCounts = { imagery: 0, terrain: 0 }

async function tileBytes(url: string): Promise<ArrayBuffer> {
  const { data } = await loadTile({ url }, new AbortController())
  return data
}

const isPng = (b: ArrayBuffer) => {
  const h = new Uint8Array(b, 0, Math.min(4, b.byteLength))
  return h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47
}

/** The centre of a Web Mercator tile, for asking whether a source covers it. */
function tileCentre(x: number, y: number, z: number): LatLon {
  const n = 2 ** z
  const lon = ((x + 0.5) / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI
  return { lat, lon }
}

/*
 * THE IMAGERY, read through the 2D map's tile cache: the venue's source
 * where it covers the tile, Esri's where it does not or has no tile. A
 * source that draws tiles on request answers a transparent PNG where part of
 * the tile is outside its pictures; that is laid over Esri's tile, so the
 * edge of its coverage has no holes.
 */
class CachedImagery extends UrlTemplateImageryProvider {
  private readonly source: ImagerySource | null
  constructor(opts: { maximumLevel: number; minimumLevel?: number; rectangle?: InstanceType<typeof Rectangle>; source: ImagerySource | null }) {
    super({
      url: IMAGERY_TEMPLATE,
      tilingScheme: new WebMercatorTilingScheme(),
      maximumLevel: opts.maximumLevel,
      minimumLevel: opts.minimumLevel ?? 0,
      rectangle: opts.rectangle,
      credit: new Credit(opts.source === null ? ESRI_CREDIT : `${opts.source.attribution}. ${ESRI_CREDIT}`),
    })
    this.source = opts.source
  }
  override requestImage(x: number, y: number, level: number): Promise<ImageryTypes> {
    const esri = () => tileBytes(tileUrl(IMAGERY_TEMPLATE, { x, y, z: level }))
    const src = this.source
    const bitmap = (b: ArrayBuffer) => createImageBitmap(new Blob([b]))
    const drawn =
      src === null || level > src.maxZoom || !covers(src, tileCentre(x, y, level))
        ? esri().then(bitmap)
        : tileBytes(sourceTileUrl(src, x, y, level)).then(async (b) => {
            if (!isPng(b)) return bitmap(b)
            /* Part of the tile is outside the source's pictures: over Esri's. */
            const [under, over] = await Promise.all([esri().then(bitmap), bitmap(b)])
            const canvas = document.createElement('canvas')
            canvas.width = under.width
            canvas.height = under.height
            const ctx = canvas.getContext('2d')
            if (ctx === null) return over
            ctx.drawImage(under, 0, 0)
            ctx.drawImage(over, 0, 0, under.width, under.height)
            return createImageBitmap(canvas)
          }, () => esri().then(bitmap))
    return drawn.then((image) => {
      tileCounts.imagery += 1
      return image
    })
  }
}

/** A square NEAR_M either side of a place, as the engine's rectangle. */
function nearRectangle(at: LatLon): InstanceType<typeof Rectangle> {
  const dLat = (NEAR_M / 6_371_000) * (180 / Math.PI)
  const dLon = dLat / Math.cos((at.lat * Math.PI) / 180)
  return Rectangle.fromDegrees(at.lon - dLon, at.lat - dLat, at.lon + dLon, at.lat + dLat)
}

/** Decoded terrarium tiles, a few kept so a level's children reuse their parent. */
const decoded = new Map<string, Promise<Uint8ClampedArray>>()
async function terrariumPixels(x: number, y: number, z: number): Promise<Uint8ClampedArray> {
  const key = `${z}/${x}/${y}`
  let hit = decoded.get(key)
  if (hit === undefined) {
    hit = tileBytes(tileUrl(TERRAIN_TEMPLATE, { x, y, z })).then(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([bytes]), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx === null) throw new Error('no 2D context to read elevation')
      ctx.drawImage(bitmap, 0, 0)
      return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
    })
    decoded.set(key, hit)
    if (decoded.size > 64) decoded.delete(decoded.keys().next().value as string)
    hit.catch(() => decoded.delete(key))
  }
  return hit
}

export interface GroundStatus {
  /** Tiles of elevation that could not be had (offline and not saved), drawn flat. */
  flatTiles: number
}

function terrarium(status: GroundStatus, onChange: () => void, scan: Rasters | null): TerrainProvider {
  return new CustomHeightmapTerrainProvider({
    width: HEIGHT_SAMPLES,
    height: HEIGHT_SAMPLES,
    tilingScheme: new WebMercatorTilingScheme(),
    credit: new Credit('Elevation: Terrarium, AWS Open Data'),
    callback: async (x, y, level) => {
      const src = sourceFor({ x, y, z: level })
      try {
        const px = await terrariumPixels(src.tile.x, src.tile.y, src.tile.z)
        tileCounts.terrain += 1
        const grid = heightGrid(px, Math.round(Math.sqrt(px.length / 4)), HEIGHT_SAMPLES, src.u0, src.v0, src.span)
        /* The sea floor below any tide, then inside a kept scan's patch the lidar ground (src/lib/lidar/terrain.ts). */
        lowerSea(grid)
        if (scan !== null && level >= 13) overlayDtm(grid, HEIGHT_SAMPLES, { x, y, z: level }, scan)
        return grid
      } catch {
        /* Not saved and no signal. Drawn flat, and counted so the screen can say so. */
        status.flatTiles += 1
        onChange()
        return new Float32Array(HEIGHT_SAMPLES * HEIGHT_SAMPLES)
      }
    },
  })
}

/* ------------------------------------------------------------------- scene */

export interface Pin {
  number: number
  at: LatLon
}

export interface ObserverView {
  at: LatLon
  heightAboveGround: number
  heading: number
  pitch: number
  /** The 3D camera's horizontal angle, degrees. */
  viewHorizontal: number
}

export interface ClayScene {
  /** Resolves once the first view's tiles have arrived, or SHOW_WITHIN_MS has passed. */
  whenShown(): Promise<void>
  /** The sun the light was last set from, for checks. */
  sunNow(): { azimuth: number; altitude: number }
  setTime(at: Date): void
  setBuildings(buildings: readonly Building[]): void
  setTrees(trees: readonly MappedTree[]): void
  setPins(pins: readonly Pin[]): void
  setSkyDay(dayStart: Date): void
  orbit(): void
  /** Fly a Preflight move; with record, resolves to the watermarked clip. */
  /** onNote: what the preview says over itself, once it has started (src/lib/preflight/play.ts previewNote). */
  playPath(play: FlightPlay, onTime: (at: Date) => void, onProgress?: (share: number) => void, onNote?: (note: string) => void): Promise<Blob | null>
  droneView(at: LatLon, altAbsM: number, yaw: number, gimbal: number, focal: number): void
  setCeiling(centre: LatLon | null, altAbsM: number, alpha: number): void
  startRecording(): { stop: () => Promise<Blob | null> } | null
  observe(view: ObserverView): Promise<void>
  /**
   * What is under a screen pixel, by the depth buffer: buildings included.
   * A real Cartesian2, because the engine caches picks by the position's
   * toString() and a plain {x, y} reads the same for every pixel.
   */
  pickAt(x: number, y: number): LatLon | null
  /** The ground's height at a place, from the elevation the model is drawn on. */
  groundAt(at: LatLon): Promise<number | null>
  /** Straight down on a place from a height, for checks that read the ground. */
  lookDown(at: LatLon, height: number): void
  /** The buildings drawn, so a check can put the same list through the 2D shadow code. */
  buildings(): readonly Building[]
  /** Tiles drawn from so far. */
  counts: typeof tileCounts
  /** The water offshore (src/three/cinema.ts buildSea), from the preview's own inputs; null takes it away. */
  setSea(inputs: CinemaInputs | null): void
  /** Screen x,y for a place, or null off screen: for checking what the camera is looking at. */
  project(at: LatLon, height?: number): { x: number; y: number } | null
  widget: CesiumWidget
  destroy(): void
}

export function createClayScene(
  container: HTMLElement,
  venue: LatLon,
  timeZone: string,
  status: GroundStatus,
  onStatus: () => void,
  scan: Rasters | null = null,
): ClayScene {
  const widget = new CesiumWidget(container, {
    baseLayer: false,
    terrainProvider: terrarium(status, onStatus, scan),
    /* No stars, and no engine sun or moon: the sky's bodies are ours. */
    skyBox: false,
    shadows: true,
    terrainShadows: ShadowMode.ENABLED,
    scene3DOnly: true,
    msaaSamples: 4,
  })
  const scene = widget.scene
  /*
   * NEVER A HOLE. A coarse layer (to zoom 13, a handful of tiles that arrive
   * first) lies under the sharp one, so where a sharp tile has not loaded or
   * failed the coarser picture shows instead of a dark patch. 1st St jetty,
   * 27 Oct: a patchwork with dark green holes. The engine has no cross-fade
   * between imagery levels, so the change from coarse to sharp is a swap.
   */
  widget.imageryLayers.add(new ImageryLayer(new CachedImagery({ maximumLevel: 13, source: null })))
  /*
   * FAR OFF, ESRI'S, to FAR_ZOOM. Near the view, the sharpest free source
   * covering the venue (src/data/imagerySources.ts), Esri's where it has no
   * tile. The source was the far layer too, and a state's drawn-on-request
   * tiles that timed out fell back to Esri's one by one: a beach of light
   * and grey triangles at Ocean City (28 Oct). One boundary, at NEAR_M,
   * instead.
   */
  const source = pickImagery(venue)
  widget.imageryLayers.add(new ImageryLayer(new CachedImagery({ maximumLevel: FAR_ZOOM, source: null })))
  /*
   * AND NEAR THE VIEW, ONE ZOOM: a layer whose provider answers only at
   * NEAR_ZOOM, inside NEAR_M of the view's centre. It moves with the view
   * when the view has gone more than half of NEAR_M from it.
   */
  let nearLayer: InstanceType<typeof ImageryLayer> | null = null
  let nearAt: LatLon | null = null
  const placeNear = (at: LatLon) => {
    if (nearAt !== null && distanceMeters(nearAt, at) < NEAR_M / 2) return
    if (nearLayer !== null) widget.imageryLayers.remove(nearLayer, true)
    /*
     * ONLY ON FINE GROUND TILES (NEAR_MIN_TERRAIN and deeper). The engine
     * stitches every imagery tile a ground tile covers into its texture: a
     * coarse ground tile over the whole square took about 170 of them, at
     * every coarse level, and the 3D network audit's page never settled.
     * Proved by turning this layer off: 260 tiles and loaded. Coarser
     * ground, far off, wears the far layer.
     */
    nearLayer = new ImageryLayer(new CachedImagery({ maximumLevel: NEAR_ZOOM, minimumLevel: NEAR_ZOOM, rectangle: nearRectangle(at), source }), { minimumTerrainLevel: NEAR_MIN_TERRAIN })
    widget.imageryLayers.add(nearLayer)
    nearAt = at
  }
  placeNear(venue)
  /* Where the camera looks (the ground at the middle of the screen, else under the camera), checked as it settles. */
  widget.camera.moveEnd.addEventListener(() => {
    const canvas = scene.canvas
    const hit = widget.camera.pickEllipsoid(new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2))
    const c = hit === undefined ? widget.camera.positionCartographic : Cartographic.fromCartesian(hit)
    placeNear({ lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude) })
  })
  /* Where a tile has not arrived yet: a dark ground, not the engine's bright blue. */
  scene.globe.baseColor = Color.fromCssColorString('#1d2124')
  scene.globe.enableLighting = true
  scene.globe.dynamicAtmosphereLighting = false
  scene.globe.depthTestAgainstTerrain = true
  scene.globe.maximumScreenSpaceError = 1.5
  scene.fog.enabled = true
  /*
   * SHADOW SETTINGS, CHOSEN BY LOOKING (scripts/measure-3d-shadows.mjs).
   * At the defaults the ground was striped with self-shadow and no building
   * shadow reached it. Hard edges at 1.5 km with a larger terrain depth bias
   * put the 39 m block's shadow on the ground beside it and clear the
   * stripes. _terrainBias is the engine's own, unexported: pinned to
   * @cesium/engine 26.4.0, which package.json holds exactly.
   *
   * SOFT EDGES. Hard edges at 2048 drew the long evening shadows of the
   * Virginia Beach hotels as 5 to 10 m stair-steps across the beach; soft
   * filtering takes the steps out at the same map size (4096 would cost a
   * phone about 64 MB of graphics memory).
   */
  if (scene.shadowMap !== undefined) {
    scene.shadowMap.softShadows = true
    scene.shadowMap.size = 2048
    scene.shadowMap.maximumDistance = 1500
    scene.shadowMap.darkness = 0.45
    const bias = (scene.shadowMap as unknown as { _terrainBias?: { depthBias: number; normalOffsetScale: number } })._terrainBias
    if (bias !== undefined) {
      bias.depthBias = 0.002
      bias.normalOffsetScale = 3
    }
    /*
     * AND THE BUILDINGS' OWN. Roofs and walls flickered with a sawtooth at the
     * 1st St jetty on 27 Oct: each face shadowing itself (shadow acne). The
     * primitive bias, same engine object, pushes the comparison off the face.
     */
    const prim = (scene.shadowMap as unknown as { _primitiveBias?: { depthBias: number; normalOffsetScale: number; normalShading: boolean } })._primitiveBias
    if (prim !== undefined) {
      prim.depthBias = 0.0004
      prim.normalOffsetScale = 0.6
      prim.normalShading = true
    }
  }
  widget.clock.shouldAnimate = false
  /*
   * PLAIN_FPS FRAMES A SECOND IN THE PLAIN VIEW, NOT 60. With the sea, the
   * roofs and the shade at the walls' feet, 60 kept a software-drawn page so
   * busy the 3D network audit could not get a word in (28 Oct), and on a
   * phone it is battery for nothing. Drawing only on request starved the
   * globe instead: it fetches tiles as it draws, and 96 arrived in a minute
   * against 408. A move played or recorded, and flying, run at full rate.
   */
  widget.targetFrameRate = PLAIN_FPS

  const origin = Cartesian3.fromDegrees(venue.lon, venue.lat)
  /* At run time Transforms borrows this from FixedFrameTransforms; engine 26's typings leave it off. */
  const enu = (Transforms as unknown as { eastNorthUpToFixedFrame: (o: InstanceType<typeof Cartesian3>) => InstanceType<typeof Matrix4> }).eastNorthUpToFixedFrame(origin)
  const enuToFixedVector = (v: [number, number, number]) =>
    Cartesian3.normalize(Matrix4.multiplyByPointAsVector(enu, new Cartesian3(v[0], v[1], v[2]), new Cartesian3()), new Cartesian3())
  const enuToFixedPoint = (v: [number, number, number]) => Matrix4.multiplyByPoint(enu, new Cartesian3(v[0], v[1], v[2]), new Cartesian3())

  /* ------------------------------------------------------------ the light */
  const light = new DirectionalLight({ direction: enuToFixedVector([0, 0, -1]), intensity: CLAY_LIGHT_INTENSITY })
  scene.light = light
  let sunNow = { azimuth: 180, altitude: 45 }
  const setTime = (at: Date) => {
    widget.clock.currentTime = JulianDate.fromDate(at)
    const sun = getSunPosition(at, venue.lat, venue.lon)
    sunNow = sun
    light.direction = enuToFixedVector(sunlightEnu(at, venue.lat, venue.lon))
    /* The base light always; below the horizon there is no sunlight to cast anything, so no shadows. */
    const lit = clayLight(sun.altitude)
    light.intensity = lit.intensity
    if (scene.shadowMap !== undefined) scene.shadowMap.enabled = lit.shadows
    scene.requestRender()
  }

  /* -------------------------------------------------------- the buildings */
  let buildingEntities: Entity[] = []
  let drawnBuildings: readonly Building[] = []
  const setBuildings = (buildings: readonly Building[]) => {
    drawnBuildings = buildings
    for (const e of buildingEntities) widget.entities.remove(e)
    buildingEntities = []
    for (const b of buildings) {
      const known = b.height.metres !== null
      const flat = b.ring.flatMap(([lon, lat]) => [lon, lat])
      /* A footprint of no area, from any source, would stop the engine for good: its centre is found by dividing by the area. */
      if (flat.length < 6 || !flat.every(Number.isFinite) || ringDegrees2(b.ring) === 0) continue
      buildingEntities.push(
        widget.entities.add({
          polygon: {
            hierarchy: Cartesian3.fromDegreesArray(flat),
            heightReference: HeightReference.CLAMP_TO_GROUND,
            extrudedHeight: known ? (b.height.metres as number) : NOMINAL_DRAW_HEIGHT,
            extrudedHeightReference: HeightReference.RELATIVE_TO_GROUND,
            /*
             * UNKNOWN HEIGHT IS A FLAT LIGHTER TONE, NO PATTERN. The stripes it
             * had aliased into a speckle on a phone (1st St jetty, 27 Oct).
             */
            material: new ColorMaterialProperty(Color.fromCssColorString(known ? CLAY : CLAY_UNKNOWN)),
            /* Unknown height casts nothing: a shadow from an invented height is invented shade. */
            shadows: known ? ShadowMode.ENABLED : ShadowMode.RECEIVE_ONLY,
          },
        }),
      )
      /* The roof, a step darker, laid a few centimetres over the block's top. */
      buildingEntities.push(
        widget.entities.add({
          polygon: {
            hierarchy: Cartesian3.fromDegreesArray(flat),
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            height: (known ? (b.height.metres as number) : NOMINAL_DRAW_HEIGHT) + 0.05,
            material: new ColorMaterialProperty(Color.fromCssColorString(known ? CLAY_ROOF : CLAY_UNKNOWN_ROOF)),
            shadows: ShadowMode.RECEIVE_ONLY,
          },
        }),
      )
      /*
       * ITS FOOTPRINT ON THE GROUND, AS THE SOFT SHADE AT ITS FOOT. A dark
       * warm band along the base, half see-through, reads as the shade where
       * a wall meets the ground (one band: each is a line draped on the
       * ground, and two a building doubled the cost of drawing them). The engine's own ambient
       * occlusion was tried first: a full-screen pass every frame, and the 3D
       * network audit's page never settled with it on (28 Oct). The band also
       * keeps what the light outline did: satellite photos lean, and the
       * footprint lets the eye match block to photo (1st St jetty, 27 Oct).
       */
      buildingEntities.push(
        widget.entities.add({
          polyline: {
            positions: Cartesian3.fromDegreesArray([...flat, flat[0], flat[1]]),
            clampToGround: true,
            width: 5,
            material: Color.fromCssColorString(FOOT_SHADE).withAlpha(0.24),
          },
        }),
      )
    }
    scene.requestRender()
  }

  /* ------------------------------------------------------------ the trees */
  let treeEntities: Entity[] = []
  const setTrees = (trees: readonly MappedTree[]) => {
    for (const e of treeEntities) widget.entities.remove(e)
    treeEntities = trees.map((t) => {
      const h = t.height ?? NOMINAL_TREE_HEIGHT
      return widget.entities.add({
        position: Cartesian3.fromDegrees(t.at.lon, t.at.lat, h * 0.6),
        ellipsoid: {
          radii: new Cartesian3(h * 0.35, h * 0.35, h * 0.45),
          heightReference: HeightReference.RELATIVE_TO_GROUND,
          material: Color.fromCssColorString(TREE_GREEN),
          shadows: t.height === null ? ShadowMode.RECEIVE_ONLY : ShadowMode.ENABLED,
        },
      })
    })
    scene.requestRender()
  }

  /* -------------------------------------------------------------- the pins */
  let pinEntities: Entity[] = []
  const pinImage = (n: number) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 36 48"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe58a"/><stop offset=".5" stop-color="#c88711"/><stop offset="1" stop-color="#a86a05"/></linearGradient></defs><path d="M18 47l-7-13h14z" fill="#a86a05"/><circle cx="18" cy="18" r="16" fill="url(#g)" stroke="#fff" stroke-opacity=".6"/><ellipse cx="18" cy="10" rx="10" ry="5" fill="#fff" fill-opacity=".4"/><text x="18" y="24" text-anchor="middle" font-family="monospace" font-weight="700" font-size="16" fill="#fff">${n}</text></svg>`
    return `data:image/svg+xml;base64,${btoa(svg)}`
  }
  const setPins = (pins: readonly Pin[]) => {
    for (const e of pinEntities) widget.entities.remove(e)
    pinEntities = pins.map((p) =>
      widget.entities.add({
        position: Cartesian3.fromDegrees(p.at.lon, p.at.lat),
        billboard: {
          image: pinImage(p.number),
          verticalOrigin: VerticalOrigin.BOTTOM,
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }),
    )
    scene.requestRender()
  }

  /* ---------------------------------------------------------- the sky arcs */
  let skyEntities: Entity[] = []
  const setSkyDay = (dayStart: Date) => {
    for (const e of skyEntities) widget.entities.remove(e)
    skyEntities = []
    const sunColour = Color.fromCssColorString(token('--sun', '#ffd54a'))
    const moonColour = Color.fromCssColorString(token('--grey-1', '#b4b4b4'))
    const pillBg = Color.fromCssColorString(token('--mark-edge', '#0a0b09')).withAlpha(0.82)
    const draw = (arc: SkyArc) => {
      const colour = arc.body === 'sun' ? sunColour : moonColour
      skyEntities.push(
        widget.entities.add({
          polyline: {
            positions: arc.path.map((s) => enuToFixedPoint(domePoint(s, SKY_RADIUS))),
            width: arc.body === 'sun' ? 3 : 2,
            /* Solid for both: a dash pattern on a line this long breaks into confetti near the eye. */
            material: new ColorMaterialProperty(arc.body === 'sun' ? colour : colour.withAlpha(0.8)),
            arcType: 0,
          },
        }),
      )
      for (const h of arc.hours) {
        skyEntities.push(
          widget.entities.add({
            position: enuToFixedPoint(domePoint(h, SKY_RADIUS)),
            point: { pixelSize: 7, color: colour, outlineColor: Color.BLACK, outlineWidth: 1 },
            label: {
              text: formatHour(h.at, timeZone),
              font: '600 12px ui-monospace, Menlo, monospace',
              fillColor: Color.WHITE,
              showBackground: true,
              backgroundColor: pillBg,
              backgroundPadding: new Cartesian2(6, 3),
              style: LabelStyle.FILL,
              pixelOffset: new Cartesian2(0, -16),
              verticalOrigin: VerticalOrigin.BOTTOM,
            },
          }),
        )
      }
    }
    for (const arc of skyArc('sun', dayStart, venue.lat, venue.lon)) draw(arc)
    for (const arc of skyArc('moon', dayStart, venue.lat, venue.lon)) draw(arc)
    /* Where the sun is on the time bar, as a disc on its arc. */
    skyEntities.push(
      widget.entities.add({
        position: new ConstantPositionProperty(enuToFixedPoint(domePoint(sunNow, SKY_RADIUS))),
        point: {
          pixelSize: 16,
          color: new CallbackProperty(() => (sunNow.altitude > 0 ? sunColour : Color.TRANSPARENT), false),
          outlineColor: Color.WHITE,
          outlineWidth: 2,
        },
      }),
    )
    const disc = skyEntities[skyEntities.length - 1]
    const follow = () => (disc.position = new ConstantPositionProperty(enuToFixedPoint(domePoint(sunNow, SKY_RADIUS))))
    scene.preRender.addEventListener(follow)
    scene.requestRender()
  }

  /* ------------------------------------------------------------ the camera */
  const controller = scene.screenSpaceCameraController
  const defaults = { look: controller.lookEventTypes }
  const orbit = () => {
    controller.enableTranslate = true
    controller.enableZoom = true
    controller.enableTilt = true
    controller.enableRotate = true
    controller.lookEventTypes = defaults.look
    widget.camera.frustum = widget.camera.frustum.clone()
    widget.camera.lookAt(Cartesian3.fromDegrees(venue.lon, venue.lat, 5), new HeadingPitchRange(CMath.toRadians(20), CMath.toRadians(-32), 750))
    widget.camera.lookAtTransform(Matrix4.IDENTITY)
    scene.requestRender()
  }

  const observe = async (view: ObserverView) => {
    const [ground] = await sampleTerrain(widget.terrainProvider, 15, [Cartographic.fromDegrees(view.at.lon, view.at.lat)])
    const h = (ground?.height ?? 0) + view.heightAboveGround
    widget.camera.setView({
      destination: Cartesian3.fromDegrees(view.at.lon, view.at.lat, h),
      orientation: { heading: CMath.toRadians(view.heading), pitch: CMath.toRadians(view.pitch), roll: 0 },
    })
    /* The engine takes the larger dimension's angle. */
    const canvas = widget.canvas
    const frustum = widget.camera.frustum as { fov?: number }
    const horizontal = CMath.toRadians(view.viewHorizontal)
    frustum.fov =
      canvas.clientWidth >= canvas.clientHeight ? horizontal : 2 * Math.atan(Math.tan(horizontal / 2) * (canvas.clientHeight / canvas.clientWidth))
    /* Stand still and look around: drag turns the head, nothing moves the feet. */
    controller.enableTranslate = false
    controller.enableZoom = false
    controller.enableTilt = false
    controller.enableRotate = false
    controller.lookEventTypes = [CameraEventType.LEFT_DRAG]
    scene.requestRender()
  }

  /*
   * PREFLIGHT: FLY THE MOVE. The camera rides the path, metres above the
   * takeoff point's ground, looking at the subject through the chosen
   * camera's horizontal field of view, and the time follows the move. With
   * `record`, every frame is drawn onto a second canvas with the watermark
   * and recorded (MediaRecorder): the clip comes back as a Blob.
   */
  let playing: { stop: () => void } | null = null
  /*
   * RECORDING: every frame drawn onto a second canvas with the watermark, and
   * that canvas recorded (MediaRecorder). Null where the browser cannot.
   */
  const startRecording = (): { stop: () => Promise<Blob | null> } | null => {
    if (typeof MediaRecorder === 'undefined') return null
    const canvas = widget.canvas
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')
    const compose = () => {
      if (ctx === null) return
      ctx.drawImage(canvas, 0, 0)
      ctx.font = `${Math.round(out.height / 40)}px system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(WATERMARK, Math.round(out.width / 30), out.height - Math.round(out.height / 30))
    }
    scene.postRender.addEventListener(compose)
    const type = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    const recorder = new MediaRecorder(out.captureStream(30), type === '' ? undefined : { mimeType: type })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => chunks.push(e.data)
    recorder.start()
    return {
      stop: () =>
        new Promise<Blob | null>((resolve) => {
          scene.postRender.removeEventListener(compose)
          recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
          recorder.stop()
        }),
    }
  }

  /* FLYING IT YOURSELF: the camera is the drone; a faint glass plane at the ceiling when near it. */
  let ceilingPlane: Entity | null = null
  const droneView = (at: LatLon, altAbsM: number, yaw: number, gimbal: number, focal: number) => {
    const canvas = widget.canvas
    const frustum = widget.camera.frustum as { fov?: number }
    const horizontal = CMath.toRadians(horizontalFov(focal))
    frustum.fov = canvas.clientWidth >= canvas.clientHeight ? horizontal : 2 * Math.atan(Math.tan(horizontal / 2) * (canvas.clientHeight / canvas.clientWidth))
    widget.camera.setView({ destination: Cartesian3.fromDegrees(at.lon, at.lat, altAbsM), orientation: { heading: CMath.toRadians(yaw), pitch: CMath.toRadians(gimbal), roll: 0 } })
  }
  const setCeiling = (centre: LatLon | null, altAbsM: number, alpha: number) => {
    if (ceilingPlane !== null) widget.entities.remove(ceilingPlane)
    ceilingPlane = null
    if (centre === null || alpha <= 0) return
    const d = 0.01
    ceilingPlane = widget.entities.add({
      polygon: {
        hierarchy: Cartesian3.fromDegreesArrayHeights([centre.lon - d, centre.lat - d, altAbsM, centre.lon + d, centre.lat - d, altAbsM, centre.lon + d, centre.lat + d, altAbsM, centre.lon - d, centre.lat + d, altAbsM]),
        perPositionHeight: true,
        material: Color.WHITE.withAlpha(alpha),
      },
    })
  }
  /*
   * THE CINEMATIC LOOK (src/three/cinema.ts), made once and switched on only
   * while a move plays or renders. The sky arcs and the numbered pins are a
   * planning overlay, put away for the preview and back after it.
   */
  let cinema: Cinema | null = null
  let cloudsDrawn = false
  const overlays = (show: boolean) => {
    for (const e of [...skyEntities, ...pinEntities]) e.show = show
  }

  const playPath = async (play: FlightPlay, onTime: (at: Date) => void, onProgress?: (share: number) => void, onNote?: (note: string) => void): Promise<Blob | null> => {
    playing?.stop()
    const [g] = await sampleTerrain(widget.terrainProvider, 15, [Cartographic.fromDegrees(play.takeoff.lon, play.takeoff.lat)])
    const base = g?.height ?? 0
    const [sg] = await sampleTerrain(widget.terrainProvider, 15, [Cartographic.fromDegrees(play.subject.lon, play.subject.lat)])
    const subjectH = (sg?.height ?? 0) + 2
    const canvas = widget.canvas
    const frustum = widget.camera.frustum as { fov?: number }
    const horizontal = CMath.toRadians(horizontalFov(play.focal))
    frustum.fov = canvas.clientWidth >= canvas.clientHeight ? horizontal : 2 * Math.atan(Math.tan(horizontal / 2) * (canvas.clientHeight / canvas.clientWidth))
    const end = play.path[play.path.length - 1].t
    const at = (t: number) => {
      let i = 0
      while (i + 1 < play.path.length && play.path[i + 1].t < t) i += 1
      const a = play.path[i]
      const b = play.path[Math.min(play.path.length - 1, i + 1)]
      const f = b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))
      return { lat: a.at.lat + (b.at.lat - a.at.lat) * f, lon: a.at.lon + (b.at.lon - a.at.lon) * f, ft: a.ft + (b.ft - a.ft) * f }
    }
    /*
     * One instant of the move: the clock eased at both ends (src/core/gimbal.ts),
     * the camera on the path looking at the subject with a gimbal's small
     * drift, the light at that moment, and the sea and focus with it.
     */
    const pose = (t: number) => {
      const shown = easedTime(t, end)
      const p = at(shown)
      const h = base + p.ft * 0.3048
      const dist = Math.max(1, distanceMeters({ lat: p.lat, lon: p.lon }, play.subject))
      const d = drift(t)
      widget.camera.setView({
        destination: Cartesian3.fromDegrees(p.lon, p.lat, h),
        orientation: {
          heading: CMath.toRadians(bearingBetween({ lat: p.lat, lon: p.lon }, play.subject) + d.yaw),
          pitch: Math.atan2(subjectH - h, dist) + CMath.toRadians(d.pitch),
          roll: 0,
        },
      })
      const when = new Date(play.startAt.getTime() + shown * 1000)
      if (play.record) setTime(when)
      cinema?.frame(t, getSunPosition(when, venue.lat, venue.lon).altitude, Math.hypot(dist, h - subjectH))
      return when
    }

    if (play.cinema !== null) {
      cinema ??= createCinema(widget, venue, enuToFixedPoint)
      /* The preview draws its own sea, in its own look. */
      if (plainSea !== null) plainSea.primitive.show = false
      cinema.on(play.cinema, play.look, play.focal)
      cloudsDrawn = cinema.clouds()
      overlays(false)
    }
    onNote?.(previewNote(play.cinema, cloudsDrawn))
    const renderMode = scene.requestRenderMode
    scene.requestRenderMode = false
    widget.targetFrameRate = 60
    let clip: Blob | null = null
    try {
      if (play.record) clip = await renderFrames(play, end, pose, onTime, onProgress)
      else {
        const started = performance.now()
        let lastTime = -1
        await new Promise<void>((resolve) => {
          let raf = 0
          const frame = () => {
            const t = Math.min(end, (performance.now() - started) / 1000)
            const when = pose(t)
            if (Math.floor(t * 2) !== lastTime) {
              lastTime = Math.floor(t * 2)
              onTime(when)
            }
            if (t >= end) return resolve()
            raf = requestAnimationFrame(frame)
          }
          playing = { stop: () => { cancelAnimationFrame(raf); resolve() } }
          raf = requestAnimationFrame(frame)
        })
      }
    } finally {
      playing = null
      scene.requestRenderMode = renderMode
      widget.targetFrameRate = PLAIN_FPS
      cinema?.off()
      if (plainSea !== null) plainSea.primitive.show = true
      cloudsDrawn = false
      overlays(true)
    }
    return clip
  }

  /*
   * FRAME BY FRAME. The engine's own loop stops; each frame is posed, drawn
   * until its tiles have arrived, averaged over SUBFRAMES instants for the
   * motion blur, watermarked, and handed to the encoder with its number. So
   * the clip runs at a steady 30 fps however long a frame took to draw.
   */
  const renderFrames = async (play: FlightPlay, end: number, pose: (t: number) => Date, onTime: (at: Date) => void, onProgress?: (share: number) => void): Promise<Blob | null> => {
    /* The canvas is drawn at CSS pixels; for the clip, at the screen's own (a phone's 2 or 3), and back after. */
    const scaleBefore = widget.resolutionScale
    widget.resolutionScale = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    widget.resize()
    const size = clipSize(widget.canvas.width, widget.canvas.height)
    const encoder = await clipEncoder(size.width, size.height, FPS)
    if (encoder === null) return null
    const out = document.createElement('canvas')
    out.width = size.width
    out.height = size.height
    const ctx = out.getContext('2d')
    if (ctx === null) return null
    const note = previewNote(play.cinema, cloudsDrawn)
    let stopped = false
    playing = { stop: () => (stopped = true) }
    widget.useDefaultRenderLoop = false
    /*
     * Drawn again until the tiles the view asked for have arrived (the
     * engine's load queue empty twice running), or the wait runs out. Not
     * globe.tilesLoaded: with the camera low over the water it never turned
     * true, and every frame waited out its whole timeout.
     */
    let queued = 0
    const onQueue = (n: number) => (queued = n)
    scene.globe.tileLoadProgressEvent.addEventListener(onQueue)
    const settle = async (maxMs: number) => {
      const t0 = performance.now()
      let empty = 0
      widget.render()
      while (empty < 2 && performance.now() - t0 < maxMs) {
        /* Every 100 ms: often enough to take tiles as they land, not so often that a slow GPU stalls on a queue of frames. */
        await new Promise((r) => setTimeout(r, 100))
        widget.render()
        empty = queued === 0 ? empty + 1 : 0
      }
    }
    /*
     * The frame copied while it is still on the canvas: inside the engine's
     * postRender, as the recorder does. Read after render() returns, the
     * canvas had already been handed to the page and came back black.
     */
    const drawn = () =>
      new Promise<void>((resolve) => {
        const copy = () => {
          scene.postRender.removeEventListener(copy)
          ctx.drawImage(widget.canvas, 0, 0, size.width, size.height)
          resolve()
        }
        scene.postRender.addEventListener(copy)
        widget.render()
      })
    try {
      const frames = frameTimes(end)
      for (let f = 0; f < frames.length && !stopped; f += 1) {
        const subs = subframeTimes(frames[f], end)
        let when = play.startAt
        for (let k = 0; k < subs.length; k += 1) {
          when = pose(subs[k])
          /* The first instant of a frame waits for its tiles; the rest are a sixtieth of a second on and draw from them. */
          if (k === 0) await settle(f === 0 ? 20_000 : 1_500)
          /* A running mean: the k-th instant weighs 1 / (k + 1). */
          ctx.globalAlpha = 1 / (k + 1)
          await drawn()
        }
        ctx.globalAlpha = 1
        ctx.font = `${Math.round(size.height / 40)}px system-ui, sans-serif`
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillText(note, Math.round(size.width / 30), size.height - Math.round(size.height / 30))
        await encoder.add(out, f)
        onProgress?.((0.9 * (f + 1)) / frames.length)
        if (f % 15 === 0) onTime(when)
      }
    } finally {
      widget.useDefaultRenderLoop = true
      scene.globe.tileLoadProgressEvent.removeEventListener(onQueue)
      widget.resolutionScale = scaleBefore
      widget.resize()
    }
    if (stopped) return null
    return encoder.finish((share) => onProgress?.(0.9 + 0.1 * share))
  }

  const project = (at: LatLon, height = 0) => {
    const p = scene.cartesianToCanvasCoordinates(Cartesian3.fromDegrees(at.lon, at.lat, height))
    return p === undefined ? null : { x: p.x, y: p.y }
  }

  /*
   * SHOWN ONCE THE FIRST VIEW HAS ARRIVED: every tile it asked for loaded
   * (or failed and drawn flat), at least one of them this scene's. Until
   * then Clay3D keeps the canvas hidden and the 2D map shows through. Shown
   * anyway after SHOW_WITHIN_MS, so a stuck tile cannot hide the model.
   */
  const startCounts = { ...tileCounts, flat: status.flatTiles }
  const probe = window as unknown as { __clayShown?: { by: string; ms: number } }
  const builtAt = performance.now()
  const shown = new Promise<void>((resolve) => {
    const timer = setTimeout(() => done('timer'), SHOW_WITHIN_MS)
    function done(by: 'tiles' | 'timer') {
      clearTimeout(timer)
      scene.postRender.removeEventListener(check)
      probe.__clayShown = { by, ms: Math.round(performance.now() - builtAt) }
      resolve()
    }
    function check() {
      const arrived = tileCounts.imagery > startCounts.imagery && (tileCounts.terrain > startCounts.terrain || status.flatTiles > startCounts.flat)
      if (arrived && scene.globe.tilesLoaded) done('tiles')
    }
    scene.postRender.addEventListener(check)
  })

  orbit()
  ;(window as unknown as { __clayBuilds?: number }).__clayBuilds = ((window as unknown as { __clayBuilds?: number }).__clayBuilds ?? 0) + 1
  /*
   * THE SEA IN THE PLAIN VIEW (27 Oct, the pier: the satellite's sea was dark
   * slabs from different zooms). Offshore of the map's coastline, the
   * preview's water in its Real look, at the tide's height, its waves moving
   * with the clock. Rebuilt only when the ocean's outline or the waves
   * change; a new tide height lifts it.
   */
  let plainSea: ReturnType<typeof buildSea> | null = null
  let seaKey = ''
  const setSea = (inputs: CinemaInputs | null) => {
    const key = inputs === null || inputs.seaMask === null ? '' : `${inputs.seaMask.url.length}:${inputs.seaMask.url.slice(-64)}:${JSON.stringify(inputs.sea)}`
    if (key !== seaKey) {
      if (plainSea !== null) scene.primitives.remove(plainSea.primitive)
      plainSea = null
      seaKey = key
      if (inputs !== null && inputs.seaMask !== null) {
        plainSea = buildSea(inputs, venue, false, true)
        plainSea.primitive.show = playing === null
        scene.primitives.add(plainSea.primitive)
      }
    }
    if (plainSea !== null && inputs !== null) plainSea.setLevel(inputs.waterLevelM)
    scene.requestRender()
  }
  const seaStart = performance.now()
  scene.preRender.addEventListener(() => {
    if (plainSea !== null) (plainSea.material.uniforms as Record<string, unknown>).time = (performance.now() - seaStart) / 1000
  })

  return {
    setSea,
    whenShown: () => shown,
    sunNow: () => sunNow,
    setTime,
    setBuildings,
    setTrees,
    setPins,
    setSkyDay,
    orbit,
    observe,
    playPath,
    droneView,
    setCeiling,
    startRecording,
    project,
    counts: tileCounts,
    buildings: () => drawnBuildings,
    pickAt: (x, y) => {
      const hit = scene.pickPosition(new Cartesian2(x, y))
      if (hit === undefined) return null
      const c = Cartographic.fromCartesian(hit)
      return { lat: CMath.toDegrees(c.latitude), lon: CMath.toDegrees(c.longitude) }
    },
    groundAt: async (at) => {
      const [p] = await sampleTerrain(widget.terrainProvider, 15, [Cartographic.fromDegrees(at.lon, at.lat)])
      return p === undefined || !Number.isFinite(p.height) ? null : p.height
    },
    lookDown: (at, height) => {
      widget.camera.setView({ destination: Cartesian3.fromDegrees(at.lon, at.lat, height), orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 } })
      scene.requestRender()
    },
    widget,
    destroy: () => widget.destroy(),
  }
}
