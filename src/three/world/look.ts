/*
 * THE LOOK: Real (the photo, lit by our sun) or Animated (Batch D, Section 6).
 *
 * 1 Nov: "Animated" was the photo posterised and blurred, worse than Real. It
 * is not a filter any more; it is a different way of drawing the same world,
 * made by the materials themselves:
 *
 *   ground     a painted palette: each pixel of the photo sorted into sand,
 *              vegetation, roofs and paving or shade and drawn in that flat
 *              colour, so boundaries stay crisp; flat-shaded by its own slope
 *              against our sun in soft bands; lit by the hour's light
 *   water      painted: two flat tones by the Fresnel angle and a clean glint
 *              band (water.ts)
 *   buildings  flat walls in a pale clay, flat roofs a step darker, a crisp
 *              dark outline round each block (buildings.ts)
 *
 * One switch for all three. Real is the default; Fly turns Animated on below
 * 150 ft unless the pilot chose (Clay3D.tsx).
 */
import * as THREE from 'three'
import type { SkyColours } from '../../core/skyLook.ts'
import type { Ground, GroundMaterialHook } from './ground.ts'

export type WorldLook = 'real' | 'animated'

interface Restyle {
  setLook(look: WorldLook): void
}

export interface LookControl {
  groundHook(): GroundMaterialHook
  set(look: WorldLook, ground: Ground, buildings: Restyle, water: Restyle): void
  setSun(dir: THREE.Vector3, c: SkyColours): void
  frame(seconds: number): void
  now(): WorldLook
}

/*
 * THE PHOTO IS ALREADY LIT. A satellite picture carries the light of the day
 * it was flown; lit again by the scene's sun it went dark and muddy (first
 * shots, 1 Nov). So in Real the ground wears the photo unlit, tinted by the
 * hour's daylight (src/core/skyLook.ts): full at day, warm and dimmer at
 * sunset, blue and dark at night. Shadows still fall on it.
 */
export function daylightTint(c: SkyColours): THREE.Color {
  const k = Math.min(1, 0.12 + 0.28 * c.lightIntensity + 0.25 * c.ambientIntensity)
  const warm = c.light
  return new THREE.Color().setRGB(k * (0.75 + 0.25 * warm[0]), k * (0.75 + 0.25 * warm[1]), k * (0.75 + 0.25 * warm[2]), THREE.LinearSRGBColorSpace)
}

const toonVertex = /* glsl */ `
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`

const toonFragment = /* glsl */ `
#include <fog_pars_fragment>
uniform sampler2D map;
uniform vec3 sunDir;
uniform vec3 light;
uniform vec3 ambient;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  /*
   * A PAINTED PALETTE, NOT A BLURRED PHOTO: each pixel of the photo (lightly
   * smoothed) is sorted into what it is, and drawn in that class's flat
   * colour: sand, vegetation, roofs and paving, shade. The boundaries between
   * classes stay crisp; nothing is blurred over the picture.
   */
  vec3 p = texture2D(map, vUv, 1.5).rgb;
  float lum = dot(p, vec3(0.299, 0.587, 0.114));
  float sat = max(p.r, max(p.g, p.b)) - min(p.r, min(p.g, p.b));
  vec3 tone;
  if (lum < 0.16) tone = vec3(0.30, 0.32, 0.36);
  else if (p.g > p.r * 1.04 && p.g > p.b * 1.04 && sat > 0.04) tone = lum > 0.32 ? vec3(0.52, 0.68, 0.38) : vec3(0.33, 0.52, 0.30);
  else if (p.r > p.b * 1.12 && lum > 0.38) tone = vec3(0.90, 0.82, 0.62);
  else tone = lum > 0.45 ? vec3(0.80, 0.79, 0.76) : vec3(0.58, 0.58, 0.58);
  /* Flat facets: the face's own normal from the screen derivatives. */
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.y < 0.0) n = -n;
  float lambert = max(dot(n, normalize(sunDir)), 0.0);
  /* Two soft bands, not a smooth ramp: painted, not photographed. */
  float band = 0.55 + 0.25 * smoothstep(0.15, 0.35, lambert) + 0.2 * smoothstep(0.55, 0.75, lambert);
  vec3 col = tone * band * (ambient * 0.6 + light * 0.8);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`

export function createWorldLook(): LookControl {
  let current: WorldLook = 'real'
  const tint = new THREE.Color(1, 1, 1)
  const made: THREE.MeshLambertMaterial[] = []
  const shared = {
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    light: { value: new THREE.Color(0.9, 0.9, 0.85) },
    ambient: { value: new THREE.Color(0.35, 0.37, 0.42) },
  }
  const real: GroundMaterialHook = {
    make: (map) => {
      /* Lambert with the photo as its own light (emissive), the sun's shadows darkening it where they fall. */
      const m = new THREE.MeshLambertMaterial({ color: 0x000000, emissive: tint, emissiveMap: map, map })
      m.color.setRGB(0.25, 0.25, 0.25)
      made.push(m)
      return m
    },
  }
  const animated: GroundMaterialHook = {
    make: (map) =>
      new THREE.ShaderMaterial({
        uniforms: { map: { value: map }, ...shared, ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog) },
        vertexShader: toonVertex,
        fragmentShader: toonFragment,
        fog: true,
      }),
  }
  let hook = real
  return {
    groundHook: () => ({ make: (map) => hook.make(map) }),
    set: (look, ground, buildings, water) => {
      if (look === current) return
      current = look
      hook = look === 'animated' ? animated : real
      ground.setMaterial(hook)
      buildings.setLook(look)
      water.setLook(look)
    },
    setSun: (dir, c) => {
      tint.copy(daylightTint(c))
      for (const m of made) m.emissive.copy(tint)
      shared.sunDir.value.copy(dir)
      const k = Math.min(1, 0.2 + 0.3 * c.lightIntensity)
      shared.light.value.setRGB(c.light[0] * k, c.light[1] * k, c.light[2] * k, THREE.LinearSRGBColorSpace)
      shared.ambient.value.setRGB(0.25 + c.zenith[0] * 0.8, 0.27 + c.zenith[1] * 0.8, 0.3 + c.zenith[2] * 0.8, THREE.LinearSRGBColorSpace).multiplyScalar(Math.min(1, 0.3 + 0.25 * c.ambientIntensity * 2))
    },
    frame: () => {},
    now: () => current,
  }
}
