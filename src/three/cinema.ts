/*
 * THE CINEMATIC PREVIEW'S LOOK, over the same real geometry (lidar or map
 * heights, satellite imagery). Only the look changes, and all of it is
 * computed here, no AI:
 *
 *   sky      the engine's Rayleigh and Mie sky, lit from our sun (suncalc)
 *            rather than its own; the light coloured by the sun's height
 *            through the air (src/core/sunColour.ts); haze from the forecast
 *            visibility as the fog
 *   sea      a surface at the tide's water level over the map's ocean, its
 *            ripples from the marine forecast and the wind
 *            (src/core/seaSurface.ts); the glint is the scene light's own
 *            reflection in it, so it lies where the sun puts it
 *   clouds   from the forecast's low, mid and high cover, placed generically
 *            and said so: "Clouds illustrative" (src/core/clouds.ts)
 *   camera   bloom, light grain, and depth of field at 70 mm
 *   looks    Real (the imagery as it is) or Animated (soft painted colours,
 *            outlines, flat painted water)
 *
 * Only while a Preflight move plays or renders: the plain 3D view stays the
 * clay model, with nothing illustrative in it.
 */
import {
  BillboardCollection,
  Cartesian4,
  Color,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  GroundPrimitive,
  ClassificationType,
  Material,
  PostProcessStage,
  PostProcessStageLibrary,
  Primitive,
  Rectangle,
  RectangleGeometry,
  Sun,
  Cartesian3,
  Matrix4,
  type CesiumWidget,
} from '@cesium/engine'
import { placeClouds, type Cloud, type Cover } from '../core/clouds.ts'
import type { LatLon } from '../core/geo.ts'
import { seaWaves, type SeaInput } from '../core/seaSurface.ts'
import { fogDensity, sunColour } from '../core/sunColour.ts'

export type Look = 'real' | 'animated'

export const CLOUDS_NOTE = 'Clouds illustrative'

export interface CinemaInputs {
  sea: SeaInput
  /** The water's height in the scene's frame (NAVD88 metres, as the ground), or null when it is not known: then 0 and said so. */
  waterLevelM: number | null
  cover: Cover | null
  visibilityKm: number | null
  /** Where the ocean is, around the venue: a mask image (white sea) and its half-width in metres. */
  seaMask: { url: string; halfM: number } | null
  seed: number
}

export interface Cinema {
  /** Sets it all up for these inputs and look. */
  on(inputs: CinemaInputs, look: Look, focal: 24 | 70): void
  /** Per frame: the move's clock in seconds (waves), the sun's altitude, the distance to what the camera looks at (focus). */
  frame(seconds: number, sunAltitudeDeg: number, focusM: number): void
  off(): void
  /** Whether clouds are drawn: the preview then says so. */
  clouds(): boolean
}

const MAX_WAVES = 9
/* How much of the sun's colour the light takes. */
const TINT_STRENGTH = 0.7
/* The sea's mesh spacing: a chord this long sags c^2 / 8R, 0.05 mm, below the curve. */
export const SEA_GRANULARITY_M = 50

/* Each wave is two vec4 uniforms (fabric uniforms cannot be arrays), declared by the engine from the fabric: wN_a (direction east, north, wavenumber, amplitude) and wN_b (angular frequency, phase). */
const waveTerm = (i: number) => `  slope += wave(w${i}_a, w${i}_b, p, px);\n`
const SEA_GLSL = `
vec2 wave(vec4 a, vec4 b, vec2 p, float px)
{
  vec2 d = a.xy;
  float k = a.z;
  /* Faded where it is finer than a pixel: no shimmer far off. */
  float fade = clamp(1.0 - px * k / 3.14159, 0.0, 1.0);
  return d * (a.w * k * cos(k * dot(d, p) - b.x * time + b.y)) * fade;
}

czm_material czm_getMaterial(czm_materialInput materialInput)
{
  czm_material m = czm_getDefaultMaterial(materialInput);
  if (texture(mask, materialInput.st).r < 0.5) discard;
  vec2 p = (materialInput.st - 0.5) * 2.0 * halfM;
  vec2 footprint = fwidth(p);
  float px = max(footprint.x, footprint.y);
  vec2 slope = vec2(0.0);
${Array.from({ length: MAX_WAVES }, (_, i) => waveTerm(i)).join('')}  vec3 nT = normalize(vec3(-slope, 1.0));
  m.normal = normalize(materialInput.tangentToEyeMatrix * nT);
  vec3 toEye = normalize(materialInput.positionToEyeEC);
  float fresnel = pow(1.0 - clamp(dot(m.normal, toEye), 0.0, 1.0), 5.0) * 0.98 + 0.02;
  if (painted > 0.5) {
    m.diffuse = deep.rgb;
    m.emission = sky.rgb * fresnel * 0.4;
    m.specular = 0.3;
    m.shininess = 140.0;
  } else {
    m.diffuse = deep.rgb;
    m.emission = sky.rgb * fresnel;
    m.specular = 1.0;
    m.shininess = 900.0;
  }
  m.alpha = 1.0;
  return m;
}
`

