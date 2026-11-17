# The live phone pass (Batch CORE, Section 7)

Run 16 Nov 2026 2:48 PM with `node scripts/walk-live.mjs https://scoutngo.vercel.app`: WebKit (iPhone 13) at 390 x 844 against the deployed build 8bb1cbb with live data, the Virginia Beach Fishing Pier saved as the spot (a public landmark; location never asked). Each screen is read for a blank page, "didn't load", NaN, "—" (counted; a dash is "not known"), overlapping words and console errors.

**Found: no blank page, no NaN, no "didn't load" on any of 19 screens.** One dash (the Drone page). The console errors are below; the overlap detector's other hits were a page drawn over the home (the home's place, date and temperature underneath it) and the planner's lens labels under its sheet: words under an opaque page, not overlaps on screen, so they are left out.

| screen | problem | fixed in this batch |
|---|---|---|
| landing (first visit) | none found | — |
| home page 1 | none found | — |
| home page 2 | none found | — |
| home page 3 | none found | — |
| menu | console: "Fetch API cannot load … overpass … due to access control checks" ×28 | n |
| sky now | console: "Fetch API cannot load … overpass … due to access control checks" ×28 | n |
| best sky | none found | — |
| weather | console: "Fetch API cannot load … overpass … due to access control checks" ×29 | n |
| surf | console: "Fetch API cannot load … overpass … due to access control checks" ×28 | n |
| tide | none found | — |
| wind | none found | — |
| buoys | none found | — |
| drone | 1 dash (not known) | n |
| drone | console: "Fetch API cannot load … overpass … due to access control checks" ×27 | n |
| map | console: "Fetch API cannot load … overpass … due to access control checks" ×28 | n |
| planner (preflight) | console: "Fetch API cannot load … arcgisonline … due to access control checks" ×1255 | n |
| planner (preflight) | console: "Fetch API cannot load … overpass … due to access control checks" ×27 | n |
| planner (preflight) | console: "Origin … is not allowed by Access-Control-Allow-Origin" ×1 | n |
| planner (preflight) | words overlap: "Tap where you will stand" / "Wind aloft: crosswind, t" | n |
| planner (preflight) | words overlap: "Tap where you will stand" / "Battery: 1.7 of 34 minut" | n |
| 3D | words overlap: "Tap where you will stand" / "Wind aloft: crosswind, t" | n |
| 3D | words overlap: "Tap where you will stand" / "Battery: 1.7 of 34 minut" | n |
| drone Fly | words overlap: "Inside Class D · Oceana " / "N" | n |

## What the console errors are, as far as this run shows

- **"Fetch API cannot load … due to access control checks"** for Esri imagery (1,283 on the planner) and the three Overpass mirrors. Esri answers this origin with `Access-Control-Allow-Origin: *` (checked with curl the same afternoon). WebKit logs a cross-origin request that is **cancelled** in these words too, and both cancel on purpose: MapLibre drops tiles the view has moved past, and the Overpass client races three mirrors and drops the losers (src/lib/overpassClient.ts). Not proved either way here: the phone's error log (Settings › Debug › Last errors, Section 2) records map source failures with their host now, so a real one will show there.
- **"Origin https://scoutngo.vercel.app is not allowed by Access-Control-Allow-Origin"** on the first open and the Drone page: a service that refused this origin; which one is not in the message. Not followed up in this batch.

## The console errors, traced (Batch DRONE, Section 6.4)

Run 16 Nov 2026, 7:30 PM, a WebKit iPhone against the deployed app (home, Drone, the map), every failed request recorded with its host and reason, every answer of 400 or more, and every cross-origin fetch answered without `Access-Control-Allow-Origin`:

| what the console said | what it was | real? |
|---|---|---|
| "Fetch API cannot load … due to access control checks" (Esri, Overpass mirrors, this app, Open-Meteo) | requests **cancelled** by the page: Playwright reports them as `cancelled` (16 to this app, 8 to Open-Meteo, 3 to the Overpass mirrors that lost the race). Apart from overpass-api.de's 406 below, no cross-origin answer came back without `Access-Control-Allow-Origin`. | No: WebKit words a cancelled cross-origin request this way. |
| "Origin https://scoutngo.vercel.app is not allowed by Access-Control-Allow-Origin. Status code: 406" | **overpass-api.de** refusing the request with 406 and no CORS header (twice, on the first open). | Yes, a refusal by that server, not a fault here: the Overpass client asks the other two mirrors (src/lib/overpassClient.ts), and they answered. Moving overpass-api.de out of first place would end the two console lines; not done in this batch. |
| "Failed to load resource: … 429 (Too Many Requests)" ×12 | **api.open-meteo.com** refusing this Mac's address (a day of walks and probes from one address). | Yes, and handled as designed since DRONE 0.5: a 429 given to the phone sends that request through this app's forecast cache. On a phone the limit is that phone's own. |

## The rest of the walk (Batch DRONE, Section 6.3)

Run 16 Nov 2026, 9:27 PM, with `node scripts/walk-live-more.mjs https://scoutngo.vercel.app` against the deployed build a0c4173 (DRONE Section 5), the same phone and spot as above.

| screen | opened | NaN | dashes | didn't load | console |
|---|---|---|---|---|---|
| calendar | opened | 0 | 0 | 0 | overpass refusal (406) ×1; cancelled request ("access control checks") ×1 |
| sun moon night: sun | opened | 0 | 1 | 0 | cancelled request ("access control checks") ×28; overpass refusal (406) ×1 |
| sun moon night: moon | opened | 0 | 1 | 0 | — |
| sun moon night: night | opened | 0 | 1 | 0 | — |
| map: radar | opened | 0 | 0 | 0 | cancelled request ("access control checks") ×27 |
| map: wind | opened | 0 | 0 | 0 | — |
| map: clouds | opened | 0 | 0 | 0 | — |
| map: tide | opened | 0 | 0 | 0 | — |
| map: playback | opened | 0 | 0 | 0 | — |
| map, as opened · scale bar 200 ft | opened | 0 | 0 | 0 | — |
| map, out 5 · scale bar 1 mi | opened | 0 | 0 | 0 | — |
| map, out 3 more · scale bar 10 mi | opened | 0 | 0 | 0 | — |
| map, out 2 more · scale bar 30 mi | opened | 0 | 0 | 0 | — |
| field report | opened | 0 | 0 | 0 | cancelled request ("access control checks") ×1 |

- **Found:** every screen opened; 0 NaN, 0 "didn't load". One dash on each Sun · Moon · Night tab; where it is was not traced (the screen read includes the Sky page under the page).
- **The zooms:** the page does not expose the map's zoom, and mobile WebKit takes no wheel, so the walk pressed MapLibre's keyboard "−" (5, 3, 2 times). The scale bar went 200 ft → 1 mi → 10 mi → 30 mi, the presses moving less than a level each. **z12, z7, z4 and z2 as asked were not walked as such**: from what the scale bar shows, the views were street level to a county; nothing continental; the map has no minimum zoom set (src/components/MapView.tsx), so it is the walk's presses, not a floor. Not walked at z4/z2.
- **Console:** the same kinds as above: cancelled requests, and overpass-api.de's 406.

Found, both passes: 0 blank, 0 NaN, 0 "didn't load" on 33 screens; console errors in 3 kinds, traced above (DRONE 6.4), none a fault in this app.
