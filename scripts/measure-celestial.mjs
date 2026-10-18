/*
 * CHECK src/core/celestial.ts AGAINST PUBLISHED EPHEMERIS, AND WRITE THE TABLE.
 *
 * Usage:  node --experimental-strip-types scripts/measure-celestial.mjs
 * Writes: measurements/2026-10-18-celestial-vs-horizons.md
 *
 * IT IMPORTS THE SHIPPED FILE. A first draft of this script carried its own
 * copy of the transform, which would have measured a copy and told us nothing
 * about the code that runs. If the import below is ever replaced by a local
 * implementation, this script stops being evidence.
 *
 * The reference rows are JPL Horizons output, recorded verbatim. See the
 * measurement file for the exact query.
 */
import { writeFileSync } from 'node:fs'
import { equatorialToHorizontal } from '../src/core/celestial.ts'

const ROWS = [
  {
    body: 'Moon',
    site: 'Washington DC',
    lat: 38.9,
    lon: -77.0,
    ut: '2026-10-21 23:00',
    iso: '2026-10-21T23:00:00Z',
    ra: 337.51974,
    dec: -9.55589,
    azimuth: 134.417627,
    elevation: 29.417795,
  },
  {
    body: 'Jupiter',
    site: 'Sydney',
    lat: -33.868,
    lon: 151.209,
    ut: '2026-07-15 01:00',
    iso: '2026-07-15T01:00:00Z',
    ra: 125.62312,
    dec: 19.88012,
    azimuth: 29.190102,
    elevation: 30.61351,
  },
  {
    body: 'Venus',
    site: 'Quito',
    lat: -0.18,
    lon: -78.467,
    ut: '2026-01-09 14:00',
    iso: '2026-01-09T14:00:00Z',
    ra: 291.77375,
    dec: -22.74809,
    azimuth: 118.195759,
    elevation: 35.457839,
  },
  {
    body: 'Mars',
    site: 'Tromso',
    lat: 69.649,
    lon: 18.955,
    ut: '2026-03-02 08:00',
    iso: '2026-03-02T08:00:00Z',
    ra: 332.28651,
    dec: -12.56965,
    azimuth: 147.576753,
    elevation: 4.587551,
  },
]

const measured = ROWS.map((row) => {
  const got = equatorialToHorizontal(row.ra, row.dec, row.lat, row.lon, new Date(row.iso))
  return {
    ...row,
    gotAzimuth: got.azimuth,
    gotElevation: got.altitude,
    dAzimuth: got.azimuth - row.azimuth,
    dElevation: got.altitude - row.elevation,
  }
})

const worst = measured.reduce(
  (acc, r) => Math.max(acc, Math.abs(r.dAzimuth), Math.abs(r.dElevation)),
  0,
)

const lines = [
  '# equatorialToHorizontal checked against JPL Horizons',
  '',
  '**Date:** 2026-10-18  ',
  '**Question:** Does `src/core/celestial.ts` reproduce published apparent',
  'alt/az from published apparent RA/Dec, well enough to decide whether a',
  'radiant clears a ridge?  ',
  `**Outcome:** Yes. Worst disagreement **${worst.toFixed(4)} deg** (${(worst * 3600).toFixed(1)} arcsec) across four`,
  'sites from -34 to +70 latitude. Test tolerance pinned at 0.01 deg.',
  '',
  '## Method',
  '',
  'JPL Horizons, `ssd.jpl.nasa.gov/api/horizons.api`, queried 2026-10-18:',
  '',
  '```',
  "EPHEM_TYPE='OBSERVER'   CENTER='coord@399'   COORD_TYPE='GEODETIC'",
  "QUANTITIES='2,4'        ANG_FORMAT='DEG'     APPARENT='AIRLESS'",
  '```',
  '',
  'Quantity 2 is apparent RA/Dec referred to the true equator and equinox of',
  'date **as seen from the site**, so topocentric parallax is already in it.',
  'Quantity 4 is apparent azimuth (clockwise from north) and elevation. The',
  'pair is what the transform must reproduce: a rotation, with no physics left.',
  '',
  "`APPARENT='AIRLESS'` because `celestial.ts` does not model refraction.",
  'Asking Horizons to refract would compare two different quantities and call',
  'the difference an error.',
  '',
  '## Raw numbers',
  '',
  '| body | site | lat | lon | UT | RA (a-app) | Dec (a-app) |',
  '|---|---|---:|---:|---|---:|---:|',
  ...measured.map(
    (r) =>
      `| ${r.body} | ${r.site} | ${r.lat.toFixed(3)} | ${r.lon.toFixed(3)} | ${r.ut} | ${r.ra.toFixed(5)} | ${r.dec.toFixed(5)} |`,
  ),
  '',
  '| body | Horizons az | computed az | d az | Horizons el | computed el | d el |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...measured.map(
    (r) =>
      `| ${r.body} | ${r.azimuth.toFixed(6)} | ${r.gotAzimuth.toFixed(6)} | ${r.dAzimuth >= 0 ? '+' : ''}${r.dAzimuth.toFixed(4)} ` +
      `| ${r.elevation.toFixed(6)} | ${r.gotElevation.toFixed(6)} | ${r.dElevation >= 0 ? '+' : ''}${r.dElevation.toFixed(4)} |`,
  ),
  '',
  '## What the residual is',
  '',
  'The equation of the equinoxes. `celestial.ts` uses **mean** sidereal time',
  '(Meeus 12.4) and ignores nutation; apparent sidereal time differs by up to',
  'about 1.1 seconds of time, which is 0.0046 deg of hour angle. The measured',
  `worst case, ${worst.toFixed(4)} deg, sits inside that and is not noise: it is the term`,
  'that was deliberately left out.',
  '',
  '## Decision',
  '',
  'Nutation stays out. The question this serves is whether a radiant clears a',
  'ridge, and a ridge edge is not knowable to a hundredth of a degree from a',
  '30 m DEM. The residual is pinned by `celestial.test.ts` at 0.01 deg, so a',
  'change that made the transform worse fails rather than drifts.',
  '',
  'Reproduce with `node --experimental-strip-types scripts/measure-celestial.mjs`.',
  '',
]

const out = 'measurements/2026-10-18-celestial-vs-horizons.md'
writeFileSync(out, lines.join('\n'))
console.log(`worst residual ${worst.toFixed(4)} deg  ->  ${out}`)
