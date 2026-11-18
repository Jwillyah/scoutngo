# SIMPLE-1, Section 6: the "too much" audit

For the mockups. Facts only; no UI was changed. Jwilly's friend took 20 minutes to find their way around; this is what the app asks of someone at 390 x 844.

Every number here comes from one measurement run on the current build (`dist-audit`, the working copy as of 18 Nov). Raw data, scripts and screenshots: `/private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/simple/audit6/` (`screens.json`, `walk.json`, `walk2.json`, `numeric.json`, `smalls.json`, `evening.json`; scripts `lib2.mjs`, `screens.mjs`, `run.mjs`, `walk.mjs`, `walk2.mjs`, `table.mjs`; screenshots in `shots/`).

## How it was measured

- WebKit, iPhone 13 profile, 390 x 844, browser tab (not standalone), served from the repo's fixture server on :5290 behind the fixture proxy on :5291. No live host was reached.
- Clock fixed at **Fri 30 Oct 2026, 7:30 AM EDT**, the day the fixtures answer for. (A first try with the clock on 8 Nov showed dashes everywhere because the fixtures have no forecast for that day; those numbers were discarded.)
- Home state for every "from Home" screen: the one a new user ends with after the real first run (Landing > search "Virginia Beach" > Virginia Beach Pier > "Not now" on the activity picker), saved as `base.json`. So no activities are picked, and Home shows six cards (surf, wind, tide, sky, drone, moon). Someone who picks activities sees fewer.
- Each screen was opened from a fresh load by real taps (the tap list is in `screens.mjs`), then measured after 3 s.
- **"Visible"** = not `display:none`, `visibility:hidden`, `opacity:0`, `hidden`; box has size; and its box intersects the screen (**first view**, the 390 x 844 viewport) or, for the **whole scroll** figures, any vertical position inside the screen's own layer (horizontal off-screen panes, like Home's Tomorrow and Week, are not counted).
- **Which layer is "the screen"**: the highest z-index full-screen `position:fixed` child of `.shell` or `body`; if there is none (the map and Setup) the whole `.shell`, so map chrome and its sheet count together.
- **Selectors**
  - Text items: leaf elements (no child element with text) with non-empty `innerText`, not SVG.
  - Buttons: `button, [role=button], a[href], [role=tab]`.
  - Cards: `.hcard, .mcard, .dcard, .card2, .wtile, .rstrip__tile, .smn__card, .bsky__spotcard, .set2__card, .cal2__card, .judge`.
  - Rows: `.mrow, .set2__row, .spick__row, .kit-row, .kited__row, .smn__row, .bsky__row, .drp__row, .drp__pfrow, .hweek__row, .wiz__row, .more2__row, .feat3__row, .camsheet__list > li, .drep--row`.
  - Targets under 44 px: visible buttons (same selector) whose smaller side is under 44 px (UX rule 7).
- **Scroll length**: `scrollHeight / clientHeight` of the layer's scroller (the largest scrollable element in the layer that is on screen); when the layer itself is taller than its scroller, the layer's `scrollHeight / 844`. "1.0" means it does not scroll.
- **Cluttered score** = text items + 2 x buttons, in the first view (a button is a decision, so it counts double; cards and rows are shown but not added, because they only contain text and buttons already counted). The whole-scroll score is the same formula over everything on the page.
- Caveat on text counts: bare numerals count as text items. On the Drone tabs and Weather, most counted items are short numerals from grids (see the Findings; `numeric.json`).

## 1. Per screen, most cluttered first

Reached by = taps from Home (Menu counts as a tap), or from first launch for the first-run screens.

