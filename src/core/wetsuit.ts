/*
 * WHAT WETSUIT IS TYPICAL FOR THE WATER'S TEMPERATURE (Batch N, Section 2).
 *
 * THE SOURCE. The thickness-by-water-temperature chart that wetsuit makers
 * and surf shops print (O'Neill, Rip Curl, Xcel and others each publish a
 * version). It is a convention, not a measurement: the brands' edges differ
 * by two or three degrees F, and what a person wears also depends on the air,
 * the wind and the person. The bands below take the middle of those charts,
 * in Fahrenheit because that is how they are printed.
 *
 * WHAT THE PAGE SAYS. A fact about the convention, "4/3 typical at 60°F",
 * never an instruction ("wear"). Rule 28.
 */

export interface WetsuitBand {
  /** The band holds water at or above this, °F (the last band has none). */
  fromF: number
  /** What the charts list, short: "4/3", "3/2", "Boardshorts". */
  suit: string
}

/** Warmest first; the first band whose fromF the water reaches is the one. */
export const WETSUIT_BANDS: readonly WetsuitBand[] = [
  { fromF: 75, suit: 'Boardshorts' },
  { fromF: 70, suit: '2 mm spring suit' },
  { fromF: 64, suit: '3/2' },
  { fromF: 58, suit: '4/3' },
  { fromF: 52, suit: '4/3 + booties' },
  { fromF: 46, suit: '5/4 + hood' },
  { fromF: -Infinity, suit: '6/5 + hood' },
]

export const cToF = (c: number): number => (c * 9) / 5 + 32

/** The band for a water temperature in °C (Open-Meteo Marine's unit); null when there is none. */
export function wetsuitFor(waterC: number | null): WetsuitBand | null {
  if (waterC === null || !Number.isFinite(waterC)) return null
  const f = cToF(waterC)
  return WETSUIT_BANDS.find((b) => f >= b.fromF) ?? null
}
