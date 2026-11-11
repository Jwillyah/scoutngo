/*
 * RECORD THE GATE'S VECTOR TILES, ONCE, BY HAND. Never run by the gate.
 *
 * Usage:  node scripts/gate/record-tiles.mjs [out-dir, default scripts/gate/tiles]
 *
 * The map's vector tiles (OpenFreeMap: the sea, the buildings, the coast test)
 * for the places the audits look at, at the zooms the app reads them
 * (src/lib/offlineSources.ts VECTOR_ZOOMS; the coast test at 12). Written to
 * scripts/gate/tiles/openfreemap/{z}/{x}/{y}.pbf, which
 * scripts/gate/fixtures.mjs serves. A tile not recorded is served empty.
 *
 * Re-run only to add a place; the recorded set is what makes two gate runs
 * see the same coast.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { boxAround, tilesInBox } from '../../src/lib/tileRange.ts'
import { TILE_DIR } from './fixtures.mjs'

export const PLACES = [
  { name: 'Virginia Beach Fishing Pier', lat: 36.8435575, lon: -75.9713104 },
  { name: 'Wrightsville Beach (Johnnie Mercers Pier)', lat: 34.2132, lon: -77.7865 },
  { name: 'Brew River, the calibration venue', lat: 38.364236, lon: -75.605912 },
  { name: 'Hampton Coliseum (the buildings audit)', lat: 37.0347, lon: -76.3814 },
  { name: 'Big Meadows, Shenandoah (inland)', lat: 38.5285, lon: -78.4383 },
  /* Batch Beach, Section 1: the 10 Nov Rodanthe pin, on the sound side of a barrier island. */
  { name: 'Rodanthe, the 10 Nov pin', lat: 35.5935, lon: -75.4679 },
]
const RINGS = [
  /* Batch Beach, Section 1: the open-sea test reads zoom 7 out to 120 km (src/lib/coast.ts OPEN_ZOOM). */
  { z: 7, radiusM: 130_000 },
  { z: 12, radiusM: 3000 },
  { z: 13, radiusM: 1500 },
  { z: 14, radiusM: 1200 },
]

let bytes = 0
let count = 0
for (const place of PLACES) {
  for (const { z, radiusM } of RINGS) {
    for (const t of tilesInBox(boxAround(place, radiusM), z)) {
      const url = `https://tiles.openfreemap.org/planet/latest/${z}/${t.x}/${t.y}.pbf`
      const r = await fetch(url, { redirect: 'follow' })
      if (!r.ok) {
        console.log(`  ${z}/${t.x}/${t.y}: HTTP ${r.status}`)
        continue
      }
      const body = Buffer.from(await r.arrayBuffer())
      const file = join(process.argv[2] ?? TILE_DIR, 'openfreemap', String(z), String(t.x), `${t.y}.pbf`)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, body)
      bytes += body.length
      count += 1
    }
  }
  console.log(`${place.name}: done`)
}
console.log(`${count} tiles, ${(bytes / 1024).toFixed(0)} KB`)
