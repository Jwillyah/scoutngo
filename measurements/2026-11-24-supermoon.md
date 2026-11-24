# The supermoon of 24 Nov 2026, ours against a second ephemeris

**Date:** 2026-11-24
**Script:** `scripts/measure-supermoon.mjs` (no network)
**Place:** Atlantic Park Surf, 36.851, -75.98, America/New_York (EST, UTC−5)
**Rule:** a full moon whose Earth–Moon distance (centre to centre) at the full instant is 362,000 km or less
**Ours:** suncalc 2.0.2 getMoonPosition().distance (Meeus 47, full table 47.A, TT), through `src/core/moonMoment.ts` moonDistanceKm; full instant `src/core/moonPhases.ts` (Meeus 49)
**Second:** `src/core/ephemeris2.ts` moonPosition2().distanceKm (Meeus 47, its 13 largest distance terms, separate code)
**Tolerance:** 200 km between the two, and the same side of the line
**Card checked at:** Mon, Nov 23 10:27 PM

## Meeus example 47.a

1992 Apr 12 0h TD, book: 368409.7 km; suncalc: 368409.7 km · ok

## The fixture: batch, ours

| | batch | ours | |
|---|---|---|---|
| distance at full | 360,765 km | 360767.3 km (second 360850.8 km) | supermoon |
| full instant | — | Tue, Nov 24 9:54 AM | |
| Mon 23 Nov 10:27 PM card | shows | "Supermoon tomorrow · Tue 24" / "Rises 4:38 PM ENE · at sunset" | ok |
| Tue 24 moonrise | 4:38 PM ENE ~57° | 4:38 PM ENE 56.6° | |
| Tue 24 sunset | 4:50 PM | 4:50 PM | |
| Tue 24 moonset | 7:00 AM WNW | 7:00 AM WNW 301.9° (sunrise 6:51 AM, 99.8% lit) | |
| Go alert | 15 min before the rise | 4:23 PM "Supermoon rising now · look ENE" | |

## Every full moon, 2026–2027

| full (EST) | ours km | second km | ours − second | supermoon | |
|---|---|---|---|---|---|
| Sat, Jan 3 2026 5:03 AM | 362312.6 | 362384.7 | -72.1 | no | ok |
| Sun, Feb 1 2026 5:09 PM | 371384 | 371365.3 | 18.7 | no | ok |
| Tue, Mar 3 2026 6:38 AM | 382609.4 | 382524.7 | 84.6 | no | ok |
| Wed, Apr 1 2026 10:12 PM | 393596.2 | 393487.5 | 108.7 | no | ok |
| Fri, May 1 2026 1:23 PM | 402003.5 | 401907.1 | 96.4 | no | ok |
| Sun, May 31 2026 4:45 AM | 406134.6 | 406082 | 52.6 | no | ok |
| Mon, Jun 29 2026 7:57 PM | 405251.3 | 405250.2 | 1.1 | no | ok |
| Wed, Jul 29 2026 10:36 AM | 399617.2 | 399641 | -23.7 | no | ok |
| Fri, Aug 28 2026 12:19 AM | 390397.5 | 390419.9 | -22.4 | no | ok |
| Sat, Sep 26 2026 12:49 PM | 379432.6 | 379463.8 | -31.2 | no | ok |
| Mon, Oct 26 2026 12:12 AM | 368870.9 | 368935.1 | -64.2 | no | ok |
| Tue, Nov 24 2026 9:54 AM | 360767.3 | 360850.8 | -83.5 | yes | ok |
| Wed, Dec 23 2026 8:28 PM | 356740 | 356788.1 | -48.1 | yes | ok |
| Fri, Jan 22 2027 7:17 AM | 357644.4 | 357616.2 | 28.3 | yes | ok |
| Sat, Feb 20 2027 6:24 PM | 363305.8 | 363213.6 | 92.2 | no | ok |
| Mon, Mar 22 2027 6:44 AM | 372524.9 | 372414.4 | 110.6 | no | ok |
| Tue, Apr 20 2027 6:27 PM | 383426.2 | 383341.8 | 84.3 | no | ok |
| Thu, May 20 2027 6:59 AM | 393901.5 | 393881.6 | 19.9 | no | ok |
| Fri, Jun 18 2027 8:44 PM | 401951 | 402017.1 | -66.1 | no | ok |
| Sun, Jul 18 2027 11:45 AM | 405972.9 | 406095.5 | -122.6 | no | ok |
| Tue, Aug 17 2027 3:29 AM | 405078.3 | 405180.7 | -102.4 | no | ok |
| Wed, Sep 15 2027 7:04 PM | 399355.6 | 399381.3 | -25.7 | no | ok |
| Fri, Oct 15 2027 9:47 AM | 389936.3 | 389890.3 | 46.1 | no | ok |
| Sat, Nov 13 2027 10:26 PM | 378760.5 | 378675.6 | 84.9 | no | ok |
| Mon, Dec 13 2027 11:09 AM | 368138.3 | 368040.8 | 97.6 | no | ok |

25 full moons; 3 supermoons by the rule; every check passed.