| # | Screen | Reached by | Text | Buttons | Cards | Rows | Score (first view) | Targets under 44 px | Scroll: scrollHeight / clientHeight (screens long) | Score (whole scroll) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Calendar | 2 from Home | 59 | 44 | 1 | 0 | **147** | 5 | 844 / 844 (1.0) | 147 |
| 2 | Drone › Airspace tab | 2 from Home | 99 | 11 | 0 | 0 | **121** | 3 | 844 / 844 (1.0) | 121 |
| 3 | Drone › Wind tab | 1 from Home | 73 | 6 | 2 | 6 | **85** | 3 | 844 / 844 (1.0) | 85 |
| 4 | Home · Today | 0 from Home | 43 | 16 | 6 | 0 | **75** | 6 | 844 / 844 (1.0) | 75 |
| 5 | Home · Tomorrow | 1 from Home | 44 | 15 | 6 | 0 | **74** | 5 | 844 / 844 (1.0) | 74 |
| 6 | Weather | 1 from Home | 62 | 6 | 12 | 0 | **74** | 0 | 844 / 844 (1.0) | 74 |
| 7 | Features / layers | 2 from Home | 27 | 23 | 1 | 5 | **73** | 6 | 844 / 844 (1.0) | 73 |
| 8 | Cams sheet | 2 from Home | 33 | 18 | 0 | 13 | **69** | 4 | 1760 / 530 (3.3) | 177 |
| 9 | Settings | 2 from Home | 34 | 17 | 3 | 11 | **68** | 14 | 2049 / 776 (2.6) | 144 |
| 10 | Menu | 1 from Home | 36 | 14 | 6 | 6 | **64** | 1 | 844 / 844 (1.0) | 64 |
| 11 | Sun · Moon · Night | 1 from Home | 51 | 6 | 2 | 3 | **63** | 3 | 899 / 790 (1.1) | 66 |
| 12 | Surf | 1 from Home | 42 | 9 | 5 | 1 | **60** | 0 | 844 / 844 (1.0) | 60 |
| 13 | Settings › How it works (the Alerts row: opens a note in place) | 3 from Home | 31 | 14 | 3 | 9 | **59** | 10 | 2199 / 776 (2.8) | 145 |
| 14 | Home · Week | 1 from Home | 40 | 8 | 0 | 7 | **56** | 4 | 844 / 844 (1.0) | 56 |
| 15 | Features › More | 3 from Home | 18 | 18 | 1 | 10 | **54** | 12 | 844 / 844 (1.0) | 61 |
| 16 | Wind | 1 from Home | 35 | 9 | 2 | 0 | **53** | 2 | 844 / 844 (1.0) | 53 |
| 17 | Map · sheet at half (handle tap) | 2 from Home | 20 | 15 | 0 | 0 | **50** | 4 | 844 / 844 (1.0) | 72 |
| 18 | Sky › Now | 2 from Home | 28 | 11 | 3 | 0 | **50** | 3 | 844 / 844 (1.0) | 50 |
| 19 | Setup 3 of 3 (Gear) | 4 from Home | 18 | 15 | 0 | 0 | **48** | 3 | 844 / 844 (1.0) | 48 |
| 20 | Sky (opens on This morning at 7:30 AM) | 1 from Home | 31 | 8 | 3 | 0 | **47** | 3 | 891 / 790 (1.1) | 56 |
| 21 | Sky › Tonight | 2 from Home | 31 | 8 | 3 | 0 | **47** | 3 | 891 / 790 (1.1) | 56 |
| 22 | Kit | 2 from Home | 26 | 10 | 0 | 7 | **46** | 2 | 1965 / 788 (2.5) | 154 |
| 23 | Settings › What leaves my phone (Privacy) | 3 from Home | 40 | 1 | 0 | 0 | **42** | 0 | 6648 / 844 (7.9) | 201 |
| 24 | Tides | 1 from Home | 25 | 8 | 6 | 0 | **41** | 0 | 844 / 844 (1.0) | 41 |
| 25 | Buoys | 2 from Home | 27 | 7 | 1 | 0 | **41** | 0 | 844 / 844 (1.0) | 41 |
| 26 | Map · sheet at peek | 1 from Home | 14 | 13 | 0 | 0 | **40** | 5 | 844 / 844 (1.0) | 40 |
| 27 | Best Sky | 2 from Home | 14 | 13 | 0 | 0 | **40** | 6 | 844 / 844 (1.0) | 40 |
| 28 | Radar (map, rain layer) | 1 from Home | 14 | 13 | 0 | 0 | **40** | 5 | 844 / 844 (1.0) | 40 |
| 29 | Map after Setup (plan made) | 5 from Home | 14 | 13 | 0 | 0 | **40** | 5 | 844 / 844 (1.0) | 40 |
| 30 | Drone › Preflight tab | 2 from Home | 19 | 9 | 0 | 8 | **37** | 3 | 844 / 844 (1.0) | 37 |
| 31 | Setup 2 of 3 (When) | 3 from Home | 14 | 11 | 0 | 0 | **36** | 1 | 844 / 844 (1.0) | 36 |
| 32 | Settings › Data & credits | 3 from Home | 25 | 5 | 0 | 0 | **35** | 4 | 4144 / 420 (9.9) | 177 |
| 33 | Map › Skyline | 3 from Home | 14 | 10 | 0 | 0 | **34** | 4 | 844 / 844 (1.0) | 34 |
| 34 | Landing | first launch | 28 | 3 | 0 | 0 | **34** | 1 | 844 / 844 (1.0) | 34 |
| 35 | Settings › More | 3 from Home | 23 | 5 | 3 | 3 | **33** | 0 | 1634 / 776 (2.1) | 87 |
| 36 | Spot picker, first run, "Virginia Beach" typed | 1 + type | 15 | 8 | 0 | 3 | **31** | 4 | 844 / 844 (1.0) | 31 |
| 37 | Activity picker (What do you do outside?) | 3 from first launch | 15 | 7 | 0 | 0 | **29** | 0 | 844 / 844 (1.0) | 29 |
| 38 | Saved | 2 from Home | 16 | 6 | 0 | 0 | **28** | 5 | 844 / 844 (1.0) | 28 |
| 39 | Settings › About | 3 from Home | 17 | 5 | 0 | 0 | **27** | 0 | 844 / 844 (1.0) | 27 |
| 40 | Spot picker (from Home) | 1 from Home | 13 | 6 | 0 | 4 | **25** | 0 | 844 / 844 (1.0) | 25 |
| 41 | Spot picker, address typed (geocoder answer mocked) | 1 + type (mock) | 11 | 6 | 0 | 1 | **23** | 4 | 844 / 844 (1.0) | 23 |
| 42 | Setup (Plan a shoot) | 2 from Home | 8 | 7 | 0 | 1 | **22** | 1 | 844 / 844 (1.0) | 22 |
| 43 | Spot picker, first run (empty) | 1 from first launch | 7 | 4 | 0 | 0 | **15** | 3 | 844 / 844 (1.0) | 15 |
| 44 | Viewfinder | 3 from Home | 4 | 2 | 0 | 0 | **8** | 0 | 844 / 844 (1.0) | 8 |

