# Batch SIMPLE-1 · Wed 18 Nov (after 3D ea93f27) · unattended run

Jwilly is away. His friend took 20 min to figure out how to get around the app. **This batch makes only the safe cuts and fixes.** The visual redesign waits for mockups. Do **not** restyle screens beyond what's listed.

## How to run (orchestrator)
Act as the orchestrator: split each section into subtasks, each with an owner, its dependencies and a definition of done.
- Hard diagnosis (3D, search, airspace data) goes to the strongest model at high effort; bounded UI and test work goes to a faster model.
- Each subagent gets a goal, the context, constraints, the expected output and a definition of done.
- Investigate rather than guess. Parallelize independent work and avoid overlapping edits.
- Make routine, reversible calls yourself. Consequential ones go in `docs/batches/simple-decisions.md` with your options + pick.
- End with one verified report.

## Rules
- Same gate rules as 3D: one commit per piece, two strikes reverts that piece, known flakes re-run alone.
- Load ≤ 12; hard stop at 8 h.
- Contact sheets at 390×844, 390×664 and 412×915.
- Facts only. Nothing about the user leaves the phone.
- **Hide, don't delete:** anything cut goes behind a flag in `src/config/flags.ts` so it can come back.

## SECTION 0 · Stop things popping up
1. **The planner never opens by itself.**
   - It opens only from Menu › "Plan a shoot" (rename it if it's called something else) or from a drone page button.
   - Opening the map must show the map, the marker and the time bar, with no planner, Preflight, airspace or drone sheet.
2. **Leaving a mode clears it.** Back from drone, Preflight, airspace or the planner returns to a clean map. Nothing from drone carries over (Jwilly saw drone sheets reappear after going back to the map).
3. Test: open the map 5 ways (home, menu, drone back, search pick, deep link) and get **no sheet** each time.

## SECTION 1 · Drone = 3 tabs: Wind · Airspace · Preflight
1. **Wind:** the current Now tab (number, direction, gusts, limit chip, today bars), plus the By-height grid moved below it (one scroll page). When calm, show "Calm" in the compass, never an empty circle (same for the home wind card).
2. **Airspace:** the current Airspace tab.
   - **Heliport dots** show only within 5 mi of the marker, or at z ≥ 11.
   - **One TFR truth:** the app does fetch TFRs (/api/tfr). Everywhere, say "TFRs today: 0 within 20 mi · from tfr.faa.gov at 9:14 AM · other NOTAMs not checked". Remove "TFRs and NOTAMs are NOT checked by this app" (it contradicts the drone tab).
3. **Preflight:** a checklist, each row green or amber with one line:
   - Airspace (class / ceiling / LAANC needed)
   - Wind at 400 ft vs limit
   - Gusts
   - Battery (minutes, cold trim)
   - Sunset / civil twilight
   - TFRs today
   - Remote ID
   - Kp

   The buttons are "Get LAANC ›" and "Plan a shoot ›".
4. **Behind a flag (off):** the Plan tab (turn-back %, sun at 400 ft, sun in lens, lens fog, flight-log import). Jwilly: turn-back isn't verified, so it's off.
5. **The drone header uses the spot name.** Spell it "Chic's Beach" everywhere (the starter list says "Chick's").

## SECTION 2 · Search: addresses
- "Pub, 425 E Pinner St, Suffolk, VA 23434" and "425 E Pinner St, Suffolk" → "Nothing found".
1. When the local list has no match, send **only the typed words** to the geocoder (Photon first, then Nominatim), with US addresses supported. Keep the current privacy line.
2. Strip business prefixes before a comma when the full string fails ("Pub, 425 E…" → "425 E…").
3. Test: 10 addresses (VB, Suffolk, Norfolk, Wilmington NC, Salisbury MD) + 5 place names → the right point is first.

## SECTION 3 · Airspace data gap
- Near Suffolk, AutoPylot shows the **Great Dismal Swamp National Wildlife Refuge** boundary. We showed "nothing marked here".
1. Add **US Fish & Wildlife Service refuge boundaries** (FWS public open data, nationwide, fetched whole like the other FAA layers; no spot sent) to the "Parks and local rules" layer. The sheet line: "National Wildlife Refuge · drone use needs refuge permission".
2. Add state parks only if a free nationwide dataset exists (USGS PAD-US). Otherwise note it as a gap in the decisions doc.
3. Test: a Suffolk point east of US-13 → the refuge line shows.

## SECTION 4 · 3D leftovers (from the 3D report)
**Phone evidence (Jwilly, Debug, 18 Nov 1:07 PM, build 3db2f29):** all 20 errors are just two kinds:
- "3D not shown in 10 s" (×13);
- "Fly not open in 3 s (3D not shown yet, take-off ground…)" (×5);
- plus "The page reloaded while this was open" (×4).

No shader or context error, so the graphics compile. **Cause #1 from the 3D report is confirmed: 3D waits for ~900 tiles and hits the 10 s timeout on the phone network.** The reloads come after repeated tries, so they're probably tile memory piling up from un-cancelled downloads (cause #3). Items 1–3 below are the fix. Do them first in this batch, right after Section 0.
1. **Show 3D at first useful frame:** the terrain + the nearest tile ring, then stream the rest in. Not after all ~900 tiles. The 10 s "didn't load" applies only to the first frame.
2. **Closing 3D cancels its tile downloads** (AbortController).
3. **Lost-context rebuild:** at most 2 retries, then "3D didn't load · Back to 2D".
4. **Labs default ON everywhere, including iOS (Jwilly, 18 Nov: keep 3D and Fly on for testing until they work).** Keep the Labs switch so it can be turned off. With the 2-retry cap + "Back to 2D" card + no auto-reopen after a reload, a failure must land on the 2D map, never loop Safari into "A problem repeatedly occurred". Jwilly will run `/?probe=webgl` and paste the result.

## SECTION 4b · Open-Meteo 429
The phone's network log shows `api.open-meteo.com 429` among ~15 calls in one minute at 1:07 PM.
- Dedupe identical requests, cache for 10 min, and merge variables into one call per spot where possible.
- On a 429, back off for 60 s and use the cached value with its age.
- Report the calls per app open, before → after.

## SECTION 5 · Mon 23 swell log
Run the multi-model wave check **once per day** on app open (one request per model at the home spot, a background task, inside the request budget), so the Mon 23 log fills even if the Surf page isn't opened. The log stays on the phone.

## SECTION 6 · Too-much audit (for the mockups, no UI changes)
Write `docs/batches/simple-audit.md`:
1. **Per screen:** the number of visible text items, buttons, cards and rows at 390×844, and the scroll length. Sort by most cluttered.
2. **A task walk:** the taps needed for each of these, from a fresh install:
   - check surf now;
   - see tonight's color;
   - check if I can fly the drone here;
   - see the tide;
   - plan a shoot;
   - find a spot by name;
   - find a spot by address.

   Flag any task over 3 taps.
3. **A list of every screen and every way to reach it** (so the mockups can collapse duplicate paths).
4. **A cut list proposal** (what to hide behind "More"), with no changes made.

## FINAL REPORT (short)
- Per section: the commit and contact sheets.
- Section 2: the search table.
- Section 3: the sources added.
- Section 6: the audit path + the top 5 cluttered screens + the tasks over 3 taps.
- Anything left undone.
