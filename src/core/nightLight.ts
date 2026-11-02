/*
 * THE LIGHT AT NIGHT, FOR THE 3D VIEW (Batch G, Section 9). Arithmetic only.
 *
 * Under the sun the walls are lit by it and by the sky. After dusk both go
 * to nothing, and the oceanfront hotels at the Virginia Beach pier drew as
 * flat black slabs over a ground photo that still showed (1 Nov, 9:30 PM).
 * What lights a wall at night is the moon and the sky's own glow (and, on a
 * coast like this one, the town's), so:
 *
 *   night      0 by day, 1 once the sun is NIGHT_AT_DEG down (nautical
 *              dusk): from sunset the scene hands over smoothly
 *   moon       the moon's share: its lit fraction, and how high it stands
 *              (full at MOON_FULL_DEG up and higher), only at night
 *   floor      the light every wall gets at night whatever the moon:
 *              SKY_GLOW, so a wall reads as a wall and not a hole
 *   windows    the share of a tall building's windows lit, a little after
 *              dusk, fewer after midnight: a picture of a town at night,
 *              said as illustrative, not a count of anyone's rooms
 */
export const NIGHT_AT_DEG = -12
export const MOON_FULL_DEG = 30
export const SKY_GLOW = 0.35
export const WINDOWS_LIT = 0.45

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (x: number) => x * x * (3 - 2 * x)

export interface NightLight {
  night: number
  moon: number
  /** The light a wall gets at night, 0..1: the sky's glow and the moon's. */
  wall: number
  /** Share of windows lit, 0..1. */
  windows: number
}

/**
 * From the sun's altitude, the moon's altitude and lit fraction (suncalc's),
 * and the venue's local hour (0-24).
 */
export function nightLight(sunAltDeg: number, moonAltDeg: number, moonFraction: number, localHour: number): NightLight {
  const night = smooth(clamp(-sunAltDeg / -NIGHT_AT_DEG))
  const high = moonAltDeg <= 0 ? 0 : clamp(Math.sin((moonAltDeg * Math.PI) / 180) / Math.sin((MOON_FULL_DEG * Math.PI) / 180))
  const moon = night * clamp(moonFraction) * high
  const wall = night * (SKY_GLOW + (1 - SKY_GLOW) * moon)
  /* Lit from dusk, thinning after midnight to a quarter by 4 AM. */
  const h = ((localHour % 24) + 24) % 24
  const late = h < 12 ? clamp(1 - h / 5.3, 0.25, 1) : 1
  return { night, moon, wall, windows: night * WINDOWS_LIT * late }
}
