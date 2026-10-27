/*
 * HOW TALL A BUILDING IS, FROM WHAT OSM ACTUALLY CARRIES.
 *
 * THE HEIGHTS ARE THE POINT, NOT THE LOOK. These extrude into grey boxes and
 * that is all they will ever be visually. The reason they are worth having is
 * that a height is the same input two things already in this app need and
 * currently guess at:
 *
 *   SHADOW CASTING. A 40m building and a 4m one throw shadows that differ by
 *   an order of magnitude, and the app currently draws a shadow BEARING with
 *   no length attached to any real obstruction.
 *
 *   SIGHTLINE BLOCKING. src/core/sightline.ts asks whether something stands
 *   between a position and the subject, and has only power lines with no
 *   height to work with.
 *
 * So the parsed height is stored as data in its own right, and the renderer is
 * one consumer of it rather than the owner. That is why this is a core module
 * and not a paint expression.
 *
 * WHAT OSM CARRIES, IN THE ORDER IT IS TRUSTED.
 *
 *   height            metres, sometimes with a unit, occasionally in feet
 *   building:levels   storeys, which need a metres-per-level assumption
 *   nothing           which is most buildings, and stays null
 *
 * NULL IS NOT ZERO AND NOT A DEFAULT. A building with no height tag is a
 * building whose height nobody recorded. Giving it a nominal 10m would put an
 * invented obstruction into a sightline check, which is the same class of
 * error as a default subject width or an assumed wind speed. It is drawn at a
 * stated nominal height for the PICTURE and carries null for the ARITHMETIC,
 * and those are deliberately two different values.
 */

/** Metres per storey, for building:levels. */
export const METRES_PER_LEVEL = 3

/**
 * What a footprint is drawn at when OSM gave no height.
 *
 * FOR THE PICTURE ONLY. Nothing geometric may read this: a box has to be some
 * height to be a box. parseBuildingHeight returns null for these and that null
 * is what the shadow and sightline work must use.
 */
export const NOMINAL_DRAW_HEIGHT = 8

export interface BuildingTags {
  height?: string
  'building:levels'?: string
  min_height?: string
  'building:min_level'?: string
}

const FEET_PER_METRE = 3.28084

/**
 * Parse an OSM height value into metres.
 *
 * OSM's own spec says bare numbers are metres, and the wild data contains
 * "12", "12 m", "12m", "40 ft", "39'" and plenty that is not a number at all.
 * Anything unparseable is null rather than coerced: a building of height NaN
 * drawn as a box is a box of unknown size claiming to be known.
 */
