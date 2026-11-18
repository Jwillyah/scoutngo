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
