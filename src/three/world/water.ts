/*
 * WATER AND COASTLINE (Batch D, Section 3).
 *
 * On 1 Nov the coastline was a pixel staircase with a dotted edge (a raster
 * mask) and a flat dark slab of ocean sat over the photo's water. Here the
 * shore is the map's own water polygons (OpenFreeMap's water layer: ocean,
 * bays, rivers, lakes), drawn as geometry, so the edge is the mapped line,
 * never a grid of pixels:
 *
 *   near   zoom 14 water tiles within NEAR_M (about 2.4 m to a tile unit)
 *   far    zoom 12 beyond, to FAR_M, a few centimetres lower
 *
 * The surface is a shader: waves as moving normals scaled by the forecast's
 * sea (src/core/seaSurface.ts seaWaves, through the shared weather store's
 * marine answer), the sky's own colours reflected by the Fresnel term, and
 * the sun's glint where the reflected view meets OUR sun. Along every real
 * coastline edge (not the tiles' cut edges) a ribbon runs out into the
 * water: lighter shallow water fading over SHALLOW_M, and a moving foam line
 * at the shore. The water is opaque and above the photo's sea (the ground's
 * sea floor is taken below any tide), so there is no second ocean under it.
 */
import * as THREE from 'three'
import type { LatLon } from '../../core/geo.ts'
import { seaWaves } from '../../core/seaSurface.ts'
import type { SkyColours } from '../../core/skyLook.ts'
import { loadVectorTile, vectorExtent } from '../../lib/vectorTiles.ts'
import type { CinemaInputs } from './inputs.ts'
import { latOf, lonOf, tileX, tileY, working, type Frame } from './sources.ts'

export const NEAR_Z = 14
export const FAR_Z = 12
export const NEAR_M = 2500
export const FAR_M = 12_000
export const SHALLOW_M = 28

type Pt = { x: number; y: number }

