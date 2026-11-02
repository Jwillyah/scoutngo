/*
 * SKY FIRE, THE FOUR REPLAYS (Batch G, Section 1), offline: the kept
 * forecast answers (tests/data/sky-fire-<date>-sunrise.json) and KORF's
 * reports round each sunrise (tests/data/korf-sunrise-metars.txt), through
 * the verdict and the colour clock (src/core/fireOutlook.ts).
 *
 * Usage:  node scripts/measure-fire-replays.mjs
 * Writes: measurements/<today>-sky-fire-replays.md
 *
 * The same reads tests/skyFireReplays.test.ts holds to. The verdicts before
 * Batch G are the "Verdict" lines of measurements/<date>-sky-fire.md, written
 * by scripts/measure-sky-fire.mjs with the old checks.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { agreementLine, checkWords, clockStrips, fireVerdict } from '../src/core/fireOutlook.ts'
import { parseMetarSky } from '../src/core/metar.ts'
import { clockWords, LAYER_WORD } from '../src/core/skyColour.ts'
import { MODEL_LABEL } from '../src/core/skyFire.ts'
import { formatClock } from '../src/core/timezone.ts'
import { parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

const DAYS = [
  ['2026-10-29', 'low deck lit from under: it fired'],
  ['2026-11-02', 'high cirrus, clear low horizon: it fired'],
  ['2026-10-30', 'clear sky'],
  ['2026-10-11', 'overcast at 800 ft, rain'],
]
const metars = readFileSync('tests/data/korf-sunrise-metars.txt', 'utf8').split('\n').filter((l) => l.startsWith('ORF,'))
const clock = (d) => formatClock(d, 'America/New_York', 12)
const ran = new Date().toISOString()
const rows = [
  '# Sky fire, the four replays',
  '',
  `Run: ${ran} · node scripts/measure-fire-replays.mjs · the Virginia Beach Fishing Pier · aerosol 0.1 (2 Nov's Open-Meteo figure for 11:00 GMT was 0.09) · station: KORF's report nearest the sunrise, within 2 h`,
  '',
  '| sunrise | what happened | station | verdict | per layer | colour clock |',
  '|---|---|---|---|---|---|',
]
const detail = []
for (const [date, what] of DAYS) {
  const fx = JSON.parse(readFileSync(`tests/data/sky-fire-${date}-sunrise.json`, 'utf8'))
  const paths = pathsAt(parseFirePaths(fx.payload), fx.hour)
  const event = new Date(fx.event)
  const near = metars
    .map((l) => l.split(','))
    .map(([, t, m]) => ({ at: new Date(`${t.replace(' ', 'T')}:00Z`), sky: parseMetarSky(m), raw: m }))
    .filter((m) => m.sky !== null)
    .sort((a, b) => Math.abs(a.at - event) - Math.abs(b.at - event))[0]
  const v = fireVerdict(paths, { event, kind: 'sunrise', venue: fx.venue, aod: 0.1, station: { sky: near.sky, at: near.at } })
  const strips = clockStrips(v)
  const words = strips.length === 0 ? '—' : clockWords(strips, 'sunrise', clock)
  rows.push(`| ${date} ${clock(event)} | ${what} | ${near.raw.split(' ').slice(0, 6).join(' ')} | ${v.line} (${v.agree} of ${v.of}) | ${agreementLine(v)} | ${words} |`)
  detail.push('', `## ${date}`, '', '| model | layer | canvas | gap | not blocked | fires |', '|---|---|---|---|---|---|')
  for (const m of [v.sky, ...v.models])
    for (const l of m.layers.filter((x) => x.canvas)) {
      const w = checkWords(l)
      detail.push(`| ${m.model === 'sky' ? 'mean (the clock)' : MODEL_LABEL[m.model]} | ${LAYER_WORD[l.layer]} | ${w.canvas} | ${w.gap} | ${w.notBlocked} | ${l.fires ? 'yes' : 'no'} |`)
    }
}
const out = `measurements/${ran.slice(0, 10)}-sky-fire-replays.md`
writeFileSync(out, [...rows, ...detail, ''].join('\n'))
console.log([...rows].join('\n'))
console.log(`\nwritten: ${out}`)
