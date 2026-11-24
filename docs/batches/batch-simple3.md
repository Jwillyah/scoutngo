# Batch SIMPLE-3 · Mon 23 Nov (after SIMPLE-2) · unattended run

**Goal:** the app tells the truth the same way on every screen, sees fog, and gives a shooter a one-tap Day sheet. Field tests 20–23 Nov are the evidence (run-queue-2.md, "SIMPLE-2 phone tests" through "23 Nov 5:00").

Mockups in `docs/mockups/simple3/` (390×844): **Home_Visual** (approved), **Day_Sheet**, **Sky_Sunrise2**, **Sky_Sunset2**, **Home_Moon** (moon moment card), **Wind_Bar_8** (day-tab timeline). Values in them are examples; real values come from our functions.

## How to run (orchestrator)
Same as SIMPLE-2: split sections into subtasks with owners, dependencies and a definition of done. Hard diagnosis (S0 flicker, S1 fog) goes to the strongest model at high effort; bounded UI and tests to a faster model. Investigate, don't guess. Log consequential calls in `docs/batches/simple3-decisions.md`. End with one verified report.

## Rules
- One commit per piece, full gate, **push after each** (if the push is refused by permissions, ask once, then keep going and list unpushed commits in the report). Two strikes reverts that piece. Known flakes (gesture, service worker, offline, viewfinder) re-run alone.
- Load ≤ 12; hard stop 8 h. **Sections are in priority order.**
- Contact sheets at 390×844, 390×664, 412×915 for every changed screen.
- Model proposes, code computes. Facts only. Nothing about the user leaves the phone. No personal info in any request.
- Hide, don't delete (flags in `src/config/flags.ts`). Labs 3D/Fly stays on.

## SECTION 0 · One truth, no flicker (bugs, first)
1. **Home flickers between two states** (23 Nov 5:10, same minute): state A has the mini pictures, Sky "Possible", Surf "1–2 ft", Tide "—", no moment card; state B has no pictures, Sky "Likely", Surf "2–3 ft", Tide "High 8:58p", "COLOR ON NOW". Find the two sources racing (cache vs live, two spot resolutions, two sky calls) and make home render from **one** resolved snapshot per spot. Pictures never disappear once drawn. Test: record both states as a fixture; 10 reloads → identical tiles.
2. **One sky call object** read by home tile, moment card, Sky Tonight, Sky color page, alerts. 23 Nov 4:57: Tonight "Color possible" vs Sky color "Color likely". Add a test that compares all five.
3. **One surf story:** home moment, Surf tile, Surf chart window, Best row read the same series and window (23 Nov 11:07: "1–3 ft until 5 PM" vs "2–3 ft" vs "clean 10a–11p" vs "11a–11p").
4. **Back button** sometimes lands on the "Find a spot" picker. The spot picker is a modal: it never enters history; back returns to the previous page. Audit every back path.
5. **Loading state:** never "■■■", "…", "—" or "H— L—" (21 Nov 10:18 PM, 23 Nov 5:10 Tide "—"). Show the last saved value with its age ("High 8:58p · 2 h ago"), or a light skeleton for under 2 s.
6. **"COMING UP · 0 M"** → "Now". Moment cards and "Color on now" expire at the window end.

## SECTION 1 · Fog (3 misses: 21 Nov sunrise, 23 Nov 11 AM haze, 23 Nov 4:30 PM sea fog)
1. **Compute fog risk per spot per hour (code, not a model):**
   - inputs: air temp, dew point, water temp (our existing source), wind speed + direction vs the spot's facing, Open-Meteo hourly `visibility`, station visibility (KNTU, KORF, NDBC/CO-OPS where reported), and GOES fog/low-cloud where available;
   - **sea fog** risk high when dew point ≥ water temp − 1 °F and wind ≤ 12 kt onshore/cross-onshore at a coastal spot; **radiation fog** when spread ≤ 2 °F, wind ≤ 4 kt, clear-ish night/early morning;
   - confirm/upgrade with any station or model visibility ≤ 2 mi within 15 mi; downgrade when visibility ≥ 6 mi everywhere.
2. **Say it everywhere:** "Fog on the beach" / "Fog likely 5–9 AM" on Weather, Sky Now, Sky Sunrise/Sunset, the Day sheet, home weather tile, and the moment card.
3. **Sky call with fog:** at a coastal spot with high fog risk at the call time, drop the call ≥ 1 step there and add "Color above the fog inland" with Best spot near me pointing to inland/elevated spots. Inland spots keep their call (23 Nov: beach fogged, inland "kinda fired").
4. **Fixtures:** 21 Nov 6:30–7:30 AM (fog + good sunrise), 23 Nov 11 AM (haze), 23 Nov 4:20–4:55 PM (beach fog, inland color). Each must show fog at the beach and the right inland call.

