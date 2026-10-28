/*
 * THE SUN'S COLOUR FROM ITS HEIGHT, for the 3D preview's light.
 *
 * Sunlight crosses more air the lower the sun is (the air mass), and air
 * scatters blue far more than red (Rayleigh, as the fourth power of the
 * wavelength), so what is left is golden near the horizon. Haze (aerosol)
 * dims all colours more evenly; how much comes from the forecast visibility.
 * The colour is white-balanced to the sun overhead in clean air, as a camera
 * set to daylight sees it: white at noon, golden low.
 *
 * Arithmetic only, two ways for the air mass:
 *   Kasten & Young (1989)  m = 1 / (sin h + 0.50572 (h + 6.07995)^-1.6364)
 *   Pickering (2002)       m = 1 / sin(h + 244 / (165 + 47 h^1.1))
 * They agree within a few per cent above the horizon; the colour is computed
 * with each and the two compared in the tests and in
 * scripts/measure-cinema.mjs.
 */

const RAD = Math.PI / 180

/** Relative air mass at an apparent altitude in degrees (Kasten & Young 1989). Null below -1 deg. */
export function airMassKastenYoung(altitudeDeg: number): number | null {
  if (altitudeDeg < -1) return null
  const h = Math.max(altitudeDeg, 0)
  return 1 / (Math.sin(h * RAD) + 0.50572 * (h + 6.07995) ** -1.6364)
}

/** The same, Pickering (2002). Null below -1 deg. */
export function airMassPickering(altitudeDeg: number): number | null {
  if (altitudeDeg < -1) return null
  const h = Math.max(altitudeDeg, 0)
  return 1 / Math.sin((h + 244 / (165 + 47 * h ** 1.1)) * RAD)
}

/* Red, green, blue as single wavelengths, micrometres. */
export const RGB_UM = [0.61, 0.55, 0.465] as const

/** Rayleigh optical depth of the whole atmosphere at sea level (Hansen & Travis 1974 fit), wavelength in micrometres. */
export const rayleighDepth = (um: number): number => 0.008569 * um ** -4 * (1 + 0.0113 * um ** -2 + 0.00013 * um ** -4)

/* Aerosol: Angstrom exponent, and the scale height that turns a visibility into an optical depth. */
const ANGSTROM = 1.3
const AEROSOL_SCALE_KM = 1.2

/** Aerosol optical depth at 550 nm from a horizontal visibility (Koschmieder: extinction 3.912 / V). Clear air, 0.1, when it is not known. */
export function aerosolDepth550(visibilityKm: number | null): number {
  if (visibilityKm === null || !Number.isFinite(visibilityKm) || visibilityKm <= 0) return 0.1
  return Math.min(1.5, (3.912 / Math.max(visibilityKm, 1)) * AEROSOL_SCALE_KM)
}

export interface SunColour {
  /** 0..1 each, the brightest channel 1. */
  rgb: [number, number, number]
  /** Fraction of the green that gets through: how dim the sun is. */
  transmittance: number
  airMass: number
}

/** The sun's colour and strength at an altitude, with the chosen air-mass formula. Null when it is down. */
export function sunColour(altitudeDeg: number, visibilityKm: number | null, airMass: (h: number) => number | null = airMassKastenYoung): SunColour | null {
  const m = airMass(altitudeDeg)
  if (m === null) return null
  const tauA = aerosolDepth550(visibilityKm)
  const through = (um: number, mass: number, aerosol: number) => Math.exp(-mass * (rayleighDepth(um) + aerosol * (um / 0.55) ** -ANGSTROM))
  const t = RGB_UM.map((um) => through(um, m, tauA))
  /* White-balanced as a camera on daylight is: the sun overhead in clean air is white. */
  const wb = RGB_UM.map((um) => through(um, 1, 0.1))
  const c = t.map((x, i) => x / wb[i])
  const top = Math.max(...c)
  return { rgb: [c[0] / top, c[1] / top, c[2] / top], transmittance: t[1], airMass: m }
}

/**
 * How far the haze lets you see, as the 3D view's fog density: Cesium's fog
 * fades with exp(-(density x distance)^2), so it reaches the visibility's 2%
 * contrast (Koschmieder) at density = sqrt(3.912) / V. Unknown visibility:
 * the engine's own default.
 */
export function fogDensity(visibilityKm: number | null): number {
  if (visibilityKm === null || !Number.isFinite(visibilityKm) || visibilityKm <= 0) return 2.0e-4
  return Math.sqrt(3.912) / (Math.min(Math.max(visibilityKm, 0.5), 80) * 1000)
}
