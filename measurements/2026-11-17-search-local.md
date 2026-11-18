# Local spot search: query, #1 result, source

Produced by `node scripts/measure-search-local.mjs` on 2026-11-17: each query run through `ownSpots` (src/core/spotSearch.ts) over the surf spots, the starter list and the extra places, with no saved spots and no cached map spots; no network. Same cases as tests/spotFind.test.ts (tests/searchCases.ts).

| Query | #1 result | Source | Expected id | Right |
|---|---|---|---|---|
| Chic's Beach | Chick's Beach (chicks-beach) | starter list (src/data/bestSkySpots.ts) | chicks-beach | yes |
| Chicks Beach | Chick's Beach (chicks-beach) | starter list (src/data/bestSkySpots.ts) | chicks-beach | yes |
| Chesapeake Beach | Chick's Beach (chicks-beach) | starter list (src/data/bestSkySpots.ts) | chicks-beach | yes |
| The Back Deck | The Back Deck (back-deck) | added place (src/data/searchSpots.ts) | back-deck | yes |
| Croatan | Croatan (vb-croatan) | surf spots (src/data/surfSpots.ts) | vb-croatan | yes |
| Croatan Jetty | Croatan (vb-croatan) | surf spots (src/data/surfSpots.ts) | vb-croatan | yes |
| 1st St Jetty | 1st Street Jetty (vb-1st-street-jetty) | surf spots (src/data/surfSpots.ts) | vb-1st-street-jetty | yes |
| First Street Jetty | 1st Street Jetty (vb-1st-street-jetty) | surf spots (src/data/surfSpots.ts) | vb-1st-street-jetty | yes |
| North End | North End (vb-north-end) | surf spots (src/data/surfSpots.ts) | vb-north-end | yes |
| Sandbridge | Sandbridge (sandbridge) | surf spots (src/data/surfSpots.ts) | sandbridge | yes |
| Rudee Inlet | Rudee Inlet (rudee-inlet) | starter list (src/data/bestSkySpots.ts) | rudee-inlet | yes |
| Lynnhaven Inlet | Lynnhaven Inlet (lynnhaven-inlet) | starter list (src/data/bestSkySpots.ts) | lynnhaven-inlet | yes |
| Fort Story | Ft Story (fort-story) | starter list (src/data/bestSkySpots.ts) | fort-story | yes |
| Cape Henry | Ft Story (fort-story) | starter list (src/data/bestSkySpots.ts) | fort-story | yes |
| Pleasure House Point | Pleasure House Point (pleasure-house-point) | added place (src/data/searchSpots.ts) | pleasure-house-point | yes |
| Little Island Park | Little Island Park (little-island-park) | added place (src/data/searchSpots.ts) | little-island-park | yes |
| Back Bay | Back Bay (back-bay) | starter list (src/data/bestSkySpots.ts) | back-bay | yes |
| Chics beach | Chick's Beach (chicks-beach) | starter list (src/data/bestSkySpots.ts) | chicks-beach | yes |
| Backdeck | The Back Deck (back-deck) | added place (src/data/searchSpots.ts) | back-deck | yes |
| back deck | The Back Deck (back-deck) | added place (src/data/searchSpots.ts) | back-deck | yes |
| Croaton | Croatan (vb-croatan) | surf spots (src/data/surfSpots.ts) | vb-croatan | yes |
| Sandbrige | Sandbridge (sandbridge) | surf spots (src/data/surfSpots.ts) | sandbridge | yes |
| Rudy inlet | Rudee Inlet (rudee-inlet) | starter list (src/data/bestSkySpots.ts) | rudee-inlet | yes |
| Lynhaven inlet | Lynnhaven Inlet (lynnhaven-inlet) | starter list (src/data/bestSkySpots.ts) | lynnhaven-inlet | yes |
| Pleasure hous point | Pleasure House Point (pleasure-house-point) | added place (src/data/searchSpots.ts) | pleasure-house-point | yes |
| Little iland park | Little Island Park (little-island-park) | added place (src/data/searchSpots.ts) | little-island-park | yes |
| fort storey | Ft Story (fort-story) | starter list (src/data/bestSkySpots.ts) | fort-story | yes |
| northend | North End (vb-north-end) | surf spots (src/data/surfSpots.ts) | vb-north-end | yes |
| 1st street jety | 1st Street Jetty (vb-1st-street-jetty) | surf spots (src/data/surfSpots.ts) | vb-1st-street-jetty | yes |
