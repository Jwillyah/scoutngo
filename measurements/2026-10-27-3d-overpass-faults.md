# The 3D view when Overpass fails: blocked, hanging, 429

Run: 2026-10-27T00:24:23.058Z · node scripts/measure-3d-overpass-faults.mjs · Virginia Beach Fishing Pier 36.8435575, -75.9713104 · screen 390 x 844 · nothing saved on the phone
Faults are made in the browser (Chrome DevTools Protocol) for all three Overpass servers at once. Retry is pressed with the fault lifted and a one-building answer served in Overpass's place.
Most at once counts requests the browser had open together; an overlap is how long a newer request had been open when the browser reported the older one ended. The client's own count is overpassInFlight() in src/lib/overpassClient.ts.
Limits: the pill says "Map data didn't load" within 60 s of opening 3D; never more than 1 Overpass request on the wire; the pill one line (40 px tall or less, 260 px wide or less) and no other error line; Retry draws the building.

| fault | pill after opening 3D (s) | after the venue was set (s) | Overpass requests | servers asked | most at once, client | most at once, browser (longest overlap ms) | pill (w x h px) | other error lines | Retry: buildings drawn | pass |
|---|---|---|---|---|---|---|---|---|---|---|
| blocked | 0.5 | 5.1 | 7 | overpass-api.de, overpass.kumi.systems, overpass.private.coffee | 1 | 1 (0) | 176 x 23 | 0 | 1 | yes |
| hanging | 45.9 | 50.5 | 4 | overpass-api.de, overpass.kumi.systems, overpass.private.coffee | 1 | 1 (0) | 176 x 23 | 0 | 1 | yes |
| 429 | 1.9 | 6.5 | 9 | overpass-api.de, overpass.kumi.systems, overpass.private.coffee | 1 | 1 (0) | 176 x 23 | 0 | 1 | yes |

Pass.
