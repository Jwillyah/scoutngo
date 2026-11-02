/*
 * THE SKY'S COLOURS FROM THE SUN'S HEIGHT (Batch D, Section 1).
 *
 * The 3D view's sky was black at 8 AM with the sun up (Wrightsville Beach and
 * the VB pier, 1 Nov). This is the one place its colours come from, so the
 * sky, the haze and the ambient light agree, and so a test can hold them
 * without a GPU: the shader (src/three/world/sky.ts) only blends what this
 * returns.
 *
 * AN ANALYTIC MODEL, NOT A SIMULATION. Keyframes by solar elevation, read off
 * clear-sky photographs and the usual twilight bands, interpolated in linear
 * light:
 *
 *   30° and up   deep blue zenith, pale blue-white horizon
 *   6°           day still, the horizon warming
 *   0° to 2°     sunrise / sunset: orange-pink horizon, the zenith still blue
 *   -4°          civil twilight: blue zenith, a rose band low; never black
 *   -6°          end of civil twilight: deep blue; stars begin
 *   -12° down    night: near-black blue, stars
 *
 * Colours are linear RGB, 0..1, before tone mapping (the renderer applies
 * ACES and the sRGB curve). `luminance` is Rec. 709 relative luminance of the
 * linear colour.
 */
export type Rgb = readonly [number, number, number]

export interface SkyColours {
  zenith: Rgb
  horizon: Rgb
  /** The glow round the sun's direction, added on top. */
  sun: Rgb
  /** The ground's ambient (hemisphere light from below). */
  ground: Rgb
  /** 0 to 1: how much the stars show. */
  stars: number
  /** The sunlight's colour and strength on the scene. */
  light: Rgb
  lightIntensity: number
  ambientIntensity: number
}

interface Key {
  at: number
  zenith: Rgb
  horizon: Rgb
  sun: Rgb
  ground: Rgb
  light: Rgb
  lightIntensity: number
  ambient: number
}

/* Linear-light keyframes, low to high. */
const KEYS: readonly Key[] = [
  { at: -18, zenith: [0.002, 0.003, 0.008], horizon: [0.004, 0.006, 0.014], sun: [0, 0, 0], ground: [0.002, 0.002, 0.003], light: [0.3, 0.35, 0.5], lightIntensity: 0, ambient: 0.05 },
  { at: -12, zenith: [0.004, 0.007, 0.02], horizon: [0.01, 0.014, 0.03], sun: [0.01, 0.006, 0.01], ground: [0.004, 0.004, 0.006], light: [0.4, 0.45, 0.6], lightIntensity: 0, ambient: 0.08 },
  { at: -6, zenith: [0.012, 0.025, 0.08], horizon: [0.06, 0.05, 0.09], sun: [0.12, 0.05, 0.04], ground: [0.01, 0.012, 0.02], light: [0.6, 0.55, 0.7], lightIntensity: 0, ambient: 0.18 },
  { at: -4, zenith: [0.025, 0.05, 0.14], horizon: [0.16, 0.1, 0.13], sun: [0.3, 0.12, 0.06], ground: [0.02, 0.025, 0.035], light: [0.8, 0.55, 0.45], lightIntensity: 0.05, ambient: 0.28 },
  { at: 0, zenith: [0.06, 0.12, 0.3], horizon: [0.55, 0.3, 0.2], sun: [1.2, 0.5, 0.15], ground: [0.05, 0.05, 0.06], light: [1.0, 0.55, 0.3], lightIntensity: 0.5, ambient: 0.45 },
  { at: 2, zenith: [0.08, 0.17, 0.42], horizon: [0.7, 0.45, 0.3], sun: [1.4, 0.75, 0.35], ground: [0.07, 0.07, 0.07], light: [1.0, 0.7, 0.45], lightIntensity: 1.1, ambient: 0.55 },
  { at: 6, zenith: [0.1, 0.24, 0.6], horizon: [0.65, 0.62, 0.62], sun: [1.2, 0.95, 0.7], ground: [0.1, 0.09, 0.08], light: [1.0, 0.86, 0.7], lightIntensity: 1.9, ambient: 0.65 },
  { at: 15, zenith: [0.09, 0.25, 0.68], horizon: [0.62, 0.72, 0.85], sun: [1.0, 0.95, 0.85], ground: [0.12, 0.11, 0.1], light: [1.0, 0.94, 0.86], lightIntensity: 2.6, ambient: 0.75 },
  { at: 30, zenith: [0.07, 0.22, 0.66], horizon: [0.58, 0.72, 0.9], sun: [1.0, 0.98, 0.92], ground: [0.13, 0.12, 0.11], light: [1.0, 0.97, 0.92], lightIntensity: 3.0, ambient: 0.8 },
  { at: 90, zenith: [0.05, 0.18, 0.6], horizon: [0.55, 0.7, 0.9], sun: [1.0, 1.0, 0.96], ground: [0.14, 0.13, 0.12], light: [1.0, 1.0, 0.97], lightIntensity: 3.2, ambient: 0.85 },
]

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function skyColours(sunAltitudeDeg: number): SkyColours {
  const h = Math.max(-18, Math.min(90, sunAltitudeDeg))
  let i = 0
  while (i + 1 < KEYS.length - 1 && KEYS[i + 1].at <= h) i += 1
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = b.at === a.at ? 0 : Math.max(0, Math.min(1, (h - a.at) / (b.at - a.at)))
  /* The stars: none by -4°, all by -12°. */
  const stars = Math.max(0, Math.min(1, (-4 - h) / 8))
  return {
    zenith: mix(a.zenith, b.zenith, t),
    horizon: mix(a.horizon, b.horizon, t),
    sun: mix(a.sun, b.sun, t),
    ground: mix(a.ground, b.ground, t),
    stars,
    light: mix(a.light, b.light, t),
    lightIntensity: lerp(a.lightIntensity, b.lightIntensity, t),
    ambientIntensity: lerp(a.ambient, b.ambient, t),
  }
}

export const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

/** The sky's colour looking `elevationDeg` above the horizon (0 horizon, 90 zenith), without the sun's glow. */
export function skyAt(colours: SkyColours, elevationDeg: number): Rgb {
  const t = Math.pow(Math.max(0, Math.min(1, elevationDeg / 90)), 0.45)
  return mix(colours.horizon, colours.zenith, t)
}

/** Blue over red: above 1 reads as blue sky. */
export const blueness = (c: Rgb): number => c[2] / Math.max(1e-6, c[0])

/*
 * ATMOSPHERIC PERSPECTIVE (Batch D, Section 5b). Far land fades into the
 * haze, and the haze by day is a touch bluer than the horizon band itself,
 * so distant ground goes lighter and bluer the way it does from the air,
 * rather than toward a flat white. A fifth of the way to the zenith, scaled
 * by the light: none at night, when the haze is the horizon's own dark.
 */
export const HAZE_ZENITH_SHARE = 0.2
export function hazeColour(c: SkyColours): Rgb {
  const k = HAZE_ZENITH_SHARE * Math.min(1, Math.max(0, c.lightIntensity))
  return [c.horizon[0] + (c.zenith[0] - c.horizon[0]) * k, c.horizon[1] + (c.zenith[1] - c.horizon[1]) * k, c.horizon[2] + (c.zenith[2] - c.horizon[2]) * k]
}
