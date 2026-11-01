/*
 * THE SKY, THE SUN'S GLOW AND THE STARS (Batch D, Section 1).
 *
 * The colours are src/core/skyLook.ts's, from OUR sun (suncalc, through
 * src/core/sun.ts) at the time on the bar; this file only paints them: a
 * dome that blends horizon to zenith, the sun's glow round its direction
 * (the only "bloom": a bright soft disc, not a full-screen pass, so nothing
 * else in the picture blooms), a darker band below the horizon, and stars
 * that fade in from -4° to -12°. The haze (the scene's fog) takes the
 * horizon colour, so far land melts into the same sky.
 */
import * as THREE from 'three'
import { skyColours, type SkyColours } from '../../core/skyLook.ts'

export const SKY_RADIUS = 60_000

const vertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; /* always at the far plane */
}`

const fragment = /* glsl */ `
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 below;
uniform vec3 sunGlow;
uniform vec3 sunDir;
uniform float stars;
uniform float exposure;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  vec3 col;
  if (el >= 0.0) {
    col = mix(horizon, zenith, pow(el, 0.45));
  } else {
    col = mix(horizon, below, clamp(-el * 6.0, 0.0, 1.0));
  }
  float c = max(dot(d, normalize(sunDir)), 0.0);
  /* The glow: a wide warm halo and a tight bright disc. */
  col += sunGlow * (0.35 * pow(c, 8.0) + 0.9 * pow(c, 64.0));
  col += sunGlow * 18.0 * smoothstep(0.99985, 0.99995, c) * step(-0.02, sunDir.y);
  if (stars > 0.0 && el > 0.0) {
    vec3 cell = floor(d * 420.0);
    float h = hash(cell);
    float tw = step(0.9975, h) * (0.6 + 0.4 * hash(cell + 7.0));
    col += vec3(tw) * stars * 0.9;
  }
  gl_FragColor = vec4(col * exposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export interface Sky {
  mesh: THREE.Mesh
  /** The colours now, for the haze and the lights. */
  colours(): SkyColours
  /** Set from the sun's direction (unit vector in the scene frame) and its altitude in degrees. */
  set(sunDir: THREE.Vector3, altitudeDeg: number): void
}

const v3 = (c: readonly [number, number, number]) => new THREE.Vector3(c[0], c[1], c[2])

export function createSky(): Sky {
  const uniforms = {
    zenith: { value: new THREE.Vector3() },
    horizon: { value: new THREE.Vector3() },
    below: { value: new THREE.Vector3() },
    sunGlow: { value: new THREE.Vector3() },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    stars: { value: 0 },
    exposure: { value: 1 },
  }
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 48, 24), material)
  mesh.name = 'sky'
  mesh.renderOrder = -1000
  mesh.frustumCulled = false
  let now = skyColours(30)
  const set = (sunDir: THREE.Vector3, altitudeDeg: number) => {
    now = skyColours(altitudeDeg)
    uniforms.zenith.value.copy(v3(now.zenith))
    uniforms.horizon.value.copy(v3(now.horizon))
    uniforms.below.value.copy(v3(now.horizon).multiplyScalar(0.55).add(v3(now.ground)))
    uniforms.sunGlow.value.copy(v3(now.sun))
    uniforms.sunDir.value.copy(sunDir)
    uniforms.stars.value = now.stars
  }
  return { mesh, colours: () => now, set }
}
