/*
 * BACK IS WHERE YOU CAME FROM (Batch Beach, Section 5). The map opened from a
 * detail page (Wind Data's Map, the Surf page's See on map) goes back to that
 * page; opened any other way, back to the home.
 */
export type MapFrom = 'tides' | 'surf' | 'buoys' | 'wind' | null

export function mapBack(from: MapFrom): { kind: 'page'; page: Exclude<MapFrom, null> } | { kind: 'home' } {
  return from === null ? { kind: 'home' } : { kind: 'page', page: from }
}
