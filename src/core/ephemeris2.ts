/*
 * A SECOND EPHEMERIS, written from Meeus (Astronomical Algorithms, 2nd ed.)
 * and sharing no code with suncalc, so an alignment's bearing is worked out
 * twice and the two can be held against each other (tests/lineup.test.ts).
 *
 *   sun   chapter 25, the low-accuracy method: about 0.01°
 *   moon  chapter 47, its 24 largest longitude terms, 10 latitude and 13
 *         distance terms: a few hundredths of a degree in longitude; the
 *         topocentric shift (chapter 40, in altitude) applied for the
 *         observer on the Earth's surface
 *
 * Geometric altitude: no refraction here, on purpose; the azimuth is the
 * thing compared.
 */
const DEG = Math.PI / 180
const sin = (d: number) => Math.sin(d * DEG)
const cos = (d: number) => Math.cos(d * DEG)
const norm = (d: number) => ((d % 360) + 360) % 360

const julian = (t: Date) => t.getTime() / 86_400_000 + 2440587.5

function horizontal(ra: number, dec: number, t: Date, lat: number, lon: number): { azimuth: number; altitude: number } {
  const jd = julian(t)
  const T = (jd - 2451545) / 36525
  const gmst = norm(280.46061837 + 360.98564736629 * (jd - 2451545) + 0.000387933 * T * T - (T * T * T) / 38710000)
  const H = norm(gmst + lon - ra)
  const az = Math.atan2(sin(H), cos(H) * sin(lat) - (Math.tan(dec * DEG) * cos(lat))) / DEG
  const alt = Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(H)) / DEG
  return { azimuth: norm(az + 180), altitude: alt }
}

function equatorial(lambda: number, beta: number, T: number): { ra: number; dec: number } {
  const omega = 125.04 - 1934.136 * T
  const eps = 23.439291 - 0.0130042 * T + 0.00256 * cos(omega)
  const ra = norm(Math.atan2(sin(lambda) * cos(eps) - Math.tan(beta * DEG) * sin(eps), cos(lambda)) / DEG)
  const dec = Math.asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lambda)) / DEG
  return { ra, dec }
}

export function sunPosition2(t: Date, lat: number, lon: number): { azimuth: number; altitude: number } {
  const T = (julian(t) - 2451545) / 36525
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M)
  const omega = 125.04 - 1934.136 * T
  const lambda = L0 + C - 0.00569 - 0.00478 * sin(omega)
  const { ra, dec } = equatorial(norm(lambda), 0, T)
  return horizontal(ra, dec, t, lat, lon)
}

/* Meeus table 47.A (longitude, distance) and 47.B (latitude): [D, M, M', F, coefficient]. */
const LON: readonly (readonly number[])[] = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528], [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
]
const DIST: readonly (readonly number[])[] = [
  [0, 0, 1, 0, -20905355], [2, 0, -1, 0, -3699111], [2, 0, 0, 0, -2955968], [0, 0, 2, 0, -569925], [0, 1, 0, 0, 48888], [0, 0, 0, 2, -3149],
  [2, 0, -2, 0, 246158], [2, -1, -1, 0, -152138], [2, 0, 1, 0, -170733], [2, -1, 0, 0, -204586], [0, 1, -1, 0, -129620], [1, 0, 0, 0, 108743], [0, 1, 1, 0, 104755],
]
const LAT: readonly (readonly number[])[] = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822],
]

export function moonPosition2(t: Date, lat: number, lon: number): { azimuth: number; altitude: number; distanceKm: number } {
  const T = (julian(t) - 2451545) / 36525
  const Lp = 218.3164477 + 481267.88123421 * T
  const D = 297.8501921 + 445267.1114034 * T
  const M = 357.5291092 + 35999.0502909 * T
  const Mp = 134.9633964 + 477198.8675055 * T
  const F = 93.272095 + 483202.0175233 * T
  const E = 1 - 0.002516 * T
  const arg = (r: readonly number[]) => r[0] * D + r[1] * M + r[2] * Mp + r[3] * F
  const e = (r: readonly number[]) => (Math.abs(r[1]) === 1 ? E : Math.abs(r[1]) === 2 ? E * E : 1)
  const sl = LON.reduce((s, r) => s + r[4] * e(r) * sin(arg(r)), 0)
  const sb = LAT.reduce((s, r) => s + r[4] * e(r) * sin(arg(r)), 0)
  const sr = DIST.reduce((s, r) => s + r[4] * e(r) * cos(arg(r)), 0)
  const omega = 125.04 - 1934.136 * T
  const lambda = norm(Lp + sl / 1e6 - 0.00478 * sin(omega))
  const beta = sb / 1e6
  const distanceKm = 385000.56 + sr / 1000
  const { ra, dec } = equatorial(lambda, beta, T)
  const geo = horizontal(ra, dec, t, lat, lon)
  /* Seen from the surface, not the Earth's centre: lower by the parallax, in altitude. */
  const parallax = Math.asin(6378.14 / distanceKm) / DEG
  return { azimuth: geo.azimuth, altitude: geo.altitude - parallax * cos(geo.altitude), distanceKm }
}