export function parseHeightMetres(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const text = raw.trim().toLowerCase()
  if (text === '') return null

  /* Feet, either "40 ft" or the surveyor's apostrophe. */
  const feet = /^(-?\d+(?:\.\d+)?)\s*(?:ft|feet|')$/.exec(text)
  if (feet !== null) {
    const value = Number.parseFloat(feet[1]) / FEET_PER_METRE
    return Number.isFinite(value) && value > 0 ? value : null
  }

  const metres = /^(-?\d+(?:\.\d+)?)\s*(?:m|metres|meters)?$/.exec(text)
  if (metres !== null) {
    const value = Number.parseFloat(metres[1])
    return Number.isFinite(value) && value > 0 ? value : null
  }
  return null
}

export interface BuildingHeight {
  /**
   * Metres, or NULL when OSM did not say.
   *
   * This is the value the shadow and sightline work must read. It is never
   * filled in with a guess.
   */
  metres: number | null
  /**
   * Where it came from, so a readout can say how much to trust it. 'tile':
   * OpenStreetMap's height or storeys as the map tiles carry it, rounded to
   * whole metres, the two no longer told apart (tileBuildingHeight).
   * 'lidar': measured from the venue's downloaded scan (src/lib/lidar/applyScan.ts),
   * in the year `scanYear`.
   */
  source: 'height' | 'levels' | 'tile' | 'lidar' | 'overture' | 'unknown'
  /** For an 'overture' height, whose it is (Esri Community Maps). */
  overtureSource?: string
  /** The scan's acquisition year, for a 'lidar' height, or for a footprint newer than the scan. */
  scanYear?: number | null
  /** A footprint inside the scan with no building points in it: built since, or not a building then. */
  newerThanScan?: boolean
  /** What to extrude for the picture. Never null, and never geometric truth. */
  drawMetres: number
  /** Metres the footprint starts at, for a building on a podium. */
  baseMetres: number
}

export function parseBuildingHeight(tags: BuildingTags): BuildingHeight {
  const direct = parseHeightMetres(tags.height)
  if (direct !== null) {
    return {
      metres: direct,
      source: 'height',
      drawMetres: direct,
      baseMetres: parseHeightMetres(tags.min_height) ?? 0,
    }
  }

  const levels = Number.parseFloat(tags['building:levels'] ?? '')
  if (Number.isFinite(levels) && levels > 0) {
    const metres = levels * METRES_PER_LEVEL
    /*
     * MARKED AS 'levels' RATHER THAN 'height', because three metres a storey
     * is an assumption and a reader deciding whether a ridge line clears a
     * roof deserves to know which of the two numbers they are looking at.
     */
    const minLevel = Number.parseFloat(tags['building:min_level'] ?? '')
    return {
      metres,
      source: 'levels',
      drawMetres: metres,
      baseMetres: Number.isFinite(minLevel) && minLevel > 0 ? minLevel * METRES_PER_LEVEL : 0,
    }
  }

  return { metres: null, source: 'unknown', drawMetres: NOMINAL_DRAW_HEIGHT, baseMetres: 0 }
}

/*
 * HEIGHTS FROM THE MAP TILES (OpenFreeMap, OpenMapTiles schema). Each
 * footprint carries one number, `render_height`, and not the tags it was
 * made from: OSM's height in whole metres, or a height from its storeys,
 * or for a building with neither, 5. At Virginia Beach Fishing Pier all
 * 86 buildings with no height and no storeys in OSM read 5, 199 had a height,
 * and 10 and 14 storeys read 37 and 52, MEASURED in
 * measurements/2026-10-27-tile-heights.md. So 5 cannot be told from "nobody
 * recorded a height", and is read as unknown: drawn at the nominal picture
 * height, null for the arithmetic. A building really 5 m tall is drawn
 * lighter and casts no shadow, which is the safe side.
 */
export const TILE_DEFAULT_HEIGHT = 5

export function tileBuildingHeight(renderHeight: unknown, renderMinHeight: unknown): BuildingHeight {
  const h = typeof renderHeight === 'number' && Number.isFinite(renderHeight) ? renderHeight : null
  const base = typeof renderMinHeight === 'number' && Number.isFinite(renderMinHeight) && renderMinHeight > 0 ? renderMinHeight : 0
  if (h === null || h <= 0 || h === TILE_DEFAULT_HEIGHT) return { metres: null, source: 'unknown', drawMetres: NOMINAL_DRAW_HEIGHT, baseMetres: 0 }
  return { metres: h, source: 'tile', drawMetres: h, baseMetres: base < h ? base : 0 }
}

/**
 * WHAT THE LAYER CANNOT TELL YOU, said wherever buildings are drawn.
 *
 * Same rule as the hazard layer, for the same reason: OpenStreetMap building
 * coverage is excellent in some cities and absent in others, and an empty
 * patch of map is an empty patch of MAP. Treating it as an empty patch of
 * ground is how somebody plans a sightline through a warehouse.
 */
export const BUILDINGS_COVERAGE_NOTE =
  'Buildings come from OpenStreetMap and coverage is uneven. A building that ' +
  'is not drawn is one nobody has mapped, not an empty lot. Heights are often ' +
  'missing too, and an unmapped height is shown as a nominal box rather than ' +
  'a measured one.'
