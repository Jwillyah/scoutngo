/*
 * THE CLAY MODEL: CesiumJS drawing the place from the map data this app
 * already has, and nothing else.
 *
 *   ground     Esri imagery draped on AWS Terrarium elevation, lit by the
 *              sun so ridgelines read
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
import { overlayDtm } from '../lib/lidar/terrain.ts'
import type { Rasters } from '../lib/lidar/raster.ts'
import { formatHour } from '../core/timezone.ts'
import type { Building } from '../lib/buildings.ts'
import { loadTile } from '../lib/offlineCache.ts'
import { IMAGERY_TEMPLATE, TERRAIN_TEMPLATE } from '../lib/offlineSources.ts'
import { tileUrl } from '../lib/tileRange.ts'
import { NOMINAL_TREE_HEIGHT, type MappedTree } from '../lib/trees.ts'

export const CLAY = '#ede6da'
/* Unknown height: lighter, hatched. */
const CLAY_UNKNOWN = '#f7f3ec'
/* The footprint drawn on the ground, so a block that leans in the photo still sits on its own outline. */
const FOOTPRINT = '#f7f3ec'
const TREE_GREEN = '#a9b694'
const SKY_RADIUS = 1500
/* The longest the canvas stays hidden waiting for its first tiles. */
export const SHOW_WITHIN_MS = 30_000
/* 129 across a 256 px tile: every other pixel, close enough to read within a metre of the 2D map. */
const HEIGHT_SAMPLES = 129
const ESRI_CREDIT = 'Tiles by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

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

/** Esri imagery, read through the 2D map's tile cache. */
class CachedImagery extends UrlTemplateImageryProvider {
  constructor(maximumLevel = 19) {
    super({
      url: IMAGERY_TEMPLATE,
      tilingScheme: new WebMercatorTilingScheme(),
      maximumLevel,
      credit: new Credit(ESRI_CREDIT),
    })
  }
  override requestImage(x: number, y: number, level: number): Promise<ImageryTypes> {
    return tileBytes(tileUrl(IMAGERY_TEMPLATE, { x, y, z: level })).then((bytes) => {
      tileCounts.imagery += 1
      return createImageBitmap(new Blob([bytes]))
    })
  }
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
        /* Inside a kept scan's patch, the lidar ground (src/lib/lidar/terrain.ts). */
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
  widget.imageryLayers.add(new ImageryLayer(new CachedImagery(13)))
  widget.imageryLayers.add(new ImageryLayer(new CachedImagery()))
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
      /*
       * ITS FOOTPRINT ON THE GROUND. Satellite photos lean: a tall block's
       * roof sits off its base in the picture. A soft outline at the base lets
       * the eye match block to photo (1st St jetty, 27 Oct).
       */
      buildingEntities.push(
        widget.entities.add({
          polyline: {
            positions: Cartesian3.fromDegreesArray([...flat, flat[0], flat[1]]),
            clampToGround: true,
            width: 1.5,
            material: Color.fromCssColorString(FOOTPRINT).withAlpha(0.7),
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
  return {
    whenShown: () => shown,
    sunNow: () => sunNow,
    setTime,
    setBuildings,
    setTrees,
    setPins,
    setSkyDay,
    orbit,
    observe,
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
