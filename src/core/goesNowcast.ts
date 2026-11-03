/*
 * THE SATELLITE'S LOOK TOWARD THE SUN (Batch H, Section 2.2: from three
 * hours to thirty minutes before a sunrise or sunset the nowcast overrides
 * the models).
 *
 * WHAT IT READS. GOES-East band 13, clean longwave infrared, from NASA GIBS
 * (src/core/goes.ts): each pixel's colour is a cloud-top or ground
 * temperature, by GIBS's own colour table. Sampled every SAT_STEP_KM along
 * the sun's line out to 400 km, each point first moved back upwind by the
 * wind at cloud height times the time from the frame to the event
 * (advect), so the cloud read is the cloud that will be there.
 *
 * WHAT INFRARED CAN AND CANNOT SAY. Cloud colder than the ground by
 * COLD_BY_C is mid or high cloud, the canvas of a high fire. Low cloud sits
 * near the ground's own temperature: at night infrared does not see it, so
 * this never claims the low gap open. That stays the stations' (and the
 * reason the low deck of 29 Oct is the stations' call, not this).
 *
 *   ground    the air at 2 m from the forecast (the ground or sea's own
 *             temperature, near enough); without it, the warmest sample.
 *             The warmest sample alone fails under a sheet of cirrus: on
 *             2 Nov every sample was cloud (measured,
 *             measurements/2026-11-02-goes-nowcast.md)
 *   canvas    half or more of 0-50 km COLD_BY_C under the ground: mid or
 *             high cloud over you
 *   blocked   CLOSED_SHARE or more of 100-400 km colder than DEEP_BELOW_C:
 *             deep cloud (rain cloud) all the way to the sun. Thin cirrus is
 *             partly see-through and reads warmer (-20 to 2 °C on 2 Nov,
 *             when it fired); the deck that rained on 11 Oct read -55 to
 *             -25 °C (measurements/2026-11-02-goes-nowcast.md)
 *   open      the far stretch mostly warm: the way in is not shut by cold
 *             cloud (low cloud there is not seen)
 */
export const SAT_STEP_KM = 10
export const SAT_REACH_KM = 400
export const COLD_BY_C = 12
export const CLOSED_SHARE = 0.85
export const DEEP_BELOW_C = -30

export interface SatSample {
  km: number
  /** Brightness temperature, °C; null where the tile had no data. */
  c: number | null
}

export interface SatRead {
  /** The frame's time. */
  at: Date
  /** The warmest sample, the ground or the sea's own temperature, °C. */
  groundC: number
  canvas: boolean
  blocked: boolean
  /** Share of 100-400 km that is cold, 0-1. */
  farCold: number
  /** Share of 0-50 km that is cold, 0-1. */
  overCold: number
  /** Share of 100-400 km colder than DEEP_BELOW_C, 0-1. */
  farDeep: number
  /** In words, for the Why. */
  line: string
  /** The samples read, for the cloud top over you and the gap toward the sun (Batch J). */
  samples: readonly SatSample[]
}

const share = (xs: readonly SatSample[], cold: (c: number) => boolean) => {
  const known = xs.filter((s) => s.c !== null)
  return known.length === 0 ? null : known.filter((s) => cold(s.c as number)).length / known.length
}

export function satRead(samples: readonly SatSample[], at: Date, airC: number | null = null): SatRead | null {
  const known = samples.filter((s) => s.c !== null)
  if (known.length < samples.length / 2) return null
  const groundC = airC ?? Math.max(...known.map((s) => s.c as number))
  const cold = (c: number) => c < groundC - COLD_BY_C
  const overCold = share(samples.filter((s) => s.km <= 50), cold)
  const farCold = share(samples.filter((s) => s.km >= 100), cold)
  const farDeep = share(samples.filter((s) => s.km >= 100), (c) => c < DEEP_BELOW_C)
  if (overCold === null || farCold === null || farDeep === null) return null
  const canvas = overCold >= 0.5
  const blocked = farDeep >= CLOSED_SHARE
  const line = blocked
    ? `The satellite sees deep cloud ${Math.round(farDeep * 100)}% of the way to the sun, 100-400 km`
    : canvas
      ? `The satellite sees high or mid cloud over you, and the way to the sun ${Math.round(farCold * 100)}% cold`
      : 'The satellite sees no high or mid cloud over you'
  return { at, groundC, canvas, blocked, farCold, overCold, farDeep, line, samples }
}

/** Kilometres along the sun's line the satellite is read at. */
export const satKms = (): number[] => Array.from({ length: SAT_REACH_KM / SAT_STEP_KM + 1 }, (_, i) => i * SAT_STEP_KM)

/**
 * Where to read a point so the cloud is the one there at the event: back
 * upwind by the wind (m/s, the direction it blows FROM) times the lead.
 * Returned as the east and north offset in km to add to the point.
 */
export function advectKm(windMps: number, fromDeg: number, leadMs: number): { eastKm: number; northKm: number } {
  const km = (windMps * leadMs) / 1000 / 1000
  const r = (fromDeg * Math.PI) / 180
  /* The cloud comes from upwind: read where it is now, that much toward where the wind comes from. */
  return { eastKm: km * Math.sin(r), northKm: km * Math.cos(r) }
}

/** The nowcast window: three hours to thirty minutes before the event. */
export const NOWCAST_FROM_MS = 3 * 3_600_000
export const NOWCAST_TO_MS = 30 * 60_000
export function inNowcast(event: Date, now: Date): boolean {
  const lead = event.getTime() - now.getTime()
  return lead <= NOWCAST_FROM_MS && lead >= NOWCAST_TO_MS
}
