/*
 * /?probe=webgl: WHAT THIS PHONE'S GRAPHICS WILL AND WILL NOT DO (Batch 3D,
 * Section 1.1). A plain page, no app shell (src/main.tsx branches to it
 * before the app starts, and imports it only then, so the app's bundle does
 * not carry it). It runs the steps below one at a time, prints PASS or FAIL
 * with the browser's own words, and stops at the first failure; the order
 * and the text are src/lib/probeSteps.ts.
 *
 * Nothing about the phone leaves it. The only requests are the map tiles,
 * terrain and buildings the 3D view itself asks for, through the app's own
 * fetchers, at one fixed place: the Virginia Beach pier the gate's fixtures
 * were recorded at, never the phone's position. Each step's result is kept
 * in localStorage as it lands, so a page iOS reloads mid-step comes back
 * saying which step it died in.
 */
import * as THREE from 'three'
import { buildLabel } from './build.ts'
import { describeError, firstFailure, reportText, runSteps, stepLine, type ProbeStep, type StepResult } from './probeSteps.ts'
import { currentQuality } from './quality3d.ts'
import { borrowRenderer, countGpu, disposeTree, type Borrowed } from '../three/world/sharedRenderer.ts'
import { PROBE_BUILTINS, PROBE_MATERIALS } from '../three/probeMaterials.ts'
import type { LatLon } from '../core/geo.ts'

/** The pier (scripts/audit-3d-five.mjs, scripts/gate/record-tiles.mjs): the fixtures answer here. */
export const PROBE_POINT: LatLon = { lat: 36.8435575, lon: -75.9713104 }
export const PROBE_KEY = 'scoutngo.probe.v1'
/* The 3D view's first view must be up within the scene's own SHOW_WITHIN_MS; a few seconds more here. */
const SCENE_WAIT_MS = 35_000
const PART_WAIT_MS = 20_000
const ATTRS: WebGLContextAttributes = { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }

interface Kept {
  at: string
  build: string
  results: StepResult[]
}

const keep = (k: Kept) => {
  try {
    localStorage.setItem(PROBE_KEY, JSON.stringify(k))
  } catch {
    /* Storage blocked: the screen still says it. */
  }
}
const kept = (): Kept | null => {
  try {
    const v = JSON.parse(localStorage.getItem(PROBE_KEY) ?? 'null') as Kept | null
    return v !== null && Array.isArray(v.results) ? v : null
  } catch {
    return null
  }
}

/* ------------------------------------------------------------ the raw steps */

let raw: WebGL2RenderingContext | null = null
const gl2 = (): WebGL2RenderingContext => {
  if (raw === null || raw.isContextLost()) throw new Error('no WebGL 2 context (step 1)')
  return raw
}
const releaseRaw = () => {
  raw?.getExtension('WEBGL_lose_context')?.loseContext()
  raw = null
}
const glErrors = (gl: WebGLRenderingContext | WebGL2RenderingContext): string[] => {
  const out: string[] = []
  for (let i = 0; i < 8; i += 1) {
    const e = gl.getError()
    if (e === gl.NO_ERROR) break
    out.push(`0x${e.toString(16)}`)
  }
  return out
}

const contextStep: ProbeStep = {
  name: 'WebGL 2 context (WebGL 1 tried if not)',
  run: () => {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    let why = ''
    c.addEventListener('webglcontextcreationerror', (e) => (why = (e as WebGLContextEvent).statusMessage), false)
    raw = c.getContext('webgl2', ATTRS)
    if (raw === null) {
      const one = document.createElement('canvas').getContext('webgl', ATTRS)
      const v1 = one === null ? 'WebGL 1 refused too' : `WebGL 1 works (${String(one.getParameter(one.VERSION))}); the 3D view needs WebGL 2`
      one?.getExtension('WEBGL_lose_context')?.loseContext()
      throw new Error(`WebGL 2 refused${why === '' ? '' : ` (${why})`}; ${v1}`)
    }
    const a = raw.getContextAttributes()
    return `${String(raw.getParameter(raw.VERSION))}, ${String(raw.getParameter(raw.SHADING_LANGUAGE_VERSION))}; antialias ${String(a?.antialias)}`
  },
}

