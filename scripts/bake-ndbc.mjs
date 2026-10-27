/*
 * THE NDBC BUOYS, BAKED INTO THE APP, so the phone picks its nearest buoy
 * itself and only a buoy number is ever sent anywhere (api/buoy.ts).
 *
 * Usage:   node scripts/bake-ndbc.mjs
 * Writes:  src/data/ndbc.ts
 *
 * From NOAA NDBC's active station list, https://www.ndbc.noaa.gov/activestations.xml:
 * moored buoys that report meteorology (type "buoy", met "y"). Whether a buoy
 * reports waves at the moment is the buoy's latest observation's to say; the
 * app tries the nearest few.
 */
import { writeFileSync } from 'node:fs'

const xml = await (await fetch('https://www.ndbc.noaa.gov/activestations.xml')).text()
const created = /created="([^"]+)"/.exec(xml)?.[1] ?? 'unknown'
const rows = []
for (const m of xml.matchAll(/<station ([^>]*)\/?>/g)) {
  const a = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]))
  if (a.type !== 'buoy' || a.met !== 'y') continue
  const lat = Number(a.lat)
  const lon = Number(a.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !/^[A-Z0-9]{5}$/i.test(a.id)) continue
  rows.push([a.id.toUpperCase(), Math.round(lat * 1000) / 1000, Math.round(lon * 1000) / 1000, a.name.replace(/&amp;/g, '&').replace(/'/g, '’')])
}
rows.sort((p, q) => p[0].localeCompare(q[0]))
const out = `/*
 * NOAA NDBC moored buoys reporting meteorology, baked by scripts/bake-ndbc.mjs
 * from https://www.ndbc.noaa.gov/activestations.xml (list created ${created}).
 * ${rows.length} buoys: [id, lat, lon, name]. Do not edit by hand; re-bake.
 */
export const NDBC_BUOYS: readonly (readonly [string, number, number, string])[] = [
${rows.map((r) => `  [${JSON.stringify(r[0])}, ${r[1]}, ${r[2]}, ${JSON.stringify(r[3])}],`).join('\n')}
]
`
writeFileSync('src/data/ndbc.ts', out)
console.log(`wrote src/data/ndbc.ts: ${rows.length} buoys, list created ${created}`)