const GRAIN_GLSL = `
uniform sampler2D colorTexture;
uniform float seed;
uniform float amount;
in vec2 v_textureCoordinates;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
void main() {
  vec4 c = texture(colorTexture, v_textureCoordinates);
  float n = rand(floor(v_textureCoordinates * czm_viewport.zw)) - 0.5;
  /* Grain shows most in the mid-tones, as on film. */
  float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  out_FragColor = vec4(c.rgb + n * amount * (1.0 - abs(l - 0.5) * 1.4), c.a);
}
`

/*
 * Animated: the ground posterised toward a soft palette, the sky left smooth
 * (where nothing was drawn, depth 1), and outlines where the depth breaks
 * (a building's edge against what is behind it), not where the imagery's
 * texture does, which drew noise.
 */
const TOON_GLSL = `
uniform sampler2D colorTexture;
uniform sampler2D depthTexture;
in vec2 v_textureCoordinates;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float depthAt(vec2 uv) { return czm_readDepth(depthTexture, uv); }
void main() {
  vec2 px = 1.0 / czm_viewport.zw;
  vec2 uv = v_textureCoordinates;
  float d = depthAt(uv);
  vec3 base = texture(colorTexture, uv).rgb;
  if (d >= 1.0) {
    /* The sky: a touch richer, no bands. */
    out_FragColor = vec4(mix(vec3(luma(base)), base, 1.15), 1.0);
    return;
  }
  vec3 sum = vec3(0.0);
  for (int i = -2; i <= 2; i++) {
    for (int j = -2; j <= 2; j++) {
      sum += texture(colorTexture, uv + vec2(float(i), float(j)) * px * 1.5).rgb;
    }
  }
  vec3 c = sum / 25.0;
  float l = luma(c);
  c = mix(vec3(l), c, 1.2);
  c = floor(c * 8.0 + 0.5) / 8.0;
  c = mix(c, vec3(0.98, 0.95, 0.88), 0.1);
  /* Depth breaks, relative to the depth, so far edges are not all outline. */
  float dl = depthAt(uv - vec2(px.x, 0.0));
  float dr = depthAt(uv + vec2(px.x, 0.0));
  float du = depthAt(uv - vec2(0.0, px.y));
  float dd = depthAt(uv + vec2(0.0, px.y));
  float jump = (abs(dl - dr) + abs(du - dd)) / max(1e-4, 1.0 - d);
  float edge = smoothstep(0.08, 0.3, jump);
  out_FragColor = vec4(c * (1.0 - edge * 0.5), 1.0);
}
`

/* A soft cloud, drawn once: overlapping round puffs, white, fading at the edge. */
function cloudSprite(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const ctx = c.getContext('2d')
  if (ctx === null) return c
  const puffs = [[70, 78, 46], [118, 60, 58], [170, 72, 48], [205, 86, 34], [40, 92, 30], [140, 92, 50]]
  for (const [x, y, r] of puffs) {
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r)
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.6)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  return c
}

/**
 * THE SEA SURFACE: the water's height over the map's ocean, its waves from
 * the marine forecast and the wind (src/core/seaSurface.ts), Real (the deep
 * colour, the sky in it, a sharp glint) or painted. Built at 0 m and lifted
 * to the water's height by its model matrix, so a new tide height moves it
 * rather than rebuilding 57,000 vertices (setLevel). Used by the preview and,
 * since 28 Oct, by the plain 3D view offshore.
 */
