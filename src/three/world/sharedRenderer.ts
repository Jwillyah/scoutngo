/*
 * ONE WEBGL CONTEXT FOR THE WHOLE APP (Batch FIX, Section 0.2). Every 3D
 * open used to make a renderer of its own, and closing one freed the ground
 * and the decks but left the water, sky, clouds, buildings, trees, pins and
 * the shadow map on the GPU until the browser got round to collecting the old
 * context. On an iPhone that is memory the tab is killed for. Now:
 *
 *   one renderer, made on first use and kept; 3D, Fly, Compare and the sky
 *   thumbnails borrow it, never two at once (a new borrower sends the old
 *   one away first: its scene is torn down before the next is built)
 *   on leave, every geometry, material and texture of the scene is disposed,
 *   and the canvas taken off the page
 *   a context lost and not restored is let go for good (forceContextLoss),
 *   and the next borrower gets a new one
 */
import * as THREE from 'three'
import { gpuBytes, type GpuCount, type GpuTexture } from '../../core/gpuBudget.ts'
import { recordError } from '../../lib/errorLog.ts'

/** The phone would not give the 3D view a WebGL context: 3D and Fly say so at once (src/lib/clayStatus.ts flyGate). */
export class GraphicsRefused extends Error {
  constructor(why: string) {
    super(`This phone did not allow 3D graphics: ${why}`)
    this.name = 'GraphicsRefused'
  }
}

interface Holder {
  renderer: THREE.WebGLRenderer
  owner: symbol | null
  evict: (() => void) | null
  lost: boolean
}
let held: Holder | null = null

/*
 * Batch 3D, Section 1.2: WHAT THE PHONE REFUSED, KEPT. A context the phone
 * would not give, and a shader it would not compile, went to the console
 * only, which nobody reads on an iPhone (17 Nov: "3D didn't load", and
 * nothing in Last errors said why). Both go to the phone's error log now
 * (src/lib/errorLog.ts), with the browser's own words.
 */
const make = (): Holder => {
  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    recordError('3D', `WebGL context refused: ${message}`)
    throw new GraphicsRefused(message)
  }
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const log = (s: string | null) => (s ?? '').trim().replace(/\s+/g, ' ')
    const words = [!gl.getShaderParameter(vs, gl.COMPILE_STATUS) ? `vertex: ${log(gl.getShaderInfoLog(vs))}` : '', !gl.getShaderParameter(fs, gl.COMPILE_STATUS) ? `fragment: ${log(gl.getShaderInfoLog(fs))}` : '', `link: ${log(gl.getProgramInfoLog(program))}`].filter((w) => w !== '')
    console.error('3D shader refused', ...words)
    recordError('3D', `A shader did not compile on this phone: ${words.join(' · ')}`)
  }
  const h: Holder = { renderer, owner: null, evict: null, lost: false }
  renderer.domElement.addEventListener('webglcontextlost', () => (h.lost = true), false)
  renderer.domElement.addEventListener('webglcontextrestored', () => (h.lost = false), false)
  return h
}

export interface Borrowed {
  renderer: THREE.WebGLRenderer
  /** Give it back: the canvas comes off the page; the renderer stays for the next borrower. */
  release(): void
  /** Still this borrower's (a newer one has not taken it). */
  mine(): boolean
}

/** Borrow the app's one renderer. `evict` is called if another borrower takes it first: tear the scene down there. */
export function borrowRenderer(evict: () => void): Borrowed {
  if (held !== null && held.owner !== null) {
    const away = held.evict
    held.owner = null
    held.evict = null
    away?.()
  }
  if (held !== null && held.lost) {
    held.renderer.dispose()
    held.renderer.forceContextLoss()
    held = null
  }
  if (held === null) held = make()
  const h = held
  const me = Symbol('borrower')
  h.owner = me
  h.evict = evict
  const r = h.renderer
  /* What a previous borrower set, back to three.js's defaults. */
  r.setRenderTarget(null)
  r.shadowMap.enabled = false
  r.toneMapping = THREE.NoToneMapping
  r.toneMappingExposure = 1
  r.outputColorSpace = THREE.SRGBColorSpace
  r.domElement.style.cssText = ''
  const probe = globalThis as unknown as { __renderers?: number }
  probe.__renderers = rendererCount()
  return {
    renderer: r,
    mine: () => h.owner === me,
    release: () => {
      if (h.owner !== me) return
      h.owner = null
      h.evict = null
      r.renderLists.dispose()
      r.domElement.remove()
      for (const f of [...freeWaiters]) f()
    },
  }
}