const gpuStep: ProbeStep = {
  name: 'GPU name (UNMASKED_RENDERER)',
  note: true,
  run: () => {
    const gl = gl2()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (ext === null) return `not given; RENDERER says ${String(gl.getParameter(gl.RENDERER))}`
    return `${String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))} (${String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL))})`
  },
}

const limitsStep: ProbeStep = {
  name: 'Limits (MAX_TEXTURE_SIZE and the rest)',
  run: () => {
    const gl = gl2()
    const q = currentQuality()
    const n = (p: number) => Number(gl.getParameter(p))
    const max = n(gl.MAX_TEXTURE_SIZE)
    const line = `MAX_TEXTURE_SIZE ${max}, RENDERBUFFER ${n(gl.MAX_RENDERBUFFER_SIZE)}, fragment uniform vectors ${n(gl.MAX_FRAGMENT_UNIFORM_VECTORS)}, vertex uniform vectors ${n(gl.MAX_VERTEX_UNIFORM_VECTORS)}, varyings ${n(gl.MAX_VARYING_VECTORS)}, texture units ${n(gl.MAX_TEXTURE_IMAGE_UNITS)}, samples ${n(gl.MAX_SAMPLES)}; this phone's 3D level ${q.level}, near picture ${q.nearPx} px`
    if (max < q.nearPx) throw new Error(`${line}: the near picture is bigger than the GPU allows`)
    return line
  },
}

const texturesStep: ProbeStep = {
  name: 'Textures 1024² and 2048²',
  run: () => {
    const gl = gl2()
    const out: string[] = []
    for (const px of [1024, 2048]) {
      const t = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, px, px, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(px * px * 4))
      gl.generateMipmap(gl.TEXTURE_2D)
      const e = glErrors(gl)
      gl.deleteTexture(t)
      if (e.length > 0) throw new Error(`${px}² refused: GL error ${e.join(', ')}`)
      out.push(`${px}² ok`)
    }
    return out.join(', ')
  },
}

const floatStep: ProbeStep = {
  name: 'Float render target (not used by the 3D view)',
  note: true,
  run: () => {
    const gl = gl2()
    const said: string[] = []
    for (const [ext, fmt, type, label] of [
      ['EXT_color_buffer_float', gl.RGBA32F, gl.FLOAT, 'float'],
      ['EXT_color_buffer_half_float', gl.RGBA16F, gl.HALF_FLOAT, 'half float'],
    ] as const) {
      if (gl.getExtension(ext) === null) {
        said.push(`${label}: ${ext} not offered`)
        continue
      }
      const t = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, 64, 64, 0, gl.RGBA, type, null)
      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.deleteFramebuffer(fb)
      gl.deleteTexture(t)
      said.push(`${label}: ${ok ? 'complete' : 'incomplete'}`)
    }
    return said.join('; ')
  },
}

const offscreenStep: ProbeStep = {
  name: 'OffscreenCanvas picture into a texture (as the ground tiles do)',
  run: () => {
    if (typeof OffscreenCanvas === 'undefined') return 'no OffscreenCanvas here; the ground is drawn without it'
    const gl = gl2()
    const c = new OffscreenCanvas(256, 256)
    const ctx = c.getContext('2d')
    if (ctx === null) throw new Error('OffscreenCanvas gave no 2D context')
    ctx.fillStyle = '#4a7'
    ctx.fillRect(0, 0, 256, 256)
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c as unknown as TexImageSource)
    const e = glErrors(gl)
    const bmp = c.transferToImageBitmap()
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp)
    const e2 = glErrors(gl)
    gl.deleteTexture(t)
    if (e.length > 0 || e2.length > 0) throw new Error(`GL error ${[...e, ...e2].join(', ')} (canvas ${e.length === 0 ? 'ok' : 'refused'}, bitmap ${e2.length === 0 ? 'ok' : 'refused'})`)
    releaseRaw()
    return 'canvas and transferred bitmap both upload'
  },
}

/* --------------------------------------------------- the app's renderer */

interface World {
  borrowed: Borrowed
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
}
let world: World | null = null
let preview: HTMLElement | null = null

