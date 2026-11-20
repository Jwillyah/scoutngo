# Batch SIMPLE-2: decisions

Each consequential call is listed with its options and the one picked. Jwilly can reverse any of them. Run started Thu 19 Nov 2026, 10:49 PM.

## Section 8: domain (checked first, it decides itself)

`https://scoutngo.com` answers 200 from GoDaddy's site builder (`Server: DPS/2.0.0`, IPs 76.223.105.230 and 13.248.243.5, both GoDaddy), not Vercel. **Skipped, as the batch says.** Nothing about the canonical URL, manifest, service worker scope or privacy host list was changed.

## Section 4 (moon math): checked against USNO

Our rise, set and bearing already agreed with USNO (22 events within 0.5 min, 16 bearings within 0.1°). The phase instant did not: a 6-hour grid put full moon 187 min late. Table and evidence: measurements/2026-11-19-moon-fixture.md.

- **Phase instant source.** Options: (a) refine suncalc (still 7–24 min off, it is a three-term moon); (b) promote the check-only `ephemeris2.ts`; (c) Meeus ch. 49 in its own module. **Picked (c)**, `src/core/moonPhases.ts`: the one source for full/new time and waxing/waning on the Night tab.
- **The batch's own fixture was off in places.** Mon 23 Nov moonset is 5:44 AM (USNO and ours), not 6:57 AM, so Mon 23 is *not* a "Moonset at sunrise"; Tue 24 is (sets 7:01 AM, sunrise 6:52 AM, 99.8% lit). Tue 24 is a Big moonrise (4:38 PM, 57°, sunset 4:49 PM).
- FULL/NEW marks fall on the venue-local date of the instant. Moment windows are symmetric (before or after sunset/sunrise). "Tonight" is yesterday's date before this morning's sunrise.
- **Darkest nights** = new ±3 days (the batch's rule); the old page's under-20%-lit rule goes with that page.
- **Milky Way** prints the computed next window (29 Jan 2027), not the mockup's "late Feb".
- **Left:** `skyEvents.ts moonTurningPoints` (planner's night pick, calendar) still uses the 6-hour grid; routing it through moonPhases.ts is a follow-up, not done here.

## Section 7: FWS refuge layer

The patch applied except two hunks (airspaceCard.ts CHECKED_DETAIL wording, DroneAirspace.tsx import), ported by hand.

- **Baked, not fetched.** `scripts/bake-refuges.mjs` → `src/data/refuges.ts`, a lazy chunk beside the parks data. The phone asks no new host, so no spot is sent and no gate fixture is needed. Cost: 2.28 MB (1.1 MB gzipped) in its own chunk, loaded only for airspace.
- **Alaska** kept at a coarser simplification (16 refuges, 0.002°), as the patch had it, rather than dropped.
- **Beyond the patch:** the Drone Preflight Airspace row counted special-use areas and parks only, so at a refuge it said nothing was marked. It now counts refuges and reads "A restricted area, park or wildlife refuge is over this point".
- **Left:** `aerialHero.ts` and `suggest.ts` still know parks only.

## Section 6: cams (sources, cams.json, the pick)

- **Sources and verdicts** are data, `data/cam-sources.json`, rendered into `docs/sources-licenses.md` ("Cam sources") by `scripts/write-sources-doc.ts`. Options: (a) a hand-written doc section the generator would wipe; (b) data the doc and cams.json both read. **Picked (b)**: one place says whether a source may be embedded.
- **Embed today: none.** VDOT's current terms are silent (its 2001 partner guideline asks for attribution, but it is for signed partners; SmarterRoads needs an account) → false. NCDOT's terms allow non-commercial, unaltered copies → true, but no NC traffic cam is in the list (DriveNC's camera list needs a developer key). Surfline/Surfchex false by rule; SkylineWebcams and EarthCam false by their terms; HDOnTap, piers, aggregators false because silent. So Surf › Cams and Sky › Now will be link-out rows until Jwilly asks VDOT (or signs SmarterRoads) or gets an NCDOT key. **Ask VDOT** is the one that unlocks in-app VB sky cams.
- **cams.json: generated, not a second source.** Options: (a) a hand-written cams.json duplicating positions/urls from coastCams.ts and vdotCams.ts; (b) cams.json replacing those two (rewrites the Surf page, CamsSheet, Home); (c) cams.json built from them plus the hand tags. **Picked (c)**, `scripts/build-cams.mjs`; `tests/camsJson.test.ts` fails when it is stale. 771 cams, 215 KB: load it lazily. The older `src/data/cams.ts` (CamList's upwind list) stays out.
- **Facing.** Beach cams keep the coast list's sea facing (`facingIs: "sea"`). VDOT cams: null, except `vdot-2298` "Toward Berkley Bridge" (bearing to the bridge cam, computed: 16°). No VB traffic cam has a cited lens direction, so at sunset no VB cam is recorded facing west and the big cam is the nearest, said as such (`bigWhy: "nearest"`).
- **Sky reach** is `CAM_MAX_KM` (15 km, the existing "someone else's sky" rule) by default; at Chic's Beach that is the three oceanfront cams. HRBT, Berkley, JRB and Willoughby are 18–23 km away. Option left for the UI owner: pass a larger `maxKm`. **Surf reach** 30 mi (docs/cams.md).
- **"Faces" means within 90°** of the line (`SKY_FACING_HALF_DEG`); beyond that the pick falls back to the nearest rather than calling a cam pointing away "toward the sun".
- **Added one cam:** Surfchex "Norfolk, VA" (Willoughby Marina sponsor), placed at Willoughby Harbor Marina from OpenStreetMap, sky only. The old `src/data/cams.ts` entry `surfchex-norfolk` sits at 36.85, −76.29 (downtown), which looks wrong; not touched here.
- **How new cams get tagged:** docs/cams.md, "Tagging a cam".

## Section 0: the planner

**The leaks** (WebKit, iPhone 13, HEAD ba30b8c; evidence in the run's scratchpad `s0/before/`):
1. First run with no saved place started in `setup`; picking a spot put the home over it and the mode stayed `setup`, so Escape or any page's Back uncovered the wizard.
2. The map's sheet raised by its handle (or left up when a card closed) showed the shoot card.
3. `/setup`, `/kit`, `/saved` opened the planner from the address.

- **How to stop it.** (a) one more reset in App; (b) an ask object only a tap can make, held in one View state. **Picked (b)** (`src/lib/planner.ts`): a reset covers only the paths someone remembers; a stored or URL value now cannot be an ask.
- **Doors kept:** Menu › Plan a shoot, Drone Preflight "Plan a shoot ›", Sky Night "Plan ›", Menu › Kit and Menu › Saved (their drawers live in setup; they are Menu taps). Behind `PLANNER_EXTRA_DOORS` (off): Features › Plan a shoot, Now › Plan this spot, Viewfinder "Set up a place" (with a place). A plan block's "fix this" is already inside the planner.
- **The raised sheet with nothing asked.** (a) pin it at the lowest stop (breaks ux-rule 5 and ~13 audits); (b) an empty sheet (rule 5); (c) the map's own Features card plus Save for offline. **Picked (c).**
- **Addresses** `/setup`, `/kit`, `/saved` land on the map: an address cannot carry a tap.

## Pushing

The batch says push after each piece. The auto-mode classifier refused the push step in this run, so **nothing was pushed**: every commit is local on main, for Jwilly to push.

## Flakes, not strikes

The moon piece's first gate failed `viewfinder` (could not find Menu › Kit in 30 s) and `gesture` (slow-flick timing) with the machine's load at 13.5 and four agents working. Both passed alone on the same tree (viewfinder 0 problems in 168 s; gesture 0 on its second run). Counted as flakes, re-gated.
