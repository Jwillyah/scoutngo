/*
 * EVERY SHADER THE 3D VIEW AND FLY DRAW WITH, FOR THE WEBGL PROBE (Batch 3D,
 * Section 1.1). /?probe=webgl compiles each of these on its own, on the
 * app's one renderer, and says which one the phone refused. Each entry is
 * made by the module's own factory, so the probe compiles the very source
 * the scene does, never a copy (tests/webglProbe.test.ts holds that every
 * GLSL string and every custom material in src/three is listed here).
 */
import * as THREE from 'three'
import { createSky } from './world/sky.ts'
import { slabMaterial } from './world/clouds.ts'
import { createWaterMaterials } from './world/water.ts'
import { createWorldLook, toonGroundMaterial } from './world/look.ts'
import { roofMaterial, wallMaterial } from './world/buildings.ts'

export interface ProbeMaterial {
  /** What the probe prints. */
  name: string
  /** The module that makes it, under src/three. */
  file: string
  /** The exported GLSL strings it carries, by name. */
  glsl: readonly string[]
  make(): THREE.Material
}

/* A 4 x 4 picture where a material needs one bound: the program is the same whatever the picture. */
const tinyMap = (): THREE.Texture => {
  const t = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(128), 4, 4)
  t.needsUpdate = true
  return t
}

export const PROBE_MATERIALS: readonly ProbeMaterial[] = [
  { name: 'Ground, Real look', file: 'world/look.ts', glsl: [], make: () => createWorldLook().groundHook().make(tinyMap()) },
  { name: 'Ground, Animated look', file: 'world/look.ts', glsl: ['toonVertex', 'toonFragment'], make: () => toonGroundMaterial(tinyMap()) },
  { name: 'Sky, sun glow, stars, shafts', file: 'world/sky.ts', glsl: ['skyVertex', 'skyFragment'], make: () => createSky().mesh.material as THREE.Material },
  { name: 'Clouds, raymarched layer', file: 'world/clouds.ts', glsl: ['slabVertex', 'slabFragment', 'CLOUD_NOISE_GLSL'], make: () => slabMaterial({}) },
  { name: 'Water surface', file: 'world/water.ts', glsl: ['waterVertex', 'waterFragment'], make: () => createWaterMaterials().material },
  { name: 'Shore ribbon', file: 'world/water.ts', glsl: ['shoreVertex', 'shoreFragment'], make: () => createWaterMaterials().shoreMaterial },
  { name: 'Building walls with windows', file: 'world/buildings.ts', glsl: ['WALL_PARS', 'WALL_FRAG_PARS', 'WALL_FRAG'], make: () => wallMaterial().walls },
  { name: 'Building roofs', file: 'world/buildings.ts', glsl: ['roofVertex', 'roofFragment'], make: () => roofMaterial().roofs },
]

/** three.js's own materials the scene uses, one of each kind (the programs differ by kind and by flags). */
export const PROBE_BUILTINS: readonly { name: string; kind: string; make(): THREE.Material }[] = [
  { name: 'Lambert, flat shaded (woods, Animated walls)', kind: 'MeshLambertMaterial', make: () => new THREE.MeshLambertMaterial({ color: 0x336633, flatShading: true }) },
  { name: 'Standard (decks, the drone)', kind: 'MeshStandardMaterial', make: () => new THREE.MeshStandardMaterial({ color: 0x9a968e, roughness: 0.9, metalness: 0 }) },
  { name: 'Basic, see-through (the 400 ft ceiling)', kind: 'MeshBasicMaterial', make: () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, side: THREE.DoubleSide }) },
  { name: 'Sprite (pins, cloud puffs, hour pills)', kind: 'SpriteMaterial', make: () => new THREE.SpriteMaterial({ map: tinyMap(), transparent: true, depthWrite: false, fog: true }) },
  { name: 'Lines (sun and moon arcs, outlines)', kind: 'LineBasicMaterial', make: () => new THREE.LineBasicMaterial({ color: 0x1d1a16 }) },
]
