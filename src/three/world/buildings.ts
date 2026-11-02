/*
 * BUILDINGS AND TREES (Batch D, Section 4).
 *
 * 1 Nov: glowing cream boxes with no roof detail, floating over the photo.
 * Here:
 *
 *   footprints  OpenFreeMap's, the heights as the place gives them (a kept
 *               3D scan's where downloaded: src/lib/lidar/), each inset
 *               INSET_M so a box never overhangs its own photo, standing on
 *               the ground under its middle
 *   roofs       the satellite photo, projected straight down from the near
 *               ground's own picture: the roof you see is the roof that was
 *               flown. Beyond the near picture, a plain roof clay
 *   walls       a neutral mid clay, lit by our sun and shaded by face,
 *               darkened toward the foot (ambient occlusion as a gradient),
 *               never brighter than the sky
 *   unknown     no height in the map: UNKNOWN_M tall, flat, darker, no
 *               shadow cast (as in 2D: "no height, no shadow")
 *   far         buildings in CELL_M cells; a cell further than SHOW_M from
 *               where the camera looks is not drawn
 *   trees       instanced simple canopies at their height (a scan's or the
 *               map's, else the nominal one)
 *   at night    (Batch G, Section 9: the hotels drew as black slabs) the
 *               walls glow with the sky's light and the moon's
 *               (src/core/nightLight.ts), the moon itself lighting the faces
 *               toward it (scene.ts); tall buildings show warm windows, a
 *               share of them lit, illustrative. Animated: flat night clay,
 *               and a pale outline you can read against the dark.
 */
import * as THREE from 'three'
import type { Building } from '../../lib/buildings.ts'
import type { LatLon } from '../../core/geo.ts'
import type { SkyColours } from '../../core/skyLook.ts'
import type { Ground } from './ground.ts'
import { daylightTint } from './look.ts'
import { heightAt, type Frame } from './sources.ts'
import type { NightLight } from '../../core/nightLight.ts'

export const INSET_M = 0.4
export const UNKNOWN_M = 3
export const CELL_M = 400
export const SHOW_M = 1500
/* Wall clay, linear: a mid sand, darker than a sunlit sky. */
const WALL = new THREE.Color().setRGB(0.36, 0.32, 0.27, THREE.LinearSRGBColorSpace)
const WALL_UNKNOWN = new THREE.Color().setRGB(0.2, 0.19, 0.17, THREE.LinearSRGBColorSpace)
const ROOF_CLAY = new THREE.Color().setRGB(0.3, 0.27, 0.23, THREE.LinearSRGBColorSpace)
/* Night: the walls' own glow from the sky and the moon, a cool clay; windows a warm lamp colour. */
const NIGHT_WALL = new THREE.Color().setRGB(0.1, 0.105, 0.13, THREE.LinearSRGBColorSpace)
const WINDOW = new THREE.Color().setRGB(1.0, 0.62, 0.3, THREE.LinearSRGBColorSpace)
/* Windows only on buildings this tall, and only above the ground floor. */
export const WINDOWS_FROM_M = 9
export const FLOOR_M = 3.2
export const BAY_M = 3.4
/* Animated by night: flat clay and an outline that reads against the dark. */
const TOON_DAY_EMISSIVE = new THREE.Color().setRGB(0.12, 0.11, 0.1, THREE.LinearSRGBColorSpace)
const TOON_NIGHT_EMISSIVE = new THREE.Color().setRGB(0.1, 0.105, 0.135, THREE.LinearSRGBColorSpace)
const OUTLINE_DAY = new THREE.Color(0x1d1a16)
const OUTLINE_NIGHT = new THREE.Color().setRGB(0.62, 0.66, 0.76, THREE.LinearSRGBColorSpace)

/*
 * THE WINDOWS, worked out in the wall's shader from two numbers per vertex:
 * how far above the building's foot it is (interpolated up the wall, so the
 * floors fall where they would), and nothing when the building is under
 * WINDOWS_FROM_M or has no height. Along the wall, bays every BAY_M by the
 * world position; which are lit, by a hash of the pane, against the share.
 */
