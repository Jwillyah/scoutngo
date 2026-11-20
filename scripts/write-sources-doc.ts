/*
 * docs/sources-licenses.md from src/core/credits.ts (Batch DRONE, Section 0.4).
 * Run: node scripts/write-sources-doc.ts. tests/credits.test.ts fails when
 * the doc and the list disagree.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { CREDITS } from '../src/core/credits.ts'

/* The cam sources and whether each may be shown in the app: data/cam-sources.json (Batch SIMPLE-2, Section 6). */
interface CamSource { id: string; name: string; runs: string; terms: string; alsoRead: string[]; read: string; says: string | null; embed: boolean; why: string }
const CAM_SOURCES = JSON.parse(readFileSync('data/cam-sources.json', 'utf8')) as CamSource[]

const cell = (s: string) => s.replace(/\|/g, '\\|')
const rows = CREDITS.map((c) => `| ${cell(c.name)} | ${cell(c.use)} | ${cell(c.license)} | ${c.attribution === null ? 'none asked' : cell(c.attribution)} | ${cell(c.key)} | ${cell(c.rate)} | **${c.status}**${c.note === undefined ? '' : ` · ${cell(c.note)}`} |`)
const camRows = CAM_SOURCES.map((c) => `| ${cell(c.name)} | ${cell(c.runs)} | ${[c.terms, ...c.alsoRead].join('<br>')} | ${c.says === null ? 'Nothing found on showing it elsewhere' : cell(c.says)} | embed: ${c.embed} | ${cell(c.why)} |`)
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

## Cam sources (Batch SIMPLE-2, read ${CAM_SOURCES[0].read})

May the app show a cam's image or stream, loaded by the phone straight from its owner (**embed: true**), or only link to the owner's page (**embed: false**)? From \`data/cam-sources.json\`; every cam in \`src/data/cams.json\` takes its source's answer (\`scripts/build-cams.mjs\`, \`tests/camsJson.test.ts\`). Where the terms are silent or unclear the answer is false. Surfline and Surfchex are link out only whatever their terms say: no embed, no logo. Nothing from any cam is stored on our side, and no cam page is scraped. Today no cam in the list is embeddable: the one source whose terms allow it (NCDOT) has no cam in the list, because DriveNC's camera list needs a developer key.

| Source | Runs it | Terms read | What they say | Verdict | Why |
|---|---|---|---|---|---|
${camRows.join('\n')}
`
writeFileSync('docs/sources-licenses.md', doc)
console.log(`docs/sources-licenses.md: ${CREDITS.length} rows`)
