/*
 * USGS STREAM AND ESTUARY GAUGES THAT REPORT THE WATER'S TEMPERATURE, BAKED
 * (Batch FIX, Section 4: rivers).
 *
 * Usage:  node scripts/bake-usgs-water-temp.mjs
 * Writes: src/data/usgsWaterTemp.ts from USGS Water Services' site service:
 *         every active site with instantaneous water temperature (parameter
 *         00010) whose type is a stream (ST, with its tidal, canal and ditch
 *         kinds) or an estuary (ES). Not storm drains (FA-STS), wells or
 *         lakes: near Virginia Beach a storm drain at Lindsley Drive reports
 *         water temperature too, 4.6 km from the oceanfront, and is not the
 *         water anyone surfs, fishes or flies over. Lakes are not in this
 *         batch.
 *
 * One request per two-digit hydrologic region (the service takes one major
 * region at a time), 01 to 21. The phone picks the nearest by distance from
 * this list; at runtime it sends only site numbers (waterservices.usgs.gov,
 * no key), never the spot.
 */
import { writeFileSync } from 'node:fs'

const rows = []
for (let h = 1; h <= 21; h += 1) {
  const huc = String(h).padStart(2, '0')
  const url = `https://waterservices.usgs.gov/nwis/site/?format=rdb&huc=${huc}&parameterCd=00010&siteType=ST,ES&siteStatus=active&hasDataTypeCd=iv`
  const r = await fetch(url)
  if (r.status === 404) continue
  if (!r.ok) throw new Error(`USGS answered HTTP ${r.status} for region ${huc}`)
  const text = await r.text()
  const lines = text.split('\n').filter((l) => !l.startsWith('#') && l.trim() !== '')
  const head = lines[0].split('\t')
  const col = (n) => head.indexOf(n)
  for (const l of lines.slice(2)) {
    const f = l.split('\t')
    const type = f[col('site_tp_cd')]
    if (!/^(ST|ES)(-|$)/.test(type)) continue
    const lat = Math.round(Number(f[col('dec_lat_va')]) * 10000) / 10000
    const lon = Math.round(Number(f[col('dec_long_va')]) * 10000) / 10000
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    rows.push({ id: f[col('site_no')], name: f[col('station_nm')].replace(/\s+/g, ' ').trim(), lat, lon })
  }
  console.log(`region ${huc}: ${rows.length} so far`)
}
const list = [...new Map(rows.map((r) => [r.id, r])).values()].sort((a, b) => a.id.localeCompare(b.id))
writeFileSync(
  'src/data/usgsWaterTemp.ts',
  `/*
 * USGS STREAM AND ESTUARY GAUGES WITH WATER TEMPERATURE: ${list.length}, GENERATED
 * by scripts/bake-usgs-water-temp.mjs (${new Date().toISOString().slice(0, 10)}).
 * [site number, name, lat, lon]. Do not edit by hand; re-bake.
 */
export const USGS_WATER_TEMP: readonly (readonly [string, string, number, number])[] = [
${list.map((s) => `  [${JSON.stringify(s.id)}, ${JSON.stringify(s.name)}, ${s.lat}, ${s.lon}],`).join('\n')}
]
`,
)
console.log(`${list.length} sites`)
