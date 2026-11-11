# Surf spots: the ocean beach and its facing, from the coastline

Run 2026-11-11T00:38:08.493Z · `node scripts/measure-spot-facing.mjs` · OpenFreeMap vector tiles, live (the map's own), through src/lib/coast.ts coastFacing: the open-sea test 20, 60 and 120 km out on zoom-7 tiles, the ocean side across a barrier island within 3 km, then the waterline and the nearest-sea facing on zoom-12 tiles.

| spot | from | side | facing read at the point | ocean beach (lat, lon) | moved | facing there | listed facing |
|---|---|---|---|---|---|---|---|
| 1st Street | list | open | 61° | 36.0294, -75.6642 | 0 m | 61° | 61° |
| Avalon Pier | list | open | 60° | 36.0442, -75.6745 | 0 m | 60° | 60° |
| Jennette's Pier | list | open | 57° | 35.9105, -75.5943 | 0 m | 57° | 57° |
| Kitty Hawk Pier | list | open | 66° | 36.1014, -75.7109 | 0 m | 66° | 66° |
| Nags Head Fishing Pier | list | open | 65° | 35.9736, -75.6304 | 0 m | 65° | 65° |
| Outer Banks Pier | list | open | 65° | 35.8855, -75.5815 | 0 m | 65° | 65° |
| Sandbridge | list | open | 73° | 36.7220, -75.9270 | 0 m | 73° | 73° |
| Wrightsville Beach | list | open | 123° | 34.2104, -77.7964 | 0 m | 123° | 123° |
| S-Turns | list | open | 82° | 35.6085, -75.4655 | 0 m | 82° | 82° |
| Mirlo Beach | list | open | 74° | 35.6002, -75.4639 | 0 m | 74° | 74° |
| Rodanthe Pier | list | open | 84° | 35.5911, -75.4622 | 0 m | 84° | 84° |
| Buxton | list | open | 100° | 35.2560, -75.5180 | 0 m | 100° | 100° |
| Cape Point | list | open | 158° | 35.2210, -75.5300 | 0 m | 158° | 158° |
| Frisco Pier | list | open | 165° | 35.2268, -75.6330 | 0 m | 165° | 165° |
| 1st Street Jetty | list | open | 80° | 36.8318, -75.9678 | 0 m | 80° | 80° |
| Rodanthe (the town’s point, the 10 Nov pin) | candidate | island | 83° | 35.5940, -75.4630 | 450 m | 83° | — |
| S-Turns | candidate | open | 82° | 35.6085, -75.4655 | 358 m | 82° | — |
| Mirlo Beach (0.7 km south of S-Turns) | candidate | open | 74° | 35.6002, -75.4639 | 398 m | 74° | — |
| Rodanthe Pier | candidate | open | 84° | 35.5911, -75.4622 | 251 m | 84° | — |
| Buxton | candidate | open | 100° | 35.2560, -75.5180 | 0 m | 100° | — |
| Cape Point | candidate | open | 158° | 35.2210, -75.5300 | 0 m | 158° | — |
| Frisco Pier | candidate | open | 165° | 35.2268, -75.6330 | 0 m | 165° | — |
