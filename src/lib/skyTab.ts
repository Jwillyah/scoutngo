/*
 * What the map's Sky sheet shows (Batch Pages, Section 3): no tabs any more.
 * The Sky page is its own page (src/components/SkyPage.tsx), the Weather page
 * too, Special light is the Sky page's Rare light, and the calendar opens
 * from the Sky page. The sheet stays for two doors only: the Sky page's
 * "Color detail ›" (the colour clock, the log) and the map's Golden chip
 * (the sun, the moon and the night as swipe pages, on the time bar's hour).
 * The home's Moon card and the Sky page's "Sun, moon, night ›" open the
 * Sun · Moon · Night page (src/components/SunMoonNightPage.tsx) since Batch
 * DRONE, Section 4.
 */
export type SkyTab = 'now' | 'fire'
