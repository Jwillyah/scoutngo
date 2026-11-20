# Batch SIMPLE-2 · Thu 19 Nov (after SIMPLE-1 7cb57ba) · unattended run

**Goal:** a first-timer can answer "should I go, when, where?" in ≤ 3 taps. Trey took 20 min to find his way around; after this batch it should take 10 s per question.

**App structure (Jwilly, decided):**
- **HOME** = what / when / where. Every tile is tappable to one simple page.
- **MAP** = a map only, with layers (wind, radar, clouds, tide, airspace). It never opens Plan a shoot.
- **☰ MENU** = everything else.

Mockups are in `docs/mockups/simple2/` (PNG, 390×844). **Build what they show.** Mockup names, cam names and values are examples; real values come from our existing functions.

## How to run (orchestrator)
Act as the orchestrator: split each section into subtasks, each with an owner, its dependencies and a definition of done.
- Hard judgment (cam sources and their terms, moon math checks, navigation architecture) goes to the strongest model at high effort; bounded UI and test work goes to a faster model.
- Each subagent gets a goal, the context, constraints, the expected output and a definition of done.
- Investigate rather than guess. Parallelize independent work and avoid overlapping edits. **Sections 2–7 share one page component (S1): build S1 first.**
- Make routine, reversible calls yourself. Consequential ones go in `docs/batches/simple2-decisions.md` with the options + your pick.
- End with one verified report.

## Rules
- One commit per piece, full gate, push after each. Two strikes reverts that piece only. The gesture, service-worker and offline audits are known flakes: re-run them alone first.
- Load ≤ 12; hard stop at 8 h. **Sections are in priority order**, so if time runs out the most important work is done.
- Contact sheets at 390×844, 390×664 and 412×915 for every new screen.
- Model proposes, code computes. Facts only, never "safe" or "clear".
- Nothing about the user leaves the phone. The persona pick, the chosen cam and saved spots stay in local storage. No personal info in any User-Agent, header, URL or body (the CLAUDE.md rule + test).
- **Hide, don't delete:** old screens that are replaced go behind flags in `src/config/flags.ts` (off), so they can come back.
- Labs 3D/Fly stays ON for testing (unchanged).
- Every page footer: "How we got this ›" left; the right side is the page's safety line.

## SECTION 0 · Plan a shoot never pops up (bug, first)
Jwilly still sees the planner open on the map after SIMPLE-1 S0.
1. Find the path SIMPLE-1 missed: walk every route into the map (home tile, dock Map button, back from each page, search pick, deep link, reload while on the map, returning from Viewfinder/3D/Fly, and an old saved state in local storage).
2. The planner opens **only** from ☰ › Plan a shoot and from the "Plan a shoot ›" / "Plan ›" buttons (Drone Preflight, Sky Night moments).
3. Test: open the map 10 ways → no sheet. Add an audit so this can't come back.

## SECTION 1 · One page skeleton (build first, everything uses it)
A shared `<TapInPage>` (mockups Page_*):
- **Header:** back ‹ + title + "<spot> · now".
- **Optional pill tabs** (the same pill component as today). Swipe between tabs. A page opens on its "should I go?" tab.
- **Hero:** an eyebrow (e.g. "NOW · POOR"), one big value, one sub line.
- **One chart card**, then a **rows card** (label left, value + detail right, ≤ 5 rows) with "More details ›" last. Everything advanced goes behind More details (the existing detail screens, unchanged).
- Optional action buttons.
- **Footer:** "How we got this ›" + the safety line.
- Shared pieces, so numbers never disagree: **one tide curve** component (Surf strip, Fish chart, Tide page), **one wind bar** (Wind_Bar_7), **one moon drawing** (real phase, waxing lit on the right, waning on the left).
- Fits 390×664 without covering anything; scrolls if it needs to.

## SECTION 2 · Home (Home_P_Surf / Home_P_Shoot / Home_P_Fish)
1. **First-run picker:** "What do you do outside?" Surf · Shoot · Fish · Drone · Just weather. Store it on the phone; change it in Settings. It sets the tile order and which moments get the top card. Drone persona = the Surf order with Drone second. Just weather = the Shoot order.
2. **Header:** spot name ⌄ (opens spot search) + a small persona pill ("SURF FIRST").
3. **Moment card** (gold) at the top **only when something is worth it**: Sky Likely/Fire within 3 h, glassy coming within 12 h, a fish window starting within 2 h, a swell arriving, a big moonrise today. Otherwise the top is empty. Persona decides which moments win.
4. **Wide Weather tile:** temp + condition + H/L + a 6-hour strip + ›. Tap → Weather page.
5. **2×3 tiles:** each = label, value, one detail line, a mini picture (live: wind arrow points the real way, tide curve rising/falling, sky art matches the call) and ›. Order per persona as in the mockups; Fish swaps Drone for Water.
6. **Dock:** Map + ☰. Nothing else.
7. The home-fit audit passes at all 3 sizes.

