# equatorialToHorizontal checked against JPL Horizons

**Date:** 2026-10-18  
**Question:** Does `src/core/celestial.ts` reproduce published apparent
alt/az from published apparent RA/Dec, well enough to decide whether a
radiant clears a ridge?  
**Outcome:** Yes. Worst disagreement **0.0024 deg** (8.5 arcsec) across four
sites from -34 to +70 latitude. Test tolerance pinned at 0.01 deg.

## Method

JPL Horizons, `ssd.jpl.nasa.gov/api/horizons.api`, queried 2026-10-18:

```
EPHEM_TYPE='OBSERVER'   CENTER='coord@399'   COORD_TYPE='GEODETIC'
QUANTITIES='2,4'        ANG_FORMAT='DEG'     APPARENT='AIRLESS'
```

Quantity 2 is apparent RA/Dec referred to the true equator and equinox of
date **as seen from the site**, so topocentric parallax is already in it.
Quantity 4 is apparent azimuth (clockwise from north) and elevation. The
pair is what the transform must reproduce: a rotation, with no physics left.

`APPARENT='AIRLESS'` because `celestial.ts` does not model refraction.
Asking Horizons to refract would compare two different quantities and call
the difference an error.

## Raw numbers

| body | site | lat | lon | UT | RA (a-app) | Dec (a-app) |
|---|---|---:|---:|---|---:|---:|
| Moon | Washington DC | 38.900 | -77.000 | 2026-10-21 23:00 | 337.51974 | -9.55589 |
| Jupiter | Sydney | -33.868 | 151.209 | 2026-07-15 01:00 | 125.62312 | 19.88012 |
| Venus | Quito | -0.180 | -78.467 | 2026-01-09 14:00 | 291.77375 | -22.74809 |
| Mars | Tromso | 69.649 | 18.955 | 2026-03-02 08:00 | 332.28651 | -12.56965 |

| body | Horizons az | computed az | d az | Horizons el | computed el | d el |
|---|---:|---:|---:|---:|---:|---:|
| Moon | 134.417627 | 134.415894 | -0.0017 | 29.417795 | 29.416770 | -0.0010 |
| Jupiter | 29.190102 | 29.192462 | +0.0024 | 30.613510 | 30.612545 | -0.0010 |
| Venus | 118.195759 | 118.195153 | -0.0006 | 35.457839 | 35.456220 | -0.0016 |
| Mars | 147.576753 | 147.574447 | -0.0023 | 4.587551 | 4.587105 | -0.0004 |

## What the residual is

The equation of the equinoxes. `celestial.ts` uses **mean** sidereal time
(Meeus 12.4) and ignores nutation; apparent sidereal time differs by up to
about 1.1 seconds of time, which is 0.0046 deg of hour angle. The measured
worst case, 0.0024 deg, sits inside that and is not noise: it is the term
that was deliberately left out.

## Decision

Nutation stays out. The question this serves is whether a radiant clears a
ridge, and a ridge edge is not knowable to a hundredth of a degree from a
30 m DEM. The residual is pinned by `celestial.test.ts` at 0.01 deg, so a
change that made the transform worse fails rather than drifts.

Reproduce with `node --experimental-strip-types scripts/measure-celestial.mjs`.