Not in the table because I did not open them: Debug, the Exposure page, Field mode (no tap path found, see section 3), the Now screen, the Call sheet, Terrain light, Light map, Moonrise, the map's Hazards and Airspace cards, Near you, the HowPage, Offline areas, the Buoys page when there is no surf place.

### What the numbers say

1. **Calendar** is first because of the month grid (44 buttons: the day cells and the filter chips; five chips are visible). It does not scroll.
2. **The Drone tabs carry the most text.** Airspace has 99 text items, 85 of them bare numerals (the 250/150 ft grid labels); Wind has 73, 52 numerals (the hour and height grids) (`numeric.json`). Their verdict is the one line the pilot needs: "Class D · ceiling 250 ft · LAANC needed" (on the Preflight tab, 19 text items, 9 buttons).
3. **Home** has 16 buttons and 43 text items in one screen, and does not scroll. Four of its buttons open the same Weather page (temperature, the condition line, the 8-hour strip; Home.tsx lines 426, 430, 441, 450 route to `onOpen('weather')`). The Sky card and the "Color now" button open the same Sky page (lines 421 and the card). Six of its 16 buttons are under 44 px: the spot name (169 x 28), the three day dots (24 x 24 each), the "Color now" line (229 x 14) and the condition line (177 x 20) (`smalls.json`).
4. **Features / layers** has 23 buttons in the first view: 5 weather tiles, 4 toggles, a "More" row that adds 10 rows, 3 map styles, 4 tools. One tool, "Plan a shoot", sits at the bottom and opens the Setup wizard.
5. **Long scrolls**: Privacy 7.9 screens, Data & credits 9.9 panel-heights (a 420 px panel over the map), Cams sheet 3.3, Settings 2.6, Kit 2.5.
6. **Menu** is 14 buttons and 36 text items; `docs/ux-rules.md` rule 24 says max 7 top items. It is: the spot name (the home), a close, six cards (weather, surf, wind, tide, sky, drone; fewer when activities are picked, from `menuCardList`) and six rows (Plan a shoot, Calendar, Cams, Kit, Saved, Settings). Each of the six cards opens a page Home already opens.
7. **The day dots** (Today / Tomorrow / Week) are 24 x 24 px; the pages also swipe.

## 2. The task walk

**Start state for every task:** first launch, nothing stored (a new browser context), online, location never asked, WebKit 390 x 844, clock Fri 30 Oct 2026 7:30 AM. Common first run, 4 taps to reach Home: (1) Landing "Open ScoutNGo", (2) tap the search box (it does not open focused; checked `document.activeElement`), type "Virginia Beach", (3) tap "Virginia Beach Pier", (4) "Not now" on "What do you do outside?". Typing is not counted as a tap. Walk logs: `walk.json`, `walk2.json`.