const freeWaiters = new Set<() => void>()
/** Called each time a borrower gives the renderer back (a 3D view sent away by Compare comes back after it); returns the unsubscribe. */
export function whenFree(f: () => void): () => void {
  freeWaiters.add(f)
  return () => freeWaiters.delete(f)
}

/** How many renderers the app holds right now: 0 or 1, never more (the audit reads it). */
export const rendererCount = (): number => (held === null ? 0 : 1)

/** Is a borrower holding the renderer now (the sky thumbnails wait rather than send the 3D view away)? */
export const rendererBusy = (): boolean => held !== null && held.owner !== null

const texturesOf = (m: THREE.Material): THREE.Texture[] => {
  const out: THREE.Texture[] = []
  for (const v of Object.values(m as unknown as Record<string, unknown>)) if (v instanceof THREE.Texture) out.push(v)
  const u = (m as THREE.ShaderMaterial).uniforms
  if (u !== undefined) for (const k of Object.keys(u)) if (u[k]?.value instanceof THREE.Texture) out.push(u[k].value as THREE.Texture)
  return out
}

/**
 * Free everything under `root`: geometries, materials and their textures. A
 * canvas behind a texture is shrunk to nothing, which is what makes iOS hand
 * its memory back at once (ground.ts's release does the same).
 */
export function disposeTree(root: THREE.Object3D): void {
  const geos = new Set<THREE.BufferGeometry>()
  const mats = new Set<THREE.Material>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry instanceof THREE.BufferGeometry) geos.add(m.geometry)
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) for (const x of mat) mats.add(x)
    else if (mat instanceof THREE.Material) mats.add(mat)
  })
  const texs = new Set<THREE.Texture>()
  for (const m of mats) for (const t of texturesOf(m)) texs.add(t)
  for (const g of geos) g.dispose()
  for (const m of mats) m.dispose()
  for (const t of texs) {
    t.dispose()
    const img = t.image as { width?: number; height?: number } | null
    if (img !== null && typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) {
      img.width = 0
      img.height = 0
    }
  }
}

const imageSize = (t: THREE.Texture): { width: number; height: number } => {
  const img = t.image as { width?: number; height?: number; data?: ArrayLike<number> } | null
  if (img === null || img === undefined) return { width: 0, height: 0 }
  return { width: Number(img.width ?? 0), height: Number(img.height ?? 0) }
}

/** The scene's GPU count (src/core/gpuBudget.ts): every distinct texture and buffer under `root`, the shadow map, the canvas. */
export function countGpu(root: THREE.Object3D, renderer: THREE.WebGLRenderer, shadowPx: number): { count: GpuCount; bytes: number } {
  const geos = new Set<THREE.BufferGeometry>()
  const texs = new Set<THREE.Texture>()
  root.traverse((o) => {
    if (!o.visible) return
    const m = o as THREE.Mesh
    if (m.geometry instanceof THREE.BufferGeometry) geos.add(m.geometry)
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    for (const x of Array.isArray(mat) ? mat : mat instanceof THREE.Material ? [mat] : []) for (const t of texturesOf(x)) texs.add(t)
  })
  const buffers: number[] = []
  for (const g of geos) {
    for (const a of Object.values(g.attributes)) buffers.push((a as THREE.BufferAttribute).array?.byteLength ?? 0)
    if (g.index !== null) buffers.push(g.index.array.byteLength)
  }
  const textures: GpuTexture[] = [...texs].map((t) => ({ ...imageSize(t), mipmaps: t.generateMipmaps && t.minFilter !== THREE.LinearFilter && t.minFilter !== THREE.NearestFilter }))
  const el = renderer.domElement
  const ctx = renderer.getContext()
  const samples = (ctx.getContextAttributes()?.antialias ?? false) ? 4 : 1
  const count: GpuCount = { textures, buffers, shadowPx: renderer.shadowMap.enabled ? shadowPx : 0, canvas: { width: el.clientWidth, height: el.clientHeight, dpr: renderer.getPixelRatio(), samples } }
  return { count, bytes: gpuBytes(count) }
}
