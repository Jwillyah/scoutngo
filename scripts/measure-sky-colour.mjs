/*
 * THE COLOUR CLOCK FOR 29 OCT AT THE VIRGINIA BEACH PIER, REPLAYED.
 *
 * Asks Open-Meteo's air-quality service for the aerosol optical depth at the
 * pier (2 decimals) for the sunrise hour, runs src/core/skyColour.ts over the
 * six-model cover along the sun's line recorded that morning
 * (tests/data/sky-fire-2026-10-29-sunrise.json) with the KNTU deck base
 * (BKN030, 914 m), and writes measurements/<date>-sky-colour.md.
 *
 * Usage:  node scripts/measure-sky-colour.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { getPosition, getTimes } from 'suncalc'
import { clockWords, dipDeg, LAYER_WORD, reachKm, strip, stripTimes } from '../src/core/skyColour.ts'
import { DECK_HEIGHT_M } from '../src/core/skyFire.ts'
import { formatClock } from '../src/core/timezone.ts'
import { aerosolUrl, nearestHour, parseAerosol, parseFirePaths, pathsAt } from '../src/lib/skyFireData.ts'

const PIER = { lat: 36.8435575, lon: -75.9713104 }
const sunrise = getTimes(new Date('2026-10-29T16:00:00Z'), PIER.lat, PIER.lon).sunrise
const url = aerosolUrl(PIER, sunrise)
const aod = parseAerosol(await (await fetch(url)).json(), sunrise)
if (aod === null) throw new Error(`no aerosol optical depth in ${url}`)

const fixture = JSON.parse(readFileSync('tests/data/sky-fire-2026-10-29-sunrise.json', 'utf8'))
const paths = pathsAt(parseFirePaths(fixture.payload), nearestHour(sunrise))
const best = paths.find((p) => p.model === 'best_match') ?? paths[0]
const clock = (d) => formatClock(d, 'America/New_York', 12)
const alt = (t) => getPosition(t, PIER.lat, PIER.lon).altitude
const rows = []
const strips = []
for (const layer of ['high', 'mid', 'low']) {
  const heightM = layer === 'low' ? 914 : DECK_HEIGHT_M[layer]
  const reach = reachKm(best, layer, heightM)
  if (reach === null) {
    rows.push(`| ${LAYER_WORD[layer]} | ${heightM} m | not on the sun's line in best_match | | | |`)
    continue
  }
  const s = strip({ layer, heightM, reachKm: reach }, sunrise, alt, aod)
  strips.push(s)
  const t = stripTimes(s)
  const c = (d) => (d === null ? 'none' : clock(d))
  rows.push(`| ${LAYER_WORD[layer]} | ${heightM} m, dip ${dipDeg(heightM).toFixed(2)} deg | ${reach} km | ${c(t.firstLit)} | ${c(t.glowFrom)} to ${c(t.glowTo)} | ${c(t.deepest)} |`)
}
const words = clockWords(strips, 'sunrise', clock)
const day = new Date().toISOString().slice(0, 10)
const md = `# The colour clock, 29 Oct sunrise at the Virginia Beach Fishing Pier

Run ${new Date().toISOString()} by scripts/measure-sky-colour.mjs.

Sunrise ${clock(sunrise)} EDT (suncalc). Aerosol optical depth at 550 nm for ${nearestHour(sunrise)} UTC: ${aod.toFixed(2)}, from ${url}
Cloud cover along the sun's line: best_match in tests/data/sky-fire-2026-10-29-sunrise.json. Low deck base 914 m (KNTU 1056Z, BKN030).

| layer | height | lit cloud toward the sun | first lit | glow | deepest red |
|---|---|---|---|---|---|
${rows.join('\n')}

Words: ${words}

Seen from the pier that morning: the low deck glowing from about 7:15.
`
writeFileSync(`measurements/${day}-sky-colour.md`, md)
console.log(md)