/** The app's one renderer, set up as scene.ts sets it: ACES, sRGB, the haze, the sun, the moon and the sky's light. */
function theWorld(): World {
  if (world !== null) return world
  const borrowed = borrowRenderer(() => {})
  const renderer = borrowed.renderer
  const q = currentQuality()
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = q.shadows
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setPixelRatio(Math.min(2, q.maxDpr, window.devicePixelRatio || 1))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  if (preview !== null) {
    preview.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
  }
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0xbfd0e0, 1 / 18_000)
  const sun = new THREE.DirectionalLight(0xffffff, 3)
  sun.castShadow = q.shadows
  sun.position.set(400, 600, 300)
  scene.add(sun, sun.target, new THREE.DirectionalLight(0xc8d4ff, 0.2), new THREE.HemisphereLight(0xbfd5ff, 0x40362c, 0.8))
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / Math.max(1, window.innerHeight), 1, 80_000)
  camera.position.set(250, 420, 600)
  camera.lookAt(0, 0, 0)
  world = { borrowed, renderer, scene, camera }
  return world
}

function endWorld(): void {
  if (world === null) return
  disposeTree(world.scene)
  world.borrowed.release()
  world = null
}

/** Did three.js's program for `mat` compile and link? The browser's own logs if not. */
function programVerdict(renderer: THREE.WebGLRenderer, mat: THREE.Material): string {
  const gl = renderer.getContext()
  const p = (renderer.properties.get(mat) as { currentProgram?: { program: WebGLProgram; vertexShader: WebGLShader; fragmentShader: WebGLShader } }).currentProgram
  if (p === undefined) throw new Error('three.js made no program for it')
  const vOk = gl.getShaderParameter(p.vertexShader, gl.COMPILE_STATUS) === true
  const fOk = gl.getShaderParameter(p.fragmentShader, gl.COMPILE_STATUS) === true
  const linked = gl.getProgramParameter(p.program, gl.LINK_STATUS) === true
  if (!vOk || !fOk || !linked) {
    const log = (s: string | null) => (s ?? '').trim().slice(0, 400) || 'no log'
    throw new Error(`${!vOk ? `vertex shader: ${log(gl.getShaderInfoLog(p.vertexShader))}. ` : ''}${!fOk ? `fragment shader: ${log(gl.getShaderInfoLog(p.fragmentShader))}. ` : ''}${!linked ? `link: ${log(gl.getProgramInfoLog(p.program))}` : ''}`)
  }
  return `compiled and linked, ${String(gl.getProgramParameter(p.program, gl.ACTIVE_UNIFORMS))} uniforms`
}

const objectFor = (mat: THREE.Material): THREE.Object3D => {
  if (mat instanceof THREE.SpriteMaterial) return new THREE.Sprite(mat)
  if (mat instanceof THREE.LineBasicMaterial) return new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 1, 1)]), mat)
  const g = new THREE.BoxGeometry(50, 50, 50)
  /* The walls read a per-vertex height and colour. */
  g.setAttribute('above', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(10), 1))
  g.setAttribute('outward', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(0.5), 1))
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(0.8), 3))
  return new THREE.Mesh(g, mat)
}

const shaderStep = (name: string, make: () => THREE.Material): ProbeStep => ({
  name: `Shader: ${name}`,
  run: () => {
    const w = theWorld()
    const mat = make()
    const obj = objectFor(mat)
    w.scene.add(obj)
    try {
      w.renderer.compile(w.scene, w.camera)
      const said = programVerdict(w.renderer, mat)
      w.renderer.render(w.scene, w.camera)
      const e = glErrors(w.renderer.getContext())
      if (w.renderer.getContext().isContextLost()) throw new Error('the context was lost drawing it')
      if (e.length > 0) throw new Error(`${said}, but drawing it gave GL error ${e.join(', ')}`)
      return said
    } finally {
      w.scene.remove(obj)
      disposeTree(obj)
    }
  },
})