## SECTION 1b · Rain now (Jwilly 23 Nov 11:14 PM: TWC "intermittent rain ends in the next hour, light", our home said "Clouds coming and going · 60–100%" with no rain anywhere)
1. **Rain nowcast per spot, computed:** station present weather (METAR RA/DZ/SH within 15 mi, ≤ 75 min old), radar at the spot (the radar layer we already load, sampled at the marker + 10 mi upstream along the storm motion), and Open-Meteo `minutely_15` precipitation for the next 2 h. Code decides: "Light rain now · ends ~11:50 PM", "Rain starts ~2:15 PM · light", "Showers nearby · moving NE".
2. **Show it:** home weather tile line + a 2-hour rain strip (15-min bars) replacing the cloud line when rain is now or within 2 h; Weather page hero; Day sheet rows; moment card for "Rain in 20 min" when the persona is Shoot/Drone/Surf.
3. **Rain alert (opt-in, same switch as Go alerts):** "Rain starts ~20 min · light" / "Rain ending ~11:50". Phone only; it fires while the app is open/backgrounded within what the PWA allows (document the limit, no server learns the spot).
4. Fixture: 23 Nov 11:14 PM VB (light intermittent rain ending within the hour, radar band moving NE).

## SECTION 1c · Wind contradiction (23 Nov 11:14 PM)
Home Wind "18 kt NNE · gusts 22" while Drone said "8 kt at 400 ft" in the same minute: wind at 400 ft can't be less than half the surface wind with this setup. Both must read the same blended source and the same hour; add a fixture and a test (surface vs 400 ft ratio sanity: 400 ft ≥ 0.9 × surface unless a measured profile says otherwise).

## SECTION 2 · Home visuals (Home_Visual, approved)
1. Each tile's empty lower half gets its live mini picture: Sky = sun arc with now + sunset/sunrise point + cloud band; Drone = 400 ft bars vs dashed limit; Wind = arrows every 2 h (pointing where it blows) with kt; Tide = filled curve, now dot, low/high times; Surf = bars with the glassy/clean window shaded; Fish = day bar with the window + tide-turn tick. Moment card gets a small icon.
2. **Weather tile layout:** the hourly strip has a fixed width (6 slots, never squashed: "Now6p7p…" overlap seen 23 Nov). The condition line is one short phrase; replace "Clouds coming and going · 0–100%" with "Partly cloudy · clouds moving fast" (no 0–100%).
3. Surf tile: "nearest: Virginia Beach · 9 mi" never wraps (short name, or move distance to the pill).
4. Home-fit audit passes at all sizes.
5. **Weather tile hourly strip scrolls** (added by Jwilly, 24 Nov, during the run): a finger scrolls it sideways through the next 48 h, snapping per hour, with a soft fade and a "›" hint on the right edge. Day breaks labelled ("Wed"), sunrise/sunset marked, rain % under the icon when ≥ 20%. Horizontal drag scrolls the strip, vertical drag scrolls the page; a tap on the tile or an hour opens the Weather page at that hour. Resets to "Now" on reopen. Same commit as the rest of Section 2.

## SECTION 2b · Moon moments (Home_Moon) · Jwilly 23 Nov: "tomorrow's supermoon should pop up"
1. Home moment card for moon events, from the evening before through the event: **Supermoon** (full moon with Earth–Moon distance ≤ 362,000 km, computed; 24 Nov 2026 = 360,765 km, check against a second ephemeris), **Big moonrise** (full ±1 day rising within 45 min of sunset), **Moonset at sunrise** (≥ 95% setting within 30 min of sunrise). Text: "SUPERMOON TOMORROW · TUE 24 / Rises 4:38 PM ENE · at sunset", tap → Sky › Night. Moon moments rank with sky/surf moments by the persona order; a Supermoon always shows.
2. Optional Go alert (same switch as color): "Supermoon rising now · look ENE" 15 min before moonrise. Phone only.
3. The Night tab moon drawing is a flat purple disc: draw it moon-colored (warm grey/cream) with a few soft maria, phase-correct.
4. Fixture: 23 Nov 10:27 PM → card shows; 24 Nov 4:38 PM moonrise (ENE ~57°), sunset 4:50; Moonset Tue 24 7:00 AM WNW.

## SECTION 5b · Wind timeline: easier to slide (Wind_Bar_8) · Jwilly 23 Nov: "too much going on, hard to slide; I like how Windy slides closer to the day"
1. Replace the 5-day squeezed bar with **day tabs** (Mon calm · Tue max 10 · Wed max 19 · Thu max 27 · Fri max 17) under **one day of 24 hourly bars**. Tap a day to show its hours; drag anywhere on the bars to scrub (big touch area, the thumb has a 44 px handle); swipe left/right past the edge moves to the next/previous day.
2. Header shows the scrubbed time + value ("Wed 2 PM · 19 kt NNE · gusts 25").
3. Direction arrows every 3 h for that day only; gust caps; dashed drone limit labeled at the right end (never under the now line).
4. Same component for Radar and Clouds. 60 fps scrub, no refetch while dragging.

