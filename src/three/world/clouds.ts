/*
 * CLOUDS IN THE WORLD (Batch D, Sections 5 and 5b).
 *
 * 1 Nov: clouds were flat 2D blobs stuck to the screen, sliding over the HUD
 * and the compass and not moving with the camera. Here they are things in
 * the scene, at the forecast's layer heights (src/core/clouds.ts LAYERS) and
 * its cover from the shared weather store, so they move with parallax and
 * the HUD, which is the page over the canvas, is always on top of them.
 *
 *   HIGH     each layer a slab, raymarched: density from the cloud field's
 *            noise above the cover's threshold (src/core/cloudField.ts: 37%
 *            cover is about 37% of the field), taller where denser, lit by
 *            our sun's colour with self-shadowing toward the sun (bright
 *            edges toward it, dark bases) and a forward-scattering glow,
 *            drifting with the wind
 *   BATTERY  soft billboards where src/core/clouds.ts placeCloudsForSky puts them,
 *            tinted by the same light: far cheaper, for a phone on a long
 *            flight
 *
 * Where each cloud is, is illustrative: the forecast gives cover and height,
 * not positions. The 3D view's "i" says "Clouds illustrative".
 */
import * as THREE from 'three'
import { LAYERS, placeCloudsForSky, type Cover } from '../../core/clouds.ts'
import { coverThreshold } from '../../core/cloudField.ts'
import type { SkyColours } from '../../core/skyLook.ts'
import { cloudSprite, type CinemaInputs } from './inputs.ts'

export const CLOUDS_NOTE = 'Clouds illustrative'
const FIELD_HALF_M = 18_000
const THICK: Record<'low' | 'mid' | 'high', number> = { low: 700, mid: 900, high: 350 }
const SCALE: Record<'low' | 'mid' | 'high', number> = { low: 1100, mid: 2200, high: 3800 }

export const CLOUD_NOISE_GLSL = /* glsl */ `
float hash2(vec2 p) { return fract(sin(p.x * 127.1 + p.y * 311.7) * 43758.5453); }
float noise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i), b = hash2(i + vec2(1.0, 0.0)), c = hash2(i + vec2(0.0, 1.0)), d = hash2(i + vec2(1.0, 1.0));
  return a + (b - a) * f.x + (c - a) * f.y + (a - b - c + d) * f.x * f.y;
}
float fbm(vec2 p) {
  float v = 0.0; float amp = 0.5;
  for (int i = 0; i < 5; i++) { v += amp * noise2(p); p = p * 2.03 + vec2(17.1, 9.2); amp *= 0.5; }
  return v / 0.96875;
}`

const slabVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

