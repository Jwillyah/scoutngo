/*
 * HOW HIGH THE GROUND STANDS, LOOKING ALONG A BEARING.
 *
 * This is what makes the sun go behind a ridge rather than through it. The sun
 * sits at a computed altitude; the terrain along that bearing rises to some
 * angle above the observer's own horizontal; and whichever is higher is what
 * you can see.
 *
 * THE SAMPLES COME FROM THE DEM, which the app already loads for the terrain
 * render, so this costs no network and no new source. MapLibre's
 * queryTerrainElevation answers per coordinate against the tiles already in
 * memory.
 *
 * THE SEAM, NOTED AND NOT BUILT. The same data answers a bigger question:
 * TRUE sunrise and sunset over the real skyline, which is not the flat-horizon
 * sunrise suncalc reports and can differ by many minutes in a valley. That
 * needs a horizon profile sampled all the way round rather than along one
 * bearing, cached per venue, and a careful account of what to do where the DEM
 * runs out. It is deliberately NOT built here: this file answers one bearing
 * at one moment, which is what putting a sun on screen needs, and nothing in
 * it should be read as a sunrise time.
 */

/** One DEM sample along the line of sight. */
export interface TerrainSample {
  /** Metres from the observer, along the bearing. */
  distanceMeters: number
  /** Metres above sea level, or null where the DEM had no answer. */
  elevationMeters: number | null
}

/**
 * The highest angle the ground reaches, in degrees above horizontal.
 *
 * NULL WHEN NOTHING IS KNOWN. Not zero: zero is a claim that the horizon is
 * flat, which is exactly the claim this exists to replace. A null means the
 * DEM did not answer and the caller must not draw an occlusion it cannot
 * justify.
 *
 * NEGATIVE IS A REAL ANSWER and is kept. Standing on a summit, every sample
 * along the bearing is below you and the horizon angle is negative, which is
 * why the sun stays visible lower there than it does in a valley.
 */
export function horizonAngleDegrees(
  samples: readonly TerrainSample[],
  observerElevationMeters: number | null,
): number | null {
  if (observerElevationMeters === null || !Number.isFinite(observerElevationMeters)) return null

  let worst: number | null = null
  for (const sample of samples) {
    if (sample.elevationMeters === null || !Number.isFinite(sample.elevationMeters)) continue
    if (!Number.isFinite(sample.distanceMeters) || sample.distanceMeters <= 0) continue
    const rise = sample.elevationMeters - observerElevationMeters
    const angle = Math.atan2(rise, sample.distanceMeters) / (Math.PI / 180)
    if (worst === null || angle > worst) worst = angle
  }
  return worst
}

/**
 * WHETHER THE TERRAIN IS IN THE WAY.
 *
 * Three states, not a boolean, because "the DEM did not answer" is not the
 * same as "nothing is in the way" and must not be drawn as though it were.
 */
export type SunVisibility = 'clear-of-terrain' | 'behind-terrain' | 'unknown'

export function sunVisibility(
  sunAltitudeDegrees: number,
  horizonAngle: number | null,
): SunVisibility {
  if (horizonAngle === null || !Number.isFinite(sunAltitudeDegrees)) return 'unknown'
  return sunAltitudeDegrees < horizonAngle ? 'behind-terrain' : 'clear-of-terrain'
}

/**
 * Where to sample, in metres along the bearing.
 *
 * GEOMETRIC RATHER THAN EVEN. A ridge 300m away and a ridge 30km away both
 * matter and they matter at completely different scales, so the spacing grows:
 * close in, where a bank of earth can block a low sun, the samples are tight,
 * and far out they are coarse because a distant range is broad.
 *
 * STOPS AT 40km. Past that the earth's own curvature is the larger term and
 * this ignores it, so claiming an answer there would be claiming more
 * precision than the method has.
 */
export const SAMPLE_DISTANCES_METERS: readonly number[] = [
  100, 200, 400, 700, 1200, 2000, 3500, 6000, 10_000, 16_000, 25_000, 40_000,
] as const

/*
 * ------------------------------------------------------------------ THE SEAM
 *
 * TRUE SUNRISE AND SUNSET OVER THE REAL SKYLINE. NOT BUILT. Noted here so the
 * next person finds the note before they find the idea.
 *
 * Everything needed is now present. The DEM is loaded for the terrain render,
 * horizonAngleDegrees above turns samples along a bearing into an angle, and
 * src/core/sunInverse.ts already solves the inverse problem: when is the sun at
 * a given altitude on a given bearing. Composing those three gives the moment
 * the sun clears the actual ridge rather than the flat horizon suncalc assumes,
 * which in a valley is many minutes different and is the number a shooter
 * standing in that valley actually wants.
 *
 * WHAT IT NEEDS THAT IS NOT HERE YET, and why none of it is a detail:
 *
 *   A HORIZON PROFILE, not one bearing. The sun's azimuth moves as it rises,
 *   so the ridge that matters is not the one on today's sunrise bearing: it is
 *   whichever ridge the sun meets as both it and the skyline change. That is a
 *   profile sampled all the way round, cached per venue.
 *
 *   AN ANSWER FOR WHERE THE DEM RUNS OUT. queryTerrainElevation answers only
 *   from tiles in memory, so a profile built while zoomed in is a profile of
 *   the near field. A sunrise time computed from a partial profile would be
 *   confidently wrong, which is worse than the flat-horizon answer it replaced.
 *
 *   A STATED RELATIONSHIP WITH THE EXISTING TIMES. The app shows suncalc's
 *   sunrise everywhere and the Part 107 civil twilight boundaries depend on
 *   it. A second, later sunrise appearing beside the first needs the
 *   difference between "the sun is above the mathematical horizon" and "you
 *   can see it from here" said out loud, or it just looks like two numbers
 *   disagreeing.
 *
 * Until those three are answered, this file answers ONE BEARING at ONE MOMENT,
 * which is what putting a disc on screen needs. Nothing in it is a sunrise
 * time and nothing should be presented as one.
 */