/** Draw frames until `done` (or `maxMs`), each read back so its time is the GPU's too. */
async function drawFor(w: World, maxMs: number, done: () => boolean, each: (frame: number) => void = () => {}): Promise<{ frames: number; slowestMs: number; met: boolean }> {
  const gl = w.renderer.getContext()
  const px = new Uint8Array(4)
  const t0 = performance.now()
  let frames = 0
  let slowest = 0
  let quiet = 0
  while (performance.now() - t0 < maxMs) {
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    each(frames)
    const f0 = performance.now()
    w.renderer.render(w.scene, w.camera)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    slowest = Math.max(slowest, performance.now() - f0)
    frames += 1
    if (gl.isContextLost()) throw new Error(`the context was lost after ${frames} frames (slowest ${Math.round(slowest)} ms)`)
    const e = glErrors(gl)
    if (e.length > 0) throw new Error(`GL error ${e.join(', ')} after ${frames} frames`)
    quiet = done() ? quiet + 1 : 0
    if (quiet >= 3) return { frames, slowestMs: Math.round(slowest), met: true }
  }
  return { frames, slowestMs: Math.round(slowest), met: false }
}

const oneRenderStep: ProbeStep = {
  name: 'One three.js scene drawn',
  run: async () => {
    const w = theWorld()
    const box = new THREE.Mesh(new THREE.BoxGeometry(200, 200, 200), new THREE.MeshStandardMaterial({ color: 0xc88711 }))
    w.scene.add(box)
    const r = await drawFor(w, 3000, () => true)
    const gl = w.renderer.getContext()
    const px = new Uint8Array(4)
    w.renderer.render(w.scene, w.camera)
    gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
    w.scene.remove(box)
    disposeTree(box)
    if (px[0] + px[1] + px[2] === 0) throw new Error('drawn, but the middle pixel is black')
    return `${r.frames} frames, the middle pixel rgb(${px[0]}, ${px[1]}, ${px[2]}); drawing buffer ${gl.drawingBufferWidth} × ${gl.drawingBufferHeight}`
  },
}

/* ---------------------------------------- the 3D view, piece by piece */

type Scene3D = typeof import('../three/world/scene.ts')
type Parts = { ground: import('../three/world/ground.ts').Ground; buildings: ReturnType<typeof import('../three/world/buildings.ts').createBuildings> | null }
let parts: Parts | null = null

/* Every request the page has made, by the browser's own resource timing (the buffer is raised at the start). */
const requestsSoFar = (): number => performance.getEntriesByType('resource').length

const memLine = (w: World) => {
  const g = countGpu(w.scene, w.renderer, currentQuality().shadowPx)
  const m = w.renderer.info.memory
  return `${m.textures} textures, ${m.geometries} geometries, ${Math.round(g.bytes / 1e6)} MB on the GPU by our count`
}

const terrainStep: ProbeStep = {
  name: '3D: the terrain only',
  run: async () => {
    const w = theWorld()
    const [{ createGround }, { createWorldLook }, sources] = await Promise.all([import('../three/world/ground.ts'), import('../three/world/look.ts'), import('../three/world/sources.ts')])
    const q = currentQuality()
    sources.setTileCaches(q.pictureCache, q.terrainCache)
    const ground = createGround(PROBE_POINT, sources.imagerySourceFor(PROBE_POINT), { flatTiles: 0 }, () => {}, createWorldLook().groundHook(), q)
    w.scene.add(ground.group)
    parts = { ground, buildings: null }
    const asked = requestsSoFar()
    const t0 = performance.now()
    let nearAt: number | null = null
    const r = await drawFor(w, PART_WAIT_MS, () => sources.pending.n === 0 && ground.ready(), (f) => {
      if (f % 8 === 0) ground.follow(0, 0, undefined, w.camera.position.y)
      if (nearAt === null && ground.ready()) nearAt = Math.round(performance.now() - t0)
    })
    const tiles = `${sources.tileCounts.imagery} pictures and ${sources.tileCounts.terrain} terrain tiles from ${requestsSoFar() - asked} requests`
    const all = Math.round(performance.now() - t0)
    return `${r.met ? `every tile in at ${all} ms` : `${sources.pending.n} tiles still on the way after ${PART_WAIT_MS / 1000} s (the network, not the graphics)`}, the near square drawn at ${nearAt ?? 'never'} ms; ${tiles}; ${r.frames} frames, slowest ${r.slowestMs} ms; ${memLine(w)}`
  },
}

