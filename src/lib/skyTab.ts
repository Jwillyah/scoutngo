/*
 * What the map's Sky sheet shows (Batch Pages, Section 3): no tabs any more.
 * The Sky page is its own page (src/components/SkyPage.tsx), the Weather page
 * too, Special light is the Sky page's Rare light, and the calendar opens
 * from the Sky page. The sheet stays for two doors only: the Sky page's
 * "Color detail ›" (the colour clock, the log) and the home's Moon card
 * (the sun, the moon and the night as swipe pages).
 */
export type SkyTab = 'now' | 'fire'
