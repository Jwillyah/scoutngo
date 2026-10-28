/*
 * THE STATE OUTLINES THE IMAGERY SOURCES COVER, BAKED INTO THE APP, so the
 * phone picks the sharpest source for a view itself and asks nobody where it
 * is (src/data/imagerySources.ts).
 *
 * Usage:   node scripts/bake-imagery-coverage.mjs
 * Writes:  src/data/imageryCoverage.ts
 *
 * From the US Census Bureau's TIGERweb States layer, simplified to about a
 * kilometre (0.01 degree), outer ring only, as [lon, lat]. The outline runs
 * out to the state's sea boundary, so a barrier island is inside it. Near a
 * border a kilometre either way is the source's own tiles or Esri's: where
 * a source has no picture the tile falls back to Esri, so the outline only
 * has to choose, not to be exact.
 */
import { writeFileSync } from 'node:fs'

const STATES = ['VA', 'NC', 'MD', 'DE', 'SC']
const url = new URL('https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0/query')
url.search = new URLSearchParams({
  where: `STUSAB IN (${STATES.map((s) => `'${s}'`).join(',')})`,
  outFields: 'STUSAB',
  maxAllowableOffset: '0.01',
  outSR: '4326',
  geometryPrecision: '4',
  f: 'geojson',
}).toString()
const res = await fetch(url)
if (!res.ok) throw new Error(`TIGERweb answered HTTP ${res.status}`)
const data = await res.json()
const rings = {}
for (const f of data.features) {
  const g = f.geometry
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  /* The largest outer ring: the state itself, without islands too small to matter at a kilometre. */
  const outer = polys.map((p) => p[0]).sort((a, b) => b.length - a.length)[0]
  rings[f.properties.STUSAB] = outer.map(([lon, lat]) => [Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4])
}
for (const s of STATES) if (rings[s] === undefined) throw new Error(`TIGERweb returned no outline for ${s}`)
const out = `/*
 * State outlines for the imagery sources' coverage, baked by
 * scripts/bake-imagery-coverage.mjs from the US Census Bureau's TIGERweb
 * States layer (${new Date().toISOString().slice(0, 10)}), simplified to 0.01 degree, [lon, lat].
 * Do not edit by hand; re-bake.
 */
export const STATE_OUTLINES: Readonly<Record<${STATES.map((s) => `'${s}'`).join(' | ')}, readonly (readonly [number, number])[]>> = {
${STATES.map((s) => `  ${s}: ${JSON.stringify(rings[s])},`).join('\n')}
}
`
writeFileSync('src/data/imageryCoverage.ts', out)
console.log(`wrote src/data/imageryCoverage.ts: ${STATES.map((s) => `${s} ${rings[s].length} points`).join(', ')}`)
