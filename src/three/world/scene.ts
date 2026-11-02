/*
 * THE 3D SCENE, IN THREE.JS (Batch D): one scene for the map's 3D button,
 * Fly and Preflight, so all three look the same. It replaces the old globe
 * library's clay model (src/three/clayScene.ts) and keeps its contract (the ClayScene
 * interface below), so the components that drive it did not change shape.
 *
 *   sky        src/core/skyLook.ts's colours from our sun at the bar's time;
 *              ACES tone mapping, sRGB out; haze in the horizon's colour
 *   sun        one directional light along suncalc's sun with soft shadows
 *              from a tight shadow camera round where the camera looks; a
 *              hemisphere light from the sky's own colours
 *   ground     ground.ts: one picture near the camera, coarser rings beyond
 *   water      water.ts (Section 3)
 *   buildings  buildings.ts (Section 4); trees instanced
 *   clouds     clouds.ts (Section 5), in the world, never over the HUD
 *   looks      Real, or Animated: a stylised render, not a filter (Section 6)
 *
 * NO NEW HOSTS. Every tile comes through loadTile (src/lib/offlineCache.ts),
 * the same saved copy the 2D map reads, else the same Esri, AWS and
 * OpenFreeMap URLs; scripts/audit-3d-network.mjs holds it.
 *
 * DRAWN ON DEMAND. The picture is drawn when something changed or moves
 * (the camera, the time, a tile arriving, the water), at up to 60 frames a
 * second while it moves and none while it is still: battery for nothing
 * otherwise. The drawing scale drops on a slow frame and climbs back
 * (adaptive resolution, Section 7).
 */
import * as THREE from 'three'
import { logTouch } from '../../lib/touchDebug.ts'
import { createDecks } from './decks.ts'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { NOMINAL_DRAW_HEIGHT } from '../../core/buildingHeight.ts'
import { bearingBetween, distanceMeters, type LatLon } from '../../core/geo.ts'
import { domePoint, skyArc, type SkyArc } from '../../core/sky3d.ts'
import { getSunPosition } from '../../core/sun.ts'
import { formatHour } from '../../core/timezone.ts'
import { drift, easedTime, FPS, frameTimes, subframeTimes } from '../../core/gimbal.ts'
import { clipEncoder, clipSize } from '../../lib/cinema/encode.ts'
import type { Building } from '../../lib/buildings.ts'
import type { Rasters } from '../../lib/lidar/raster.ts'
import { horizontalFov, previewNote, WATERMARK, type FlightPlay } from '../../lib/preflight/play.ts'
import { NOMINAL_TREE_HEIGHT, type MappedTree } from '../../lib/trees.ts'
import type { CinemaInputs, Look } from './inputs.ts'
import { createGround, type GroundStatus } from './ground.ts'
import { createSky } from './sky.ts'
import { ESRI_CREDIT, frameAt, heightAt, imagerySourceFor, OSM_CREDIT, pending, TERRAIN_CREDIT, tileCounts } from './sources.ts'
import { createWorldLook } from './look.ts'
import { createBuildings } from './buildings.ts'
import { createWater } from './water.ts'
import { createClouds } from './clouds.ts'
import { createWoods } from './woods.ts'
import { hazeColour, ambientSky } from '../../core/skyLook.ts'
import { getMoonIllumination, getMoonPosition } from 'suncalc'
import { nightLight } from '../../core/nightLight.ts'
import { createArcs } from './arcs.ts'