const WALL_PARS = /* glsl */ `
attribute float above;
varying float vAbove;
varying vec3 vWallWorld;
`
const WALL_FRAG_PARS = /* glsl */ `
uniform float nightWall;
uniform float windowsLit;
uniform vec3 nightWallCol;
uniform vec3 windowCol;
varying float vAbove;
varying vec3 vWallWorld;
float paneHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
`
const WALL_FRAG = /* glsl */ `
  totalEmissiveRadiance += nightWallCol * nightWall;
  if (vAbove > 4.0 && windowsLit > 0.0) {
    float f = fract(vAbove / ${FLOOR_M.toFixed(1)});
    float b = fract((vWallWorld.x + vWallWorld.z) / ${BAY_M.toFixed(1)});
    float pane = step(0.32, f) * step(f, 0.72) * step(0.22, b) * step(b, 0.78);
    vec3 cell = floor(vec3(vWallWorld.x / ${BAY_M.toFixed(1)}, vAbove / ${FLOOR_M.toFixed(1)}, vWallWorld.z / ${BAY_M.toFixed(1)}));
    float on = step(paneHash(cell), windowsLit);
    totalEmissiveRadiance += windowCol * pane * on * 0.55;
  }
`

export interface TreeIn {
  at: LatLon
  height: number
  known: boolean
}

type P = { x: number; y: number }

/** A ring moved `d` metres inward along each corner's bisector (a footprint drawn inside its own photo). */
/*
 * WALLS FACE OUT, WHICHEVER WAY THE RING RUNS (Batch F, Section 2). A wall's
 * quad was wound in the ring's own order, so a ring running clockwise (x
 * east, y north) gave walls whose fronts faced INTO the building: from
 * outside, the near walls were culled and what showed were the far walls'
 * insides, lit as if they faced the other way. The oceanfront hotels at the
 * VB pier came out as dark boxes where the photo had them lit. Rings are put
 * counter-clockwise first; each wall's normal then points away from the
 * building (buildingWalls.test.ts holds it for both orders).
 */
export function counterClockwise<T extends P>(ring: readonly T[]): T[] {
  let twiceArea = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) twiceArea += ring[j].x * ring[i].y - ring[i].x * ring[j].y
  return twiceArea < 0 ? [...ring].reverse() : [...ring]
}

/** One quad per edge of a counter-clockwise ring, two triangles, in scene coordinates (x east, y up, z = -north). */
export function wallQuad(a: P, c: P, y0: number, y1: number): number[][] {
  return [
    [a.x, y0, -a.y],
    [c.x, y0, -c.y],
    [c.x, y1, -c.y],
    [a.x, y0, -a.y],
    [c.x, y1, -c.y],
    [a.x, y1, -a.y],
  ]
}

export function insetRing(ring: readonly P[], d: number): P[] {
  const n = ring.length
  let area = 0
  for (let i = 0, j = n - 1; i < n; j = i++) area += (ring[j].x - ring[i].x) * (ring[j].y + ring[i].y)
  /* area > 0: clockwise in (x, y up); the inside is to the right of each edge. */
  const side = area > 0 ? -1 : 1
  const out: P[] = []
  for (let i = 0; i < n; i += 1) {
    const a = ring[(i - 1 + n) % n]
    const b = ring[i]
    const c = ring[(i + 1) % n]
    const n1 = norm({ x: -(b.y - a.y), y: b.x - a.x })
    const n2 = norm({ x: -(c.y - b.y), y: c.x - b.x })
    const m = norm({ x: n1.x + n2.x, y: n1.y + n2.y })
    const cos = Math.max(0.35, m.x * n1.x + m.y * n1.y)
    out.push({ x: b.x + (side * m.x * d) / cos, y: b.y + (side * m.y * d) / cos })
  }
  return out
}
const norm = (v: P) => {
  const l = Math.hypot(v.x, v.y) || 1
  return { x: v.x / l, y: v.y / l }
}

