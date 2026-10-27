# The 3D view when its map data fails: Overpass down, and the map tiles down

Run: 2026-10-27T03:05:16.051Z · node scripts/measure-3d-map-faults.mjs · Virginia Beach Fishing Pier 36.8435575, -75.9713104 · screen 390 x 844 · nothing saved on the phone at the start of each case
Faults are made in the browser (Chrome DevTools Protocol): Overpass on all three servers at once (overpass-api.de, overpass.kumi.systems, overpass.private.coffee); the map tiles at tiles.openfreemap.org. Watched for 60 s from opening 3D.
Limits. Overpass down, tiles open: buildings drawn, the pill never says "Map data didn't load", never more than 1 Overpass request on the wire (the client's own count, src/lib/overpassClient.ts), and when Overpass refuses the legend says the trees did not load. Tiles down: the pill says it, one line (40 px tall or less, 260 px wide or less), and Retry with the tiles let through draws the buildings.

| case | buildings drawn after opening 3D (s) | buildings | "Map data didn't load" after (s) | pill (w x h px) | trees | Overpass requests | most at once | map tile requests | Retry: buildings | pass |
|---|---|---|---|---|---|---|---|---|---|---|
| Overpass blocked | 1.1 | 302 | never | — | trees didn't load | 3 | 1 | 4 | — | yes |
| Overpass hanging | 1.1 | 302 | never | — | trees didn't load | 3 | 1 | 23 | — | yes |
| Overpass 429 | 1.0 | 302 | never | — | trees didn't load | 6 | 1 | 8 | — | yes |
| map tiles blocked | never | 0 | 1.0 | 176 x 23 | not said yet | 6 | 1 | 11 | 302 | yes |

Pass.
