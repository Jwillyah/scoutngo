/*
 * WHITE GLYPH ON EVERY GOLDEN BUBBLE TILE.
 *
 * Usage:  node scripts/measure-icon-contrast.mjs
 * Writes: measurements/<today>-icon-contrast.md
 * Exits:  0 when every tile the app paints gives white 3:1 or better on its
 *         middle stop; 1 when one does not.
 *
 * Reads src/lib/iconPalette.ts, the one place the stops are written down, so
 * the table is of what ships, not of a copy. The ratio is WCAG's, against the
 * middle stop alone: the gloss and the light stop make the top of a tile
 * lighter still, so the middle is the honest single number, not the best case.
 */
import { writeFileSync } from 'node:fs'
import { ICON_IDS, GLYPH_MIN_CONTRAST, tileContrast } from '../src/lib/iconPalette.ts'

const today = new Date().toISOString().slice(0, 10)
const rows = ICON_IDS.map(tileContrast)
const bad = rows.filter((r) => r.shippedRatio < GLYPH_MIN_CONTRAST)
const fmt = (n) => n.toFixed(2)

const lines = [
  `# White glyph against each tile's middle stop`,
  '',
  `Run: ${new Date().toISOString()} · node scripts/measure-icon-contrast.mjs`,
  `Source: src/lib/iconPalette.ts (stops from design/icons-golden-bubble.html and design/home-golden.html)`,
  `Rule: white #ffffff on the middle stop, WCAG ratio, floor ${GLYPH_MIN_CONTRAST}:1. A tile under it is walked toward its own dark stop in 1% steps until it passes.`,
  '',
  '| tile | design middle | ratio | ships | ratio | deepened |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${r.designMiddle} | ${fmt(r.designRatio)} | ${r.shippedMiddle} | ${fmt(r.shippedRatio)} | ${r.deepened ? 'yes' : 'no'} |`),
  '',
  `Deepened: ${rows.filter((r) => r.deepened).map((r) => r.id).join(', ') || 'none'}.`,
  `Under ${GLYPH_MIN_CONTRAST}:1 after deepening: ${bad.map((r) => r.id).join(', ') || 'none'}.`,
  '',
]
const out = `measurements/${today}-icon-contrast.md`
writeFileSync(out, lines.join('\n'))
console.log(lines.join('\n'))
console.log(`wrote ${out}`)
process.exit(bad.length === 0 ? 0 : 1)