const roofVertex = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`
const roofFragment = /* glsl */ `
#include <fog_pars_fragment>
uniform sampler2D atlas;
uniform vec4 box; /* west x, east x, north z, south z */
uniform float hasAtlas;
uniform vec3 tint;
uniform vec3 clay;
uniform vec3 glow;
varying vec3 vWorld;
void main() {
  vec2 uv = vec2((vWorld.x - box.x) / (box.y - box.x), 1.0 - (vWorld.z - box.z) / (box.w - box.z));
  bool inside = hasAtlas > 0.5 && uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0;
  vec3 col = (inside ? texture2D(atlas, uv).rgb * tint : clay * tint) + glow;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

export function createBuildings(frame: Frame, ground: Ground, onChange: () => void) {
  const group = new THREE.Group()
  group.name = 'buildings'
  const treeGroup = new THREE.Group()
  treeGroup.name = 'trees'
  group.add(treeGroup)
  let list: readonly Building[] = []
  const cells = new Map<string, { group: THREE.Group; x: number; z: number }>()
  const walls = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  const nightUniforms = {
    nightWall: { value: 0 },
    windowsLit: { value: 0 },
    nightWallCol: { value: NIGHT_WALL.clone() },
    windowCol: { value: WINDOW.clone() },
  }
  walls.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, nightUniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WALL_PARS}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\nvAbove = above;\nvWallWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${WALL_FRAG_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${WALL_FRAG}`)
  }
  walls.customProgramCacheKey = () => 'walls-night-v1'
  /* The Animated look: flat pale clay faces and a crisp dark outline round each block. */
  const toonWalls = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.8, 0.74, 0.64, THREE.LinearSRGBColorSpace), emissive: new THREE.Color().setRGB(0.12, 0.11, 0.1, THREE.LinearSRGBColorSpace), flatShading: true })
  const outline = new THREE.LineBasicMaterial({ color: 0x1d1a16 })
  let look = 'real'
  const roofUniforms = {
    atlas: { value: null as THREE.Texture | null },
    box: { value: new THREE.Vector4(0, 1, 0, 1) },
    hasAtlas: { value: 0 },
    tint: { value: new THREE.Color(1, 1, 1) },
    clay: { value: ROOF_CLAY.clone() },
    /* At night the roofs too take the sky's and the moon's light (setNight): a roof, not a hole. */
    glow: { value: new THREE.Color(0, 0, 0) },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  }
  const roofs = new THREE.ShaderMaterial({ uniforms: roofUniforms, vertexShader: roofVertex, fragmentShader: roofFragment, fog: true })
  /* The roofs follow the near picture as it moves with the camera. */
  let atlasSeen: THREE.Texture | null = null
  const syncAtlas = () => {
    const a = ground.atlas()
    if (a === null || a.texture === atlasSeen) return
    atlasSeen = a.texture
    roofUniforms.atlas.value = a.texture
    roofUniforms.box.value.set(frame.x(a.west), frame.x(a.east), frame.z(a.north), frame.z(a.south))
    roofUniforms.hasAtlas.value = look === 'animated' ? 0 : 1
    onChange()
  }

  let generation = 0
  const set = (buildings: readonly Building[]) => {
    list = buildings
    generation += 1
    const mine = generation
    for (const c of cells.values()) {
      group.remove(c.group)
      c.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
    }
    cells.clear()
    void (async () => {
      /* Per cell: one merged wall geometry, one roof geometry, built as each cell's ground heights arrive. */
      const byCell = new Map<string, { walls: number[]; colours: number[]; above: number[]; roofs: number[]; shadow: boolean[] }>()
      for (const b of buildings) {
        if (mine !== generation) return
        if (b.ring.length < 4) continue
        const local = b.ring.map(([lon, lat]) => ({ x: frame.x(lon), y: -frame.z(lat) }))
        if (local.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) continue
        const cx = local.reduce((s, p) => s + p.x, 0) / local.length
        const cy = local.reduce((s, p) => s + p.y, 0) / local.length
        const base = (await heightAt(frame.lat(-cy), frame.lon(cx))) ?? 0
        const known = b.height.metres !== null
        const h = known ? (b.height.metres as number) : UNKNOWN_M
        const ring = counterClockwise(insetRing(local.slice(0, local[0].x === local[local.length - 1].x && local[0].y === local[local.length - 1].y ? -1 : undefined), INSET_M))
        if (ring.length < 3) continue
        const key = `${Math.floor(cx / CELL_M)},${Math.floor(cy / CELL_M)}`
        let cell = byCell.get(key)
        if (cell === undefined) {
          cell = { walls: [], colours: [], above: [], roofs: [], shadow: [] }
          byCell.set(key, cell)
        }
        const wall = known ? WALL : WALL_UNKNOWN
        /* Walls: a quad per edge, darker toward the foot (ambient occlusion as a gradient over the lowest 6 m). */
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i]
          const c = ring[(i + 1) % ring.length]
          const y0 = base - 0.5
          const y1 = base + h
          const ao = (y: number) => 0.55 + 0.45 * Math.min(1, (y - base) / 6)
          const quad = wallQuad(a, c, y0, y1)
          for (const q of quad) {
            cell.walls.push(q[0], q[1], q[2])
            const k = ao(q[1])
            cell.colours.push(wall.r * k, wall.g * k, wall.b * k)
            /* Height above the foot for the windows; -1 for buildings too low or of no known height. */
            cell.above.push(known && h >= WINDOWS_FROM_M ? q[1] - base : -1)
          }
        }
        /* The roof: the footprint triangulated at the top. */
        const tris = THREE.ShapeUtils.triangulateShape(ring.map((p) => new THREE.Vector2(p.x, p.y)), [])
        for (const t of tris) for (const i of t) cell.roofs.push(ring[i].x, base + h, -ring[i].y)
        cell.shadow.push(known)
      }
      if (mine !== generation) return
      for (const [key, c] of byCell) {
        const [cx, cy] = key.split(',').map(Number)
        const g = new THREE.Group()
        g.name = 'buildings'
        const wg = new THREE.BufferGeometry()
        wg.setAttribute('position', new THREE.Float32BufferAttribute(c.walls, 3))
        wg.setAttribute('color', new THREE.Float32BufferAttribute(c.colours, 3))
        wg.setAttribute('above', new THREE.Float32BufferAttribute(c.above, 1))
        wg.computeVertexNormals()
        const wm = new THREE.Mesh(wg, look === 'animated' ? toonWalls : walls)
        wm.name = 'buildings walls'
        wm.castShadow = c.shadow.some(Boolean)
        wm.receiveShadow = true
        const rg = new THREE.BufferGeometry()
        rg.setAttribute('position', new THREE.Float32BufferAttribute(c.roofs, 3))
        rg.computeVertexNormals()
        const rm = new THREE.Mesh(rg, roofs)
        rm.name = 'buildings roofs'
        g.add(wm, rm)
        if (look === 'animated') addOutline(g, wm)
        group.add(g)
        cells.set(key, { group: g, x: (cx + 0.5) * CELL_M, z: -(cy + 0.5) * CELL_M })
      }
      syncAtlas()
      onChange()
    })()
  }

  const addOutline = (g: THREE.Group, wm: THREE.Mesh) => {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(wm.geometry, 30), outline)
    e.name = 'buildings outline'
    g.add(e)
  }

  /* --------------------------------------------------------------- trees */
  const setTrees = (trees: readonly TreeIn[]) => {
    for (const c of [...treeGroup.children]) {
      treeGroup.remove(c)
      ;(c as THREE.Mesh).geometry?.dispose()
    }
    if (trees.length === 0) return
    void (async () => {
      const canopy = new THREE.IcosahedronGeometry(1, 1)
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(0.07, 0.13, 0.05, THREE.LinearSRGBColorSpace) })
      const mesh = new THREE.InstancedMesh(canopy, mat, trees.length)
      mesh.name = 'trees'
      mesh.castShadow = true
      mesh.receiveShadow = true
      const m = new THREE.Matrix4()
      for (let i = 0; i < trees.length; i += 1) {
        const t = trees[i]
        const g = (await heightAt(t.at.lat, t.at.lon)) ?? 0
        const r = t.height * 0.32
        m.compose(new THREE.Vector3(frame.x(t.at.lon), g + t.height * 0.62, frame.z(t.at.lat)), new THREE.Quaternion(), new THREE.Vector3(r, t.height * 0.4, r))
        mesh.setMatrixAt(i, m)
      }
      mesh.instanceMatrix.needsUpdate = true
      treeGroup.add(mesh)
      onChange()
    })()
  }

  return {
    group,
    set,
    setTrees,
    list: () => list,
    /* Cells beyond SHOW_M of where the camera looks are not drawn; the roofs follow the near picture. */
    follow: (x: number, z: number) => {
      for (const c of cells.values()) c.group.visible = Math.hypot(c.x - x, c.z - z) < SHOW_M + CELL_M / 2
      syncAtlas()
    },
    setSun: (c: SkyColours) => {
      roofUniforms.tint.value.copy(daylightTint(c))
    },
    /* The night's light on the walls, their windows, and the Animated look's night clay and outline. */
    setNight: (n: NightLight) => {
      nightUniforms.nightWall.value = n.wall
      roofUniforms.glow.value.copy(NIGHT_WALL).multiplyScalar(n.wall * 0.6)
      nightUniforms.windowsLit.value = n.windows
      toonWalls.emissive.copy(TOON_DAY_EMISSIVE).lerp(TOON_NIGHT_EMISSIVE, n.night)
      outline.color.copy(OUTLINE_DAY).lerp(OUTLINE_NIGHT, n.night)
      onChange()
    },
    setLook: (next: string) => {
      look = next
      for (const c of cells.values()) {
        for (const o of [...c.group.children]) {
          if (o.name === 'buildings walls') (o as THREE.Mesh).material = next === 'animated' ? toonWalls : walls
          if (o.name === 'buildings outline') {
            c.group.remove(o)
            ;(o as THREE.LineSegments).geometry.dispose()
          }
        }
        if (next === 'animated') {
          const wm = c.group.children.find((o) => o.name === 'buildings walls') as THREE.Mesh | undefined
          if (wm !== undefined) addOutline(c.group, wm)
        }
      }
      /* Flat roofs in the Animated look: the clay, not the photo. */
      roofUniforms.hasAtlas.value = next === 'animated' ? 0 : atlasSeen === null ? 0 : 1
      onChange()
    },
  }
}