const buildingsStep: ProbeStep = {
  name: '3D: + the buildings',
  run: async () => {
    const w = theWorld()
    if (parts === null) throw new Error('no terrain (the step before)')
    const [{ createBuildings }, { fetchBuildings }, { boxAround }, { PLACE_BUILDING_METERS }, { frameAt }] = await Promise.all([
      import('../three/world/buildings.ts'),
      import('./buildings.ts'),
      import('./tileRange.ts'),
      import('./place.ts'),
      import('../three/world/sources.ts'),
    ])
    const answer = await fetchBuildings(boxAround(PROBE_POINT, PLACE_BUILDING_METERS))
    const list = answer.status === 'ok' ? answer.buildings : []
    const b = createBuildings(frameAt(PROBE_POINT), parts.ground, () => {})
    w.scene.add(b.group)
    parts.buildings = b
    b.set(list)
    const r = await drawFor(w, 4000, () => false, (f) => {
      if (f % 8 === 0) b.follow(0, 0)
    })
    return `${list.length} buildings${answer.status === 'ok' ? '' : ` (none came: ${answer.reason})`}; ${r.frames} frames, slowest ${r.slowestMs} ms; ${memLine(w)}`
  },
}

const skyStep: ProbeStep = {
  name: '3D: + the sky, the water and raymarched clouds',
  run: async () => {
    const w = theWorld()
    const [{ createSky }, { createWater }, { createClouds }, { frameAt }, { sunDirection }] = await Promise.all([
      import('../three/world/sky.ts'),
      import('../three/world/water.ts'),
      import('../three/world/clouds.ts'),
      import('../three/world/sources.ts'),
      import('../three/world/scene.ts'),
    ])
    const sky = createSky()
    const dir = sunDirection(200, 25)
    sky.set(dir, 25)
    const water = createWater(frameAt(PROBE_POINT), () => {})
    const clouds = createClouds(() => {})
    clouds.set(PROBE_CLOUDS)
    clouds.setSun(dir, sky.colours())
    water.setSun(dir, sky.colours())
    w.scene.add(sky.mesh, water.group, clouds.group)
    /* Half the frames from the overview, half low and level as Fly flies, where the cloud layer fills the top of the screen. */
    const overview = await drawFor(w, 3000, () => false, (f) => clouds.frame(f / 60, w.camera))
    w.camera.position.set(0, 60, 0)
    w.camera.lookAt(0, 60, -1000)
    const level = await drawFor(w, 3000, () => false, (f) => {
      clouds.frame(f / 60, w.camera)
      sky.setShafts(clouds.mirror(), w.camera.position)
    })
    w.camera.position.set(250, 420, 600)
    w.camera.lookAt(0, 0, 0)
    return `drawn; overview ${overview.frames} frames, slowest ${overview.slowestMs} ms; low and level ${level.frames} frames, slowest ${level.slowestMs} ms; ${clouds.drawn() ? 'cloud layers drawn' : 'no cloud layer drawn'}; ${memLine(w)}`
  },
}

/** Low, mid and high cloud over a moderate sea: every cloud shader at work. Illustrative inputs, nothing forecast. */
const PROBE_CLOUDS = { sea: { heightM: 1, periodS: 8, fromDeg: 90, windMps: 5, windFromDeg: 200 }, waterLevelM: 0, cover: { low: 60, mid: 40, high: 30 }, visibilityKm: 20, seaMask: null, seed: 7 }

