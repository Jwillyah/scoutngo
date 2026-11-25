/*
 * FLAGS: things that are cut from the screen but not deleted (Batch SIMPLE-1,
 * Section 1: "hide, don't delete"). Each is a const, off, with its code still
 * in the tree, so putting one back is changing one word. A flag is not a
 * setting: nothing reads it from the phone, and there is no UI for it.
 */

/**
 * The Drone page's Plan tab: turn back by, sun at 400 ft, sun in the lens,
 * lens fog, the flight-log import. OFF because the turn-back figure is not
 * verified (Jwilly, 18 Nov). With it off the tab is not drawn and no caller
 * can reach it: DronePage maps `plan` to Preflight (src/core/dronePage.ts
 * droneTabFor). It also carries the old "Preflight check" and "Plan the
 * flight" buttons, which come back with it.
 */
export const DRONE_PLAN_TAB = false

/**
 * The four one-line rows under the Wind tab's bars (Airspace · Battery · Sky ·
 * GPS). OFF: Airspace, Battery and Kp are Preflight's rows now, and the Wind
 * tab is the wind.
 */
export const DRONE_WIND_ROWS = false

/**
 * The Tide page's old body (Batch Pages, Batch N: the day's curve you can
 * scrub, four tiles, the mirror-morning list) as the page itself. OFF: the
 * Tide page is the tap-in skeleton now (Batch SIMPLE-2, Section 1, board
 * Page_Tide), and the old body is what "More details ›" opens, unchanged.
 * On, the old body opens first and there is no skeleton page.
 */
export const TIDE_PAGE_OLD_FIRST = false

/**
 * Batch SIMPLE-2, Section 0: the planner's other doors, the ones SIMPLE-1
 * kept beyond Menu › Plan a shoot and the explicit "Plan a shoot ›" / "Plan ›"
 * buttons: the map's Features › Plan a shoot tool, Now › Plan here, the
 * Viewfinder's "Set up a place". OFF: the map
 * is a map, and the planner opens from the Menu and the Plan buttons only
 * (src/lib/planner.ts). On, each of those taps opens it again.
 */
export const PLANNER_EXTRA_DOORS = false

/**
 * The Drone page's SIMPLE-1 layout (a swiped Wind · Airspace · Preflight
 * track with its own pill and a foot with two buttons). OFF: the Drone page is
 * the tap-in skeleton now (Batch SIMPLE-2, Section 4, board Drone_Preflight):
 * tabs Preflight · Wind · Airspace, opening on Preflight. The tab contents
 * are the same either way.
 */
export const DRONE_PAGE_OLD_LAYOUT = false

/**
 * The Weather page's old body (the hours strip, six tiles, the 7 days, the
 * radar strip, the marine line). OFF: the Weather page is the tap-in skeleton
 * now (Batch SIMPLE-2, Section 4, board Page_Weather), and the old body is what
 * "More details ›" opens, unchanged. On, the old body opens first.
 */
export const WEATHER_PAGE_OLD_FIRST = false

/**
 * The Surf page's old body (the headline, the day's range chart, the buoy
 * card, the cam link, the week, the field report) as the page itself. OFF:
 * the Surf page is the tap-in skeleton now (Batch SIMPLE-2, Section 4, boards
 * Surf_Now and Surf_Cams: tabs Now · Week · Cams · Buoys), and the old body is
 * what "More details ›" opens, unchanged. On, the old body opens first.
 */
export const SURF_PAGE_OLD_FIRST = false

/**
 * Batch SIMPLE-2, Section 2: the Batch M home (Today · Tomorrow · Week
 * pages, its cards with charts, the "Next:" line, the Radar / Viewfinder /
 * Preflight button). OFF: the home is the tile home (src/components/
 * TileHome.tsx, boards Home_P_*). On, the old home comes back unchanged.
 */
export const HOME_OLD = false

/**
 * Batch SIMPLE-2, Section 3: the menu's live cards (the spot, Weather, Surf,
 * Wind, Tide, Sky, Drone) and its Cams and Kit rows, each a second way to a
 * page the home's tiles open (docs/batches/simple-audit.md, section 3). OFF:
 * the menu is the eight rows of board Home_Menu (src/lib/menu.ts MENU_LIST).
 */
export const MENU_CARDS = false

/**
 * Batch SIMPLE-2, Section 2: Batch M's "pick any" activities (the sheet with
 * Continue and Settings' five toggles). OFF: one persona, one tap
 * (src/lib/persona.ts). On, the multi-pick sheet and toggles come back; they
 * write the persona's store (src/lib/activities.ts), the first pick leading.
 */
export const ACTIVITY_MULTI = false

/**
 * Batch SIMPLE-2, Section 4: the old Sun · Moon · Night page (Batch DRONE,
 * Section 4; src/components/SunMoonNightPage.tsx) as a page of its own. OFF:
 * it folds into the Sky page's Tonight and Night tabs (mockups Sky_Tonight,
 * Sky_Night), and a call that would open it opens Sky › Night instead. On,
 * the old page opens as before and Sky › Night's "More details ›" reaches it.
 */
export const SKY_SUN_MOON_NIGHT_PAGE = false

/**
 * Batch SIMPLE-2, Section 5 (boards Wind_Map, Wind_Charts): the Wind page v2
 * (src/components/WindPageV2.tsx: the compass dial, the next 12 hours, its
 * Data | Map toggle) as what Wind opens. OFF: Wind is the map, on the wind
 * layer at now with the marker on the spot, and Map | Charts at its top;
 * Charts is the tap-in skeleton (src/components/WindCharts.tsx), and the old
 * page is what its "More details ›" opens, unchanged. On, Wind opens the old
 * page first, as before.
 */
export const WIND_PAGE_OLD_FIRST = false

/**
 * Batch SIMPLE-3, Section 4 (board Day_Sheet): ☰ › Plan a shoot opens the Day
 * sheet (src/components/DaySheetPage.tsx), and its "Add positions ›" is the
 * planner, unchanged. OFF: Plan a shoot opens the planner directly, as before.
 */
export const DAY_SHEET_FIRST = true

/*
 * Batch SIMPLE-3, Section 3.2 (mockups Sky_Sunrise2, Sky_Sunset2): the Sky
 * page's Sunrise and Sunset tabs draw the sky scene (src/components/
 * SkyScene.tsx: every layer at its height, lit undersides, fog, water or
 * land). ON: SIMPLE-2's flat picture (src/components/SkyPicture.tsx) instead.
 */
export const SKY_PICTURE_FLAT = false
