/*
 * THE LEGEND, FROM THE SERVICE RATHER THAN FROM MEMORY.
 *
 * A legend invented from recollection is a confident wrong answer about
 * somebody else's data, so none of the colours or temperatures here are
 * written down anywhere in this app. NASA GIBS publishes a machine readable
 * colour table per layer, linked from its own WMTS capabilities, and that is
 * what is parsed.
 *
 * WHAT IT SAYS, verified by fetching it: the infrared table is titled
 * "Infrared Brightness Temperature", its units are degrees Celsius, and it has
 * 239 entries whose ranges run from about -92C to about +57C. The coldest
 * entries are white and purple, warming through blue and green, which is why
 * the layer reads as purple, green, blue and white over a cold cloud top.
 *
 * THE VISIBLE BAND HAS NO COLOUR TABLE AND GIBS PUBLISHES NONE. Its layer
 * block in capabilities carries no colormap and no legend link at all, and its
 * tiles arrive as greyscale-plus-alpha PNG while the infrared arrives as RGBA.
 * That is not an omission: a visible band is reflectance, so brighter simply
 * means more sunlight came back, and there is no scale to key. The legend says
 * that rather than inventing a ramp for it.
 *
 * Parsing only. The fetch lives in src/lib/goesColormap.ts.
 */

export interface LegendStop {
  /** CSS colour, from the table's own rgb triple. */
  color: string
  /** Lower bound of this entry's range, in the table's units. */
  from: number
  /** Upper bound. */
  to: number
}

export interface GoesLegend {
  /** The table's own title, e.g. "Infrared Brightness Temperature". */
  title: string
  /** The table's own units, e.g. "°C". Empty when it declares none. */
  units: string
  /** Coldest first, as the table lists them. */
  stops: LegendStop[]
}

/** `(-92.1,-91.1]` and `[57.0,58.0)` both appear in the real table. */
function parseRange(text: string): { from: number; to: number } | null {
  const match = /^[[(]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*[\])]$/.exec(text.trim())
  if (match === null) return null
  const from = Number(match[1])
  const to = Number(match[2])
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null
}

/**
 * The legend from a GIBS ColorMap document.
 *
 * GIBS ships more than one ColorMap per file: the real one and a "No Data"
 * block. Only the block with usable numeric ranges is kept, and a transparent
 * entry is dropped because it is the absence of data rather than a value.
 *
 * Null when the document is not one of these, which is treated as "no legend
 * available" by the caller rather than as an error. A missing legend is a
 * missing legend; it must never become a made up one.
 */
export function parseGoesColormap(xml: string): GoesLegend | null {
  const blocks = xml.split(/<ColorMap[\s>]/).slice(1)
  for (const block of blocks) {
    const title = /title="([^"]*)"/.exec(block)?.[1] ?? ''
    if (/no\s*data/i.test(title)) continue
    const units = /units="([^"]*)"/.exec(block)?.[1] ?? ''

    const stops: LegendStop[] = []
    for (const entry of block.match(/<ColorMapEntry[^>]*>/g) ?? []) {
      if (/transparent="true"/.test(entry)) continue
      const rgb = /rgb="(\d+),(\d+),(\d+)"/.exec(entry)
      const range = /value="([^"]*)"/.exec(entry)
      if (rgb === null || range === null) continue
      const bounds = parseRange(range[1])
      if (bounds === null) continue
      stops.push({ color: `rgb(${rgb[1]},${rgb[2]},${rgb[3]})`, ...bounds })
    }

    if (stops.length > 1) return { title, units, stops }
  }
  return null
}

/**
 * The stops thinned to a handful, for a key that has to fit on a phone.
 *
 * Evenly spaced through the table rather than picked by hand, so the ramp
 * shown is the ramp served. The first and last are always kept, because the
 * ends of the scale are what the numbers either side of it mean.
 */
export function thinLegend(legend: GoesLegend, count = 7): LegendStop[] {
  const { stops } = legend
  if (stops.length <= count) return stops
  const out: LegendStop[] = []
  for (let i = 0; i < count; i++) {
    out.push(stops[Math.round((i * (stops.length - 1)) / (count - 1))])
  }
  return out
}

/**
 * What the greyscale visible band means, which is not a colour table.
 *
 * Stated as what the band IS rather than as a key, because GIBS publishes no
 * ramp for it and the app must not invent one.
 */
export const VISIBLE_LEGEND_NOTE =
  'Greyscale: brighter is more sunlight reflected back, so cloud and snow are white and water is dark. A visible band has no colour scale, and NASA GIBS publishes none for it.'
