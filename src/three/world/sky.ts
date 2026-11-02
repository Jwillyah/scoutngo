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
import { CLOUD_NOISE_GLSL, type CloudMirror } from './clouds.ts'
import { TWILIGHT_WARM, WARM_HEIGHT, skyColours, twilightShare, type SkyColours } from '../../core/skyLook.ts'

export const SKY_RADIUS = 60_000
/* How bright the shafts are against the glow: a ray at most half the glow's own colour brighter or darker than its neighbours. */
export const SHAFT_STRENGTH = 0.9

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
uniform float twilight;
uniform vec3 warm;
uniform float shaftsOn;
uniform vec3 camPos;
uniform float cloudBase;
uniform float cloudThresh;
uniform float cloudScale;
uniform float cloudStretch;
uniform vec2 cloudDrift;
varying vec3 vDir;
${CLOUD_NOISE_GLSL}
/* The cloud layer's cover in a direction from the camera, 0..1; none at or below the horizon. */
float coverToward(vec3 r) {
  if (r.y < 0.02) return 0.0;
  float t = (cloudBase - camPos.y) / r.y;
  if (t <= 0.0) return 0.0;
  vec2 q = (camPos.xz + r.xz * t + cloudDrift) / cloudScale;
  q.x /= cloudStretch;
  return clamp((fbm(q) - cloudThresh) * 6.0, 0.0, 1.0);
}
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  vec3 col;
  /* The twilight band (src/core/skyLook.ts skyToward): thicker, and warmest toward the sun. */
  vec2 dh = normalize(d.xz + vec2(1e-6, 0.0));
  vec2 sh = normalize(sunDir.xz + vec2(1e-6, 0.0));
  float lobe = 0.45 + 0.55 * pow((1.0 + dot(dh, sh)) * 0.5, 2.0);
  float elp = max(el, 0.0);
  vec3 band = warm * twilight * lobe * exp(-elp / ${WARM_HEIGHT.toFixed(3)});
  if (el >= 0.0) {
    col = mix(horizon, zenith, pow(elp, 0.45 + 0.45 * twilight)) + band;
  } else {
    col = mix(horizon + band, below, clamp(-el * 6.0, 0.0, 1.0));
  }
  float c = max(dot(d, normalize(sunDir)), 0.0);
  /* The glow: a wide warm halo and a tight bright disc. */
  col += sunGlow * (0.35 * pow(c, 8.0) + 0.9 * pow(c, 64.0));
  col += sunGlow * 18.0 * smoothstep(0.99985, 0.99995, c) * step(-0.02, sunDir.y);
  /*
   * SUN SHAFTS (Batch F, Section 2; High only). Light reaching this part of
   * the sky is the share of the way to the sun the clouds leave open: twelve
   * looks along the arc from here to the sun through the same cloud field
   * the slabs draw. Where cloud edges sit round the sun, neighbouring arcs
   * differ, and the gaps carry bright rays. With no cloud near the sun there
   * are no edges and nothing is added beyond the glow.
   */
  if (shaftsOn > 0.5 && sunDir.y > -0.03) {
    vec3 s = normalize(sunDir);
    float cs = dot(d, s);
    if (cs > 0.82) {
      float near = 0.0;
      vec3 side = normalize(cross(s, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(side, s);
      near += coverToward(s);
      near += coverToward(normalize(s + side * 0.04));
      near += coverToward(normalize(s - side * 0.04));
      near += coverToward(normalize(s + up * 0.04));
      near += coverToward(normalize(s - up * 0.04));
      float edge = clamp(near / 5.0 * 2.5, 0.0, 1.0) * clamp((1.0 - near / 5.0) * 4.0, 0.0, 1.0);
      if (edge > 0.0) {
        float open = 0.0;
        for (int i = 0; i < 12; i++) {
          float t = (float(i) + 0.5) / 12.0;
          open += 1.0 - coverToward(normalize(mix(d, s, t)));
        }
        open /= 12.0;
        float fall = pow((cs - 0.82) / 0.18, 2.0);
        col += sunGlow * ${SHAFT_STRENGTH.toFixed(2)} * edge * fall * (open - 0.5);
      }
    }
  }
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
  /** The cloud layer to cast shafts through, from where the camera is; null turns them off (Battery, or no cloud). */
  setShafts(m: CloudMirror | null, camPos: THREE.Vector3): void
  shaftsOn(): boolean
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
    twilight: { value: 0 },
    warm: { value: new THREE.Vector3(TWILIGHT_WARM[0], TWILIGHT_WARM[1], TWILIGHT_WARM[2]) },
    shaftsOn: { value: 0 },
    camPos: { value: new THREE.Vector3() },
    cloudBase: { value: 1000 },
    cloudThresh: { value: 1 },
    cloudScale: { value: 1000 },
    cloudStretch: { value: 1 },
    cloudDrift: { value: new THREE.Vector2() },
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
    uniforms.twilight.value = twilightShare(altitudeDeg)
  }
  const setShafts = (m: CloudMirror | null, camPos: THREE.Vector3) => {
    uniforms.shaftsOn.value = m === null ? 0 : 1
    uniforms.camPos.value.copy(camPos)
    if (m === null) return
    uniforms.cloudBase.value = m.base
    uniforms.cloudThresh.value = m.thresh
    uniforms.cloudScale.value = m.scale
    uniforms.cloudStretch.value = m.stretch
    uniforms.cloudDrift.value.copy(m.drift)
  }
  return { mesh, colours: () => now, set, setShafts, shaftsOn: () => uniforms.shaftsOn.value === 1 }
}