export function buildSea(
  inputs: Pick<CinemaInputs, 'sea' | 'seaMask' | 'waterLevelM'>,
  venue: LatLon,
  painted: boolean,
  /*
   * DRAPED ON THE GROUND, for the plain view: the water follows the terrain
   * and stops at the mask's coastline exactly. As a flat plane at the tide's
   * height it cut through the coarse elevation's triangles between the
   * lowered sea floor and the beach, and the shore drew in teeth tens of
   * metres long (Ocean City, 28 Oct). The preview keeps the plane: its
   * camera is low, where the water's height shows.
   */
  ground = false,
): { primitive: Primitive | GroundPrimitive; material: Material; setLevel: (m: number | null) => void } {
  const mask = inputs.seaMask as { url: string; halfM: number }
  const waves = seaWaves(inputs.sea).slice(0, MAX_WAVES)
  const half = mask.halfM
  const dLat = (half / 6_371_000) * (180 / Math.PI)
  const dLon = dLat / Math.cos((venue.lat * Math.PI) / 180)
  const material = new Material({
    fabric: {
      type: 'ScoutSea',
      uniforms: {
        mask: mask.url,
        time: 0,
        halfM: half,
        painted: painted ? 1 : 0,
        deep: painted ? Color.fromCssColorString('#3f8fa6') : Color.fromCssColorString('#0b2a33'),
        sky: painted ? Color.fromCssColorString('#bfe3ea') : Color.fromCssColorString('#8fb3c4'),
        ...Object.fromEntries(
          Array.from({ length: MAX_WAVES }, (_, i) => {
            const w = waves[i]
            return [
              [`w${i}_a`, w === undefined ? new Cartesian4(0, 1, 0, 0) : new Cartesian4(w.dir[0], w.dir[1], w.k, w.a)],
              [`w${i}_b`, w === undefined ? new Cartesian4(0, 0, 0, 0) : new Cartesian4(w.omega, w.phase, 0, 0)],
            ]
          }).flat(),
        ),
      },
      source: SEA_GLSL,
    },
    translucent: false,
  })
  const geometryInstances = new GeometryInstance({
      geometry: new RectangleGeometry({
        rectangle: Rectangle.fromDegrees(venue.lon - dLon, venue.lat - dLat, venue.lon + dLon, venue.lat + dLat),
        height: 0,
        /*
         * A vertex every SEA_GRANULARITY_M: at the default (one per degree)
         * the 12 km square is two flat triangles, and a flat chord that
         * long sags d^2 / 2R = 5.6 m below the Earth's curve at the middle,
         * which put the water under the sea floor at the venue.
         */
        /* Draped, the ground gives the water its shape: the engine's coarse default, a few triangles, not 57,000. */
        ...(ground ? {} : { granularity: SEA_GRANULARITY_M / 6_371_000 }),
        vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      }),
    })
  if (ground) {
    const draped = new GroundPrimitive({ geometryInstances, appearance: new EllipsoidSurfaceAppearance({ material, aboveGround: false }), classificationType: ClassificationType.TERRAIN })
    return { primitive: draped, material, setLevel: () => {} }
  }
  const primitive = new Primitive({
    geometryInstances,
    appearance: new EllipsoidSurfaceAppearance({ material, aboveGround: true }),
    asynchronous: false,
  })
  /* Up at the venue: across 6 km the local up turns by 0.05 deg, a millimetre at a metre's lift. */
  const base = Cartesian3.fromDegrees(venue.lon, venue.lat, 0)
  const setLevel = (m: number | null) => {
    const up = Cartesian3.subtract(Cartesian3.fromDegrees(venue.lon, venue.lat, m ?? 0), base, new Cartesian3())
    primitive.modelMatrix = Matrix4.fromTranslation(up)
  }
  setLevel(inputs.waterLevelM)
  return { primitive, material, setLevel }
}

