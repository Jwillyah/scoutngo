/*
 * REBUILDS src/data/coastCams.ts from data/coast-cams.json.
 *
 * Usage:  node scripts/build-coast-cams.mjs
 *
 * The JSON is the gathered list (docs/cams.md: how, and how to refresh it).
 * Each entry: name, operator, state, lat, lon, facing (degrees or null),
 * facingSource ("sea" or "page"), url (https), access ("free" or "paid").
 * Prints the count per state.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const list = JSON.parse(readFileSync('data/coast-cams.json', 'utf8'))
const seen = new Set()
const rows = list.map((c) => {
  if (!/^https:\/\//.test(c.url)) throw new Error(`not https: ${c.url}`)
  let id = `${c.state}-${c.name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  for (let k = 2; seen.has(id); k += 1) id = `${id.replace(/-\d+$/, '')}-${k}`
  seen.add(id)
  return `  { id: ${JSON.stringify(id)}, name: ${JSON.stringify(c.name)}, operator: ${JSON.stringify(c.operator)}, state: ${JSON.stringify(c.state)}, at: { lat: ${c.lat}, lon: ${c.lon} }, facing: ${JSON.stringify(c.facing)}, url: ${JSON.stringify(c.url)}, access: ${JSON.stringify(c.access)} },`
})
const head = readFileSync('src/data/coastCams.ts', 'utf8').split('export const COAST_CAMS')[0]
writeFileSync('src/data/coastCams.ts', `${head}export const COAST_CAMS: readonly CoastCam[] = [\n${rows.join('\n')}\n]\n`)
const per = {}
for (const c of list) per[c.state] = (per[c.state] ?? 0) + 1
console.log(`${list.length} cams`, Object.entries(per).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', '))
