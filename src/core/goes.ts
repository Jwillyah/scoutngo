/*
 * WHAT THE SKY IS ACTUALLY DOING, from the satellite.
 *
 * WHY THIS IS NOT THE CLOUD FORECAST. src/core/cloud.ts samples a forecast
 * MODEL along the sightline, which answers "what is expected". This answers
 * something different and more immediate: what is there, observed, as a
 * picture. For a backlit cloud shot at sunrise the difference is the shoot.
 *
 * SERVED BY NASA GIBS, NOT BY THE IEM WMS IT USED TO USE. The IEM service
 * works and serves good tiles, but it ignores a TIME parameter entirely:
 * measured, GetMap for conus_ch13 returned a byte-identical PNG for TIME
 * unset, for today and for yesterday, and its capabilities declares no
 * dimension at all. It can only ever show the latest frame, so scrubbing
 * through time is impossible on it. GIBS declares a Time dimension at ten
 * minute steps with a months-deep archive, and tiles at different timestamps
 * really do differ. It also publishes a machine readable colour table, which
 * is the only honest way to draw a legend for somebody else's data: IEM's
 * GetLegendGraphic returns a 35x5 image of solid white.
 *
 * WHICH BAND, AND WHY IT DEPENDS ON THE SUN. Band 2 is visible red: the
 * sharpest picture of cloud there is, and BLACK before sunrise, because it
 * measures reflected sunlight. Band 13 is clean longwave infrared: it sees
 * cloud by its own temperature, so it works in the dark. A photographer
 * setting an alarm for blue hour needs the one that works in the dark, so the
 * band follows the sun rather than being a setting to remember.
 */

/** The GOES ABI bands this app uses. Named by what they are, not by number. */
export type GoesBand = 'visible' | 'infrared'

/** The GIBS layer identifiers, verbatim from its WMTS capabilities. */
export const GOES_LAYER: Record<GoesBand, string> = {
  visible: 'GOES-East_ABI_Band2_Red_Visible_1km',
  infrared: 'GOES-East_ABI_Band13_Clean_Infrared',
}

/**
 * The tile matrix set each layer is served in, also verbatim.
 *
 * The level in the name is the DEEPEST zoom that exists. Past it there are no
 * tiles and the map stretches the last ones it has, which is what made the
 * layer look broken close in.
 */
export const GOES_MATRIX_SET: Record<GoesBand, string> = {
  visible: 'GoogleMapsCompatible_Level7',
  infrared: 'GoogleMapsCompatible_Level6',
}

export const GOES_MAX_TILE_ZOOM: Record<GoesBand, number> = {
  visible: 7,
  infrared: 6,
}

/**
 * Ground sample distance at nadir, in metres.
 *
 * Band 2 is half a kilometre at source and GIBS serves it resampled to one
 * kilometre, which is what its layer name says. Band 13 is two kilometres.
 * These are the numbers the zoom threshold below is computed from, rather
 * than a zoom somebody picked by looking at it.
 */
export const GOES_GROUND_METERS: Record<GoesBand, number> = {
  visible: 1000,
  infrared: 2000,
}

export const GOES_BAND_LABEL: Record<GoesBand, string> = {
  visible: 'Visible',
  infrared: 'Infrared',
}

export const GOES_BAND_NOTE: Record<GoesBand, string> = {
  visible:
    'GOES-19 band 2, visible light at 1km. The sharpest view of cloud, and blank before sunrise.',
  infrared:
    'GOES-19 band 13, longwave infrared at 2km. Sees cloud by its temperature, so it works before sunrise.',
}

/**
 * The altitude below which the visible band has nothing to show.
 *
 * Band 2 measures reflected sunlight, so it fades out rather than switching
 * off: at a couple of degrees the terminator is across the frame and most of
 * it is already dark. Three degrees is where the picture stops being worth
 * looking at, which is a judgement, which is why it is named here.
 */
export const VISIBLE_USABLE_ABOVE_DEGREES = 3

export function goesBandFor(sunAltitudeDegrees: number): GoesBand {
  return sunAltitudeDegrees > VISIBLE_USABLE_ABOVE_DEGREES ? 'visible' : 'infrared'
}

/**
 * Both credits, because two parties did different things.
 *
 * NOAA NESDIS operates the satellite and publishes the data; NASA GIBS
 * reprojects it, archives it and serves the tiles. Naming one of them would be
 * wrong about who to thank and wrong about who to blame when the tiles stop.
 */
