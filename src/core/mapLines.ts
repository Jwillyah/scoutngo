/*
 * THE SUN AND MOON LINES STEP ASIDE FOR A WEATHER LAYER (Batch SIMPLE-2,
 * Section 5.4; Trey and Jwilly, 19 Nov: the dashed sun and moon lines ran
 * through the radar and the clouds).
 *
 * Every line the map draws from the spot toward the sun or the moon goes
 * while a weather layer is on: the dashed axis through the pin (the sun's by
 * day, the moon's at night), the sun, shadow, sunrise and sunset rays, the
 * moon's rise and set (dashed) and where it is now, and their time pills.
 * The switch the shooter set is kept: the lines come back, as they were, when
 * the layer goes off.
 *
 * The tide is a layer of the bar with no paint on the map, but its bar is up
 * and the map is read for the water, so the lines step aside for it too.
 */
export type MapWeatherLayer = 'off' | 'radar' | 'wind' | 'clouds' | 'tide'

export function sunMoonLinesShown(layer: MapWeatherLayer): boolean {
  return layer === 'off'
}
