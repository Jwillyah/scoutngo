# Batch FIX · Tue 17 Nov (after DRONE cb48a8f; phone tests 16 Nov 7 PM – 17 Nov 7:07 AM)

## Rules
Same as DRONE:
- One commit per section piece, full gate, push after each.
- Two strikes reverts **only that piece**. Gesture, service-worker and offline audits are known flakes: re-run alone first.
- If a gate collapses under memory (many timeouts), close other browsers and re-run once before counting it.
- Load ≤ 12; hard stop at 8 h.
- Contact sheets at 390×844, 390×664 and 412×915.
- Model proposes, code computes. Facts only. Nothing about the user leaves the phone.

## Field truth fixtures
- **`2026-11-17-vb-dawn.json`, 7:05 AM:** 1st St OBSERVED 0–1 shin to knee (Surfline sanity, manual), N 13 g15 cross-shore. Ours 1–2 "ankle to knee", buoy 44099 3.0 ft 4 s NE → as faces 1.2 ft.
- **Mon 23 Nov watch:** Surfline shows 5–7 / 6–8 ft from a SE low ("uncertain"). Ours shows 1–2 on day 7. Log the call daily until then; truth gets filled in Monday.

## SECTION 0 · 3D and Fly still crash on the iPhone
Phone, 16 Nov 7:01 PM and 8:00 PM: "3D didn't load / Fly didn't load · the phone reloaded the app, most likely out of memory", then Safari's "A problem repeatedly occurred". The 5-of-5 WebKit test passes on the Mac, so **the Mac test is not the truth; the phone is.**
1. **Check the build first.** Read the build stamp from the phone screenshots Jwilly sends next. If 3D still crashes on cb48a8f, continue below.
2. **Lite 3D by default on iOS:**
   - ground texture ≤ 1024², DPR 1.5, no shadows, a simplified terrain mesh;
   - one WebGL context for the whole app (3D and Fly share it, never two at once);
   - dispose of all geometry and textures on leave;
   - cap the tile cache at 64 tiles.

   Step up to 2048² only after 20 s at 30+ fps with no context loss, and remember that choice per device on the phone.
3. **A memory budget you can see.** Sum the texture and buffer bytes the app creates and keep the total under 150 MB on iOS. Show it in Settings › Debug ("3D memory 82 MB of 150").
4. **Fly** uses the same Lite rules plus the reduced ground. Load Fly only from a settled map (no 3D map underneath).
5. **Test:** WebKit with a memory cap that matches an iPhone 13 tab (≈ 1 GB process; fail above 150 MB GPU-side by our own count): 10 opens of 3D, 10 of Fly, alternating, with no reload. Then **ask Jwilly for one phone test** and stop this section until he reports.

## SECTION 1 · Wind: one station, stable
At 7:06 two loads a minute apart showed:
- 13 kt NE onshore (Cape Henry 44099 met, 16 kt, 7 min old);
- 7 kt NNE cross-onshore (KNTU, 3 kt, **1 h 11 min old**).

The map also used KNTU at 1 h 10 min. The S0.1 station fix covered sky METAR, not wind.
1. **One station picker** for wind, shared by the home, Wind page, map readout, drone and surf quality:
   - the coastal station first;
   - must be fresh (≤ 75 min, or ≤ 30 min if there are 2+ choices);
   - **hysteresis**: keep the chosen station for 30 min unless it goes stale.

   Never pick a 70-min-old report when a 7-min-old one is in range.
2. **The headline** is the blended "now" (model nudged by the chosen station after 10 m normalization), with the station shown under it. It must not jump from 13 to 7 between reloads with unchanged inputs: add a test with a recorded pair.
3. **The "now" arrow** in the 12 h row pointed E while the wind was from NE. Fix the bearing (draw where the wind goes) and add a test per octant.
4. **Fixture:** 17 Nov 7:06 (both station feeds recorded) → the same answer on 5 reloads.

