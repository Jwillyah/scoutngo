# Batch 3D · Tue 17 Nov (after FIX 62899a6)

## How to run this (orchestrator)
Act as the orchestrator. Break each section into subtasks, each with an owner, its dependencies and a definition of done.
- **Routing:**
  - Deep diagnosis and consequential judgment (the iOS 3D cause, surf model choices) go to the strongest model at high effort.
  - Bounded execution (UI, wording, tests) goes to a faster model.
- **Each subagent gets:** a goal, the relevant context, constraints, the expected output, and a definition of done.
- Investigate uncertainty rather than guessing. Parallelize independent work and avoid overlapping edits.
- Routine, reversible decisions are yours to make.
- For consequential decisions (removing a feature, changing the surf model), write the options + tradeoffs + your pick into `docs/batches/3d-decisions.md` before committing.
- Verify against the goal, fix what's off, and present one final report with evidence and the remaining limits.

## Rules
Same as FIX:
- One commit per piece, full gate, push after each.
- Two strikes reverts only that piece. Gesture, service-worker and offline audits are known flakes.
- Load ≤ 12; hard stop at 8 h.
- Contact sheets at 390×844, 390×664 and 412×915.
- Model proposes, code computes. Facts only. Nothing about the user leaves the phone.

## Phone facts (Jwilly, 17 Nov 12:27 PM and 5:38 PM, build 62899a6)
- **Device:** iPhone 13 Pro Max, **iOS 18.7.8**, Safari.
- **3D:**
  - "3D didn't load · Back to 2D" (fast, within seconds);
  - then "Loading the 3D view…" stuck;
  - then "phone reloaded the app… out of memory";
  - then Safari's "A problem repeatedly occurred".
- **Fly:** "Not open in 3 s · Keep waiting / Back".
- **Settings shows "Last errors 20".** Their text hasn't been read yet.
- **The Mac WebKit test passes every time, so it is NOT the truth for this phone.** A fast "didn't load" points at WebGL context or shader creation failing on the iOS GPU path, not only memory.

## SECTION 0 · Stop the crash now (ship first, ~30 min)
1. **Labs switch:** Settings › Labs › "3D and Fly (testing)", **off by default on iOS**. When off:
   - the 3D button and "Fly it yourself" are hidden;
   - the drone page's "Plan the flight" stays (2D).

   Desktop/Android are unchanged.
2. **Never auto-reopen 3D or Fly after a reload.** If the last session ended inside 3D/Fly, open on the 2D map with a one-line note.
3. **Last errors can't be opened (bug, Jwilly 17 Nov 8:29 PM).** Settings shows "Last errors 20 ›", but tapping the row does nothing on iPhone. Fix it first: the row is a real button that opens the Debug page, and the long-press on the version line also works. (On the phone, long-pressing the Settings version line opened About, not Debug. Make the Debug path obvious: a plain "Debug" row in Settings, under About.)
4. **Last errors, shareable:**
   - the Last errors page gets **"Copy all"** (plain text to the clipboard: build, UA, GPU renderer string, WebGL version, max texture size, each error with time and stack);
   - each row expands to the full message.

   Nothing is sent anywhere; Jwilly pastes it.

## SECTION 1 · Find the real iOS cause (diagnosis, high effort)
1. **A WebGL probe page:** `/?probe=webgl`. Plain page, no app shell. It runs these steps one by one and prints PASS/FAIL with the error text for each:
   1. create a WebGL2 context (then WebGL1);
   2. read `UNMASKED_RENDERER`;
   3. `MAX_TEXTURE_SIZE`;
   4. compile **each** of our shaders (ground, sky, clouds, water, look.ts variants) separately;
   5. allocate 1024² / 2048² textures;
   6. a float render target (`EXT_color_buffer_float` / half float);
   7. OffscreenCanvas / worker use, if any;
   8. one Three.js scene render;
   9. our 3D scene with the terrain only;
   10. + buildings;
   11. + sky.

   It stops at the first failure and shows it. Jwilly opens it once and screenshots it.