export function createCinema(widget: CesiumWidget, venue: LatLon, enuToFixedPoint: (v: [number, number, number]) => InstanceType<typeof Cartesian3>): Cinema {
  const scene = widget.scene
  let sea: Primitive | GroundPrimitive | null = null
  let seaMaterial: Material | null = null
  let billboards: BillboardCollection | null = null
  let placed: Cloud[] = []
  let grain: PostProcessStage | null = null
  let toon: PostProcessStage | null = null
  let dof: ReturnType<typeof PostProcessStageLibrary.createDepthOfFieldStage> | null = null
  let visibility: number | null = null
  let saved: { fog: number; dyn: boolean; sun: Sun | undefined; color: InstanceType<typeof Color> } | null = null

  const off = () => {
    if (sea !== null) scene.primitives.remove(sea)
    sea = null
    seaMaterial = null
    if (billboards !== null) scene.primitives.remove(billboards)
    billboards = null
    placed = []
    for (const s of [grain, toon, dof]) if (s !== null) scene.postProcessStages.remove(s)
    grain = null
    toon = null
    dof = null
    scene.postProcessStages.bloom.enabled = false
    if (saved !== null) {
      scene.fog.density = saved.fog
      scene.globe.dynamicAtmosphereLighting = saved.dyn
      scene.sun = saved.sun as Sun
      scene.light.color = saved.color
      saved = null
    }
    scene.requestRender()
  }

  const on = (inputs: CinemaInputs, look: Look, focal: 24 | 70) => {
    off()
    /* For the checks (scripts/measure-cinema.mjs): what the preview was drawn from. */
    ;(window as unknown as { __cinema?: unknown }).__cinema = { inputs, look, focal }
    saved = { fog: scene.fog.density, dyn: scene.globe.dynamicAtmosphereLighting, sun: scene.sun, color: Color.clone(scene.light.color) }
    visibility = inputs.visibilityKm
    /* The sky scatters our sun's light; the engine's sun disc drawn for the bloom to catch. */
    scene.globe.dynamicAtmosphereLighting = true
    scene.globe.dynamicAtmosphereLightingFromSun = false
    scene.sun = new Sun()
    scene.fog.density = fogDensity(inputs.visibilityKm)

    if (inputs.seaMask !== null) {
      const built = buildSea(inputs, venue, look === 'animated')
      sea = built.primitive
      seaMaterial = built.material
      scene.primitives.add(sea)
    }

    if (inputs.cover !== null) {
      placed = placeClouds(inputs.cover, inputs.seed)
      if (placed.length > 0) {
        billboards = new BillboardCollection({ scene })
        const image = cloudSprite()
        for (const c of placed) {
          billboards.add({ position: enuToFixedPoint([c.east, c.north, c.up]), image, width: c.radiusM * 2.4, height: c.radiusM * 1.2, sizeInMeters: true, color: Color.WHITE.withAlpha(c.layer === 'high' ? 0.45 : 0.85) })
        }
        scene.primitives.add(billboards)
      }
    }

    /* Bloom on the sun and its glint, in Real; Animated is flat light. Tuned by looking (the frames in measurements/), gentle enough that the sky by the sun keeps its colour. */
    const bloom = scene.postProcessStages.bloom
    bloom.enabled = look === 'real'
    bloom.uniforms.glowOnly = false
    bloom.uniforms.contrast = 128
    bloom.uniforms.brightness = -0.6
    bloom.uniforms.delta = 1
    bloom.uniforms.sigma = 2.5
    bloom.uniforms.stepSize = 1
    scene.sun.glowFactor = look === 'real' ? 0.6 : 0.3
    if (focal === 70 && PostProcessStageLibrary.isDepthOfFieldSupported(scene)) {
      dof = PostProcessStageLibrary.createDepthOfFieldStage()
      dof.uniforms.focalDistance = 200
      dof.uniforms.delta = 1
      dof.uniforms.sigma = 2
      dof.uniforms.stepSize = 1
      scene.postProcessStages.add(dof)
    }
    if (look === 'animated') {
      toon = new PostProcessStage({ fragmentShader: TOON_GLSL })
      scene.postProcessStages.add(toon)
    }
    grain = new PostProcessStage({ fragmentShader: GRAIN_GLSL, uniforms: { seed: 0, amount: look === 'animated' ? 0.02 : 0.035 } })
    scene.postProcessStages.add(grain)
    scene.requestRender()
  }

  const frame = (seconds: number, sunAltitudeDeg: number, focusM: number) => {
    if (seaMaterial !== null) (seaMaterial.uniforms as Record<string, unknown>).time = seconds
    if (grain !== null) (grain.uniforms as Record<string, unknown>).seed = (seconds * 97.13) % 1000
    if (dof !== null) dof.uniforms.focalDistance = Math.max(5, focusM)
    const sc = sunColour(sunAltitudeDeg, visibility)
    if (sc !== null) {
      /*
       * The tint at TINT_STRENGTH, its brightness held: the imagery is a
       * daylight photograph already, and a camera's exposure follows the
       * light; at full strength golden sand under a golden sun went orange.
       */
      const t = sc.rgb.map((v) => 1 - TINT_STRENGTH + TINT_STRENGTH * v)
      const y = 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]
      scene.light.color = new Color(Math.min(1, t[0] / y), Math.min(1, t[1] / y), Math.min(1, t[2] / y), 1)
      /* Clouds lit by the same light: golden low. */
      if (billboards !== null) {
        for (let i = 0; i < billboards.length; i += 1) {
          const b = billboards.get(i)
          b.color = new Color(0.6 + 0.4 * sc.rgb[0], 0.6 + 0.4 * sc.rgb[1], 0.6 + 0.4 * sc.rgb[2], b.color.alpha)
        }
      }
    }
  }

  return { on, frame, off, clouds: () => placed.length > 0 }
}
