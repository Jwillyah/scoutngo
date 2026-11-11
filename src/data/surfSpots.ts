/*
 * OUR OWN SURF SPOTS (Batch Map, Section 2), searched first and on the phone,
 * with the names people say ("1st Street", "First St", "Jennette's"). Each
 * point is the beach end of the access or the pier's head, from
 * OpenStreetMap (Nominatim, looked up 9 Nov 2026); `facing` is the beach's
 * seaward direction, degrees. Add a spot here with its aliases; the search
 * normalises "first" and "1st", "st" and "street" (src/core/spotSearch.ts).
 *
 * Batch Beach, Section 1: every point is the OCEAN beach and every facing is
 * the coastline's, read from the map's own tiles by the app's own code
 * (scripts/measure-spot-facing.mjs, measurements/2026-11-10-spot-facing.md):
 * the hand-set OBX facings were 40-50° off (110 for a coast that faces 60-66),
 * Sandbridge 27° (100 for 73). src/lib/coast.ts coastFacing answers a point
 * within SPOT_SNAP_M of a spot with the spot's own beach and facing.
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
  { id: 'kdh-1st-street', name: '1st Street', aliases: ['First Street', 'First St', '1st St', 'KDH 1st Street'], town: 'Kill Devil Hills', state: 'NC', at: { lat: 36.0294, lon: -75.6642 }, facing: 61, kind: 'surf' },
  { id: 'avalon-pier', name: 'Avalon Pier', aliases: ['Avalon Fishing Pier', 'Avalon'], town: 'Kill Devil Hills', state: 'NC', at: { lat: 36.0442, lon: -75.6745 }, facing: 60, kind: 'pier' },
  { id: 'jennettes-pier', name: "Jennette's Pier", aliases: ['Jennettes Pier', 'Jennettes', "Jennette's", 'Jennette'], town: 'Nags Head', state: 'NC', at: { lat: 35.9105, lon: -75.5943 }, facing: 57, kind: 'pier' },
  { id: 'kitty-hawk-pier', name: 'Kitty Hawk Pier', aliases: ['Hilton Pier'], town: 'Kitty Hawk', state: 'NC', at: { lat: 36.1014, lon: -75.7109 }, facing: 66, kind: 'pier' },
  { id: 'nags-head-pier', name: 'Nags Head Fishing Pier', aliases: ['Nags Head Pier'], town: 'Nags Head', state: 'NC', at: { lat: 35.9736, lon: -75.6304 }, facing: 65, kind: 'pier' },
  { id: 'outer-banks-pier', name: 'Outer Banks Pier', aliases: ['Outer Banks Fishing Pier', 'South Nags Head Pier'], town: 'Nags Head', state: 'NC', at: { lat: 35.8855, lon: -75.5815 }, facing: 65, kind: 'pier' },
  { id: 'sandbridge', name: 'Sandbridge', aliases: ['Sandbridge Beach'], town: 'Virginia Beach', state: 'VA', at: { lat: 36.722, lon: -75.927 }, facing: 73, kind: 'surf' },
  { id: 'wrightsville-beach', name: 'Wrightsville Beach', aliases: ['Wrightsville', 'WB'], town: 'Wrightsville Beach', state: 'NC', at: { lat: 34.2104, lon: -77.7964 }, facing: 123, kind: 'surf' },
  /* Hatteras Island (Batch Beach, Section 1): the ocean beaches, snapped from the coastline. */
  { id: 's-turns', name: 'S-Turns', aliases: ['S Turns', 'The S-Turns', 'Pea Island S-Turns'], town: 'Rodanthe', state: 'NC', at: { lat: 35.6085, lon: -75.4655 }, facing: 82, kind: 'surf' },
  { id: 'mirlo-beach', name: 'Mirlo Beach', aliases: ['Mirlo'], town: 'Rodanthe', state: 'NC', at: { lat: 35.6002, lon: -75.4639 }, facing: 74, kind: 'surf' },
  { id: 'rodanthe-pier', name: 'Rodanthe Pier', aliases: ['Rodanthe Fishing Pier', 'Hatteras Island Fishing Pier'], town: 'Rodanthe', state: 'NC', at: { lat: 35.5911, lon: -75.4622 }, facing: 84, kind: 'pier' },
  { id: 'buxton', name: 'Buxton', aliases: ['Buxton Beach', 'Old Lighthouse Beach', 'Lighthouse Beach'], town: 'Buxton', state: 'NC', at: { lat: 35.256, lon: -75.518 }, facing: 100, kind: 'surf' },
  { id: 'cape-point', name: 'Cape Point', aliases: ['Cape Hatteras Point', 'The Point'], town: 'Buxton', state: 'NC', at: { lat: 35.221, lon: -75.53 }, facing: 158, kind: 'surf' },
  { id: 'frisco-pier', name: 'Frisco Pier', aliases: ['Frisco Fishing Pier', 'Frisco Beach'], town: 'Frisco', state: 'NC', at: { lat: 35.2268, lon: -75.633 }, facing: 165, kind: 'pier' },
  { id: 'vb-1st-street-jetty', name: '1st Street Jetty', aliases: ['First Street Jetty', '1st St Jetty', 'Rudee Inlet Jetty'], town: 'Virginia Beach', state: 'VA', at: { lat: 36.8318, lon: -75.9678 }, facing: 80, kind: 'surf' },
]

/* Words that name a stretch of coast, not a place: a filter, not a match. */
export const REGIONS: readonly { words: readonly string[]; name: string; box: { south: number; west: number; north: number; east: number } }[] = [
  { words: ['outer banks', 'obx'], name: 'Outer Banks', box: { south: 34.9, west: -76.1, north: 36.6, east: -75.3 } },
  { words: ['virginia beach', 'vb'], name: 'Virginia Beach', box: { south: 36.5, west: -76.2, north: 36.95, east: -75.85 } },
  { words: ['wilmington', 'cape fear'], name: 'Cape Fear', box: { south: 33.8, west: -78.1, north: 34.45, east: -77.6 } },
]