export type { GroundStatus }
export const SHOW_WITHIN_MS = 30_000
/* After this long with the camera still, the water and clouds animate at 10 frames a second. */
export const IDLE_MS = 15_000

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
  whenShown(): Promise<void>
  sunNow(): { azimuth: number; altitude: number }
  setTime(at: Date): void
  setBuildings(buildings: readonly Building[]): void
  setTrees(trees: readonly MappedTree[]): void
  setPins(pins: readonly Pin[]): void
  setSkyDay(dayStart: Date): void
  /** The sun and moon arcs and their hour pills, put away while flying or under a sheet. */
  setSkyShown(show: boolean): void
  /** The moon's arc and its labels only while the Moon tab is open (Section 9). */
  setMoonShown(show: boolean): void
  credits(): string[]
  orbit(): void
  playPath(play: FlightPlay, onTime: (at: Date) => void, onProgress?: (share: number) => void, onNote?: (note: string) => void): Promise<Blob | null>
  droneView(at: LatLon, altAbsM: number, yaw: number, gimbal: number, focal: number): void
  /** Third person behind a generic quadcopter (Section 5b), or the gimbal camera (the default). */
  setChase(on: boolean): void
  photoView(at: LatLon, altAbsM: number, yaw: number, pitch: number, roll: number, engineFovDeg: number): void
  settled(maxMs: number): Promise<boolean>
  snapshot(): Promise<HTMLCanvasElement>
  setCeiling(centre: LatLon | null, altAbsM: number, alpha: number): void
  startRecording(): { stop: () => Promise<Blob | null> } | null
  observe(view: ObserverView): Promise<void>
  pickAt(x: number, y: number): LatLon | null
  groundAt(at: LatLon): Promise<number | null>
  lookDown(at: LatLon, height: number): void
  buildings(): readonly Building[]
  counts: typeof tileCounts
  /** Trees drawn over the map's woods: illustrative, picture only (woods.ts). */
  woods(): number
  setSea(inputs: CinemaInputs | null): void
  setFlyLook(look: Look | null, inputs: CinemaInputs | null): void
  /** Cloud quality: High (raymarched layer) or Battery (layered billboards). */
  setQuality(q: 'high' | 'battery'): void
  project(at: LatLon, height?: number): { x: number; y: number } | null
  /** Nothing still in flight: what the audits wait on (the old globe.tilesLoaded). */
  loaded(): boolean
  /** For checks: the hour pills drawn last frame, in page pixels. */
  pills(): { text: string; l: number; t: number; r: number; b: number }[]
  /** For checks: draw without the buildings, or without their roofs. */
  setHidden(what: 'buildings' | 'roofs' | 'woods' | null): void
  /** For checks: the water drawn flat magenta (its geometry, nothing else changed). */
  setWaterMask(on: boolean): void
  /** For checks: over an n x n grid `halfM` either side of the venue, the points where water is drawn and some ground stands above it (a slab over the sea). */
  slabPoints(n: number, halfM: number): { water: number; slab: number; by: Record<string, number> }
  /** Frame times of the last frames drawn, milliseconds, for the report (Section 7). */
  frameTimes(): number[]
  /** Batch I: told when the GPU context is lost or restored, or a frame throws (Clay3D rebuilds or says why). */
  onTrouble(hooks: { lost?: () => void; restored?: () => void; error?: (message: string) => void }): void
  /** Batch I: the bridges, piers and pilings drawn, for checks. */
  decks(): { bridges: number; piers: number; pilings: number }
  /** Batch I: what is on the GPU, for Debug touch. */
  gpu(): { textures: number; geometries: number; calls: number; scale: number; lost: boolean }
  renderer: THREE.WebGLRenderer
  destroy(): void
}

const DEG = Math.PI / 180

/** A direction from heading (clockwise from north) and pitch (up positive), in the scene frame (x east, y up, z south). */
export const lookDir = (headingDeg: number, pitchDeg: number) =>
  new THREE.Vector3(Math.sin(headingDeg * DEG) * Math.cos(pitchDeg * DEG), Math.sin(pitchDeg * DEG), -Math.cos(headingDeg * DEG) * Math.cos(pitchDeg * DEG))

/** The scene-frame direction toward the sun: from suncalc's azimuth (clockwise from north) and altitude. */
export const sunDirection = (azimuthDeg: number, altitudeDeg: number) => lookDir(azimuthDeg, altitudeDeg)