## SECTION 3 · Sky page fixes
1. **Fixed tabs: Now · Sunrise · Sunset · Night.** The day goes in the eyebrow ("TONIGHT", "TOMORROW AM"). No more "This AM" / "Tmrw PM" / "Tonight" swapping.
2. **New sky scene** (Sky_Sunrise2 / Sky_Sunset2) replaces the flat pink block: gradient from the computed state, each cloud layer drawn at its height with lit undersides where the call says lit, fog band when fog risk is high, sun at its real azimuth on a compass, water vs land silhouette by the spot's facing, height labels, one plain sentence explaining the call.
3. **Labels:** a mid deck at 8,000 ft is never called "high cirrus 8 km". Name the layer from its height (low < 6,500 ft, mid 6,500–20,000, high > 20,000) and use ft/mi for US users everywhere (also "13 km NE", "about a kilometre" on Find a spot → mi).
4. **Time sequence:** golden ends at sunset; afterglow/color and blue hour follow without overlap (23 Nov: Golden 4:12–5:07 ran past sunset, Color 5:07–5:17 overlapped Blue 5:10–5:21).
5. **Rating:** 5 buttons matching the call words: Nothing · A little · Some · Good · Fired (map to Skip/Unlikely/Possible/Likely/Fire for the hit rate). One tap, changeable.
6. **Photo:** replace the raw "Choose File" input with "Add photo"; show the thumbnail and the EXIF time ("4:54 PM · saved on this phone ✓"); the entry appears in Log it. Photo never leaves the phone.
7. Sky Now cam card: show a still when the source allows, otherwise a clear "link out ↗" card; fix the "0 ft" distance.

## SECTION 4 · Day sheet (Day_Sheet) = the new default for Plan a shoot
1. ☰ › Plan a shoot opens the **Day sheet** for the current spot and today, in 1 tap. Date and spot changeable at the top.
2. Top strip: sun height over the day on golden / side / top / blue bands, with a now line, sunrise/noon/sunset labels.
3. Hour rows (first light → last light): sun direction + height (arrow = which way the light travels), light word (Golden · Warm side · Side · Flat · Top · soft when cloudy), cloud %, wind kt + direction, rain %, a fog mark when fog risk is high. Current hour highlighted.
4. One warnings line (fog until ~8:30, wind turns onshore after 2p, rain after 4p…), computed.
5. Buttons: **Share as image** (renders on the phone, shared via the share sheet) and **Add positions ›** (the existing planner, unchanged).
6. Auto-refresh every 30 min while open; works offline from the last fetch with its age.
7. Fixture: Atlantic Park Surf (36.851, −75.980), Sat 21 Nov: sunrise 6:51, sunset 4:47, noon 33° at 11:49, golden 6:51–7:26 and 4:12–4:47, blue 6:31–6:51 and 4:47–5:08 (within 2 min of a second ephemeris).

## SECTION 5 · Surf words + watch
1. **Size and quality are separate.** The pill is quality (Poor · Poor-Fair · Fair · Good), the number is size. 23 Nov: 2–3 ft clean, 10 s, light offshore → "Fair" (Surfline Fair, Jwilly: "def a go all day"); never "Small" for that.
2. Under 5 kt: "Calm · glassy" (no onshore/offshore word); 23 Nov showed NE cross-onshore vs Surfline SW offshore at 2–3 kt.
3. **Swell watch Thu 26 Nov:** Surfline shows Wed 4–6, Thu 6–8 ft at Sandbridge. Log our multi-model call daily (on the phone) and show the "bigger swell" chip if any model ≥ 4 ft.

## SECTION 6 · Alerts and banners
1. **Go alert lead time:** fire ≥ 15 min before the window starts, never after it ends (21 Nov: "6:20–6:30" pushed at 6:52).
2. **Map banners:** "God rays likely 7:00–9:00 AM · Sandbridge" showed at 5:08 PM for tomorrow: label future days ("Tomorrow 7–9 AM"), only show events within 12 h, and never cover map controls (it covered the layers button).
3. Banners and moments expire at the window end.

## SECTION 7 · Small
1. **Fish:** no all-day windows ("7 AM–9 PM · calm water", "11 AM–9 PM"). Until a real computed window exists, the tile shows the next tide turn + moonrise/moonset; "None today · wind 10 kt+" must use the same wind as the Wind tile.
2. Spot name the same on every page (home "Atlantic Park" vs Weather "Virginia Beach").
3. Map: "drone limit 23" label never under the now line.

## SECTION 8 · Domain (only if scoutngo.com serves the app)
Same as SIMPLE-2 S8. Otherwise skip and say so.

## FINAL REPORT (short)
- Per section: commit + contact sheets; unpushed commits if any.
- S0: the two racing sources and the fix.
- S1: the fog table for the 3 fixtures (beach vs inland, before → after).
- S4: Day sheet fixture times vs the second ephemeris.
- Anything left undone.
