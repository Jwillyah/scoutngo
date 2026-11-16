/*
 * docs/sources-licenses.md from src/core/credits.ts (Batch DRONE, Section 0.4).
 * Run: node scripts/write-sources-doc.ts. tests/credits.test.ts fails when
 * the doc and the list disagree.
 */
import { writeFileSync } from 'node:fs'
import { CREDITS } from '../src/core/credits.ts'

const cell = (s: string) => s.replace(/\|/g, '\\|')
const rows = CREDITS.map((c) => `| ${cell(c.name)} | ${cell(c.use)} | ${cell(c.license)} | ${c.attribution === null ? 'none asked' : cell(c.attribution)} | ${cell(c.key)} | ${cell(c.rate)} | **${c.status}**${c.note === undefined ? '' : ` · ${cell(c.note)}`} |`)
const doc = `# Sources and licences

Every outside thing ScoutNGo touches. Generated from \`src/core/credits.ts\` by \`node scripts/write-sources-doc.ts\`; the in-app "Data & credits" page (/credits) shows the same list, and \`tests/credits.test.ts\` fails when a host in \`src/lib/hosts.ts\` has no row.

Status: **ok** used within its terms as far as we know · **fix** something to change · **check** terms not yet confirmed.

| Source | What we use | Licence / terms | Credit | Key | Rate limit | Status |
|---|---|---|---|---|---|---|
${rows.join('\n')}

## Rules (Batch CORE, 16 Nov)

- Third-party surf sites (Surfline, Surfchex and the like): links that open their page in a new tab only. No embedding or framing of their cams or pages, no scraping, no copying their numbers into the app, no logos. Checked 16 Nov: the app links out only (src/components/CamsSheet.tsx, CamList.tsx, SurfPageV2.tsx, all \`target="_blank"\`); nothing embeds, frames, scrapes or copies. Nothing was removed.
- Cams: every cam the app lists is a link to its operator's page (src/data/coastCams.ts, src/data/vdotCams.ts; tests/camsLinkOnly.test.ts). None is embedded.
- Truth fixtures may carry a hand-written note such as "Surfline said Flat". Nothing fetches one automatically.
- Open-Meteo is asked from the phone; this app's cache (/api/forecast) only when Open-Meteo refuses the phone or cannot be reached.
- Licence: MIT (LICENSE), with its no-warranty clause. No keys are in the repository or its history (scanned 16 Nov for Anthropic, AWS, Google, Mapbox and GitHub key patterns: none; the only "sk-ant-" string is a test's placeholder).
`
writeFileSync('docs/sources-licenses.md', doc)
console.log(`docs/sources-licenses.md: ${CREDITS.length} rows`)