2. **Likely culprits to check in code while waiting:**
   - shader features iOS ANGLE-Metal rejects (highp in fragment loops, dynamic indexing, `textureLod` in WebGL1, integer ops);
   - float/half-float render targets;
   - `preserveDrawingBuffer`;
   - antialias with a high DPR;
   - multiple contexts (the sky pictures still make their own?);
   - very large index buffers (Uint32 without the extension);
   - Fly waiting on a 3D promise that never resolves (that's why "Not open in 3 s").
3. **Fly must not depend on 3D.** If Fly needs the 3D scene, give it its own minimal init with its own error; if the shared renderer failed, Fly says so immediately ("Needs 3D graphics this phone didn't allow") instead of a 3 s timeout.
4. **Once the probe result is in** (Jwilly will paste it): fix the failing step, re-enable behind Labs, and ask for one more phone test. Don't turn Labs on by default until the phone passes 5 opens of each.

## SECTION 2 · Search can't find local spots
- "Chics beach" → "Nothing found by that name."
- "Backdeck" → nothing. **The Back Deck is our own Best Sky truth spot.**
1. **Search our own spot list first** (the starter spots, Best Sky spots, OSM viewpoints/piers/beaches already cached), on the phone, before the geocoder.
2. **Fuzzy + aliases:** ignore case, apostrophes, spaces and plurals ("Chics" = "Chic's", "Backdeck" = "Back Deck"), with a typo distance of 2.
   - Aliases: Chic's Beach / Chicks Beach / Chesapeake Beach; The Back Deck (Lynnhaven Inlet, Shore Dr); Croatan / Croatan Jetty; 1st St Jetty / First Street Jetty; North End; Sandbridge; Rudee Inlet; Lynnhaven Inlet; Fort Story / Cape Henry; Pleasure House Point; Little Island Park; Back Bay.
3. **Businesses:** "Businesses hidden unless you search for one". A name search IS searching for one, so return businesses on a name match.
4. **Test:** those 12 names plus 5 typos return the right spot as #1.

## SECTION 3 · Decisions from FIX (Jwilly approved)
1. **Drop the surf boundary rule (3.2).** Re-run the 12–17 Nov table and confirm 13 Nov is back to Flat or 0–1.
2. **More wave models** for the bigger-swell chip: Open-Meteo Marine with ECMWF WAM, GFS-Wave and Météo-France MFWAM, asked from the phone. The chip shows when any model is ≥ 4 ft at the beach within 7 days while the call is ≤ 2. Log Mon 23 Nov daily.
3. **Water temp from the phone:** use Open-Meteo Marine `sea_surface_temperature` directly. Remove `/api/sst` and its host entry from Privacy. Stations (CO-OPS/NDBC) stay first when within 15 km.
   - Re-check VB, Croatan, Sandbridge, Lynnhaven and Wrightsville (the map showed "Water 64° · 3/2" at Wrightsville).
4. **Banners only about the place on screen:** "Sky color at sunrise · Sandbridge" showed at 12:27 PM in NC, ~250 mi away. A banner needs the spot within 25 mi of the map center, and an event that hasn't ended.

## SECTION 4 · Map small stuff (from FIX's open list)
1. **One wind number at the marker:** the map readout, the hour list and the z4/z2 view must read the same blended value at the same point and hour (the readout said 5 kt, the list 8 kt, z4 13 kt).
2. At 390×664, the readout must not cover the layer chip.
3. **The readout wraps badly** ("cross-/shore here", "14 / min ago"). Line 1 is "5 kt NNE · g6", line 2 "cross-shore", and the station line truncates the name, never the age.

## FINAL REPORT (short)
- Per section: the commit and contact sheets.
- Section 1: the probe's result on WebKit, plus what the code review found. Stop and ask Jwilly for the probe screenshot.
- Section 2: the search test table.
- Section 3: the surf table, the models used, and the water temp source per spot.
- Anything left undone.