const slabFragment = /* glsl */ `
uniform float base;
uniform float top;
uniform float thresh;
uniform float scale;
uniform float stretch;
uniform vec2 drift;
uniform vec3 sunDir;
uniform vec3 sunCol;
uniform vec3 ambient;
uniform vec3 shade;
uniform vec3 fogCol;
uniform float fogDensity;
varying vec3 vWorld;
${CLOUD_NOISE_GLSL}
float density(vec3 p) {
  vec2 q = (p.xz + drift) / scale;
  q.x /= stretch;
  float c = fbm(q) - thresh;
  if (c <= 0.0) return 0.0;
  float h = clamp((p.y - base) / (top - base), 0.0, 1.0);
  /* Taller where denser; a flat-ish base, a rounded top. */
  float profile = smoothstep(0.0, 0.12, h) * (1.0 - smoothstep(0.25 + c * 2.5, 1.0, h));
  return clamp(c * 6.0, 0.0, 1.0) * profile;
}
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  if (abs(rd.y) < 1e-4) discard;
  float t0 = (base - ro.y) / rd.y;
  float t1 = (top - ro.y) / rd.y;
  float tin = max(min(t0, t1), 0.0);
  float tout = max(t0, t1);
  if (tout <= tin) discard;
  tout = min(tout, tin + 9000.0);
  if (tin > 45000.0) discard;
  const int STEPS = 22;
  float dt = (tout - tin) / float(STEPS);
  float trans = 1.0;
  vec3 col = vec3(0.0);
  float mu = dot(rd, normalize(sunDir));
  float phase = 0.6 + 1.4 * pow(max(mu, 0.0), 6.0);
  float sigma = 0.0032;
  for (int i = 0; i < STEPS; i++) {
    float t = tin + (float(i) + 0.5) * dt;
    vec3 p = ro + rd * t;
    float d = density(p);
    if (d > 0.001) {
      /* Toward the sun, how much cloud: bright edges where little, dark where much. */
      float ls = density(p + normalize(sunDir) * (top - base) * 0.35) + density(p + normalize(sunDir) * (top - base) * 0.8);
      float lit = exp(-ls * 2.2);
      float hh = clamp((p.y - base) / (top - base), 0.0, 1.0);
      vec3 c = mix(shade, sunCol * phase, lit) + ambient * (0.4 + 0.6 * hh);
      float a = 1.0 - exp(-d * sigma * dt);
      col += trans * a * c;
      trans *= 1.0 - a;
      if (trans < 0.03) break;
    }
  }
  float alpha = 1.0 - trans;
  if (alpha < 0.004) discard;
  /* Haze toward the horizon, as on the land. */
  float f = 1.0 - exp(-pow(fogDensity * tin, 2.0));
  col = mix(col / max(alpha, 1e-3), fogCol, f) * alpha;
  gl_FragColor = vec4(col / max(alpha, 1e-3), alpha * (1.0 - 0.6 * f));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/* The billboards' picture: the SVG puff (inputs.ts), never a canvas WebKit adds noise to. */
function puffTexture(): THREE.Texture {
  const t = new THREE.TextureLoader().load(cloudSprite())
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createClouds(onChange: () => void) {
  const group = new THREE.Group()
  group.name = 'clouds'
  let quality: 'high' | 'battery' = 'high'
  let cover: Cover | null = null
  let wind = new THREE.Vector2(0, 0)
  const sun = { dir: new THREE.Vector3(0, 1, 0), col: new THREE.Color(1, 1, 1), ambient: new THREE.Color(0.5, 0.6, 0.8), shade: new THREE.Color(0.25, 0.27, 0.32), fog: new THREE.Color(0.6, 0.7, 0.85) }
  const slabs: { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> }[] = []
  let sprites: THREE.Sprite[] = []
  const spriteMat = new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false, fog: true })
  let drawn = false

  const build = () => {
    for (const s of slabs) {
      group.remove(s.mesh)
      s.mesh.geometry.dispose()
      ;(s.mesh.material as THREE.Material).dispose()
    }
    slabs.length = 0
    for (const s of sprites) group.remove(s)
    sprites = []
    drawn = false
    if (cover === null) return onChange()
    if (quality === 'high') {
      for (const layer of LAYERS) {
        const pct = cover[layer.name]
        if (pct === null || pct <= 0.5) continue
        const uniforms: Record<string, THREE.IUniform> = {
          base: { value: layer.heightM },
          top: { value: layer.heightM + THICK[layer.name] },
          thresh: { value: coverThreshold(pct / 100) },
          scale: { value: SCALE[layer.name] },
          stretch: { value: layer.name === 'high' ? 3.0 : 1.0 },
          drift: { value: new THREE.Vector2() },
          sunDir: { value: sun.dir },
          sunCol: { value: sun.col },
          ambient: { value: sun.ambient },
          shade: { value: sun.shade },
          fogCol: { value: sun.fog },
          fogDensity: { value: 1 / 60_000 },
        }
        const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: slabVertex, fragmentShader: slabFragment, transparent: true, depthWrite: false, side: THREE.BackSide })
        const geo = new THREE.BoxGeometry(FIELD_HALF_M * 2, THICK[layer.name], FIELD_HALF_M * 2)
        geo.translate(0, layer.heightM + THICK[layer.name] / 2, 0)
        const mesh = new THREE.Mesh(geo, mat)
        mesh.name = `clouds ${layer.name}`
        mesh.renderOrder = 50 - layer.heightM / 1000
        mesh.frustumCulled = false
        group.add(mesh)
        slabs.push({ mesh, uniforms })
        drawn = true
      }
    } else {
      /* Thinned so the band a flying camera sees is at most the cover (src/core/clouds.ts). */
      for (const c of placeCloudsForSky(cover, 7)) {
        const s = new THREE.Sprite(spriteMat)
        s.position.set(c.east, c.up, -c.north)
        s.scale.set(c.radiusM * 2.6, c.radiusM * 1.3, 1)
        s.name = 'cloud'
        group.add(s)
        sprites.push(s)
        drawn = true
      }
    }
    onChange()
  }

  return {
    group,
    set: (inputs: CinemaInputs | null) => {
      const next = inputs?.cover ?? null
      const sea = inputs?.sea
      if (sea?.windMps != null && sea.windFromDeg != null) {
        /* The wind blows FROM windFromDeg; the clouds drift the other way, a little faster aloft. */
        const to = ((sea.windFromDeg + 180) * Math.PI) / 180
        wind = new THREE.Vector2(Math.sin(to), -Math.cos(to)).multiplyScalar(sea.windMps * 1.6)
      }
      if (JSON.stringify(next) === JSON.stringify(cover)) return
      cover = next
      build()
    },
    setSun: (dir: THREE.Vector3, c: SkyColours) => {
      sun.dir.copy(dir)
      sun.col.setRGB(c.light[0] * c.lightIntensity * 0.45, c.light[1] * c.lightIntensity * 0.45, c.light[2] * c.lightIntensity * 0.45, THREE.LinearSRGBColorSpace)
      sun.ambient.setRGB(c.zenith[0] * 1.6 + c.horizon[0] * 0.4, c.zenith[1] * 1.6 + c.horizon[1] * 0.4, c.zenith[2] * 1.6 + c.horizon[2] * 0.4, THREE.LinearSRGBColorSpace)
      sun.shade.setRGB(c.horizon[0] * 0.35, c.horizon[1] * 0.37, c.horizon[2] * 0.42, THREE.LinearSRGBColorSpace)
      sun.fog.setRGB(c.horizon[0], c.horizon[1], c.horizon[2], THREE.LinearSRGBColorSpace)
      const k = Math.min(1, 0.25 + 0.3 * c.lightIntensity)
      spriteMat.color.setRGB(k * (0.8 + 0.2 * c.light[0]), k * (0.8 + 0.2 * c.light[1]), k * (0.8 + 0.2 * c.light[2]), THREE.LinearSRGBColorSpace)
    },
    frame: (seconds: number, camera: THREE.Camera) => {
      /* The slabs follow the camera across the ground; the pattern stays put in the world and drifts with the wind. */
      for (const s of slabs) {
        s.mesh.position.set(camera.position.x, 0, camera.position.z)
        ;(s.uniforms.drift.value as THREE.Vector2).set(-wind.x * seconds, -wind.y * seconds)
      }
    },
    animating: () => slabs.length > 0 && wind.lengthSq() > 0,
    drawn: () => drawn,
    setQuality: (q: 'high' | 'battery') => {
      if (q === quality) return
      quality = q
      build()
    },
    quality: () => quality,
  }
}