const fullStep = (host: HTMLElement): ProbeStep => ({
  name: 'The 3D view as the app opens it, then a Fly view',
  run: async () => {
    parts?.ground.dispose()
    parts = null
    endWorld()
    const mod: Scene3D = await import('../three/world/scene.ts')
    const asked = requestsSoFar()
    const t0 = performance.now()
    const made = mod.createClayScene(host, PROBE_POINT, 'America/New_York', { flatTiles: 0 }, () => {})
    let drawnMs: number | null = null
    void made.whenDrawn().then(() => (drawnMs = Math.round(performance.now() - t0)))
    let trouble: string | null = null
    made.onTrouble({ lost: () => (trouble = 'the context was lost'), error: (m) => (trouble = `a frame threw: ${m}`) })
    try {
      made.setSea(PROBE_CLOUDS)
      const shown = await Promise.race([made.whenShown().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), SCENE_WAIT_MS))])
      const ms = Math.round(performance.now() - t0)
      const requests = requestsSoFar() - asked
      if (trouble !== null) throw new Error(`${trouble} (${ms} ms in)`)
      const by = (window as unknown as { __clayShown?: { by: string } }).__clayShown?.by ?? 'unknown'
      const pose = made.frameTimes().length
      made.droneView({ lat: PROBE_POINT.lat - 0.002, lon: PROBE_POINT.lon }, 60, 0, 0, 24)
      await new Promise((r) => setTimeout(r, 3000))
      if (trouble !== null) throw new Error(`${trouble} in the Fly view`)
      const times = made.frameTimes()
      const slowest = Math.round(Math.max(0, ...times))
      const gl = made.renderer.getContext()
      const programs = made.renderer.info.programs ?? []
      const bad = programs.filter((p) => gl.getProgramParameter((p as unknown as { program: WebGLProgram }).program, gl.LINK_STATUS) !== true).length
      const g = made.gpu()
      if (bad > 0) throw new Error(`${bad} of ${programs.length} programs did not link`)
      if (!shown) throw new Error(`not shown in ${SCENE_WAIT_MS / 1000} s (first frame drawn at ${drawnMs ?? 'never'} ms, ${requests} requests made, the scene's own wait is for every tile); ${g.textures} textures, ${Math.round(g.bytes / 1e6)} MB`)
      return `first frame at ${drawnMs ?? '?'} ms, shown at ${ms} ms (by ${by}) after ${requests} requests; ${programs.length} programs, all linked; ${pose} + ${times.length - pose} frames kept, slowest ${slowest} ms; ${Math.round(g.bytes / 1e6)} MB by our count, level ${g.level}, pixel ratio ${g.scale.toFixed(1)}`
    } finally {
      made.destroy()
    }
  },
})

/*
 * WebKit keeps 16 live contexts a page and loses the oldest past that. The
 * app's hasWebGL2 (src/lib/webgl.ts) made a context every time 3D or Fly was
 * opened or closed and never gave it back (until Batch 3D, Section 1). Here:
 * does a kept context survive 20 such throwaway contexts on this phone?
 */
const contextsStep: ProbeStep = {
  name: 'A kept context survives 20 throwaway ones',
  note: true,
  run: async () => {
    const el = document.createElement('canvas')
    const kept = el.getContext('webgl2')
    if (kept === null) return 'no context to keep'
    let lostAt: number | null = null
    let i = 0
    el.addEventListener('webglcontextlost', () => (lostAt = lostAt ?? i), false)
    for (i = 1; i <= 20; i += 1) {
      document.createElement('canvas').getContext('webgl2')
      await new Promise((r) => setTimeout(r, 30))
    }
    const lost = kept.isContextLost()
    kept.getExtension('WEBGL_lose_context')?.loseContext()
    if (lost) throw new Error(`the kept context was lost at throwaway ${lostAt ?? '?'}: unreleased contexts push the 3D view's out`)
    return 'kept'
  },
}

export function probeSteps(host: HTMLElement): ProbeStep[] {
  return [
    contextStep,
    gpuStep,
    limitsStep,
    ...PROBE_MATERIALS.map((m) => shaderStep(`${m.name} (${m.file})`, m.make)),
    ...PROBE_BUILTINS.map((m) => shaderStep(m.name, m.make)),
    texturesStep,
    floatStep,
    offscreenStep,
    oneRenderStep,
    terrainStep,
    buildingsStep,
    skyStep,
    fullStep(host),
    contextsStep,
  ]
}

/* ---------------------------------------------------------------- the page */

/* One line a step, except these, whose numbers are the point (requests, timings, memory): in full, for the one screenshot. */
const WRAPPED = /^(3D: the terrain|The 3D view|A kept context)/
const COLOUR: Record<string, string> = { pass: '#7fd18b', fail: '#ff7a6b', note: '#9fb4c8', running: '#ffd36b', 'not run': '#6b7480' }

