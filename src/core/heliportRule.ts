/*
 * WHICH HELIPORT DOTS THE DRONE MAP DRAWS (Batch SIMPLE-1, Section 1). The FAA
 * lists every heliport in the country, and a zoomed-out map was a rash of
 * white dots. A dot is drawn within HELIPORT_NEAR_M of the marker, or at any
 * distance once the map is zoomed in to HELIPORT_ZOOM or past, where the dots
 * on screen are the ones you are looking at.
 */
export const HELIPORT_NEAR_M = 5 * 1609.344
export const HELIPORT_ZOOM = 11

export const heliportShown = (metresFromMarker: number, zoom: number): boolean => zoom >= HELIPORT_ZOOM || metresFromMarker <= HELIPORT_NEAR_M