export const GOES_ATTRIBUTION =
  'GOES-19 imagery: NOAA NESDIS, served as tiles by NASA GIBS'

/** How often the CONUS sector is scanned, which bounds how fresh a frame is. */
export const GOES_SCAN_MINUTES = 5

/**
 * The step GIBS actually serves, from its Time dimension: PT10M.
 *
 * Coarser than the satellite's own five minute scan, which is a fact about the
 * archive rather than about GOES, and it is what frame timestamps have to be
 * snapped to.
 */
export const GOES_FRAME_STEP_MINUTES = 10

/*
 * WHEN THE LAYER STOPS CARRYING DETAIL.
 *
 * Measured at Virginia Beach, 36.85N, on a 390px screen: how many SCREEN
 * pixels one satellite pixel covers.
 *
 *   zoom  7    61 mi scale      IR 2px      the layer reads properly
 *   zoom  9    15 mi scale      IR 8px      still real detail
 *   zoom 13     1 mi scale      IR 131px    a third of the screen, one pixel
 *   zoom 16   627 ft scale      IR 1046px   2.7 screens, one pixel
 *
 * Which is exactly the reported symptom: at a 500ft scale bar one satellite
 * pixel covers the whole screen and the layer is a flat wash that looks
 * broken. The layer was fine; the zoom was wrong.
 *
 * So the threshold is computed from the band's ground sample distance and the
 * screen width, not chosen by looking at it.
 */

/** How much of the screen one satellite pixel may cover before it is a wash. */
export const WASH_SCREEN_SHARE = 0.25

/**
 * The deepest zoom at which this band still shows something.
 *
 * Above it, one satellite pixel covers more than WASH_SCREEN_SHARE of the
 * screen and there is nothing left to read.
 */
export function goesDetailZoom(
  band: GoesBand,
  latitudeDegrees: number,
  screenWidthPx: number,
): number {
  const circumference = 40_075_016.686 * Math.cos((latitudeDegrees * Math.PI) / 180)
  const covered = WASH_SCREEN_SHARE * Math.max(1, screenWidthPx)
  return Math.log2((circumference * covered) / (256 * GOES_GROUND_METERS[band]))
}

/** How many screen pixels one satellite pixel covers at this zoom. */
export function satellitePixelOnScreen(
  band: GoesBand,
  latitudeDegrees: number,
  zoom: number,
): number {
  const circumference = 40_075_016.686 * Math.cos((latitudeDegrees * Math.PI) / 180)
  const metresPerPixel = circumference / (256 * 2 ** zoom)
  return GOES_GROUND_METERS[band] / metresPerPixel
}

export interface ZoomAdvice {
  /** True when the layer still has detail to show at this zoom. */
  readable: boolean
  /** Zoom out to at least here. Null when nothing needs to change. */
  zoomOutTo: number | null
  /** What to say, or null when the layer is fine as it is. */
  message: string | null
}

/**
 * Whether to tell the shooter to zoom out, and by how much.
 *
 * Reports rather than acts: the map is not moved for them. Somebody looking at
 * a position close in has a reason to be there, and a layer quietly dragging
 * the camera would be worse than a flat tint.
 */
export function zoomAdvice(
  band: GoesBand,
  latitudeDegrees: number,
  screenWidthPx: number,
  zoom: number,
): ZoomAdvice {
  const limit = goesDetailZoom(band, latitudeDegrees, screenWidthPx)
  if (zoom <= limit) return { readable: true, zoomOutTo: null, message: null }

  const covered = satellitePixelOnScreen(band, latitudeDegrees, zoom)
  const screens = covered / Math.max(1, screenWidthPx)
  const howFar =
    screens >= 1
      ? `one ${GOES_BAND_LABEL[band].toLowerCase()} pixel covers ${
          screens < 1.6 ? 'the whole screen' : `${screens.toFixed(0)} screens`
        }`
      : `one ${GOES_BAND_LABEL[band].toLowerCase()} pixel covers ${Math.round(
          (covered / screenWidthPx) * 100,
        )}% of the screen`

  return {
    readable: false,
    zoomOutTo: Math.floor(limit),
    message: `Too close for the sky layer: ${howFar}. Zoom out to see cloud.`,
  }
}
