/*
 * WHAT DREW THE WAVY LOOPS OVER THE WATER AT THE PIER (Batch H, Section 1.2).
 *
 * Usage:  node scripts/measure-water-contours.mjs [lat lon name]
 *         (default: the Virginia Beach Fishing Pier)
 * Writes: measurements/<today>-water-contours[-<label>].md (--label after)
 *
 * Fetches the same nine z14 terrarium tiles the 2D Terrain layer reads
 * (src/lib/terrainRelief.ts) and counts its contour lines by level: those
 * below sea level are drawn over the water from the tiles' bathymetry.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { reliefAround } from '../src/lib/terrainRelief.ts'
import { decodePng } from '../src/lib/png.ts'

const labelAt = process.argv.indexOf('--label')
const label = labelAt > 0 ? process.argv.splice(labelAt, 2)[1] : ''
const [lat = '36.8435575', lon = '-75.9713104', ...rest] = process.argv.slice(2)
const name = rest.join(' ') || 'Virginia Beach Fishing Pier'
const venue = { lat: Number(lat), lon: Number(lon) }
const ran = new Date().toISOString()
/* The raw heights across the beachfront at one latitude, z15, every 0.0005 degrees of longitude. */
async function transect(at, lon0, lon1) {
  const z = 15
  const n = 2 ** z
  const r = (at * Math.PI) / 180
  const yf = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  const tiles = new Map()
  const row = []
  for (let k = 0; lon0 + k * 0.0005 <= lon1 + 1e-9; k += 1) {
    const lon = lon0 + k * 0.0005
    const xf = ((lon + 180) / 360) * n
    const x = Math.floor(xf)
    const y = Math.floor(yf)
    const key = `${x}/${y}`
    if (!tiles.has(key)) {
      const res = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`)
      tiles.set(key, await decodePng(new Uint8Array(await res.arrayBuffer())))
    }
    const px = tiles.get(key)
    const i = (Math.floor((yf - y) * 256) * 256 + Math.floor((xf - x) * 256)) * 4
    row.push(`| ${lon.toFixed(4)} | ${(px.data[i] * 256 + px.data[i + 1] + px.data[i + 2] / 256 - 32768).toFixed(0)} |`)
  }
  return [`Raw heights across the beachfront at ${at}, z15 (land, the oceanfront towers, then the sea):`, '', '| Longitude | Metres |', '|---|---|', ...row]
}
const out = await reliefAround(venue)
if (out === null) {
  console.log('could not read the tiles')
  process.exit(2)
}
const byLevel = new Map()
for (const f of out.contours.features) byLevel.set(f.properties.level, (byLevel.get(f.properties.level) ?? 0) + 1)
const levels = [...byLevel.entries()].sort((a, b) => a[0] - b[0])
const below = levels.filter(([l]) => l < 0).reduce((a, [, n]) => a + n, 0)
const above = levels.filter(([l]) => l > 0).reduce((a, [, n]) => a + n, 0)
const atZero = byLevel.get(0) ?? 0
const lines = [
  `# Contours over the water at ${name}`,
  '',
  `Run ${ran} · venue ${venue.lat}, ${venue.lon} · nine z14 terrarium tiles (src/lib/terrainRelief.ts), 10 m interval, ${label === '' ? 'the code before Batch H' : `the code ${label} the Batch H fix (despike, no lines in a cell touching water)`}.`,
  '',
  `Relief in the block: ${out.metres.toFixed(1)} m (highest minus lowest, water included).`,
  '',
  '| Level (m) | Segments |',
  '|---|---|',
  ...levels.map(([l, n]) => `| ${l} | ${n} |`),
  '',
  `Below sea level: ${below} segments. At 0 m: ${atZero}. Above sea level: ${above}.`,
  '',
  ...(await transect(36.847, -75.976, -75.964)),
  '',
]
mkdirSync('measurements', { recursive: true })
const file = `measurements/${ran.slice(0, 10)}-water-contours${label === '' ? '' : `-${label}`}.md`
writeFileSync(file, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`wrote ${file}`)
process.exit(0)