| Task | Taps from first launch | Tap path (typing not counted) | Over 3? | Taps if the app is already set up (from Home) |
|---|---|---|---|---|
| Check surf now | **5** | Open > search box > Virginia Beach Pier > Not now > Surf card. The Surf card on Home already shows "Small 1-2 ft" after tap 4. | Yes | 1 |
| See tonight's color | **6** | Open > search box > pier > Not now > Sky page (7:30 AM: the "Color now" line; 4:30 PM: the Sky card, which opens on **Now**) > **Tonight** tab. The Home Sky card shows "Possible set 6:08 PM" after tap 4. | Yes | 2 |
| Same, from the Landing's "Where's the color tonight?" card | 3 | Color card > search box > pier. This opens **Best Sky** (the best spot nearby), not tonight's color at the current spot, and the activity picker is left open underneath it (in my first walk attempt Best Sky's footer intercepted a tap on the picker's "Not now"; that error output was not saved to a file). | No | n/a |
| Check if I can fly the drone here | **6** | Open > search box > pier > Not now > Drone card > **Airspace** tab ("Class D · max 250 ft here") or **Preflight** tab (first row "Airspace · Class D · ceiling 250 ft · LAANC needed"). The Drone card itself says only wind ("Steady, 8 kt at 400 ft"). | Yes | 2 |
| See the tide | **5** | Open > search box > pier > Not now > Tide card. The Tide card on Home already shows "High 11:25 AM, rising" after tap 4. | Yes | 1 |
| Plan a shoot (all defaults) | **9** | Open > search box > pier > Not now > Menu > Plan a shoot > Next > Next > Done. Ends on the map at peek; nothing about the plan is visible until the sheet is pulled up. | Yes | 5 |
| Find a spot by name | **4** | Open > search box > (type "Rudee") > Rudee Inlet > Not now. | Yes | 3 (spot name > search box > result) |
| Find a spot by address | **4** | Open > search box > (type "425 E Pinner St, Suffolk") > "425 East Pinner Street, Suffolk, VA" > Not now. The geocoder answer was mocked in the browser (one Photon house), since the gate fixtures return none. | Yes | 3 |

Findings:
- **Every task is over 3 taps from first launch except the Landing's color card.** The first run alone costs 4 taps: three screens (Landing, "Where do you go?", "What do you do outside?") before Home.
- Of those 4, one is the **search box tap**: the field is not focused when the picker opens, from first launch and from Home. (Not measured: whether a programmatic focus would raise the keyboard on an iPhone.)
- "Not now" and "Continue" on the activity picker: the 5-option picker plus "Continue" would be 2 more taps than "Not now" (select, Continue); not walked.
- **Tonight's color** is one extra tap in both cases I measured: at 7:30 AM the Sky page opens on "This morning"; at 4:30 PM (`evening.json`) it opens on "Now"; "Tonight" is a tab away. There is no "Color now" line on Home at 4:30 PM (there it is only the Sky card).
- **Drone** answers "can I fly" two taps in; Home's drone card answers only the wind.
- **Plan a shoot** is Menu, then a 3-screen wizard (Where, When, Gear) whose defaults are already right for most visits (current spot, Now, both ground and air).
- Two more ways to find a spot exist besides the picker: the Setup wizard's top bar has its own "Search a spot or place" box, and the map's "Find a spot" pill opens the picker (measured, section 3).

## 3. Every screen, and every way to reach it

Sources: App.tsx (`onMenuTarget`, `onMenuPick`, `homeOpen`, the `*Open` state), Menu.tsx, Home.tsx, PlanMode.tsx (chips, rail, Features sheet, `CardMore` links, `openChip`), DronePage.tsx (`droneTabs`), SettingsPage.tsx, Landing.tsx. **T** = I tapped it in the browser and it opened that screen; **C** = read from code only.

