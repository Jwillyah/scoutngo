/*
 * OUR OWN SURF SPOTS (Batch Map, Section 2), searched first and on the phone,
 * with the names people say ("1st Street", "First St", "Jennette's"). Each
 * point is the beach end of the access or the pier's head, from
 * OpenStreetMap (Nominatim, looked up 9 Nov 2026); `facing` is the beach's
 * seaward direction, degrees. Add a spot here with its aliases; the search
 * normalises "first" and "1st", "st" and "street" (src/core/spotSearch.ts).
 */
export interface SurfSpot {
  id: string
  name: string
  aliases: readonly string[]
  town: string
  state: string
  at: { lat: number; lon: number }
  facing: number
  kind: 'surf' | 'pier'
}

export const SURF_SPOTS: readonly SurfSpot[] = [
  { id: 'kdh-1st-street', name: '1st Street', aliases: ['First Street', 'First St', '1st St', 'KDH 1st Street'], town: 'Kill Devil Hills', state: 'NC', at: { lat: 36.0286, lon: -75.6662 }, facing: 110, kind: 'surf' },
  { id: 'avalon-pier', name: 'Avalon Pier', aliases: ['Avalon Fishing Pier', 'Avalon'], town: 'Kill Devil Hills', state: 'NC', at: { lat: 36.0442, lon: -75.6745 }, facing: 110, kind: 'pier' },
  { id: 'jennettes-pier', name: "Jennette's Pier", aliases: ['Jennettes Pier', 'Jennettes', "Jennette's", 'Jennette'], town: 'Nags Head', state: 'NC', at: { lat: 35.9105, lon: -75.5943 }, facing: 105, kind: 'pier' },
  { id: 'kitty-hawk-pier', name: 'Kitty Hawk Pier', aliases: ['Hilton Pier'], town: 'Kitty Hawk', state: 'NC', at: { lat: 36.1014, lon: -75.7109 }, facing: 110, kind: 'pier' },
  { id: 'nags-head-pier', name: 'Nags Head Fishing Pier', aliases: ['Nags Head Pier'], town: 'Nags Head', state: 'NC', at: { lat: 35.9736, lon: -75.6304 }, facing: 105, kind: 'pier' },
  { id: 'outer-banks-pier', name: 'Outer Banks Pier', aliases: ['Outer Banks Fishing Pier', 'South Nags Head Pier'], town: 'Nags Head', state: 'NC', at: { lat: 35.8855, lon: -75.5815 }, facing: 100, kind: 'pier' },
  { id: 'sandbridge', name: 'Sandbridge', aliases: ['Sandbridge Beach'], town: 'Virginia Beach', state: 'VA', at: { lat: 36.722, lon: -75.927 }, facing: 100, kind: 'surf' },
  { id: 'wrightsville-beach', name: 'Wrightsville Beach', aliases: ['Wrightsville', 'WB'], town: 'Wrightsville Beach', state: 'NC', at: { lat: 34.2104, lon: -77.7964 }, facing: 120, kind: 'surf' },
  { id: 'vb-1st-street-jetty', name: '1st Street Jetty', aliases: ['First Street Jetty', '1st St Jetty', 'Rudee Inlet Jetty'], town: 'Virginia Beach', state: 'VA', at: { lat: 36.8318, lon: -75.9678 }, facing: 95, kind: 'surf' },
]

/* Words that name a stretch of coast, not a place: a filter, not a match. */
export const REGIONS: readonly { words: readonly string[]; name: string; box: { south: number; west: number; north: number; east: number } }[] = [
  { words: ['outer banks', 'obx'], name: 'Outer Banks', box: { south: 34.9, west: -76.1, north: 36.6, east: -75.3 } },
  { words: ['virginia beach', 'vb'], name: 'Virginia Beach', box: { south: 36.5, west: -76.2, north: 36.95, east: -75.85 } },
  { words: ['wilmington', 'cape fear'], name: 'Cape Fear', box: { south: 33.8, west: -78.1, north: 34.45, east: -77.6 } },
]
