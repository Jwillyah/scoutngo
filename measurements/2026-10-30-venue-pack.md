# A venue saved for offline: its size

Run 2026-10-30T01:34:15.362Z by scripts/measure-venue-pack.mjs, from a desktop on a home connection.

Parameters (src/lib/venuePack.ts): near ring 1500 m, imagery z12-19, elevation z12-15, map tiles z12-14; wide ring 30000 m, imagery and elevation z8-11. Forecast data for a shoot at 2026-10-30T13:00:00.000Z, tides for 7 days from it. Imagery from Esri World Imagery, elevation from AWS terrarium, map tiles from OpenFreeMap: every tile GET, bytes as received.

| venue | tiles | imagery | elevation | map tiles | forecast and tides | total |
|---|---|---|---|---|---|---|
| Virginia Beach Fishing Pier | 3517 | 32.3 MB (3437 tiles, 0 not served) | 1.5 MB (69) | 0.3 MB (11) | 0.3 MB (7 tide days, station Virginia Beach) | 34.5 MB |
| Big Meadow, Shenandoah | 3640 | 45.0 MB (3562 tiles, 0 not served) | 2.4 MB (67) | 0.1 MB (11) | 0.0 MB (0 tide days, station none) | 47.5 MB |

Tiles that never answered after three tries: Virginia Beach Fishing Pier 0, Big Meadow, Shenandoah 0.
Time to fetch on this connection: Virginia Beach Fishing Pier 30 s, Big Meadow, Shenandoah 32 s.
