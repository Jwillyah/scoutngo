/*
 * THE SHARED FILE'S HELD-OUT CHECK, WRITTEN DOWN (Batch L, Section 1).
 *
 * Usage:  node scripts/measure-shared-skill.mjs <dir with skill/v1/<region>/latest.json> [stations]
 *
 * Reads a file made by scripts/skill/build-shared.ts and writes
 * measurements/<date>-shared-skill.md: the run's size, and for each station
 * named (KNTU,KORF by default) each model's temperature bias and mean
 * absolute error over the last 7 days, as forecast and after taking out the
 * bias of the 23 days before (the file's `check`).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

const [dir, ids = 'KNTU,KORF'] = process.argv.slice(2)
if (dir === undefined) {
  console.error('usage: node scripts/measure-shared-skill.mjs <out dir> [stations]')
  process.exit(2)
}
const region = 'midatl'
const base = join(dir, 'skill/v1', region)
const man = JSON.parse(readFileSync(join(base, 'latest.json'), 'utf8'))
const file = JSON.parse(gunzipSync(readFileSync(join(base, man.file))).toString('utf8'))
const LABEL = { ncep_nbm_conus: 'NBM', gfs_hrrr: 'HRRR', ecmwf_ifs025: 'ECMWF', ecmwf_aifs025_single: 'AIFS', gfs_global: 'GFS', icon_seamless: 'ICON' }
const lines = [
  `# Shared model-accuracy file: first run, ${man.date}`,
  '',
  `Made by \`node scripts/skill/build-shared.ts skill/${region}.json <out>\` at ${man.generated}, on this machine (the nightly Action is not switched on: docs/model-skill.md).`,
  `Written by \`node scripts/measure-shared-skill.mjs <out> ${ids}\`.`,
  '',
  `- window: ${file.window.from} to ${file.window.to} (${file.window.days} days, ${file.timeZone})`,
  `- stations: ${man.stations} (${file.stations.filter((s) => s.kind === 'asos').length} ASOS, ${file.stations.filter((s) => s.kind === 'ndbc').length} NDBC buoys)`,
  `- rows (station x model x variable x lead x hour cells with at least one hour): ${man.rows}`,
  `- size: ${man.rawBytes} bytes of JSON, ${man.bytes} gzipped (${man.file})`,
  '',
  'Held-out check, temperature 0-24 h ahead: the last 7 days as forecast, and with the bias of the 23 days before taken out. °C.',
  '',
]
for (const id of ids.split(',')) {
  const st = file.stations.find((s) => s.id === id)
  lines.push(`## ${id} ${st?.name ?? ''} (${st?.obs ?? 0} hours scored)`, '', '| model | bias as forecast | bias corrected | MAE as forecast | MAE corrected | hours |', '|---|---|---|---|---|---|')
  for (const [m, label] of Object.entries(LABEL)) {
    const c = file.check[id]?.[m]
    lines.push(c === undefined ? `| ${label} | — | — | — | — | 0 |` : `| ${label} | ${c.rawBias} | ${c.corrBias} | ${c.rawMae} | ${c.corrMae} | ${c.n} |`)
  }
  lines.push('')
}
const out = `measurements/${man.date}-shared-skill.md`
writeFileSync(out, lines.join('\n'))
console.log(`wrote ${out}`)
