/*
 * The map's constants that screens without the map need (Batch Beach,
 * Section 4): kept out of src/components/MapView.tsx so that importing one
 * does not pull MapLibre into the first download. MapView re-exports them.
 */
export const ESRI_ATTRIBUTION = 'Tiles by Esri. Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'

/*
 * The zoom buildings start at.
 *
 * Below this a city is a grey smear and the Overpass query covers a box too
 * big to answer, so the layer stays empty rather than asking for something it
 * cannot draw.
 */
export const BUILDINGS_MIN_ZOOM = 15
