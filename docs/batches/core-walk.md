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

## Not walked

The batch's list also has Sun / Moon / Night (its rebuild did not ship, Section 5.4), Calendar, the map's layers and zooms (radar, wind, clouds; z12, z7, z4, z2; playback) and the field report. Not reached in the time left; next batch.

Found 0 blank, 0 NaN, 0 "didn't load"; console errors in 3 kinds, none fixed in this batch (none proved to be a fault).
