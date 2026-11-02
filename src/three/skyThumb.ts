/*
 * A SMALL PICTURE OF ONE SKY (Batch F, Section 6), for Sky fire's pages 2
 * and 3: the same sky and cloud code the 3D view draws (world/sky.ts,
 * world/clouds.ts), with OUR sun at the event's minute and one forecast's
 * cloud amounts at their layer heights, looking toward the sun from a few
 * metres above a dark sea. No terrain, no map, no imagery: nothing of a real
 * place is drawn, only its sky. Clouds illustrative (their places are the
 * noise field's; their amounts and heights are the forecast's).
 *
 * One renderer for every picture, made on first use and kept; each picture
 * is a data URL, cached by its inputs, so a page drawn once is not drawn
 * again. Loaded only when a page asks (a dynamic import), so the 3D code
 * stays out of the app's first download.
 */
import * as THREE from 'three'
import type { Cover } from '../core/clouds.ts'
import { createClouds } from './world/clouds.ts'
import { createSky } from './world/sky.ts'
import { lookDir, sunDirection } from './world/scene.ts'

export interface SkyThumbInput {
  sunAzimuthDeg: number
  sunAltitudeDeg: number
  cover: Cover
  width: number
  height: number
  /** The colour clock's light on each layer that fires, linear RGB (src/core/skyPages.ts fourSkies). */
  glow?: Partial<Record<'low' | 'mid' | 'high', readonly [number, number, number]>>
}

let renderer: THREE.WebGLRenderer | null = null
const cache = new Map<string, string>()

export function thumbKey(i: SkyThumbInput): string {
  const r = (x: number | null) => (x === null ? '-' : Math.round(x))
  const g = (['low', 'mid', 'high'] as const).map((l) => i.glow?.[l]?.map((v) => v.toFixed(2)).join(',') ?? '-').join(';')
  return [i.sunAzimuthDeg.toFixed(1), i.sunAltitudeDeg.toFixed(1), r(i.cover.low), r(i.cover.mid), r(i.cover.high), i.width, i.height, g].join('|')
}

export function renderSkyThumb(i: SkyThumbInput): string | null {
  const key = thumbKey(i)
  const kept = cache.get(key)
  if (kept !== undefined) return kept
  try {
    if (renderer === null) {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false })
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.outputColorSpace = THREE.SRGBColorSpace
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setSize(i.width, i.height, false)
    const scene = new THREE.Scene()
    const sky = createSky()
    scene.add(sky.mesh)
    const sunDir = sunDirection(i.sunAzimuthDeg, i.sunAltitudeDeg)
    sky.set(sunDir, i.sunAltitudeDeg)
    const c = sky.colours()
    scene.fog = new THREE.FogExp2(new THREE.Color().setRGB(c.horizon[0], c.horizon[1], c.horizon[2], THREE.LinearSRGBColorSpace), 1 / 30_000)
    const clouds = createClouds(() => {})
    clouds.set({ cover: i.cover, sea: { windMps: null, windFromDeg: null }, waterLevelM: null, visibilityKm: null, seaMask: null, seed: 1 } as unknown as Parameters<typeof clouds.set>[0])
    clouds.setSun(sunDir, c)
    /*
     * The layers that fire, in the colour clock's light. Below the horizon the
     * slab shader's sun term looks along the ray to the sun; lit cloud is lit
     * from under, so the direction is taken just above the horizon for them.
     */
    if (i.glow !== undefined && Object.keys(i.glow).length > 0 && i.sunAltitudeDeg < 1) clouds.setSun(sunDirection(i.sunAzimuthDeg, 1), c)
    for (const layer of ['low', 'mid', 'high'] as const) {
      const rgb = i.glow?.[layer]
      if (rgb !== undefined) clouds.setLayerLight(layer, rgb)
    }
    scene.add(clouds.group)
    /* A dark sea to the horizon, tinted by the sky above it. */
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400_000, 400_000), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c.zenith[0] * 0.5 + c.horizon[0] * 0.08 + 0.004, c.zenith[1] * 0.5 + c.horizon[1] * 0.08 + 0.01, c.zenith[2] * 0.5 + c.horizon[2] * 0.08 + 0.02, THREE.LinearSRGBColorSpace) }))
    sea.rotation.x = -Math.PI / 2
    scene.add(sea)
    const camera = new THREE.PerspectiveCamera(62, i.width / i.height, 1, 120_000)
    camera.position.set(0, 12, 0)
    camera.lookAt(camera.position.clone().add(lookDir(i.sunAzimuthDeg, 9)))
    clouds.frame(0, camera)
    renderer.render(scene, camera)
    const url = renderer.domElement.toDataURL('image/jpeg', 0.82)
    sky.mesh.geometry.dispose()
    sea.geometry.dispose()
    cache.set(key, url)
    return url
  } catch {
    return null
  }
}
