/*
 * THE LOCAL SEARCH TABLE (Batch 3D, Section 2): each query, the #1 result,
 * and which list it came from. Run: node scripts/measure-search-local.mjs
 * Writes measurements/2026-11-17-search-local.md. Nothing is asked of the
 * network; the same queries are held by tests/spotFind.test.ts.
 */
import { writeFileSync } from 'node:fs'

const { parseQuery, ownSpots, localPool } = await import('../src/core/spotSearch.ts')
const { SEARCH_CASES } = await import('../tests/searchCases.ts')
const { SURF_SPOTS } = await import('../src/data/surfSpots.ts')
const { EXTRA_SPOTS } = await import('../src/data/searchSpots.ts')

const rows = []
for (const c of SEARCH_CASES) {
  const q = parseQuery(c.query)
  const got = ownSpots(q, null, SURF_SPOTS, localPool([], []))
  const top = got[0]
  const pool = [...localPool([], [])]
  const src = top === undefined ? '-' : SURF_SPOTS.some((s) => s.id === top.id) ? 'surf spots (src/data/surfSpots.ts)' : EXTRA_SPOTS.some((s) => s.id === top.id) ? 'added place (src/data/searchSpots.ts)' : pool.find((p) => p.id === top.id)?.source === 'starter' ? 'starter list (src/data/bestSkySpots.ts)' : 'other'
  const ok = top?.id === c.id ? 'yes' : 'NO'
  rows.push(`| ${c.query} | ${top?.name ?? 'nothing'} (${top?.id ?? '-'}) | ${src} | ${c.id} | ${ok} |`)
}
const out = [
  '# Local spot search: query, #1 result, source',
  '',
  'Produced by `node scripts/measure-search-local.mjs` on 2026-11-17: each query run through `ownSpots` (src/core/spotSearch.ts) over the surf spots, the starter list and the extra places, with no saved spots and no cached map spots; no network. Same cases as tests/spotFind.test.ts (tests/searchCases.ts).',
  '',
  '| Query | #1 result | Source | Expected id | Right |',
  '|---|---|---|---|---|',
  ...rows,
  '',
]
writeFileSync(new URL('../measurements/2026-11-17-search-local.md', import.meta.url), out.join('\n'))
console.log(out.join('\n'))