const waterVertex = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const waterFragment = /* glsl */ `
#include <fog_pars_fragment>
uniform float time;
uniform vec3 sunDir;
uniform vec3 sunColour;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 deep;
uniform float waveScale;
uniform vec2 waveDir;
uniform float mask;
uniform float toon;
varying vec3 vWorld;
float lod;
/* Each wave fades once a pixel covers more than a sixth of its wavelength: no moiré far off. */
vec2 grad(vec2 p, vec2 d, float k, float w, float a) {
  float ph = dot(p, d) * k - time * w;
  float keep = 1.0 - smoothstep(0.6, 1.2, k * lod);
  return d * k * a * cos(ph) * keep;
}
void main() {
  if (mask > 0.5) { gl_FragColor = vec4(1.0, 0.0, 1.0, 1.0); return; }
  vec2 p = vWorld.xz;
  lod = length(fwidth(p));
  vec2 d0 = normalize(waveDir);
  vec2 d1 = normalize(vec2(d0.x * 0.8 - d0.y * 0.6, d0.x * 0.6 + d0.y * 0.8));
  vec2 d2 = normalize(vec2(d0.x * 0.8 + d0.y * 0.6, -d0.x * 0.6 + d0.y * 0.8));
  vec2 g = grad(p, d0, 0.06, 0.75, 0.9) + grad(p, d1, 0.13, 1.1, 0.45) + grad(p, d2, 0.21, 1.4, 0.3)
         + grad(p, vec2(0.6, 0.8), 0.9, 2.6, 0.05) + grad(p, vec2(-0.8, 0.6), 1.7, 3.4, 0.03);
  g *= waveScale;
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(horizon, zenith, pow(clamp(r.y, 0.0, 1.0), 0.45));
  /* Deeper colour far off, a touch of green where the light goes into the water near the viewer. */
  vec3 body = mix(deep * 1.25, deep, clamp(length(cameraPosition.xz - vWorld.xz) / 4000.0, 0.0, 1.0));
  vec3 col = mix(body, sky, fres);
  float glint = pow(max(dot(r, normalize(sunDir)), 0.0), 220.0) * step(0.0, sunDir.y);
  col += sunColour * glint * 6.0;
  if (toon > 0.5) {
    /* Painted (the Animated look): two flat tones by the angle, a clean glint band. */
    float k = clamp(length(deep) * 9.0, 0.25, 1.0);
    vec3 flatDeep = vec3(0.07, 0.25, 0.42) * k;
    vec3 flatFar = vec3(0.16, 0.40, 0.58) * k;
    col = mix(flatDeep, flatFar, smoothstep(0.45, 0.5, fres));
    col += sunColour * step(0.92, pow(max(dot(r, normalize(sunDir)), 0.0), 40.0)) * 1.2;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

const shoreVertex = /* glsl */ `
#include <fog_pars_vertex>
attribute float out;
varying float vOut;
varying vec3 vWorld;
void main() {
  vOut = out;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const shoreFragment = /* glsl */ `
#include <fog_pars_fragment>
uniform float time;
uniform vec3 shallow;
uniform vec3 light;
uniform float mask;
varying float vOut;
varying vec3 vWorld;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  if (mask > 0.5) discard;
  float shallowA = (1.0 - vOut) * 0.55;
  float wash = 0.08 + 0.05 * sin(time * 0.9 + noise(vWorld.xz * 0.05) * 6.0);
  float foam = smoothstep(wash + 0.06, wash, vOut) * (0.55 + 0.45 * noise(vWorld.xz * 0.35 + time * 0.4));
  vec3 col = mix(shallow, vec3(1.0), foam) * light;
  float a = max(shallowA, foam * 0.9);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`


export function createWater(frame: Frame, onChange: () => void) {
  const group = new THREE.Group()
  group.name = 'water'
  const uniforms = {
    time: { value: 0 },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColour: { value: new THREE.Color(1, 1, 1) },
    zenith: { value: new THREE.Color(0.1, 0.25, 0.6) },
    horizon: { value: new THREE.Color(0.6, 0.7, 0.85) },
    deep: { value: new THREE.Color(0.012, 0.06, 0.09) },
    waveScale: { value: 0.6 },
    waveDir: { value: new THREE.Vector2(0.6, 0.8) },
    mask: { value: 0 },
    toon: { value: 0 },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  }
  const shoreUniforms = {
    time: uniforms.time,
    shallow: { value: new THREE.Color(0.16, 0.42, 0.42) },
    light: { value: new THREE.Color(1, 1, 1) },
    mask: uniforms.mask,
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  }
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: waterVertex, fragmentShader: waterFragment, fog: true })
  const shoreMaterial = new THREE.ShaderMaterial({ uniforms: shoreUniforms, vertexShader: shoreVertex, fragmentShader: shoreFragment, fog: true, transparent: true, depthWrite: false })
  let level = 0
  let animated = false
  let shown = 0

  /* ---------------------------------------- the polygons, tile by tile */
  const tileMeshes = (z: number, half: number, drop: number, shore: boolean, skip: ((x: number, y: number) => boolean) | null) => {
    const v = frame.venue
    const dLat = half / frame.mLat
    const dLon = half / frame.mLon
    const x0 = Math.floor(tileX(v.lon - dLon, z))
    const x1 = Math.floor(tileX(v.lon + dLon, z))
    const y0 = Math.floor(tileY(v.lat + dLat, z))
    const y1 = Math.floor(tileY(v.lat - dLat, z))
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        if (skip?.(x, y) === true) continue
        void working(() => loadVectorTile({ z, x, y })).then((tile) => {
          if (tile === null) return
          const layer = tile.layers.water
          if (layer === undefined) return
          const ext = vectorExtent(tile)
          const toLocal = (p: Pt) => ({ x: frame.x(lonOf(x + p.x / ext, z)), y: -frame.z(latOf(y + p.y / ext, z)) })
          const shapes: THREE.Shape[] = []
          const ribbons: { a: Pt; b: Pt; inward: 1 | -1 }[] = []
          for (let i = 0; i < layer.length; i += 1) {
            const f = layer.feature(i)
            if (f.type !== 3) continue
            const rings = f.loadGeometry().map((r) => r.map((p) => ({ x: p.x, y: p.y })))
            /*
             * The rings into shapes by three's own ShapePath: holes found by
             * containment, not by the order or winding a tile happens to have
             * (Wrightsville, 1 Nov: a whole ocean tile came out as a sliver).
             */
            const path = new THREE.ShapePath()
            for (const ring of rings) {
              if (ring.length < 3) continue
              const pts = ring.map(toLocal)
              path.moveTo(pts[0].x, pts[0].y)
              for (let k = 1; k < pts.length; k += 1) path.lineTo(pts[k].x, pts[k].y)
              if (!shore) continue
              /* The shore: every edge that is not the tile's own cut, the ribbon toward the water side. */
              const outer = !THREE.ShapeUtils.isClockWise(pts.map((p) => new THREE.Vector2(p.x, p.y)))
              const onCut = (p: Pt) => p.x <= 1 || p.y <= 1 || p.x >= ext - 1 || p.y >= ext - 1
              for (let k = 0; k + 1 < ring.length; k += 1) {
                if (onCut(ring[k]) && onCut(ring[k + 1])) continue
                ribbons.push({ a: pts[k], b: pts[k + 1], inward: outer ? 1 : -1 })
              }
            }
            shapes.push(...path.toShapes())
          }
          if (shapes.length === 0) return
          const geo = new THREE.ShapeGeometry(shapes)
          geo.rotateX(-Math.PI / 2)
          const mesh = new THREE.Mesh(geo, material)
          mesh.position.y = level - drop
          mesh.userData.drop = drop
          mesh.renderOrder = 1
          mesh.name = `water z${z}`
          group.add(mesh)
          if (ribbons.length > 0) group.add(ribbonMesh(ribbons))
          shown += 1
          onChange()
        })
      }
    }
  }
  /* A strip SHALLOW_M wide out into the water from each shore edge: `out` 0 at the shore, 1 at its far side. */
  const ribbonMesh = (edges: { a: Pt; b: Pt; inward: 1 | -1 }[]) => {
    const pos: number[] = []
    const outs: number[] = []
    for (const e of edges) {
      const dx = e.b.x - e.a.x
      const dy = e.b.y - e.a.y
      const len = Math.hypot(dx, dy)
      if (len < 0.01) continue
      /* Left of the edge in the (x, -z) plane, times inward: into the water. */
      const nx = (-dy / len) * e.inward * SHALLOW_M
      const ny = (dx / len) * e.inward * SHALLOW_M
      const q = [
        [e.a.x, e.a.y, 0],
        [e.b.x, e.b.y, 0],
        [e.b.x + nx, e.b.y + ny, 1],
        [e.a.x + nx, e.a.y + ny, 1],
      ]
      for (const i of [0, 1, 2, 0, 2, 3]) {
        pos.push(q[i][0], 0, -q[i][1])
        outs.push(q[i][2])
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('out', new THREE.Float32BufferAttribute(outs, 1))
    const mesh = new THREE.Mesh(geo, shoreMaterial)
    mesh.position.y = level + 0.05
    mesh.userData.drop = -0.05
    mesh.renderOrder = 2
    mesh.name = 'shore'
    return mesh
  }
  tileMeshes(NEAR_Z, NEAR_M, 0, true, null)
  /*
   * The coarse water everywhere, a little lower: where a fine tile did not
   * come (Wrightsville, 1 Nov) it covers, and near land the near ground, which
   * stands above it, hides it.
   */
  tileMeshes(FAR_Z, FAR_M, 0.08, false, null)

  const setLevel = (m: number) => {
    level = m
    for (const c of group.children) c.position.y = level - ((c.userData.drop as number | undefined) ?? 0)
    onChange()
  }

  return {
    group,
    set: (inputs: CinemaInputs | null, venue: LatLon) => {
      void venue
      setLevel(inputs?.waterLevelM ?? 0)
      const sea = inputs?.sea
      if (sea === undefined) return
      const waves = seaWaves(sea)
      const h = sea.heightM ?? 0.5
      /* The normals' strength from the forecast's height, kept within what reads as water. */
      uniforms.waveScale.value = Math.max(0.25, Math.min(1.6, 0.35 + h * 0.6))
      const main = waves[0]
      /* East and north to the scene's x and z (z is south). */
      if (main !== undefined) uniforms.waveDir.value.set(main.dir[0], -main.dir[1])
      animated = true
    },
    setSun: (dir: THREE.Vector3, c: SkyColours) => {
      uniforms.sunDir.value.copy(dir)
      uniforms.sunColour.value.setRGB(c.sun[0], c.sun[1], c.sun[2], THREE.LinearSRGBColorSpace)
      uniforms.zenith.value.setRGB(c.zenith[0], c.zenith[1], c.zenith[2], THREE.LinearSRGBColorSpace)
      uniforms.horizon.value.setRGB(c.horizon[0], c.horizon[1], c.horizon[2], THREE.LinearSRGBColorSpace)
      /* The sea's own colour under the day's light: a clear-water blue-green, not a black slab (first shots, 1 Nov). */
      const k = Math.min(1, 0.12 + 0.32 * c.lightIntensity)
      uniforms.deep.value.setRGB(0.03 * k + 0.003, 0.105 * k + 0.006, 0.14 * k + 0.01, THREE.LinearSRGBColorSpace)
      shoreUniforms.light.value.setRGB(k, k, k, THREE.LinearSRGBColorSpace)
    },
    frame: (seconds: number, camera: THREE.Camera) => {
      void camera
      uniforms.time.value = seconds
    },
    animating: () => animated && shown > 0,
    /* For checks: water drawn a flat magenta, nothing else changed. */
    setMask: (on: boolean) => {
      uniforms.mask.value = on ? 1 : 0
      onChange()
    },
    setLook: (look: string) => {
      uniforms.toon.value = look === 'animated' ? 1 : 0
      onChange()
    },
    shown: () => shown,
  }
}
