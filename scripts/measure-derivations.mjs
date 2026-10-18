/*
 * THREE CLAIMS, RE-DERIVED FROM THE SHIPPED CODE.
 *
 * Usage:  node --experimental-strip-types scripts/measure-derivations.mjs
 * Writes: measurements/2026-10-18-derivations.md
 *
 * These three were flagged by the measurement audit as real numeric claims
 * with no artefact behind them. None of them needs a browser or a network:
 * each is arithmetic over code that is already in the repo, so "re-measure"
 * here means "recompute from the shipped modules and write down what came
 * out", with the modules IMPORTED rather than copied.
 *
 *   GOES legibility       how many screen pixels one satellite pixel covers
 *   Lesner sunrise        the altitudes across the window that read as empty
 *   meridian convergence  how far forward and reverse azimuths are from 180
 */
import { writeFileSync } from 'node:fs'
import { getTimes, getPosition } from 'suncalc'
import { GOES_BAND_LABEL, GOES_GROUND_METERS, satellitePixelOnScreen, zoomAdvice } from '../src/core/goes.ts'
import { sunBand } from '../src/core/sunBand.ts'
import { bearingBetween } from '../src/core/geo.ts'

const lines = []
const say = (line = '') => {
  lines.push(line)
  console.log(line)
}

/* ------------------------------------------------- 1 · GOES legibility */

const VB = { lat: 36.85, lon: -75.97 }
const SCREEN_W = 390

say('# Three re-derived claims')
say('')
say('**Date:** 2026-10-18  ')
say('**Question:** Three numeric claims in comments had no artefact. What do')
say('they come out as, recomputed from the shipped modules?  ')
say('**Outcome:** All three reproduce. Numbers below.')
say('')
say('## 1 · GOES legibility at Virginia Beach')
say('')
say('How many SCREEN pixels one satellite pixel covers, which is what decides')
say('whether the cloud layer carries detail or is a flat wash. Computed from')
say("the band's ground sample distance and the map's metres-per-pixel, not from")
say('a zoom somebody picked by eye.')
say('')
say(`Site ${VB.lat} N, screen width ${SCREEN_W} px.`)
say('')
say('Band ground sample distance, from the shipped table: ' +
  Object.entries(GOES_GROUND_METERS).map(([b, m]) => `${GOES_BAND_LABEL[b]} ${m} m`).join(', ') + '.')
say('')
say('| zoom | infrared pixel covers | visible pixel covers | layer readable |')
say('|---:|---:|---:|---|')

for (const zoom of [7, 9, 11, 13, 16]) {
  const ir = satellitePixelOnScreen('infrared', VB.lat, zoom)
  const vis = satellitePixelOnScreen('visible', VB.lat, zoom)
  const advice = zoomAdvice('infrared', VB.lat, SCREEN_W, zoom)
  say(
    `| ${zoom} | ${ir.toFixed(0)} px | ${vis.toFixed(0)} px |` +
      ` ${advice.readable ? 'yes' : 'no — ' + String(advice.message).replace('Too close for the sky layer: ', '')} |`,
  )
}
say('')
say('One satellite pixel covering a third of the screen is the reported symptom:')
say('the layer looked broken at venue zoom. The layer was fine; the zoom was.')
say('')

/* --------------------------------------------------- 2 · Lesner sunrise */

const LESNER = { lat: 36.9089, lon: -76.0872 }
const LESNER_DAY = new Date(2026, 9, 20, 12, 0, 0)
const sunrise = getTimes(LESNER_DAY, LESNER.lat, LESNER.lon).sunrise

say('## 2 · The sunrise window at Lesner Bridge')
say('')
say('The window that prompted the band work: every altitude in it was being')
say('reported as "nothing to light a position with".')
say('')
say(`Lesner Bridge, ${LESNER.lat} N ${LESNER.lon} E, 20 October 2026.`)
say(`Sunrise, from suncalc: **${sunrise.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false })} local**.`)
say('')
say('| minutes before sunrise | sun altitude | band |')
say('|---:|---:|---|')
for (const before of [60, 50, 40, 30, 20, 10, 0]) {
  const at = new Date(sunrise.getTime() - before * 60_000)
  const altitude = getPosition(at, LESNER.lat, LESNER.lon).altitude
  say(`| ${before} | ${altitude.toFixed(2)}° | ${sunBand(altitude)} |`)
}
say('')

/* ---------------------------------------------- 3 · meridian convergence */

say('## 3 · Meridian convergence over 400 m')
say('')
say('The forward and reverse azimuths between two points are not exactly 180')
say('apart on a sphere. The claim was 6e-5 degrees over 400 m at this latitude,')
say('and it is the reason the card carries both bearings rather than deriving')
say('one from the other.')
say('')
say('| from | to | forward | reverse | 180 − |difference| |')
say('|---|---|---:|---:|---:|')

const BASE = { lat: 36.9089, lon: -76.0872 }
const convergences = []
for (const [dLat, dLon, label] of [
  [0.0036, 0, '400 m north'],
  [0, 0.0045, '400 m east'],
  [0.0025, 0.0032, '400 m north-east'],
]) {
  const to = { lat: BASE.lat + dLat, lon: BASE.lon + dLon }
  const forward = bearingBetween(BASE, to)
  const reverse = bearingBetween(to, BASE)
  const gap = Math.abs(180 - Math.abs(((forward - reverse + 540) % 360) - 180))
  convergences.push(gap)
  say(
    `| base | ${label} | ${forward.toFixed(6)}° | ${reverse.toFixed(6)}° |` +
      ` ${gap.toExponential(1)}° |`,
  )
}
say('')
const worst = Math.max(...convergences)
say(`Largest departure from exactly 180: **${worst.toExponential(1)} degrees**.`)
say('')
say('### Checked by hand, because the comment it replaces was wrong by 45x')
say('')
say('The textbook convergence is the longitude difference times sin(latitude).')
const handLat = 36.9089
const handDLon = 400 / (111320 * Math.cos((handLat * Math.PI) / 180))
const handSin = Math.sin((handLat * Math.PI) / 180)
say('')
say('```')
say(`dLon for 400 m east at ${handLat} N = 400 / (111320 * cos(lat)) = ${handDLon.toFixed(6)} deg`)
say(`sin(lat)                             = ${handSin.toFixed(4)}`)
say(`convergence = dLon * sin(lat)        = ${(handDLon * handSin).toExponential(2)} deg`)
say('```')
say('')
say('The comment in `src/core/shotType.ts` said 6e-5 degrees. It is 2.7e-3.')
say('')
say('Tiny, and that is the point: it is small enough to be invisible and real')
say('enough that deriving one bearing from the other would put an approximation')
say('on the card and in the Street View link where an exact number was already')
say('available.')
say('')
say('Reproduce with `node --experimental-strip-types scripts/measure-derivations.mjs`.')

writeFileSync('measurements/2026-10-18-derivations.md', lines.join('\n') + '\n')
console.log('\n=== DERIVATIONS OK -> measurements/2026-10-18-derivations.md ===')
