/*
 * NAMES PEOPLE SAY, AND PLACES THE SEARCH KNEW NOTHING OF (Batch 3D, Section
 * 2). The starter list (bestSkySpots.ts) is kept for Best Sky; this adds
 * what the search needs beside it, in one place:
 *
 *   STARTER_ALIASES  other names for a starter spot, by its id
 *   EXTRA_SPOTS      places that were in no list. The Back Deck is the Best
 *                    Sky truth spot (fixtures/truth/2026-11-11-lynnhaven-sunset.json,
 *                    36.9076, -76.0915). Pleasure House Point: the Natural
 *                    Area's published point (Virginia DWR birding trail,
 *                    36.9022, -76.0975). Little Island Park: the foot of its
 *                    fishing pier as the Virginia Marine Resources Commission
 *                    gives it (36°41'37.74" N 75°55'25.57" W). A pick sets the
 *                    venue there, and the phone measures its own coastline
 *                    from there (src/lib/coast.ts).
 */
export const STARTER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  /* Batch SIMPLE-1, Section 1: the display name is "Chic's Beach" (bestSkySpots.ts); "Chick's" and "Chicks" stay as aliases so search still finds it. */
  'chicks-beach': ["Chick's Beach", 'Chicks Beach', 'Chics Beach', 'Chesapeake Beach'],
  'fort-story': ['Fort Story', 'Cape Henry'],
  'lynnhaven-inlet': ['Lynnhaven'],
  'rudee-inlet': ['Rudee'],
  'vb-pier': ['Virginia Beach Pier'],
  sandbridge: ['Sandbridge Beach'],
  'back-bay': ['Back Bay NWR'],
}

export interface ExtraSpot {
  id: string
  name: string
  aliases: readonly string[]
  where: string
  at: { lat: number; lon: number }
  facing: number | null
}

export const EXTRA_SPOTS: readonly ExtraSpot[] = [
  { id: 'back-deck', name: 'The Back Deck', aliases: ['Back Deck', 'Backdeck'], where: 'Lynnhaven Inlet, Shore Dr', at: { lat: 36.9076, lon: -76.0915 }, facing: 250 },
  { id: 'pleasure-house-point', name: 'Pleasure House Point', aliases: ['Pleasure House', 'PHP'], where: 'Virginia Beach, VA', at: { lat: 36.9022, lon: -76.0975 }, facing: null },
  { id: 'little-island-park', name: 'Little Island Park', aliases: ['Little Island', 'Little Island Fishing Pier'], where: 'Sandbridge, Virginia Beach, VA', at: { lat: 36.6938, lon: -75.9238 }, facing: null },
]