| Screen | Ways in |
|---|---|
| **Landing** | First launch (T). Settings > Debug > "Show the home page" (C). |
| **HowPage** (`/how`) | The URL `/how`; Settings > Debug > "How it works" (C). No visible link on the Landing's cover (3 buttons). |
| **Privacy page** | Landing "Privacy" (C); Settings > "What leaves my phone" (T); Settings > More > "Clear this phone" (C). |
| **Spot picker** | Landing "Open ScoutNGo" (T); Landing "Where's the color tonight?" (T); Home spot name (T); map "Find a spot" pill (T). A second search box sits in the Setup wizard's top bar (seen in the Setup screenshot and button dump). |
| **Activity picker** | After the first spot is chosen (T). Settings > "What I do" has the same five choices as toggles (seen in the Settings screenshot). |
| **Home** (Today / Tomorrow / Week) | After the first run (T); Menu > the spot name (C, "the home"); Back from any page that was opened from Home (`pageFromHome`); dots or swipe between the three (T). |
| **Menu** | Home > hamburger (T); the Setup wizard's top-bar hamburger (C: `onMenu`, seen in the screen). |
| **Map** (plan mode) | Home > map button (T); Home > Radar button (T, same map); "Open the map" button on every page (ppage__map, T on Tide/Wind/Sky/Weather); Setup "Done" (T); Menu rows that open map cards (Calendar and others, C). |
| **Map sheets** | Handle tap > shoot card at half (T); the four chips (T) below; the rail's Features button (T); Features > "More" (T); Features tools: Viewfinder, Measure, Skyline (T), Plan a shoot (T); airspace / hazards / light map / cams / moonrise / sun curve / call sheet cards via `CardMore` rows and the Features tiles (C). |
| **Map chips** | Light chip > the sky "Now" sheet (half) (T). Wind chip > Wind page (T). Sky/cloud chip > Sky page (T). Tide chip > Tide page (T). |
| **Weather page** | Home temperature, condition line, 8-hour strip, weather tile (C: four buttons, Home.tsx); Menu > Weather card (C); Home temperature (T). |
| **Sky page** (tabs Now / This morning or Tonight / Tomorrow morning) | Home "Color now" line (T, only some hours); Home Sky card (T); Menu > Sky card (C); map Cloud chip (T). |
| **Sky > Sun, Moon, Night** | Home Moon card (T); Sky page "Sun, moon, night ›" (C). |
| **Best Sky** | Sky page "Where's the color nearby? ›" (T); Home "better" link (C, `hnext--better`); Landing color card (T). |
| **Color detail** (map sky card) | Sky page "Color detail ›" (C). |
| **Surf** | Home Surf card (T); Menu > Surf (Water) card (C); tab bar on Tide, Wind, Buoys (T). |
| **Tides** | Home Tide card (T); map Tide chip (T); Menu Tide card (C); tab bar (T). |
| **Wind** | Home Wind card (T); map Wind chip (T); Menu Wind card (C); tab bar (T). |
| **Buoys** | Tab bar only, on Surf/Tide/Wind (T). Only at a surf place (code: `groups.surf`). |
| **Drone page** (tabs Wind, Airspace, Preflight; Plan only if a flag is on) | Home Drone card (T); Menu > Drone card (C); Home primary button reads "Preflight" for a drone-only user (C). Preflight links out: "Plan a shoot ›", Fly, Map (C). |
| **Calendar** | Menu > Calendar (T); Home Week > "See the month" (C); Sky page "Calendar ›" (C). |
| **Settings** (and More, About, Debug, Data & credits, Privacy, Kit) | Menu > Settings (T). Inside: More (T), About (T), Data & credits (T), Privacy (T), Debug (C), Camera + lenses and Drone rows open Kit (C). |
| **Setup wizard** (Where, When, Gear) | Menu > Plan a shoot (T); Features > Plan a shoot (T); Drone Preflight > "Plan a shoot ›" (C). |
| **Kit** (drawer) | Menu > Kit (T); Settings > Camera + lenses / Drone (C); the wizard's "Edit kit" (C). |
| **Saved** (drawer) | Menu > Saved (T). |
| **Cams** | Menu > Cams (T); map "Sky cameras near here" rows (C). |
| **Viewfinder** | Home primary button (when Shoot is picked or nothing is) (C); Features > Viewfinder (T); Sky page button (C). |
| **Radar** | Home "Radar" button (T, opens the map); Weather page radar (C); Features > Rain tile (C). |
| **Exposure page** | Setup's `onOpenExposure` button (App.tsx, C). |
| **Field mode** | `onGoToField` is passed to PlanMode but not used there; I found no tap path (C). |
| **Now screen** | A sky card's `onOpenNow` (C). |

Counts of the same page reached more than one way (T or C): Weather 5, Sky 4, Surf 2 + tabs, Tides 3 + tabs, Wind 3 + tabs, Spot search 3 different boxes, Plan a shoot 3 doors, Kit 3 doors, Calendar 3 doors, Map 4 or more.