## SECTION 2 · Map leftovers
1. **The map opens at now.** It opened at "Tue 2 PM" at 7:05 AM. Opening, returning to the map and "Now" all reset the thumb to the current hour.
2. **Banners:**
   - Hidden in wind mode (all layers' play mode).
   - **Expire when the event ends.** "Sky color at sunrise possible 6:43 AM" was still up at 7:05.
   - At most one banner.
3. **The marker readout** sits beside the marker (right, or left near the edge), never on top of it.
4. **Wind bar label collision:** "drone limit 23" overlapped the "11" peak label. Move the limit label to the left end, or drop the peak label under it. Extend the overlap audit to the bar.
5. **Radar** on the timeline bar (rain % band, past 2 h + forecast).
6. **No refetch while scrubbing:** Open-Meteo was asked again at each hour crossed. Prefetch ±48 h once per spot, then scrub from memory.
7. **Walk z4 and z2** in wind mode (live tiles) and add them to the walk doc.
8. **Overpass:** try the servers that answer first; overpass-api.de (406) goes last.

## SECTION 3 · Surf leftovers
1. **The quality rule keys on the chop, not just direction.** On 16 Nov the model's NNW counted as cross-offshore, so "Poor · choppy" didn't fire, but the beach was wind-chopped by a N wind sea. Add: if the **wind sea dominates the swell at the beach** (wind-sea energy ≥ 2× swell after the transform) **and** wind ≥ 10 kt from anything but offshore ±30° → "Poor · choppy". The same rule removes the "clean" shading (it was still shaded 6–7 PM on 17 Nov with N 13 kt).
2. **Boundary rounding:** 14 Nov 4:30 missed by 0.03 ft (0.97 → 0–1). Use the likely range to pick the bin when within 0.1 ft of a boundary (show the higher bin if the upper range crosses it). Check 13 Nov 12:30 (Small vs Flat) with the same rule.
3. **One surf series:**
   - The map said "swell 1.0 ft 3 s NE" while the Surf page said swell 0.3 ft 11 s + wind waves 3.0 ft 4 s.
   - The home card said 1–2 while its chart line read ~0.3.

   Both read `surfCall` for the same hour. Add a test that compares home, Surf, map readout and week.
4. **Bigger swell watch:** if any model or ensemble member shows ≥ 4 ft at the beach within 7 days while our call is ≤ 2, show a chip on the week page: "Possible bigger swell Mon · models disagree · low confidence". Log it daily for Mon 23 Nov.
5. **17 Nov 7:05 fixture:** VB 0–1 or 1–2 is acceptable; "clean" must not show.

## SECTION 4 · Water temp everywhere (ocean + bays now)
It's only on the Tide page today (58°F · 4/3 typical). Add "Water 58° · 4/3" to:
- the home surf card (under the size);
- the Surf page header line;
- the map marker readout (when over water);
- the Fish card and page;
- the drone Plan page (lens fog uses it).

**Sources, measured only, each with its distance and age:**
1. NOAA CO-OPS water temperature (Sewells Point, CBBT, Kiptopeke, Rudee/Lynnhaven if available) and NDBC buoys (44099, 44014…).
2. For open water with no station within 15 km: satellite SST (NOAA, e.g. MUR/Coral Reef Watch daily, ~1–5 km) labelled "satellite · yesterday".
3. **Rivers:** USGS Water Services gauges that report water temp (parameter 00010) within 5 km, labelled with the gauge name.
4. **Lakes:** not yet. With no measured source, say "No water temp here". **Never estimate from air temp.**

Wetsuit line from the measured temp only (a table in code). Cache everything on the phone with the rest of the offline data.

## SECTION 5 · Small leftovers
1. **The tide chart "now" label** overlaps the 6:41 AM low label. Move "now" above the curve, or drop the low label while they collide.
2. **Swipe between the Sun · Moon · Night tabs** (same as the Sky page).
3. **Service-worker audit first-run failure:** find the cause ("B was never cached with A dropped"), or quarantine it to its own job with 1 retry, documented.
4. **Scrub fps on a real frame clock:** measure in WebKit, not headless Chrome; report it.

## SECTION 6 · Drone pages: slim down (Drone_Slim_1–4 in docs/mockups)
Phone, 17 Nov 7:13–7:15, on cb48a8f. Too much text, repeated cards, and one real contradiction.
1. **Contradiction (fix first):**
   - The Now and By height cards said "Class D · 250 ft · LAANC near KNTU".
   - The Airspace sheet for the same spot said "**Class C · max 100 ft · Norfolk Intl (KORF)**".

   One airspace lookup per point, read by every tab. The spot is Chic's Beach, so the header must say the spot name, not "Virginia Beach".
2. **Now (Slim_1):**
   - The big number, "from NNE · gusts 11 · at 400 ft", and the compass.
   - **One teal chip:** "Under your limit until sunset 4:53 · gusts 46%". Orange is only for limit or gust trouble. The orange "Calm now until 4:53" chip was the wrong color, and its words duplicated the line above.
   - The today bars.
   - Then **4 one-line rows** instead of 4 cards: Airspace (tap → Airspace tab) · Battery · Sky · GPS.
   - The Sky row says "Clear · vis 10 mi" (no "Little low cloud · low cloud 0%").
3. **By height (Slim_2):** the headline is short ("Calm all day" / "Best 3–4:50 PM"), one line under it, the grid, and the legend. **No repeated cards** on this tab; the cards were also cut off behind the buttons.
4. **Airspace (Slim_3):**
   - Map first.
   - The sheet is collapsed to 2 lines: "Class C · max 100 ft here" + "Norfolk Intl grid · LAANC needed · 0 TFRs · Remote ID on". Swipe up for the details.
   - **One** disclaimer line (there were two).
   - The layers sheet opens as a half sheet over the map, not full screen.
   - **No-fly/security and TFRs on by default.**
   - The Chart/Satellite/3D tiles show thumbnails, not flat colors.
5. **Plan (Slim_4):**
   - The turn-back card is "34%" + one line + the two pickers; the explanation goes behind ⓘ. Remove the 3-segment bar (unreadable).
   - The other items become one-line rows: Sun at 400 ft · Sun in lens · Lens fog · Last flight (import).
6. **One footer per page:** "How we got this ›" left, "Not official FAA · check LAANC" right. No second disclaimer above it.
7. **Kp:** "Kp not received · NOAA did not answer". Find out why the SWPC fetch fails on the phone (CORS/endpoint), and show the last value with its age. Hide the row if there's never been one.
8. **Lens fog** wording: say "Possible" only when the temp-dew spread is ≤ 5°F, or the lens is coming from a warm car (≥ 15°F colder outside). Otherwise "Low".

## Not in this batch
- **Live sky everywhere:** still waiting for Jwilly's approval of the 8-state sheets.
- **Fishing best time, lakes water temp, state/city park drone rules, birds:** parked.

## FINAL REPORT (short bullets)
- Per section: the commit(s) and contact sheets.
- Section 0: what changed for iOS, the memory numbers, and the request for Jwilly's phone test.
- Section 1: the 17 Nov 7:06 fixture, before → after, over 5 reloads.
- Section 3: the 12/13/14/16/17 Nov table, and the Mon 23 log so far.
- Section 4: the water temp source per spot (VB, Croatan, Sandbridge, Lynnhaven, Back Bay).
- Anything left undone.
