/*
 * WHAT THE SKY IS ACTUALLY DOING, from the satellite.
 *
 * WHY THIS IS NOT THE CLOUD FORECAST. src/core/cloud.ts samples a forecast
 * MODEL along the sightline, which answers "what is expected". This answers
 * something different and more immediate: what is there now, observed, as a
 * picture. For a backlit cloud shot at sunrise the difference is the shoot:
 * a model saying 40% mid cloud does not tell you whether there is a bank of it
 * sitting on the eastern horizon with a gap underneath.
 *
 * GOES-19 has been GOES-East since April 2025 and scans the CONUS sector every
 * five minutes. The imagery is public, keyless, and served as map tiles by the
 * Iowa Environmental Mesonet, which is what makes it usable here at all.
 *
 * WHICH BAND, AND WHY IT DEPENDS ON THE SUN. This is the part that matters for
 * this app's use. Band 2 is visible red: it is the sharpest picture of cloud
 * there is, at half a kilometre, and it is BLACK before sunrise because there
 * is no sunlight to reflect. Band 13 is clean longwave infrared: it sees cloud
 * by its own temperature, so it works in the dark, at two kilometres.
 *
 * A photographer setting an alarm for blue hour needs the one that works in
 * the dark. A photographer at a wedding at noon needs the sharp one. So the
 * band is chosen from the sun's altitude rather than being a setting to
 * remember, and the readout says which one is on screen and why.
 */

/** The GOES ABI bands this app uses. Named by what they are, not by number. */
export type GoesBand = 'visible' | 'infrared'

export const GOES_BAND_CHANNEL: Record<GoesBand, string> = {
  /* Band 2, 0.64um red. 0.5km, daylight only. */
  visible: 'conus_ch02',
  /* Band 13, 10.3um clean longwave IR. 2km, works in the dark. */
  infrared: 'conus_ch13',
}

export const GOES_BAND_LABEL: Record<GoesBand, string> = {
  visible: 'Visible',
  infrared: 'Infrared',
}

export const GOES_BAND_NOTE: Record<GoesBand, string> = {
  visible: 'GOES-19 band 2, visible light at 0.5km. The sharpest view of cloud, daylight only.',
  infrared:
    'GOES-19 band 13, longwave infrared at 2km. Sees cloud by its temperature, so it works before sunrise.',
}

/**
 * The altitude below which the visible band has nothing to show.
 *
 * Band 2 measures reflected sunlight, so it fades out as the sun sets rather
 * than switching off at zero: at a couple of degrees the terminator is across
 * the frame and most of it is already dark. Three degrees is where the picture
 * stops being worth looking at, which is a judgement, which is why it is a
 * named constant here rather than a number inside a condition.
 */
export const VISIBLE_USABLE_ABOVE_DEGREES = 3

/**
 * Which band to show, from where the sun is.
 *
 * Not a setting. The band that works is a function of the time of day, and
 * making the shooter remember to switch it is how somebody stares at a black
 * rectangle at 05:40 and concludes the feature is broken.
 */
export function goesBandFor(sunAltitudeDegrees: number): GoesBand {
  return sunAltitudeDegrees > VISIBLE_USABLE_ABOVE_DEGREES ? 'visible' : 'infrared'
}

/**
 * Both credits, because there are two parties and they did different things.
 *
 * NOAA NESDIS operates the satellite and publishes the data; the Iowa
 * Environmental Mesonet reprojects it and serves the tiles. Naming only one of
 * them would be wrong about who to thank and wrong about who to blame when the
 * tiles stop.
 */
export const GOES_ATTRIBUTION =
  'GOES-19 imagery: NOAA NESDIS, served as tiles by Iowa Environmental Mesonet'

/** How often the CONUS sector is scanned, which bounds how fresh a tile can be. */
export const GOES_SCAN_MINUTES = 5
