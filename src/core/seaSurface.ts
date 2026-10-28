/*
 * THE SEA'S SURFACE FOR THE 3D PREVIEW, from the marine forecast: a handful
 * of travelling sine waves whose sizes are worked out here, drawn by the
 * ocean shader (src/three/cinema.ts) as ripples in the light, not as moving
 * geometry.
 *
 *   swell    three waves around the forecast direction, the middle one at
 *            the forecast period's deep-water wavelength L = g T^2 / (2 pi)
 *            and the sea's significant height Hs shared between them
 *   ripples  six short waves around the wind's direction, their slopes
 *            sized so the surface's slope variance is Cox & Munk's (1954)
 *            measured one for the wind speed: 0.003 + 0.00512 U (U in m/s
 *            at 12.5 m; the 10 m forecast is used as is). That sets how far
 *            the sun's glitter spreads.
 *
 * Every wave moves at its deep-water speed: omega = sqrt(g k).
 */
const G = 9.81

export interface Wave {
  /** Unit vector the crests travel toward, east and north. */
  dir: [number, number]
  /** Wavenumber, radians per metre. */
  k: number
  /** Amplitude, metres. */
  a: number
  /** Angular frequency, radians per second. */
  omega: number
  phase: number
}

export interface SeaInput {
  /** Significant wave height, metres. */
  heightM: number | null
  periodS: number | null
  /** Where the waves come FROM, degrees true (as Open-Meteo gives it). */
  fromDeg: number | null
  windMps: number | null
  /** Where the wind comes FROM, degrees true. */
  windFromDeg: number | null
}

export const deepWavelength = (periodS: number): number => (G * periodS * periodS) / (2 * Math.PI)

/** Cox & Munk's total slope variance for a wind speed in m/s (clean sea surface). */
export const coxMunkVariance = (windMps: number): number => 0.003 + 0.00512 * Math.max(0, windMps)

const toward = (fromDeg: number, offsetDeg: number): [number, number] => {
  const t = ((fromDeg + 180 + offsetDeg) * Math.PI) / 180
  return [Math.sin(t), Math.cos(t)]
}

/* Stand-ins when the forecast is silent: a small sea and a light breeze, so the water still reads as water. */
const QUIET = { heightM: 0.3, periodS: 6, fromDeg: 90, windMps: 3, windFromDeg: 180 }

export function seaWaves(input: SeaInput): Wave[] {
  const h = input.heightM ?? QUIET.heightM
  const T = input.periodS ?? QUIET.periodS
  const from = input.fromDeg ?? QUIET.fromDeg
  const wind = input.windMps ?? QUIET.windMps
  const windFrom = input.windFromDeg ?? QUIET.windFromDeg
  const waves: Wave[] = []
  const L = deepWavelength(Math.max(2, T))
  /* Hs = 4 x the surface's standard deviation; three sines of amplitude a have a standard deviation of a x sqrt(3/2). */
  const aSwell = h / 4 / Math.sqrt(3 / 2)
  for (const [i, [off, scale]] of ([[-12, 1.3], [0, 1], [15, 0.7]] as const).entries()) {
    const k = (2 * Math.PI) / (L * scale)
    waves.push({ dir: toward(from, off), k, a: aSwell, omega: Math.sqrt(G * k), phase: i * 1.7 })
  }
  /* Six ripples, wavelengths 0.6 to 3 m: n sines of slope amplitude s have a slope variance of n s^2 / 2. */
  const N = 6
  const s = Math.sqrt((2 * coxMunkVariance(wind)) / N)
  for (let i = 0; i < N; i += 1) {
    const lambda = 0.6 * 5 ** (i / (N - 1))
    const k = (2 * Math.PI) / lambda
    waves.push({ dir: toward(windFrom, (i - 2.5) * 14), k, a: s / k, omega: Math.sqrt(G * k), phase: i * 2.3 + 0.5 })
  }
  return waves
}

/** The surface's slope variance from its waves (each sine adds (a k)^2 / 2): the check against Cox & Munk. */
export const slopeVariance = (waves: readonly Wave[]): number => waves.reduce((s, w) => s + (w.a * w.k) ** 2 / 2, 0)