## SECTION 3 · ☰ Menu (Home_Menu)
Plan a shoot · Best sky near me · Viewfinder · Calendar · Saved spots · Field report · Settings · About. Settings keeps Labs, Debug, the persona, units. Remove duplicate paths found in `docs/batches/simple-audit.md` (hide behind flags, don't delete).

## SECTION 4 · Tap-in pages
| Tile | Page | Tabs (opens on first) |
|---|---|---|
| Weather | Page_Weather | none |
| Surf | Surf_Now, Surf_Cams | Now · Week · Cams · Buoys |
| Sky (was Sunset) | Sky_Now, Sky_Tonight, Sky_Night | Now · Tonight · Tmrw AM · Night (opens on Tonight before sunset/sunrise, Now otherwise, Night after dark) |
| Tide | Page_Tide | none (Today; week behind More details) |
| Fish | Page_Fish | Today · Week |
| Drone | Drone_Preflight | Preflight · Wind · Airspace |
| Wind | opens the MAP (S5) | |

- **Surf Now:** size range, quality word, the glassy window highlighted on the bars, a thin tide strip under the bars (shared tide curve); rows Best · Tide · Swell · Water. Week = the existing week. Buoys = the existing buoys page in the skeleton.
- **Fish:** the tide curve is the chart, with the best window + tide turn marked; rows Moon · Pressure · Water · Wind. Keep the existing fish logic; if a "best window" isn't computed yet, show the tide turn + moonrise/moonset only and note it in the decisions doc (no invented windows).
- **Drone Preflight:** "N to check" headline, 8 green/amber rows (Airspace · Wind 400 ft · Gusts · Battery · Sunset · TFRs · Remote ID · Kp). Tapping Airspace → Airspace tab, Wind → Wind tab. Buttons "Get LAANC ›" and "Plan a shoot ›". Footer "Not official FAA · check LAANC". Wind and Airspace tabs = the SIMPLE-1 tabs.
- **Sky:**
  - **Now** = the sky now: one big live cam (S6) + a row of 4 more, then rows Clouds (observed, station + age) · Moving (direction/speed, clears ~time) · Rare light · Next.
  - **Tonight / Tmrw AM** = the call (one sky-call object) + a drawn sky picture from the computed state (deck height, gap direction, sun position) + rows Golden · Color · Blue hour · Moon + buttons "Best spot near me ›" (Best Sky page) and "Viewfinder ›". **No AI-made photos, ever.** No "looked like this before" for now.
  - **Night** = tonight's moon (drawn, % lit, rise/set + direction), a 14-night phase strip with FULL/NEW marked, **moment cards with Plan ›**: Big moonrise (full ±1 day rising within 45 min of sunset) and Moonset at sunrise (≥ 95% setting within 30 min of sunrise), then rows Next full · Next new · Darkest nights (new ±3 days) · Milky Way · Next shower.
  - The old Sun · Moon · Night page folds into Tonight + Night (flag it off).
  - **Check the moon math against a second ephemeris** (≤ 5 min). Fixture, Chic's Beach 36.92, −76.10: Thu 19 Nov moonrise 1:47 PM, set Fri 2:10 AM ~273°; full Tue 24 Nov 9:53 AM; moonrise Tue 24 4:41 PM ~57° with sunset 4:46 PM; Mon 23 moonset 6:57 AM ~296° with sunrise 6:54 AM; new Tue 8 Dec 7:51 PM.
- **Viewfinder** (Sky_Viewfinder): camera view with the sun path dots + times, a compass strip at the top, chips Sun · Moon · Milky Way. Reuse the existing viewfinder if there is one; camera only on the phone, nothing recorded or sent. If the camera is denied, show the compass-only version.

## SECTION 5 · Wind = the map (Wind_Map, Wind_Charts)
1. The Wind tile opens the map on the wind layer at now, with the marker on the spot.
2. A **Map | Charts** toggle at the top. Charts = 24 h bars with gust caps + the by-height grid + Station/Models rows (the existing wind page content in the skeleton).
3. The timeline bar = Wind_Bar_7 with Wind · Radar · Clouds chips.
4. **Radar and clouds: remove the sun/moon dashed lines** (Trey + Jwilly).
5. The marker readout sits beside the marker, never off-screen (flip left near the right edge).

## SECTION 6 · Cams (one list, tags)
1. **Research the sources first** and write them to `docs/sources-licenses.md`: VDOT 511 traffic cams, NC DOT, public beach/pier cams around VB, Outer Banks, Wilmington. For each: can we show the image/stream in the app (terms), or link out only. **No scraping, no Surfline/Surfchex embeds or logos (link out only).**
2. `src/data/cams.json`: id, name, lat/lon, source, **facing (degrees)**, tags (`sky` / `surf` / `road`), and `embed: true/false`. Hand-tag the VB-area cams (sky vs road-only, facing). Note how new cams get tagged in the decisions doc.
3. **Surf › Cams:** surf-tagged cams by distance, one big + list; pick one and it's remembered on the phone. Embeddable cams play in the app; the rest show "link out ↗".
4. **Sky › Now:** every cam tagged `sky` (traffic + surf cams). The big one = the best facing for the moment, computed in code: toward the sun azimuth within 90 min of sunrise/sunset, otherwise toward the observed cloud deck. "N road-only cams hidden · Show all".
5. No cam image is stored on our side; the phone loads it straight from the owner.

## SECTION 7 · FWS refuge layer (carried from SIMPLE-1)
Apply `docs/batches/section3-wip.patch` (FWS NWR boundaries FeatureServer, RSL_TYPE='NWR'; trim Alaska; fetched whole, no spot sent). Sheet line: "National Wildlife Refuge · drone use needs refuge permission". Test: a Suffolk point east of US-13 shows Great Dismal Swamp. If it fights you twice, revert and leave the patch.

## SECTION 8 · Domain (ONLY if scoutngo.com already serves the app)
Check `https://scoutngo.com`. If it serves this app: update the canonical URL, the PWA manifest `start_url`/`scope`, the privacy host list, the service worker scope, and the www → apex redirect. If it doesn't resolve to Vercel yet, skip this section and say so.

## FINAL REPORT (short)
- Per section: the commit + contact sheets.
- S0: the path that leaked the planner.
- S2: taps per task from a fresh install (surf now, tonight's color, can I fly, tide, plan a shoot, find a spot by name, by address). Target ≤ 3.
- S4: the moon fixture table (ours vs second ephemeris).
- S6: the cam source table (embed yes/no, terms link).
- Anything left undone.
