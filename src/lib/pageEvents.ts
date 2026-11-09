/*
 * THE PAGES' DOORS AS EVENTS: a screen asks App (or the map) to open
 * something it does not own.
 */
/** The radar on the map, at a scan time (Batch K; the home, the Weather page). */
export const OPEN_RADAR_EVENT = 'scoutngo:open-radar'
/** Batch Pages, Section 2: the Weather page is its own page; App opens it. */
export const OPEN_WEATHER_EVENT = 'scoutngo:open-weather'
/** Batch Pages, Section 3: the Sky page is its own page; the map's sky chips ask App to open it. */
export const OPEN_SKY_EVENT = 'scoutngo:open-sky'
