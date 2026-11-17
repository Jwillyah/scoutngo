import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { waterFogWords, type WaterReading } from '../core/waterTemp.ts'
import { formatTemperature } from '../lib/units.ts'
import { WaterLine, WaterTile } from './WaterLine.tsx'

/*
 * "Water 58° · 4/3" ON EVERY SCREEN THAT SAYS IT (Batch FIX, Section 4): the
 * one line and the Tide page's tile, from a reading in hand. The asking is
 * tests/waterTemp.test.ts.
 */
const VB = { lat: 36.85, lon: -75.97 }
const recent = new Date(Date.now() - 20 * 60_000)
const SEWELLS: WaterReading = { site: { kind: 'coops', id: '8638610', name: 'Sewells Point', at: { lat: 36.94, lon: -76.33 }, km: 9.2 }, at: recent, c: 14.4 }
const BANNED = /\b(safe|clear|legal|wear|should|must)\b/i

describe('the water line', () => {
  it('the head, and under it where from, how far, how old', () => {
    const html = renderToStaticMarkup(<WaterLine at={VB} unit="F" miles={false} className="dhead__line" source state={{ status: 'ok', reading: SEWELLS, kept: false }} />)
    expect(html).toContain('Water 58° · 4/3')
    expect(html).toContain('Sewells Point · 9 km · 20 min ago')
    expect(html).toContain('data-water="coops"')
    expect(html.replace(/<[^>]+>/g, ' ')).not.toMatch(BANNED)
  })
  it('a card: the head alone; a saved copy says so', () => {
    const html = renderToStaticMarkup(<WaterLine at={VB} unit="C" miles={false} className="hcard__line" state={{ status: 'ok', reading: SEWELLS, kept: true }} />)
    expect(html).toContain('Water 14° · 4/3')
    expect(html).not.toContain('Sewells Point')
    expect(renderToStaticMarkup(<WaterLine at={VB} unit="F" miles source className="x" state={{ status: 'ok', reading: SEWELLS, kept: true }} />)).toContain('· saved')
  })
  it('nothing while it is asked; "No water temp here" when nothing measured is near, never a zero', () => {
    expect(renderToStaticMarkup(<WaterLine at={VB} unit="F" miles={false} className="x" state={{ status: 'loading' }} />)).toBe('')
    const none = renderToStaticMarkup(<WaterLine at={VB} unit="F" miles={false} className="x" state={{ status: 'none' }} />)
    expect(none).toContain('No water temp here')
    expect(none).not.toMatch(/\d/)
  })
})

describe('the Tide page tile', () => {
  it('the number big, the suit and the source under it', () => {
    const html = renderToStaticMarkup(<WaterTile at={VB} unit="F" miles bigClass="dtide__big" lineClass="dtide__line" state={{ status: 'ok', reading: SEWELLS, kept: false }} />)
    expect(html).toContain('>58°F<')
    expect(html).toContain('4/3 typical · Sewells Point · 6 mi · 20 min ago')
  })
  it('a dash and the words when nothing is measured near', () => {
    const html = renderToStaticMarkup(<WaterTile at={VB} unit="F" miles bigClass="b" lineClass="l" state={{ status: 'none' }} />)
    expect(html).toContain('>—<')
    expect(html).toContain('No water temp here')
  })
})

describe('the lens fog row', () => {
  const temp = (c: number) => formatTemperature(c, 'F')
  it('says the water, and when the dew point is above it, that fog can form over it', () => {
    expect(waterFogWords(12, 14, temp)).toBe('water 54°F, under the dew point: fog can form over it')
    expect(waterFogWords(14, 10, temp)).toBe('water 57°F')
    expect(waterFogWords(14, 10, temp)).not.toMatch(BANNED)
  })
})