## 4. Cut list proposal (nothing was changed)

Rule of thumb used: keep the verdict and the one picture; move the second-level data, the toggles and the infrequent pages behind a single "More".

**Menu** (14 buttons, 6 cards, 6 rows; rule 24 says 7)
- Keep, as the seven: Today, Map, Sky, Water (Surf, Tide, Wind, Buoys as segments of one page), Fly, Plan a shoot, More.
- Behind "More": Calendar, Cams, Kit, Saved, Settings (with About, How it works, Privacy, Credits), Weather.
- Drop the cards from the Menu (Home already shows them); keep the Menu as seven rows.

**Home** (16 buttons, 43 text, 6 cards)
- One weather button (temperature and condition together); drop the separate 8-hour strip and weather-tile buttons.
- One tonight/sky card, not "Color now" plus the Sky card.
- Show at most three cards, the ones for the activities picked; "Not now" users get Surf, Sky, Drone, not six.
- Tomorrow and Week by swipe only; or make the dots 44 px.
- "Color now" and the condition line are 14 and 20 px tall: make them rows or cards, not lines.

**First run** (4 taps)
- Drop the "What do you do outside?" step from the first run (ask later, from Settings), saving 1 tap.
- Open the search box focused (needs an iPhone check), saving 1.
- Fold Landing and "Where do you go?" into one screen: search box and "Use my location" under the headline. Then first run is 2 taps (type, pick).
- Keep the Landing's color card as an entry, but tell the user it goes to Best Sky and clear the hidden picker.

**Spot finding** (three boxes): keep the picker only; remove the Setup wizard's own search box and the second map pill route.

**Setup wizard**: "Plan a shoot" as one tap: Menu > Plan a shoot > map with the defaults (current spot, now, both), with "Change" for Where, When, Gear. Today 5 taps from Home to a map at peek.

**Map**
- Peek: 13 buttons. Keep Back, spot, locate, time strip and the Features button; fold the four chips into one line; hide compass and 3D behind Features.
- Features (23 buttons): keep Weather tiles (Off, Rain, Wind, Clouds, Tide) and Satellite/Map; move Lightning, Warnings, Sun/moon lines, Airspace, Measure, Skyline, Plan a shoot and 3D behind "More" (which already holds 10 rows).

**Pages with tabs**
- Surf, Tide, Wind, Buoys: one "Water" page with segments.
- Sky: today it has 3 tabs plus 6 links ("Where's the color nearby?", Viewfinder, Calendar, Color detail, Sun moon night, How we got this). Keep the verdict, the tab (Now / Tonight) and Best Sky; put the rest behind "More".
- Drone: put the verdict ("Can I fly here") first, then wind and airspace as one line each; the hour grid, the height grid and the 250/150 ft map labels (52 and 85 numerals) behind "Details".
- Weather: keep temperature, the hours and rain; put UV, humidity, pressure and cloud tiles behind "More" (12 cards, 62 text items now).
- Calendar: filters behind one button (5 chips today).

**Settings** (2.6 screens long, 17 buttons in the first view, 14 under 44 px)
- Keep: What I do, Home spot, Units.
- Behind "More": Alerts (3 toggles and a segment), Labs, backup, privacy, credits, About, Debug.

**Long lists**: Cams sheet (40 rows, 3.3 screens) shows the nearest 3, then "More"; Privacy and Credits (7.9 and 9.9 screens) get a summary with the full text behind it; Kit (2.5 screens) keeps bodies and lenses, with "Shelved" and the rest behind "More".

**Targets under 44 px** (rule 7): the Home dots (24), the Home spot name (28 high) and the two lines above; the map chips are 40 high; Settings has 14 in the first view.

## What I could not measure

- Real-iPhone behaviour: keyboard on focus, standalone mode (this was the browser tab only), Android.
- "Use my location once" and the OS permission prompt (not walked; nothing is stored in the fixture world).
- The address result is a mocked Photon answer (the live geocoders were not called, and the gate fixtures return nothing); the tap count is real, the row text is the mock's.
- Screens listed under the table as not opened; paths marked C in section 3 were read from code, not tapped.
- The activity-picker "pick then Continue" path, and Home with activities picked (one to three cards).
- All counts are at one clock (7:30 AM, 30 Oct 2026) with fixture data: text counts move a little with the data (a missing value shows a dash, which still counts as a text item).
