import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  parseGoesColormap,
  thinLegend,
  VISIBLE_LEGEND_NOTE,
} from '../src/core/goesLegend.ts'

/*
 * THE REAL TABLE, COMMITTED AS A FIXTURE.
 *
 * Fetched from the URL NASA GIBS links in its own WMTS capabilities for
 * GOES-East_ABI_Band13_Clean_Infrared. Nothing in this app writes down a
 * colour or a temperature: a legend invented from memory is a confident wrong
 * answer about somebody else's data.
 */
const IR = readFileSync('tests/fixtures-gibs-ir-colormap.xml', 'utf8')

describe('the infrared colour table', () => {
  const legend = parseGoesColormap(IR)

  it('reads the title and units the table declares', () => {
    expect(legend).not.toBeNull()
    if (legend === null) return
    expect(legend.title).toBe('Infrared Brightness Temperature')
    expect(legend.units).toBe('°C')
  })

  it('reads 237 usable stops spanning -92 to +57 degrees', () => {
    if (legend === null) throw new Error('expected a legend')
    expect(legend.stops).toHaveLength(237)
    expect(legend.stops[0].from).toBeCloseTo(-92.1, 1)
    expect(legend.stops[legend.stops.length - 1].to).toBeCloseTo(56.9, 1)
  })

  it('reads the colours as the table gives them', () => {
    if (legend === null) throw new Error('expected a legend')
    // Coldest is white, which is why a high cold cloud top reads white.
    expect(legend.stops[0].color).toBe('rgb(255,255,255)')
    for (const stop of legend.stops) {
      expect(stop.color, `${stop.from}`).toMatch(/^rgb\(\d{1,3},\d{1,3},\d{1,3}\)$/)
    }
  })

  it('runs cold to warm, in the order the table lists them', () => {
    if (legend === null) throw new Error('expected a legend')
    for (let i = 1; i < legend.stops.length; i++) {
      expect(legend.stops[i].from).toBeGreaterThanOrEqual(legend.stops[i - 1].from)
    }
  })

  /*
   * THE "NO DATA" BLOCK IS NOT THE LEGEND. GIBS ships more than one ColorMap
   * per file and the other one is the absence of data, which has no scale.
   */
  it('skips the No Data block', () => {
    expect(IR).toContain('title="No Data"')
    if (legend === null) throw new Error('expected a legend')
    expect(legend.title).not.toContain('No Data')
  })

  it('drops transparent entries, which are absence rather than a value', () => {
    if (legend === null) throw new Error('expected a legend')
    expect(IR).toContain('transparent="true"')
    expect(legend.stops.length).toBeLessThan(
      (IR.match(/<ColorMapEntry/g) ?? []).length,
    )
  })
})

describe('thinning it for a phone', () => {
  const legend = parseGoesColormap(IR)

  it('keeps both ends, because the ends are what the scale means', () => {
    if (legend === null) throw new Error('expected a legend')
    const thin = thinLegend(legend, 7)
    expect(thin).toHaveLength(7)
    expect(thin[0]).toEqual(legend.stops[0])
    expect(thin[6]).toEqual(legend.stops[legend.stops.length - 1])
  })

  it('spaces the rest evenly through the served table', () => {
    if (legend === null) throw new Error('expected a legend')
    const thin = thinLegend(legend, 7)
    for (let i = 1; i < thin.length; i++) {
      expect(thin[i].from).toBeGreaterThan(thin[i - 1].from)
    }
    // Every stop shown is one the table actually contains.
    for (const stop of thin) expect(legend.stops).toContain(stop)
  })

  it('returns the table unchanged when it is already short', () => {
    const tiny = { title: 't', units: 'u', stops: [{ color: 'rgb(0,0,0)', from: 0, to: 1 }] }
    expect(thinLegend(tiny, 7)).toEqual(tiny.stops)
  })
})

/*
 * A MISSING TABLE MUST NEVER BECOME AN INVENTED ONE.
 */
describe('when there is no table', () => {
  it('returns null rather than a guess', () => {
    expect(parseGoesColormap('')).toBeNull()
    expect(parseGoesColormap('<html>not a colormap</html>')).toBeNull()
    expect(parseGoesColormap('<ColorMaps><ColorMap title="No Data"/></ColorMaps>')).toBeNull()
  })

  it('returns null for a table with only one stop, which is not a ramp', () => {
    const one =
      '<ColorMaps><ColorMap title="x" units="y"><Entries>' +
      '<ColorMapEntry rgb="1,2,3" value="(0,1]"/></Entries></ColorMap></ColorMaps>'
    expect(parseGoesColormap(one)).toBeNull()
  })

  /*
   * THE VISIBLE BAND HAS NO TABLE AND GIBS PUBLISHES NONE: its capabilities
   * block carries no colormap link, and its tiles arrive as greyscale PNG
   * while the infrared's arrive as RGBA. So it says what the band IS.
   */
  it('explains the visible band instead of inventing a ramp for it', () => {
    expect(VISIBLE_LEGEND_NOTE).toContain('Greyscale')
    expect(VISIBLE_LEGEND_NOTE).toContain('publishes none')
    expect(VISIBLE_LEGEND_NOTE.toLowerCase()).not.toContain('°c')
  })
})