export function startWebglProbe(root: HTMLElement): void {
  document.title = 'ScoutNGo · WebGL probe'
  const header = { build: buildLabel(), ua: navigator.userAgent, at: new Date().toISOString() }
  root.innerHTML = ''
  root.setAttribute('style', 'position:fixed;inset:0;overflow:auto;background:#0d1117;color:#e6edf3;font:13px/1.35 ui-monospace,Menlo,monospace;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px calc(env(safe-area-inset-bottom,0px) + 12px);box-sizing:border-box')
  const title = document.createElement('div')
  title.setAttribute('style', 'font:600 16px/1.3 system-ui,sans-serif')
  title.textContent = `WebGL probe · build ${header.build}`
  const ua = document.createElement('div')
  ua.setAttribute('style', 'color:#9fb4c8;font-size:11px;word-break:break-all')
  ua.textContent = header.ua
  const verdict = document.createElement('div')
  verdict.setAttribute('data-probe-verdict', '')
  verdict.setAttribute('style', 'margin:8px 0;padding:8px 10px;border-radius:8px;background:#1b2330;font:600 15px/1.3 system-ui,sans-serif;word-break:break-word')
  const before = document.createElement('div')
  before.setAttribute('style', 'color:#ffd36b;margin-bottom:6px')
  const list = document.createElement('ol')
  list.setAttribute('style', 'margin:0;padding:0;list-style:none')
  const row = document.createElement('div')
  row.setAttribute('style', 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap')
  const button = (label: string) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.setAttribute('style', 'min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #3a4656;background:#1b2330;color:#e6edf3;font:600 15px system-ui,sans-serif')
    row.appendChild(b)
    return b
  }
  const copy = button('Copy all')
  const again = button('Run again')
  const back = button('Back to the app')
  preview = document.createElement('div')
  preview.setAttribute('style', 'position:fixed;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);width:72px;height:156px;border:1px solid #3a4656;border-radius:6px;overflow:hidden;opacity:0.9;pointer-events:none')
  /* The whole scene's own canvas, the size of the screen, out of sight: its first view is what is measured, not shown. */
  const host = document.createElement('div')
  host.setAttribute('style', 'position:fixed;left:-10000px;top:0;width:100dvw;height:100dvh')
  root.append(title, ua, verdict, before, list, row, preview, host)

  const last = kept()
  const died = last?.results.find((r) => r.status === 'running')
  if (last !== null && died !== undefined) before.textContent = `Last run (${last.at.slice(11, 19)} UTC, build ${last.build}) never finished: the page went during "${died.name}".`

  let results: StepResult[] = []
  const show = (rs: readonly StepResult[]) => {
    results = [...rs]
    keep({ at: header.at, build: header.build, results })
    const fail = firstFailure(results)
    const running = results.find((r) => r.status === 'running')
    verdict.textContent = fail !== null ? `FAIL at ${results.indexOf(fail) + 1}: ${fail.name}: ${fail.detail}` : running !== undefined ? `Running ${results.indexOf(running) + 1} of ${results.length}: ${running.name}…` : 'All passed'
    verdict.style.color = fail !== null ? COLOUR.fail : running !== undefined ? COLOUR.running : COLOUR.pass
    list.innerHTML = ''
    results.forEach((r, i) => {
      const li = document.createElement('li')
      li.setAttribute('data-probe-step', r.status)
      /* One line a step; the failure in full. */
      const full = r.status === 'fail' || (r.status !== 'not run' && WRAPPED.test(r.name))
      li.setAttribute('style', `color:${COLOUR[r.status]};${full ? 'white-space:normal;word-break:break-word;margin:2px 0;font-size:11px' : 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis'}`)
      li.textContent = stepLine(r, i)
      list.appendChild(li)
    })
  }
  copy.onclick = () => {
    const text = reportText(header, results)
    const done = () => (copy.textContent = 'Copied')
    void navigator.clipboard?.writeText(text).then(done).catch(() => {
      /* Not allowed: the text, selected, to copy by hand. */
      const t = document.createElement('textarea')
      t.value = text
      t.setAttribute('style', 'width:100%;height:40dvh;margin-top:8px')
      root.appendChild(t)
      t.select()
    })
  }
  again.onclick = () => location.reload()
  back.onclick = () => location.assign('/')
  const run = async () => {
    try {
      performance.setResourceTimingBufferSize?.(20_000)
      await runSteps(probeSteps(host), show)
    } catch (e) {
      verdict.textContent = `The probe itself failed: ${describeError(e)}`
    } finally {
      endWorld()
      releaseRaw()
      preview?.remove()
    }
    ;(window as unknown as { __probe?: string }).__probe = reportText(header, results)
  }
  void run()
}