export function createClayScene(container: HTMLElement, venue: LatLon, timeZone: string, status: GroundStatus, onStatus: () => void, scan: Rasters | null = null): ClayScene {
  void scan
  const frame = frameAt(venue)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  /*
   * THE BLACK FLASH (Batch I, Section 4: "works but flashes black and back").
   * The adaptive resolution below changed the pixel ratio AFTER a frame was
   * drawn. Changing it resizes the canvas, which clears it, and this scene
   * draws on demand: the cleared, black canvas stayed on screen until the
   * next frame was asked for. A slow frame (over 26 ms, every few seconds on
   * a phone) did it. The new ratio now waits for the next frame and is set
   * before it is drawn, and asks for that frame.
   * Pixel ratio: never over 2 (a 3x iPhone would draw 2.25x the pixels).
   */
  const maxScale = Math.min(2, window.devicePixelRatio || 1)
  let scale = maxScale
  let wantScale = scale
  renderer.setPixelRatio(scale)
  container.appendChild(renderer.domElement)
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.display = 'block'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 80_000)
  camera.position.set(250, 420, 600)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.495
  controls.minDistance = 30
  controls.maxDistance = 20_000

  let dirty = true
  let lastMove = performance.now()
  const touch = () => {
    dirty = true
  }
  /* A finger or a pose moving the camera: the water and clouds run at full rate for a while after. */
  const moved = () => {
    lastMove = performance.now()
    touch()
  }
  controls.addEventListener('change', moved)

  /* ------------------------------------------------------- sky and light */
  const sky = createSky()
  scene.add(sky.mesh)
  scene.fog = new THREE.FogExp2(0xffffff, 1 / 18_000)
  const sun = new THREE.DirectionalLight(0xffffff, 3)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.6
  sun.shadow.radius = 3
  const shadowCam = sun.shadow.camera
  shadowCam.left = -320
  shadowCam.right = 320
  shadowCam.top = 320
  shadowCam.bottom = -320
  shadowCam.near = 1
  shadowCam.far = 4000
  scene.add(sun)
  scene.add(sun.target)
  const hemi = new THREE.HemisphereLight(0xbfd5ff, 0x40362c, 0.8)
  scene.add(hemi)
  /* The moon (Batch G, Section 9): at night it lights the faces turned toward it, a cool white, no shadow. */
  const moonLight = new THREE.DirectionalLight(0xc8d4ff, 0)
  scene.add(moonLight)
  scene.add(moonLight.target)

  let sunNow = { azimuth: 180, altitude: 45 }
  let timeNow = new Date()
  let sunDir = new THREE.Vector3(0, 1, 0)
  const look = createWorldLook()
  const applySky = () => {
    sunDir = sunDirection(sunNow.azimuth, sunNow.altitude)
    sky.set(sunDir, sunNow.altitude)
    const c = sky.colours()
    const haze = hazeColour(c)
    ;(scene.fog as THREE.FogExp2).color.setRGB(haze[0], haze[1], haze[2], THREE.LinearSRGBColorSpace)
    sun.color.setRGB(c.light[0], c.light[1], c.light[2], THREE.LinearSRGBColorSpace)
    sun.intensity = c.lightIntensity
    sun.castShadow = sunNow.altitude > 0
    const amb = ambientSky(c, sunNow.altitude)
    hemi.color.setRGB(amb[0], amb[1], amb[2], THREE.LinearSRGBColorSpace)
    hemi.groundColor.setRGB(c.ground[0] * 3, c.ground[1] * 3, c.ground[2] * 3, THREE.LinearSRGBColorSpace)
    hemi.intensity = c.ambientIntensity
    water.setSun(sunDir, c)
    buildings.setSun(c)
    /* The night's light: the sky's glow and the moon's, from the time on the bar (src/core/nightLight.ts). */
    const mp = getMoonPosition(timeNow, venue.lat, venue.lon)
    const moonAlt = mp.altitude
    const moonAz = mp.azimuth
    const localHour = (timeNow.getUTCHours() + timeNow.getUTCMinutes() / 60 + venue.lon / 15 + 24) % 24
    const n = nightLight(sunNow.altitude, moonAlt, getMoonIllumination(timeNow).fraction, localHour)
    moonLight.intensity = n.moon * 0.4
    moonLight.position.copy(sunDirection(moonAz, Math.max(1, moonAlt))).multiplyScalar(1000)
    buildings.setNight(n)
    look.setNight(n)
    clouds.setSun(sunDir, c)
    look.setSun(sunDir, c)
    touch()
  }
  const placeShadow = (target: THREE.Vector3) => {
    /* A tight shadow camera round where the camera looks: sharp near, nothing wasted far off. */
    sun.target.position.copy(target)
    sun.position.copy(target).addScaledVector(sunDir, 1500)
    sun.target.updateMatrixWorld()
  }

  /* ---------------------------------------------------------- the ground */
  const source = imagerySourceFor(venue)
  const ground = createGround(venue, source, status, () => {
    onStatus()
    touch()
  }, look.groundHook())
  scene.add(ground.group)
  const water = createWater(frame, touch)
  scene.add(water.group)
  const buildings = createBuildings(frame, ground, touch)
  /* Bridges and piers as decks on pilings (Batch I, Section 6). */
  const decks = createDecks(frame, touch)
  scene.add(decks.group)
  decks.follow(0, 0)
  scene.add(buildings.group)
  const clouds = createClouds(touch)
  scene.add(clouds.group)
  const woods = createWoods(frame, venue, touch)
  scene.add(woods.group)
  const arcs = createArcs(touch)
  scene.add(arcs.group)

  /* ------------------------------------------------------------ the pins */
  const pinGroup = new THREE.Group()
  scene.add(pinGroup)
  const pinSprite = (n: number) => {
    const c = document.createElement('canvas')
    c.width = 72
    c.height = 96
    const g = c.getContext('2d')
    if (g !== null) {
      g.fillStyle = '#a86a05'
      g.beginPath()
      g.moveTo(36, 94)
      g.lineTo(22, 66)
      g.lineTo(50, 66)
      g.fill()
      const grad = g.createLinearGradient(0, 0, 72, 72)
      grad.addColorStop(0, '#ffe58a')
      grad.addColorStop(0.5, '#c88711')
      grad.addColorStop(1, '#a86a05')
      g.fillStyle = grad
      g.beginPath()
      g.arc(36, 36, 32, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#fff'
      g.font = '700 32px ui-monospace, monospace'
      g.textAlign = 'center'
      g.fillText(String(n), 36, 47)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false, toneMapped: false }))
    s.center.set(0.5, 0)
    s.scale.set(0.045, 0.06, 1)
    s.renderOrder = 900
    return s
  }
  const setPins = (pins: readonly Pin[]) => {
    for (const c of [...pinGroup.children]) pinGroup.remove(c)
    for (const p of pins) {
      const s = pinSprite(p.number)
      s.position.set(frame.x(p.at.lon), 0, frame.z(p.at.lat))
      pinGroup.add(s)
      void heightAt(p.at.lat, p.at.lon).then((h) => {
        s.position.y = (h ?? 0) + 1
        touch()
      })
    }
    touch()
  }

  /* -------------------------------------------------------------- time */
  const setTime = (at: Date) => {
    const s = getSunPosition(at, venue.lat, venue.lon)
    sunNow = { azimuth: s.azimuth, altitude: s.altitude }
    timeNow = at
    applySky()
  }
  setTime(new Date())

  /* --------------------------------------------------------- the camera */
  let mode: 'orbit' | 'fixed' = 'orbit'
  let chase = false
  const drone = createDroneModel()
  drone.visible = false
  scene.add(drone)
  const setFov = (horizontalDeg: number) => {
    const aspect = camera.aspect
    camera.fov = (2 * Math.atan(Math.tan((horizontalDeg * DEG) / 2) / aspect)) / DEG
    camera.updateProjectionMatrix()
  }
  const orbit = () => {
    mode = 'orbit'
    controls.enabled = true
    controls.enableRotate = true
    controls.enableZoom = true
    controls.enablePan = true
    drone.visible = false
    camera.fov = 50
    camera.updateProjectionMatrix()
    camera.up.set(0, 1, 0)
    const h = 750
    camera.position.copy(lookDir(20 + 180, 32).multiplyScalar(h)).add(new THREE.Vector3(0, 5, 0))
    controls.target.set(0, 5, 0)
    void heightAt(venue.lat, venue.lon).then((g) => {
      if (g === null || mode !== 'orbit') return
      controls.target.y = g + 5
      camera.position.y += g
      touch()
    })
    touch()
  }
  const point = (at: LatLon, h: number) => new THREE.Vector3(frame.x(at.lon), h, frame.z(at.lat))
  const pose = (pos: THREE.Vector3, heading: number, pitch: number, roll = 0) => {
    lastMove = performance.now()
    mode = 'fixed'
    controls.enabled = false
    camera.up.set(0, 1, 0)
    camera.position.copy(pos)
    camera.lookAt(pos.clone().add(lookDir(heading, pitch)))
    if (roll !== 0) camera.rotateZ(-roll * DEG)
    touch()
  }
  let lastDrone: { pos: THREE.Vector3; t: number } | null = null
  let velocity = { vx: 0, vz: 0 }
  const droneView = (at: LatLon, altAbsM: number, yaw: number, gimbal: number, focal: number) => {
    const pos = point(at, altAbsM)
    const t = performance.now()
    if (lastDrone !== null && t > lastDrone.t) {
      const dt = (t - lastDrone.t) / 1000
      velocity = { vx: (pos.x - lastDrone.pos.x) / dt, vz: (pos.z - lastDrone.pos.z) / dt }
    }
    lastDrone = { pos: pos.clone(), t }
    setFov(horizontalFov(focal))
    if (chase) {
      /* Third person: behind and above the drone, looking along its heading at it. */
      drone.visible = true
      drone.position.copy(pos)
      drone.rotation.set(0, -yaw * DEG, 0)
      const back = lookDir(yaw, 0).multiplyScalar(-9).add(new THREE.Vector3(0, 3, 0))
      pose(pos.clone().add(back), yaw, -12)
    } else {
      drone.visible = false
      pose(pos, yaw, gimbal)
    }
  }
  const photoView = (at: LatLon, altAbsM: number, yaw: number, pitch: number, roll: number, engineFovDeg: number) => {
    const aspect = camera.aspect
    camera.fov = aspect >= 1 ? (2 * Math.atan(Math.tan((engineFovDeg * DEG) / 2) / aspect)) / DEG : engineFovDeg
    camera.updateProjectionMatrix()
    pose(point(at, altAbsM), yaw, pitch, roll)
  }
  const observe = async (view: ObserverView) => {
    const g = (await heightAt(view.at.lat, view.at.lon)) ?? 0
    setFov(view.viewHorizontal)
    pose(point(view.at, g + view.heightAboveGround), view.heading, view.pitch)
  }

  /* ----------------------------------------------------------- the loop */
  const resize = () => {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h, false)
    const hfov = 2 * Math.atan(Math.tan((camera.fov * DEG) / 2) * camera.aspect)
    camera.aspect = w / h
    if (mode === 'fixed') camera.fov = (2 * Math.atan(Math.tan(hfov / 2) / camera.aspect)) / DEG
    camera.updateProjectionMatrix()
    touch()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  const postRender = new Set<() => void>()
  const times: number[] = []
  let raf = 0
  let lastFrame = 0
  let continuous = 0
  const started = performance.now()
  const ray = new THREE.Raycaster()
  const groundPointAhead = () => {
    ray.setFromCamera(new THREE.Vector2(0, 0), camera)
    const hits = ray.intersectObject(ground.group, true)
    const hit = hits[0]?.point
    return hit ?? new THREE.Vector3(camera.position.x, 0, camera.position.z)
  }
  let shadowAt = new THREE.Vector3()
  let followTick = 0
  const draw = () => {
    if (wantScale !== scale) {
      logTouch(`3D pixel ratio ${scale.toFixed(1)} → ${wantScale.toFixed(1)}`)
      scale = wantScale
      renderer.setPixelRatio(scale)
    }
    const t0 = performance.now()
    const seconds = (t0 - started) / 1000
    water.frame(seconds, camera)
    clouds.frame(seconds, camera)
    water.setMirror(clouds.mirror())
    /* Sun shafts through the cloud edges: High only (Battery skips the arc of looks per sky pixel). */
    sky.setShafts(clouds.quality() === 'high' ? clouds.mirror() : null, camera.position)
    look.frame(seconds)
    arcs.frame(camera, renderer.domElement)
    /* Every few frames: where the camera looks, for the near ground, the shadow and the prefetch. */
    if (followTick++ % 8 === 0) {
      const target = mode === 'orbit' ? controls.target.clone() : groundPointAhead()
      if (target.distanceTo(shadowAt) > 40) {
        shadowAt = target
        placeShadow(target)
      }
      /* How high the camera is over where it looks: low, the ground under it is drawn at the imagery's own top zoom. */
      ground.follow(target.x, target.z, velocity, camera.position.y - target.y)
      buildings.follow(target.x, target.z)
      decks.follow(target.x, target.z)
    }
    renderer.render(scene, camera)
    for (const f of [...postRender]) f()
    const ms = performance.now() - t0
    times.push(ms)
    if (times.length > 240) times.shift()
    /* Adaptive resolution: a slow frame drops the scale, steady quick ones bring it back. */
    if (ms > 26 && scale > 0.6) {
      wantScale = Math.max(0.6, scale - 0.1)
      touch()
    } else if (ms < 10 && scale < maxScale && times.length % 30 === 0) {
      wantScale = Math.min(maxScale, scale + 0.1)
      touch()
    }
  }
  /*
   * THE GPU TAKEN AWAY (Batch I, Section 4). iOS drops a page's WebGL context
   * under memory pressure. Without this the canvas went black for good.
   * Lost: drawing stops and Clay3D is told (it shows that it is rebuilding,
   * never a black screen); restored: Clay3D builds the scene again. A frame
   * that throws stops the loop and Clay3D shows the message.
   */
  let lost = false
  const trouble: { lost?: () => void; restored?: () => void; error?: (message: string) => void } = {}
  const onLost = (e: Event) => {
    e.preventDefault()
    lost = true
    trouble.lost?.()
  }
  const onRestored = () => {
    lost = false
    trouble.restored?.()
  }
  renderer.domElement.addEventListener('webglcontextlost', onLost, false)
  renderer.domElement.addEventListener('webglcontextrestored', onRestored, false)
  let manual = false
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop)
    if (manual || lost) return
    if (mode === 'orbit') controls.update()
    const animating = continuous > 0 || water.animating() || clouds.animating() || pending.n > 0
    /*
     * Moving: every frame. Still with water or clouds: 30 a second, and after
     * IDLE_MS untouched 10 a second (battery when nobody is looking hard).
     * Nothing moving at all: no frame.
     */
    const idle = now - lastMove > IDLE_MS
    const minGap = dirty ? 0 : animating ? (idle && continuous === 0 ? 100 : 33) : Infinity
    if (now - lastFrame < minGap) return
    lastFrame = now
    dirty = false
    try {
      draw()
    } catch (error) {
      /* Stopped, and said: never a frozen or black canvas with nothing on it. */
      cancelAnimationFrame(raf)
      trouble.error?.(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
    }
  }
  raf = requestAnimationFrame(loop)

  /* --------------------------------------------------- shown and settled */
  const probe = window as unknown as { __clayShown?: { by: string; ms: number } }
  const builtAt = performance.now()
  /* Nothing in flight and the near ground drawn: pictures kept in memory from an earlier open count. */
  const loaded = () => pending.n === 0 && ground.ready()
  const shown = new Promise<void>((resolve) => {
    const timer = setTimeout(() => done('timer'), SHOW_WITHIN_MS)
    let quiet = 0
    function done(by: string) {
      clearTimeout(timer)
      postRender.delete(check)
      probe.__clayShown = { by, ms: Math.round(performance.now() - builtAt) }
      resolve()
    }
    function check() {
      quiet = loaded() ? quiet + 1 : 0
      if (quiet >= 3) done('tiles')
      else touch()
    }
    postRender.add(check)
  })
  const settled = (maxMs: number) =>
    new Promise<boolean>((resolve) => {
      const start = performance.now()
      let quiet = 0
      const check = () => {
        quiet = pending.n === 0 ? quiet + 1 : 0
        if (quiet >= 3) return done(true)
        if (performance.now() - start > maxMs) return done(false)
        touch()
      }
      const done = (ok: boolean) => {
        postRender.delete(check)
        resolve(ok)
      }
      postRender.add(check)
      touch()
    })
  const snapshot = () =>
    new Promise<HTMLCanvasElement>((resolve) => {
      const grab = () => {
        postRender.delete(grab)
        const out = document.createElement('canvas')
        out.width = renderer.domElement.width
        out.height = renderer.domElement.height
        out.getContext('2d')?.drawImage(renderer.domElement, 0, 0)
        resolve(out)
      }
      postRender.add(grab)
      touch()
    })

  /* ---------------------------------------------------------- ceiling */
  let ceiling: THREE.Mesh | null = null
  const setCeiling = (centre: LatLon | null, altAbsM: number, alpha: number) => {
    if (ceiling !== null) {
      scene.remove(ceiling)
      ceiling.geometry.dispose()
      ;(ceiling.material as THREE.Material).dispose()
      ceiling = null
    }
    if (centre !== null && alpha > 0) {
      ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: alpha, side: THREE.DoubleSide, depthWrite: false }))
      ceiling.rotation.x = -Math.PI / 2
      ceiling.position.copy(point(centre, altAbsM))
      ceiling.renderOrder = 500
      scene.add(ceiling)
    }
    touch()
  }

  /* -------------------------------------------------------- recording */
  const startRecording = (): { stop: () => Promise<Blob | null> } | null => {
    if (typeof MediaRecorder === 'undefined') return null
    const canvas = renderer.domElement
    const out = document.createElement('canvas')
    out.width = canvas.width
    out.height = canvas.height
    const ctx = out.getContext('2d')
    const compose = () => {
      if (ctx === null) return
      ctx.drawImage(canvas, 0, 0, out.width, out.height)
      ctx.font = `${Math.round(out.height / 40)}px system-ui, sans-serif`
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(WATERMARK, Math.round(out.width / 30), out.height - Math.round(out.height / 30))
    }
    postRender.add(compose)
    continuous += 1
    const type = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
    const recorder = new MediaRecorder(out.captureStream(30), type === '' ? undefined : { mimeType: type })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => chunks.push(e.data)
    recorder.start()
    return {
      stop: () =>
        new Promise<Blob | null>((resolve) => {
          postRender.delete(compose)
          continuous = Math.max(0, continuous - 1)
          recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'video/webm' }))
          recorder.stop()
        }),
    }
  }

  /* ----------------------------------------------------------- preflight */
  let playing: { stop: () => void } | null = null
  const playPath = async (play: FlightPlay, onTime: (at: Date) => void, onProgress?: (share: number) => void, onNote?: (note: string) => void): Promise<Blob | null> => {
    playing?.stop()
    const base = (await heightAt(play.takeoff.lat, play.takeoff.lon)) ?? 0
    const subjectH = ((await heightAt(play.subject.lat, play.subject.lon)) ?? 0) + 2
    setFov(horizontalFov(play.focal))
    const end = play.path[play.path.length - 1].t
    const along = (t: number) => {
      let i = 0
      while (i + 1 < play.path.length && play.path[i + 1].t < t) i += 1
      const a = play.path[i]
      const b = play.path[Math.min(play.path.length - 1, i + 1)]
      const f = b.t === a.t ? 0 : Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)))
      return { lat: a.at.lat + (b.at.lat - a.at.lat) * f, lon: a.at.lon + (b.at.lon - a.at.lon) * f, ft: a.ft + (b.ft - a.ft) * f }
    }
    const poseAt = (t: number) => {
      const shown = easedTime(t, end)
      const p = along(shown)
      const h = base + p.ft * 0.3048
      const dist = Math.max(1, distanceMeters({ lat: p.lat, lon: p.lon }, play.subject))
      const d = drift(t)
      pose(point({ lat: p.lat, lon: p.lon }, h), bearingBetween({ lat: p.lat, lon: p.lon }, play.subject) + d.yaw, Math.atan2(subjectH - h, dist) / DEG + d.pitch)
      const when = new Date(play.startAt.getTime() + shown * 1000)
      if (play.record) setTime(when)
      return when
    }
    if (play.cinema !== null) {
      setSea(play.cinema)
      clouds.set(play.cinema)
    }
    look.set(play.look === 'animated' ? 'animated' : 'real', ground, buildings, water, woods)
    arcs.setShown(false)
    pinGroup.visible = false
    onNote?.(previewNote(play.cinema, clouds.drawn()))
    continuous += 1
    let clip: Blob | null = null
    try {
      if (play.record) clip = await renderFrames(play, end, poseAt, onTime, onProgress)
      else {
        const t0 = performance.now()
        let last = -1
        await new Promise<void>((resolve) => {
          let id = 0
          const step = () => {
            const t = Math.min(end, (performance.now() - t0) / 1000)
            const when = poseAt(t)
            if (Math.floor(t * 2) !== last) {
              last = Math.floor(t * 2)
              onTime(when)
            }
            if (t >= end) return resolve()
            id = requestAnimationFrame(step)
          }
          playing = {
            stop: () => {
              cancelAnimationFrame(id)
              resolve()
            },
          }
          id = requestAnimationFrame(step)
        })
      }
    } finally {
      playing = null
      continuous = Math.max(0, continuous - 1)
      look.set(flyLook ?? 'real', ground, buildings, water, woods)
      arcs.setShown(skyShown)
      pinGroup.visible = true
    }
    return clip
  }

  /*
   * FRAME BY FRAME: the loop stops; each frame is posed, drawn until its tiles
   * have arrived, averaged over the sub-frame instants for motion blur,
   * watermarked and handed to the encoder with its number: a steady 30 fps
   * however long a frame took.
   */
  const renderFrames = async (play: FlightPlay, end: number, poseAt: (t: number) => Date, onTime: (at: Date) => void, onProgress?: (share: number) => void): Promise<Blob | null> => {
    const size = clipSize(renderer.domElement.width, renderer.domElement.height)
    const encoder = await clipEncoder(size.width, size.height, FPS)
    if (encoder === null) return null
    const out = document.createElement('canvas')
    out.width = size.width
    out.height = size.height
    const ctx = out.getContext('2d')
    if (ctx === null) return null
    const note = previewNote(play.cinema, clouds.drawn())
    let stopped = false
    playing = { stop: () => (stopped = true) }
    manual = true
    const settle = async (maxMs: number) => {
      const t0 = performance.now()
      let empty = 0
      draw()
      while (empty < 2 && performance.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 100))
        draw()
        empty = pending.n === 0 ? empty + 1 : 0
      }
    }
    try {
      const frames = frameTimes(end)
      for (let f = 0; f < frames.length && !stopped; f += 1) {
        const subs = subframeTimes(frames[f], end)
        let when = play.startAt
        for (let k = 0; k < subs.length; k += 1) {
          when = poseAt(subs[k])
          if (k === 0) await settle(f === 0 ? 20_000 : 1_500)
          draw()
          ctx.globalAlpha = 1 / (k + 1)
          ctx.drawImage(renderer.domElement, 0, 0, size.width, size.height)
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
      manual = false
    }
    if (stopped) return null
    return encoder.finish((share) => onProgress?.(0.9 + 0.1 * share))
  }

  /* ------------------------------------------------------ sea and looks */
  const setSea = (inputs: CinemaInputs | null) => {
    water.set(inputs, venue)
    clouds.set(inputs)
    touch()
  }
  let flyLook: Look | null = null
  const setFlyLook = (l: Look | null, inputs: CinemaInputs | null) => {
    if (l === flyLook) return
    flyLook = l
    if (inputs !== null) setSea(inputs)
    look.set(l ?? 'real', ground, buildings, water, woods)
    continuous = l === null ? Math.max(0, continuous - 1) : continuous + 1
    touch()
  }

  let skyShown = true
  const setSkyShown = (show: boolean) => {
    skyShown = show
    arcs.setShown(show)
    ;(window as unknown as { __skyShown?: boolean }).__skyShown = show
    touch()
  }
  setSkyShown(true)

  /* For checks and debugging: what the scene holds, by name. */
  ;(window as unknown as { __clayDebug?: () => unknown }).__clayDebug = () => {
    const names: Record<string, number> = {}
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) names[o.name || o.parent?.name || '?'] = (names[o.name || o.parent?.name || '?'] ?? 0) + 1
    })
    const w = water.group.children.map((c) => { const b = new THREE.Box3().setFromObject(c); return { name: c.name, y: Math.round(c.position.y * 100) / 100, tris: ((c as THREE.Mesh).geometry.index?.count ?? 0) / 3, x: [Math.round(b.min.x), Math.round(b.max.x)], z: [Math.round(b.min.z), Math.round(b.max.z)] } })
    const down = (lat: number, lon: number) => {
      const r = new THREE.Raycaster(new THREE.Vector3(frame.x(lon), 2000, frame.z(lat)), new THREE.Vector3(0, -1, 0))
      return r.intersectObjects([ground.group, water.group], true).slice(0, 3).map((h) => `${h.object.name}@${h.point.y.toFixed(2)}`)
    }
    const box = renderer.domElement.getBoundingClientRect()
    return { arcs: arcs.debug(), box: [box.width, box.height], fov: camera.fov, names, water: w.filter((x) => x.name !== 'shore'), camera: camera.position.toArray().map((v) => Math.round(v)), sea: down(venue.lat + 0.004, venue.lon + 0.016), nearSea: down(venue.lat + 0.002, venue.lon + 0.006) }
  }
  orbit()
  ;(window as unknown as { __clayBuilds?: number }).__clayBuilds = ((window as unknown as { __clayBuilds?: number }).__clayBuilds ?? 0) + 1

  const project = (at: LatLon, height = 0) => {
    const v = point(at, height).project(camera)
    if (v.z > 1 || v.z < -1) return null
    const w = renderer.domElement.clientWidth
    const h = renderer.domElement.clientHeight
    return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }
  }

  return {
    whenShown: () => shown,
    sunNow: () => sunNow,
    setTime,
    setBuildings: (b) => buildings.set(b),
    setTrees: (t) => buildings.setTrees(t.map((x) => ({ ...x, height: x.height ?? NOMINAL_TREE_HEIGHT, known: x.height !== null }))),
    setPins,
    setSkyDay: (dayStart: Date) => {
      const arcList: SkyArc[] = [...skyArc('sun', dayStart, venue.lat, venue.lon), ...skyArc('moon', dayStart, venue.lat, venue.lon)]
      arcs.set(arcList, (s) => {
        const [e, n, u] = domePoint(s, 1500)
        return new THREE.Vector3(e, u, -n)
      }, (at) => formatHour(at, timeZone))
    },
    setSkyShown,
    setMoonShown: (show) => arcs.setMoonShown(show),
    credits: () => [...new Set([...(source === null ? [] : [`${source.name} imagery`]), ESRI_CREDIT, TERRAIN_CREDIT, OSM_CREDIT])],
    orbit,
    playPath,
    droneView,
    setChase: (on) => {
      chase = on
      touch()
    },
    photoView,
    settled,
    snapshot,
    setCeiling,
    startRecording,
    observe,
    pickAt: (x, y) => {
      const r = renderer.domElement.getBoundingClientRect()
      ray.setFromCamera(new THREE.Vector2((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1), camera)
      const hit = ray.intersectObjects([ground.group, buildings.group], true)[0]
      return hit === undefined ? null : { lat: frame.lat(hit.point.z), lon: frame.lon(hit.point.x) }
    },
    groundAt: async (at) => {
      const h = await heightAt(at.lat, at.lon)
      return h === null || !Number.isFinite(h) ? null : h
    },
    lookDown: (at, height) => pose(point(at, height), 0, -90),
    buildings: () => buildings.list(),
    counts: tileCounts,
    woods: () => woods.count(),
    setSea,
    setFlyLook,
    setQuality: (q) => clouds.setQuality(q),
    project,
    loaded: () => loaded(),
    frameTimes: () => [...times],
    setWaterMask: (on) => water.setMask(on),
    pills: () => arcs.pills(),
    setHidden: (what) => {
      buildings.group.visible = what !== 'buildings'
      woods.group.visible = what !== 'woods'
      buildings.group.traverse((o) => {
        if (o.name === 'buildings roofs') o.visible = what !== 'roofs'
      })
      touch()
    },
    slabPoints: (n, halfM) => {
      let wet = 0
      let slab = 0
      const by: Record<string, number> = {}
      const r = new THREE.Raycaster()
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          const x = -halfM + ((i + 0.5) * 2 * halfM) / n
          const z = -halfM + ((j + 0.5) * 2 * halfM) / n
          r.set(new THREE.Vector3(x, 3000, z), new THREE.Vector3(0, -1, 0))
          const hits = r.intersectObjects([ground.group, water.group], true)
          const w = hits.findIndex((h) => h.object.name.startsWith('water'))
          if (w < 0) continue
          wet += 1
          const over = hits.slice(0, w).find((h) => h.object.name.startsWith('ground'))
          if (over !== undefined) {
            slab += 1
            const k = `${over.object.name}@${Math.round(over.point.y)}`
            by[k] = (by[k] ?? 0) + 1
          }
        }
      }
      return { water: wet, slab, by }
    },
    renderer,
    onTrouble: (hooks) => {
      Object.assign(trouble, hooks)
    },
    decks: () => decks.counts(),
    gpu: () => ({ textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, calls: renderer.info.render.calls, scale, lost }),
    destroy: () => {
      cancelAnimationFrame(raf)
      renderer.domElement.removeEventListener('webglcontextlost', onLost, false)
      renderer.domElement.removeEventListener('webglcontextrestored', onRestored, false)
      observer.disconnect()
      controls.dispose()
      ground.dispose()
      decks.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/** A generic quadcopter: four arms, four rotors, a body. No maker's design or branding (Section 5b). */
function createDroneModel(): THREE.Group {
  const g = new THREE.Group()
  const grey = new THREE.MeshStandardMaterial({ color: 0x5a5f66, roughness: 0.6, metalness: 0.2 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.7 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.3), grey)
  g.add(body)
  for (const [x, z] of [[0.2, 0.2], [-0.2, 0.2], [0.2, -0.2], [-0.2, -0.2]] as const) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.32), dark)
    arm.position.set(x / 2, 0, z / 2)
    arm.rotation.y = Math.atan2(x, z)
    g.add(arm)
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.008, 20), new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.35 }))
    rotor.position.set(x, 0.05, z)
    g.add(rotor)
  }
  g.scale.setScalar(4)
  return g
}

export { NOMINAL_DRAW_HEIGHT }
